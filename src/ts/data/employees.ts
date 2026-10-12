import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import type { EmployeeInfo } from '../models/user';
import { asString } from './parse';

/** Cédula y teléfono del empleado (employees/{correo}); null si aún no se registraron. */
export async function fetchEmployeeInfo(email: string): Promise<EmployeeInfo | null> {
  const snapshot = await getDoc(doc(getDb(), 'employees', email));
  const data = snapshot.data();
  if (!data) return null;
  return { documentNumber: asString(data.documentNumber), phone: asString(data.phone) };
}
