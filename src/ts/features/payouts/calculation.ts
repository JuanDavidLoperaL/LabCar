import type { Payout, PayoutDeferral } from '../../models/payout';
import type { Sale } from '../../models/sale';
import { splitEvenly } from '../sales/pricing';
import type { PayoutWeek } from './week';

/**
 * Liquidación de comisiones de un empleado. Lógica pura (sin Firebase ni DOM).
 *
 * Cada venta se reparte por partes iguales entre sus vendedores: con 2 vendedores en una venta de
 * $1.000.000 a cada uno se le atribuyen $500.000 vendidos, su comisión y $300.000 para LAB CAR.
 * Así, sumando a todos los empleados, lo vendido cuadra con el total real de ventas.
 *
 * Lo que no se paga en su semana queda pendiente y se suma a la siguiente: lo pendiente es todo lo
 * vendido desde el último pago registrado (o desde el inicio del control de pagos).
 */

/** paid = cubierta por un pago · pending = por pagar · untracked = anterior al control de pagos. */
export type EntryState = 'paid' | 'pending' | 'untracked';

export const ENTRY_STATE_LABELS: Record<EntryState, string> = {
  paid: 'Pagado',
  pending: 'Pendiente',
  untracked: 'Liquidado aparte',
};

/** La parte de un empleado en una venta. */
export interface PayoutEntry {
  sale: Sale;
  /** Vendedores de la venta (1 = la hizo solo). */
  sellerCount: number;
  /** Parte del valor de la venta atribuida al empleado. */
  sold: number;
  commission: number;
  /** Lo que le queda a LAB CAR de esa parte: sold − commission. */
  company: number;
  state: EntryState;
}

export interface PayoutTotals {
  count: number;
  sold: number;
  commission: number;
  company: number;
}

export type SettlementStatus =
  /** Semana anterior al control de pagos: solo informativa. */
  | { kind: 'untracked' }
  /** Pagada. `inLaterWeek`: no tiene pago propio, la cubrió el pago de una semana posterior. */
  | { kind: 'paid'; payout: Payout; inLaterWeek: boolean }
  | { kind: 'pending' }
  /** Pendiente, pero el admin decidió no pagarla y acumular el saldo a la próxima semana (aún se puede pagar). */
  | { kind: 'deferred'; deferral: PayoutDeferral }
  /** Sin nada por pagar. */
  | { kind: 'empty' };

/** Lo que cubre un pago nuevo si se marca pagado ahora. */
export interface PayoutCoverage {
  coveredFrom: Date | null;
  coveredTo: Date;
  saleIds: string[];
  amount: number;
}

export interface Settlement {
  /** Ventas de la semana, más recientes primero. */
  week: PayoutEntry[];
  weekTotals: PayoutTotals;
  /** Ventas de semanas anteriores aún sin pagar (se suman a esta). */
  carryover: PayoutEntry[];
  carryoverTotal: number;
  /** Comisión pendiente hasta el corte de esta semana (semana + saldo anterior). */
  toPay: number;
  status: SettlementStatus;
  /** Solo si se puede registrar el pago de esta semana. */
  coverage: PayoutCoverage | null;
}

function sumBy(entries: readonly PayoutEntry[], value: (entry: PayoutEntry) => number): number {
  return entries.reduce((total, entry) => total + value(entry), 0);
}

export function totalsOf(entries: readonly PayoutEntry[]): PayoutTotals {
  return {
    count: entries.length,
    sold: sumBy(entries, (entry) => entry.sold),
    commission: sumBy(entries, (entry) => entry.commission),
    company: sumBy(entries, (entry) => entry.company),
  };
}

/** Desde cuándo hay comisiones sin pagar: el fin del último pago o el inicio del control. */
export function unpaidSince(payouts: readonly Payout[], trackingStart: Date): Date {
  const last = payouts.at(-1)?.coveredTo;
  return last && last > trackingStart ? last : trackingStart;
}

