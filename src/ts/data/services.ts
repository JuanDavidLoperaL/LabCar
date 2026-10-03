import { collection, getDocs } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import type { Service } from '../models/service';
import { asNumber, asString } from './parse';

/** Catálogo de servicios activos, en el orden configurado. */
export async function fetchServices(): Promise<Service[]> {
  // Se ordena aquí (no con orderBy) para no perder servicios a los que les falte el campo `order`.
  const snapshot = await getDocs(collection(getDb(), 'services'));
  return snapshot.docs
    .filter((doc) => doc.data().active !== false)
    .map((doc) => ({
      id: doc.id,
      name: asString(doc.data().name),
      quick: doc.data().quick === true,
      order: asNumber(doc.data().order, Number.MAX_SAFE_INTEGER),
    }))
    .filter((service) => service.name.length > 0)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es'));
}
