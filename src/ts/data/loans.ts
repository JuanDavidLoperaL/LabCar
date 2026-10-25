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
import { LOAN_CATEGORIES, type Loan, type LoanCategory } from '../models/loan';
import { asDate, asNumber, asOneOf, asRecord, asString } from './parse';

function loansCollection() {
  return collection(getDb(), 'loans');
}

function parseLoan(snapshot: DocumentSnapshot): Loan | null {
  const data = snapshot.data();
  const date = asDate(data?.date);
  if (!data || !date) return null; // sin fecha no se puede ubicar en ningún periodo
  const createdBy = asRecord(data.createdBy);
  const voided = asRecord(data.void);
  const voidedAt = asDate(voided?.at);
  const voidedBy = asRecord(voided?.by);
  return {
    id: snapshot.id,
    employeeEmail: asString(data.employeeEmail),
    employeeName: asString(data.employeeName),
    category: asOneOf(data.category, LOAN_CATEGORIES, 'general'),
    date,
    description: asString(data.description),
    amount: asNumber(data.amount),
    createdAt: asDate(data.createdAt),
    createdBy: { email: asString(createdBy?.email), name: asString(createdBy?.name) },
    void: voided && voidedAt
      ? { at: voidedAt, by: { email: asString(voidedBy?.email), name: asString(voidedBy?.name) }, reason: asString(voided.reason) }
      : null,
  };
}

function toLoans(snapshots: readonly DocumentSnapshot[]): Loan[] {
  return snapshots.map(parseLoan).filter((loan): loan is Loan => loan !== null);
}

function rangeQuery(range: DateRange) {
  return query(
    loansCollection(),
    where('date', '>=', Timestamp.fromDate(range.start)),
    where('date', '<', Timestamp.fromDate(range.end)),
    orderBy('date', 'desc'),
  );
}

/** Préstamos del rango en tiempo real, del más reciente al más antiguo (incluye anulados). */
export function watchLoans(range: DateRange, onChange: (loans: Loan[]) => void, onError: (error: unknown) => void): Unsubscribe {
  return onSnapshot(rangeQuery(range), (snapshot) => onChange(toLoans(snapshot.docs)), onError);
}

/**
 * Todos los préstamos de un empleado, del más antiguo al más reciente (incluye anulados).
 * Solo filtra por igualdad (no necesita índice) y ordena aquí: son pocos por empleado.
 */
export async function fetchLoansByEmployee(employeeEmail: string): Promise<Loan[]> {
  const snapshot = await getDocs(query(loansCollection(), where('employeeEmail', '==', employeeEmail)));
  return toLoans(snapshot.docs).sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface NewLoan {
  employee: { email: string; name: string };
  category: LoanCategory;
  /** null = hoy (se usa la hora del servidor); si no, el día pasado elegido por el administrador. */
  date: Date | null;
  description: string;
  amount: number;
  createdBy: { email: string; name: string };
}

/**
 * Registra un préstamo (admin y manager; las reglas validan fecha, monto, empleado y descripción).
 * `requestId` es el ID del documento: si la respuesta se pierde y se reintenta, no se duplica.
 */
export async function createLoan(loan: NewLoan, requestId: string): Promise<void> {
  const db = getDb();
  const ref = doc(loansCollection(), requestId);
  await runTransaction(db, async (transaction) => {
    if ((await transaction.get(ref)).exists()) return;
    transaction.set(ref, {
      employeeEmail: loan.employee.email,
      employeeName: loan.employee.name,
      category: loan.category,
      date: loan.date ? Timestamp.fromDate(loan.date) : serverTimestamp(),
      description: loan.description.trim(),
      amount: loan.amount,
      createdAt: serverTimestamp(),
      createdBy: loan.createdBy,
      void: null,
    });
  });
}

/** Anula un préstamo (admin cualquiera, manager solo los de hoy; las reglas lo validan). Nunca se borra. */
export async function voidLoan(id: string, reason: string, by: { email: string; name: string }): Promise<void> {
  await updateDoc(doc(loansCollection(), id), {
    void: { at: serverTimestamp(), by, reason: reason.trim() },
  });
}