/** Rango de ventas que hay que consultar para liquidar la semana: la semana y lo pendiente de antes. */
export function settlementRange(week: PayoutWeek, payouts: readonly Payout[], trackingStart: Date): { start: Date; end: Date } {
  const since = unpaidSince(payouts, trackingStart);
  return { start: since < week.range.start ? since : week.range.start, end: week.range.end };
}

function toEntry(sale: Sale, sellerEmail: string, unpaidFrom: Date, trackingStart: Date): PayoutEntry | null {
  const index = sale.sellers.findIndex((seller) => seller.email === sellerEmail);
  if (sale.status === 'void' || index < 0) return null;
  const sellerCount = sale.sellers.length;
  const sold = splitEvenly(sale.total, sellerCount)[index];
  const commission = sale.sellers[index].commission;
  const state: EntryState = sale.date < trackingStart ? 'untracked' : sale.date < unpaidFrom ? 'paid' : 'pending';
  return { sale, sellerCount, sold, commission, company: sold - commission, state };
}

export interface SettlementInput {
  sellerEmail: string;
  /** Ventas de settlementRange(), más recientes primero. */
  sales: readonly Sale[];
  /** Pagos del empleado, del más antiguo al más reciente. */
  payouts: readonly Payout[];
  /** Semanas que se decidió acumular. */
  deferrals: readonly PayoutDeferral[];
  week: PayoutWeek;
  trackingStart: Date;
}

export function buildSettlement({ sellerEmail, sales, payouts, deferrals, week, trackingStart }: SettlementInput): Settlement {
  const unpaidFrom = unpaidSince(payouts, trackingStart);
  const entries = sales
    .map((sale) => toEntry(sale, sellerEmail, unpaidFrom, trackingStart))
    .filter((entry): entry is PayoutEntry => entry !== null);

  const { start, end } = week.range;
  const weekEntries = entries.filter((entry) => entry.sale.date >= start && entry.sale.date < end);
  const carryover = entries.filter((entry) => entry.state === 'pending' && entry.sale.date < start);
  const pending = entries.filter((entry) => entry.state === 'pending' && entry.sale.date < end);
  const toPay = sumBy(pending, (entry) => entry.commission);

  const ownPayout = payouts.find((payout) => payout.weekId === week.id);
  const laterPayout = ownPayout ? undefined : payouts.find((payout) => payout.coveredTo >= end);

  let status: SettlementStatus;
  if (end <= trackingStart) status = { kind: 'untracked' };
  else if (ownPayout) status = { kind: 'paid', payout: ownPayout, inLaterWeek: false };
  else if (laterPayout) status = { kind: 'paid', payout: laterPayout, inLaterWeek: true };
  else if (toPay > 0) {
    const deferral = deferrals.find((item) => item.weekId === week.id);
    status = deferral ? { kind: 'deferred', deferral } : { kind: 'pending' };
  }
  else status = { kind: 'empty' };

  let coverage: PayoutCoverage | null = null;
  if (status.kind === 'pending' || status.kind === 'deferred') {
    // Semana en curso: el pago cubre hasta la última venta vista (lo que se venda después queda
    // pendiente para la próxima). Semana cerrada: hasta el corte.
    const latest = pending.reduce((max, entry) => (entry.sale.date > max ? entry.sale.date : max), pending[0].sale.date);
    coverage = {
      coveredFrom: payouts.at(-1)?.coveredTo ?? null,
      coveredTo: week.isCurrent ? new Date(latest.getTime() + 1) : end,
      saleIds: pending.map((entry) => entry.sale.id),
      amount: toPay,
    };
  }

  return {
    week: weekEntries,
    weekTotals: totalsOf(weekEntries),
    carryover,
    carryoverTotal: sumBy(carryover, (entry) => entry.commission),
    toPay,
    status,
    coverage,
  };
}
