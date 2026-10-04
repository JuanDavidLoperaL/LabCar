import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { DEFAULT_COMMISSION_RATE, DEFAULT_OVERDUE_DAYS, MAX_OVERDUE_DAYS, MIN_OVERDUE_DAYS } from '../config/business';
import { getDb } from '../lib/firebase';

/** % de comisión vigente (settings/commissions.rate, 0–1). Si no está configurado, 40%. */
export async function fetchCommissionRate(): Promise<number> {
  const snapshot = await getDoc(doc(getDb(), 'settings', 'commissions'));
  const rate = snapshot.data()?.rate;
  return typeof rate === 'number' && rate >= 0 && rate <= 1 ? rate : DEFAULT_COMMISSION_RATE;
}

// ---------- Cartera: días para entrar en mora ----------

function receivablesRef() {
  return doc(getDb(), 'settings', 'receivables');
}

export function isValidOverdueDays(days: number): boolean {
  return Number.isInteger(days) && days >= MIN_OVERDUE_DAYS && days <= MAX_OVERDUE_DAYS;
}

function parseOverdueDays(value: unknown): number {
  return typeof value === 'number' && isValidOverdueDays(value) ? value : DEFAULT_OVERDUE_DAYS;
}

/** Días de mora vigentes (settings/receivables.overdueDays). Si no está configurado, 30. */
export async function fetchOverdueDays(): Promise<number> {
  const snapshot = await getDoc(receivablesRef());
  return parseOverdueDays(snapshot.data()?.overdueDays);
}

/** Igual que fetchOverdueDays, pero avisa cada vez que alguien lo cambia desde otro equipo. */
export function watchOverdueDays(onChange: (days: number) => void, onError: (error: unknown) => void): Unsubscribe {
  return onSnapshot(receivablesRef(), (snapshot) => onChange(parseOverdueDays(snapshot.data()?.overdueDays)), onError);
}

/** Solo el administrador puede cambiarlo (las reglas lo validan). */
export async function saveOverdueDays(days: number, byEmail: string): Promise<void> {
  await setDoc(receivablesRef(), { overdueDays: days, updatedAt: serverTimestamp(), updatedBy: byEmail });
}
