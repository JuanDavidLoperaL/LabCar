import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import type { Payout, PayoutDeferral } from '../models/payout';
import { asDate, asNumber, asRecord, asString } from './parse';

function payoutsCollection() {
  return collection(getDb(), 'commissionPayouts');
}

/** ID del pago: uno por empleado y semana, así dos equipos no pueden registrar el mismo pago dos veces. */
export function payoutId(weekId: string, sellerEmail: string): string {
  return `${weekId}_${sellerEmail}`;
}

function parsePayout(snapshot: DocumentSnapshot): Payout | null {
  const data = snapshot.data();
  const coveredTo = asDate(data?.coveredTo);
  const paidAt = asDate(data?.paidAt);
  if (!data || !coveredTo || !paidAt) return null;
  const paidBy = asRecord(data.paidBy);
  return {
    id: snapshot.id,
    weekId: asString(data.weekId),
    sellerEmail: asString(data.sellerEmail),
    sellerName: asString(data.sellerName),
    coveredFrom: asDate(data.coveredFrom),
    coveredTo,
    saleIds: Array.isArray(data.saleIds) ? data.saleIds.filter((id): id is string => typeof id === 'string') : [],
    amount: asNumber(data.amount),
    loanDeduction: asNumber(data.loanDeduction),
    paidAt,
    paidBy: { email: asString(paidBy?.email), name: asString(paidBy?.name) },
  };
}

/** Pagos de un empleado, del más antiguo al más reciente (son pocos: uno por semana). */
export async function fetchPayouts(sellerEmail: string): Promise<Payout[]> {
  const snapshot = await getDocs(
    query(payoutsCollection(), where('sellerEmail', '==', sellerEmail), orderBy('coveredTo', 'asc')),
  );
  return snapshot.docs.map(parsePayout).filter((payout): payout is Payout => payout !== null);
}

export interface NewPayout {
  weekId: string;
  seller: { email: string; name: string };
  coveredFrom: Date | null;
  coveredTo: Date;
  saleIds: string[];
  amount: number;
  /** Préstamos que se descuentan de `amount` (0 si no tiene). */
  loanDeduction: number;
  paidBy: { email: string; name: string };
}

/** Esa semana ya tenía un pago registrado (desde otro equipo, o doble clic). */
export class PayoutAlreadyExistsError extends Error {
  constructor() {
    super('Ya se había registrado el pago de esta semana.');
  }
}

/** Registra el pago de comisiones (solo admin; las reglas lo validan). La transacción evita pagar dos veces. */
export async function createPayout(payout: NewPayout): Promise<void> {
  const db = getDb();
  const ref = doc(payoutsCollection(), payoutId(payout.weekId, payout.seller.email));
  await runTransaction(db, async (transaction) => {
    if ((await transaction.get(ref)).exists()) throw new PayoutAlreadyExistsError();
    transaction.set(ref, {
      weekId: payout.weekId,
      sellerEmail: payout.seller.email,
      sellerName: payout.seller.name,
      coveredFrom: payout.coveredFrom ? Timestamp.fromDate(payout.coveredFrom) : null,
      coveredTo: Timestamp.fromDate(payout.coveredTo),
      saleIds: payout.saleIds,
      amount: payout.amount,
      loanDeduction: payout.loanDeduction,
      paidAt: serverTimestamp(),
      paidBy: payout.paidBy,
    });
  });
}

// ---------- Acumular a la próxima semana ----------

function deferralsCollection() {
  return collection(getDb(), 'payoutDeferrals');
}

function parseDeferral(snapshot: DocumentSnapshot): PayoutDeferral | null {
  const data = snapshot.data();
  const deferredAt = asDate(data?.deferredAt);
  if (!data || !deferredAt) return null;
  const deferredBy = asRecord(data.deferredBy);
  return {
    id: snapshot.id,
    weekId: asString(data.weekId),
    sellerEmail: asString(data.sellerEmail),
    amount: asNumber(data.amount),
    deferredAt,
    deferredBy: { email: asString(deferredBy?.email), name: asString(deferredBy?.name) },
  };
}

/** Semanas que se decidió acumular para un empleado (solo filtra por igualdad: no necesita índice). */
export async function fetchDeferrals(sellerEmail: string): Promise<PayoutDeferral[]> {
  const snapshot = await getDocs(query(deferralsCollection(), where('sellerEmail', '==', sellerEmail)));
  return snapshot.docs.map(parseDeferral).filter((deferral): deferral is PayoutDeferral => deferral !== null);
}

export interface NewDeferral {
  weekId: string;
  seller: { email: string; name: string };
  amount: number;
  deferredBy: { email: string; name: string };
}

/** Esa semana ya se había acumulado (desde otro equipo, o doble clic). */
export class DeferralAlreadyExistsError extends Error {
  constructor() {
    super('Ya se había acumulado esta semana.');
  }
}

/** Registra que no se paga la semana y el saldo pasa a la siguiente (solo admin; las reglas lo validan). */
export async function createDeferral(deferral: NewDeferral): Promise<void> {
  const db = getDb();
  const ref = doc(deferralsCollection(), payoutId(deferral.weekId, deferral.seller.email));
  await runTransaction(db, async (transaction) => {
    if ((await transaction.get(ref)).exists()) throw new DeferralAlreadyExistsError();
    transaction.set(ref, {
      weekId: deferral.weekId,
      sellerEmail: deferral.seller.email,
      sellerName: deferral.seller.name,
      amount: deferral.amount,
      deferredAt: serverTimestamp(),
      deferredBy: deferral.deferredBy,
    });
  });
}
