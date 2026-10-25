import type { Loan, LoanCategory } from '../../models/loan';
import type { Payout, PayoutDeferral } from '../../models/payout';
import { loanEntries, outstandingBalance, totalsByCategory, type LoanEntry } from '../loans/ledger';
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
 *
 * Los préstamos del empleado se descuentan de lo que se le paga: al empleado se le entrega
 * "a pagar" − "préstamos". Si debe más de lo que tiene por cobrar, se descuenta hasta dejarlo en
 * cero y el resto queda para las semanas siguientes.
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
  /** Comisión que cubre, antes de préstamos. */
  amount: number;
  /** Préstamos que se descuentan de `amount`. */
  loanDeduction: number;
}

/** Préstamos del empleado vistos desde la semana que se liquida. */
export interface LoanSummary {
  /** Lo que se descuenta en esta liquidación (o lo que se descontó, si ya está pagada). */
  deduction: number;
  /** Lo que debía en préstamos hasta el corte, antes de este descuento. */
  balance: number;
  /** Lo que sigue debiendo después de este descuento (pasa a las semanas siguientes). */
  remaining: number;
  /** Préstamos registrados en esta semana, por tipo. */
  weekByCategory: Record<LoanCategory, number>;
  /** Todos los préstamos del empleado con su estado, del más reciente al más antiguo. */
  entries: LoanEntry[];
}

export interface Settlement {
  /** Ventas de la semana, más recientes primero. */
  week: PayoutEntry[];
  weekTotals: PayoutTotals;
  /** Ventas de semanas anteriores aún sin pagar (se suman a esta). */
  carryover: PayoutEntry[];
  carryoverTotal: number;
  /** Comisión pendiente hasta el corte de esta semana (semana + saldo anterior), antes de préstamos. */
  toPay: number;
  loans: LoanSummary;
  /** Lo que se le entrega al empleado: toPay − préstamos descontados. */
  netToPay: number;
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
  /** Préstamos del empleado (todos, incluidos anulados), del más antiguo al más reciente. */
  loans: readonly Loan[];
  week: PayoutWeek;
  trackingStart: Date;
}

export function buildSettlement({ sellerEmail, sales, payouts, deferrals, loans, week, trackingStart }: SettlementInput): Settlement {
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

  // Pagada con su propio pago: lo descontado quedó registrado en el pago. Por pagar: lo que debe en
  // préstamos hasta el corte, sin pasar de la comisión.
  const balance = outstandingBalance(loans, payouts, end);
  const payable = status.kind === 'pending' || status.kind === 'deferred';
  const deduction = status.kind === 'paid' && !status.inLaterWeek
    ? status.payout.loanDeduction
    : payable ? Math.min(balance, toPay) : 0;
  const loanSummary: LoanSummary = {
    deduction,
    balance,
    remaining: payable ? balance - deduction : balance,
    weekByCategory: totalsByCategory(loans, week.range),
    entries: loanEntries(loans, payouts).reverse(),
  };

  let coverage: PayoutCoverage | null = null;
  if (payable) {
    // Semana en curso: el pago cubre hasta la última venta vista (lo que se venda después queda
    // pendiente para la próxima). Semana cerrada: hasta el corte.
    const latest = pending.reduce((max, entry) => (entry.sale.date > max ? entry.sale.date : max), pending[0].sale.date);
    coverage = {
      coveredFrom: payouts.at(-1)?.coveredTo ?? null,
      coveredTo: week.isCurrent ? new Date(latest.getTime() + 1) : end,
      saleIds: pending.map((entry) => entry.sale.id),
      amount: toPay,
      loanDeduction: deduction,
    };
  }

  return {
    week: weekEntries,
    weekTotals: totalsOf(weekEntries),
    carryover,
    carryoverTotal: sumBy(carryover, (entry) => entry.commission),
    toPay,
    loans: loanSummary,
    netToPay: toPay - (payable ? deduction : 0),
    status,
    coverage,
  };
}
