import { collection, doc, getDocs, onSnapshot, serverTimestamp, writeBatch, type QuerySnapshot, type Unsubscribe } from 'firebase/firestore';
import { createPasswordAccount } from '../lib/auth';
import { getDb } from '../lib/firebase';
import { isRole, type Role } from '../lib/roles';
import type { AppUser, ManagedUser, NewUser } from '../models/user';
import { asString } from './parse';

function usersCollection() {
  return collection(getDb(), 'users');
}

/** Todos los usuarios (activos y eliminados), ordenados por nombre. */
function toUsers(snapshot: QuerySnapshot): ManagedUser[] {
  return snapshot.docs
    .map((doc) => ({
      email: doc.id,
      name: asString(doc.data().name) || doc.id,
      role: isRole(doc.data().role) ? doc.data().role : 'basic',
      access: doc.data().access === 'password' ? ('password' as const) : ('google' as const),
      active: doc.data().active === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Usuarios activos del sistema (los posibles vendedores), ordenados por nombre. */
export async function fetchActiveUsers(): Promise<AppUser[]> {
  return toUsers(await getDocs(usersCollection()))
    .filter((user) => user.active)
    .map(({ email, name, role }) => ({ email, name, role }));
}

/** Usuarios y Roles: la lista completa en tiempo real (solo admin la edita). */
export function watchUsers(onChange: (users: ManagedUser[]) => void, onError: (error: unknown) => void): Unsubscribe {
  return onSnapshot(usersCollection(), (snapshot) => onChange(toUsers(snapshot)), onError);
}

// ---------- Escritura (solo admin; las reglas lo validan) ----------

export interface UserChangeSet {
  added: readonly NewUser[];
  /** Correo → rol nuevo. */
  roles: ReadonlyMap<string, Role>;
  /** Correos que se eliminan. */
  removed: ReadonlySet<string>;
}

/**
 * Guarda los cambios del administrador. Primero crea las cuentas con contraseña (no se
 * pueden crear dentro de un lote de Firestore) y luego guarda todos los perfiles en un solo lote:
 * o quedan todos o ninguno. Al crear una cuenta se borra su contraseña del cambio pendiente, así
 * un reintento después de un error no intenta crearla otra vez.
 *
 * Eliminar no borra el documento: lo marca inactivo. Así no puede entrar ni aparece como vendedor,
 * pero las ventas, comisiones y pagos que lo nombran siguen siendo válidos.
 */
export async function saveUserChanges(changes: UserChangeSet, adminEmail: string): Promise<void> {
  for (const user of changes.added) {
    if (user.password === null) continue;
    await createPasswordAccount(user.email, user.password);
    user.password = null;
  }

  const db = getDb();
  const batch = writeBatch(db);
  const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: adminEmail });

  for (const user of changes.added) {
    batch.set(doc(db, 'users', user.email), { name: user.name, role: user.role, access: user.access, active: true, ...stamp() }, { merge: true });
    const contact = {
      ...(user.documentNumber && { documentNumber: user.documentNumber }),
      ...(user.phone && { phone: user.phone }),
    };
    if (Object.keys(contact).length > 0) batch.set(doc(db, 'employees', user.email), contact, { merge: true });
  }
  for (const [email, role] of changes.roles) {
    batch.update(doc(db, 'users', email), { role, ...stamp() });
  }
  for (const email of changes.removed) {
    batch.update(doc(db, 'users', email), { active: false, ...stamp() });
  }
  await batch.commit();
}
