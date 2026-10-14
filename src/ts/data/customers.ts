import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { customerId, type Customer, type CustomerInput } from '../models/customer';
import { DOCUMENT_TYPES, PERSON_TYPES, TAX_REGIMES } from '../models/sale';
import { asOneOf, asString } from './parse';

function customersCollection() {
  return collection(getDb(), 'customers');
}

/** Clientes en orden alfabético (se ordena aquí porque el orden depende de tildes y mayúsculas). */
function toCustomers(snapshot: QuerySnapshot): Customer[] {
  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        documentType: asOneOf(data.documentType, DOCUMENT_TYPES, 'CC'),
        documentNumber: asString(data.documentNumber),
        personType: asOneOf(data.personType, PERSON_TYPES, 'natural'),
        name: asString(data.name),
        phone: asString(data.phone),
        email: asString(data.email),
        city: asString(data.city),
        address: asString(data.address),
        taxRegime: asOneOf(data.taxRegime, TAX_REGIMES, 'not-vat-responsible'),
      };
    })
    .filter((customer) => customer.name && customer.documentNumber)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Para preseleccionar el cliente en Nueva Venta. */
export async function fetchCustomers(): Promise<Customer[]> {
  return toCustomers(await getDocs(customersCollection()));
}

/** Servicios y Clientes: la lista en tiempo real. */
export function watchCustomers(onChange: (customers: Customer[]) => void, onError: (error: unknown) => void): Unsubscribe {
  return onSnapshot(customersCollection(), (snapshot) => onChange(toCustomers(snapshot)), onError);
}

// ---------- Escritura (solo admin; las reglas lo validan) ----------

/**
 * Crea o actualiza un cliente. El ID es el documento: si al editar cambia el tipo o el número,
 * se borra el registro anterior y se crea el nuevo en un mismo lote.
 */
export async function saveCustomer(input: CustomerInput, previousId: string | null, adminEmail: string): Promise<void> {
  const db = getDb();
  const id = customerId(input.documentType, input.documentNumber);
  const batch = writeBatch(db);
  if (previousId && previousId !== id) batch.delete(doc(db, 'customers', previousId));
  batch.set(doc(db, 'customers', id), { ...input, updatedAt: serverTimestamp(), updatedBy: adminEmail });
  await batch.commit();
}

/** Borrado definitivo. Las ventas anteriores no cambian: guardan su propia copia de los datos del cliente. */
export async function deleteCustomer(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'customers', id));
}
