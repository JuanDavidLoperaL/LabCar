import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  updateDoc,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import type { Service } from '../models/service';
import { asString } from './parse';

function servicesCollection() {
  return collection(getDb(), 'services');
}

/**
 * Servicios activos en orden alfabético. Se ordena aquí (no con orderBy) porque el orden depende
 * de tildes y mayúsculas. `active` solo existe en datos antiguos: los servicios se borran de verdad.
 */
function toServices(snapshot: QuerySnapshot): Service[] {
  return snapshot.docs
    .filter((doc) => doc.data().active !== false)
    .map((doc) => ({ id: doc.id, name: asString(doc.data().name), quick: doc.data().quick === true }))
    .filter((service) => service.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Catálogo de servicios (para registrar una venta). */
export async function fetchServices(): Promise<Service[]> {
  return toServices(await getDocs(servicesCollection()));
}

/** Igual que fetchServices, pero avisa cada vez que alguien cambia el catálogo. */
export function watchServices(onChange: (services: Service[]) => void, onError: (error: unknown) => void): Unsubscribe {
  return onSnapshot(servicesCollection(), (snapshot) => onChange(toServices(snapshot)), onError);
}

// ---------- Escritura (solo admin; las reglas lo validan) ----------

export async function createService(name: string): Promise<void> {
  await addDoc(servicesCollection(), { name, quick: false });
}

export async function renameService(id: string, name: string): Promise<void> {
  await updateDoc(doc(servicesCollection(), id), { name });
}

export async function setServiceQuick(id: string, quick: boolean): Promise<void> {
  await updateDoc(doc(servicesCollection(), id), { quick });
}

/** Borrado definitivo. Las ventas anteriores no cambian: guardan el nombre del servicio. */
export async function deleteService(id: string): Promise<void> {
  await deleteDoc(doc(servicesCollection(), id));
}
