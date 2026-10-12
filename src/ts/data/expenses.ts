import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import type { DateRange } from '../lib/dates';
import { EXPENSE_PAYMENT_METHODS, type Expense, type ExpensePaymentMethod } from '../models/expense';
import { asDate, asNumber, asOneOf, asRecord, asString } from './parse';

function expensesCollection() {
  return collection(getDb(), 'expenses');
}

function parseExpense(snapshot: DocumentSnapshot): Expense | null {
  const data = snapshot.data();
  const date = asDate(data?.date);
  if (!data || !date) return null; // sin fecha no se puede ubicar en ningún periodo
  const createdBy = asRecord(data.createdBy);
  const voided = asRecord(data.void);
  const voidedAt = asDate(voided?.at);
  const voidedBy = asRecord(voided?.by);
  return {
    id: snapshot.id,
    date,
    description: asString(data.description),
    amount: asNumber(data.amount),
    paymentMethod: asOneOf(data.paymentMethod, EXPENSE_PAYMENT_METHODS, 'cash'),
    createdAt: asDate(data.createdAt),
    createdBy: { email: asString(createdBy?.email), name: asString(createdBy?.name) },
    void: voided && voidedAt
      ? { at: voidedAt, by: { email: asString(voidedBy?.email), name: asString(voidedBy?.name) }, reason: asString(voided.reason) }
      : null,
  };
}

function toExpenses(snapshots: readonly DocumentSnapshot[]): Expense[] {
  return snapshots.map(parseExpense).filter((expense): expense is Expense => expense !== null);
}

function rangeQuery(range: DateRange) {
  return query(
    expensesCollection(),
    where('date', '>=', Timestamp.fromDate(range.start)),
    where('date', '<', Timestamp.fromDate(range.end)),
    orderBy('date', 'desc'),
  );
}

/** Gastos del rango, del más reciente al más antiguo (incluye anulados; quien consulta decide). */
export async function fetchExpenses(range: DateRange): Promise<Expense[]> {
  return toExpenses((await getDocs(rangeQuery(range))).docs);
}

/** Igual que fetchExpenses, pero avisa cada vez que alguien registra o anula un gasto desde otro equipo. */
export function watchExpenses(range: DateRange, onChange: (expenses: Expense[]) => void, onError: (error: unknown) => void): Unsubscribe {
  return onSnapshot(rangeQuery(range), (snapshot) => onChange(toExpenses(snapshot.docs)), onError);
}

export interface NewExpense {
  /** null = hoy (se usa la hora del servidor); si no, el día pasado elegido por el administrador. */
  date: Date | null;
  description: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  createdBy: { email: string; name: string };
}

/**
 * Registra un gasto (admin y manager; las reglas validan fecha, monto y descripción).
 * `requestId` identifica el intento (se genera con el formulario) y es el ID del documento: si la
 * respuesta se pierde y se reintenta, la transacción ve que ya existe y no lo duplica.
 */
export async function createExpense(expense: NewExpense, requestId: string): Promise<void> {
  const db = getDb();
  const ref = doc(expensesCollection(), requestId);
  await runTransaction(db, async (transaction) => {
    if ((await transaction.get(ref)).exists()) return;
    transaction.set(ref, {
      date: expense.date ? Timestamp.fromDate(expense.date) : serverTimestamp(),
      description: expense.description.trim(),
      amount: expense.amount,
      paymentMethod: expense.paymentMethod,
      createdAt: serverTimestamp(),
      createdBy: expense.createdBy,
      void: null,
    });
  });
}

/** Anula un gasto (admin cualquiera, manager solo los de hoy; las reglas lo validan). Nunca se borra. */
export async function voidExpense(id: string, reason: string, by: { email: string; name: string }): Promise<void> {
  await updateDoc(doc(expensesCollection(), id), {
    void: { at: serverTimestamp(), by, reason: reason.trim() },
  });
}
