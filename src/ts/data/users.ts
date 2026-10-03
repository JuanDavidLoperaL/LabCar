import { collection, getDocs } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { isRole } from '../lib/roles';
import type { AppUser } from '../models/user';
import { asString } from './parse';

/** Usuarios activos del sistema (los posibles vendedores), ordenados por nombre. */
export async function fetchActiveUsers(): Promise<AppUser[]> {
  const snapshot = await getDocs(collection(getDb(), 'users'));
  return snapshot.docs
    .filter((doc) => doc.data().active === true)
    .map((doc) => ({
      email: doc.id,
      name: asString(doc.data().name) || doc.id,
      role: isRole(doc.data().role) ? doc.data().role : 'basic',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
