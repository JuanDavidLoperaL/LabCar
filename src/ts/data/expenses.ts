import { collection, getDocs, orderBy, query, Timestamp, where, type FirestoreDataConverter } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import type { DateRange } from '../lib/dates';
import type { Expense } from '../models/expense';
import { asDate, asNumber, asString } from './parse';

const expenseConverter: FirestoreDataConverter<Expense | null> = {
  toFirestore: () => {
    throw new Error('Los gastos se escriben desde el módulo de Gastos.');
  },
  fromFirestore: (snapshot) => {
    const data = snapshot.data();
    const date = asDate(data.date);
    if (!date) return null;
    return {
      id: snapshot.id,
      date,
      category: asString(data.category, 'Otros'),
      description: asString(data.description),
      amount: asNumber(data.amount),
    };
  },
};

export async function fetchExpenses(range: DateRange): Promise<Expense[]> {
  const snapshot = await getDocs(
    query(
      collection(getDb(), 'expenses').withConverter(expenseConverter),
      where('date', '>=', Timestamp.fromDate(range.start)),
      where('date', '<', Timestamp.fromDate(range.end)),
      orderBy('date', 'desc'),
    ),
  );
  return snapshot.docs.map((doc) => doc.data()).filter((expense): expense is Expense => expense !== null);
}
