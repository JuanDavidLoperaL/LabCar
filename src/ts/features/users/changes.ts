import type { UserChangeSet } from '../../data/users';
import { displayIdentifier, isInternalAccount } from '../../lib/auth';
import { ROLE_LABELS, type Role } from '../../lib/roles';
import type { ManagedUser, NewUser } from '../../models/user';

/**
 * Cambios que el administrador va haciendo en la lista. Nada se guarda hasta que los revisa y
 * acepta en el popup de confirmación.
 */
export class PendingChanges {
  readonly added: NewUser[] = [];
  readonly roles = new Map<string, Role>();
  readonly removed = new Set<string>();

  get count(): number {
    return this.added.length + this.roles.size + this.removed.size;
  }

  add(user: NewUser): void {
    this.added.unshift(user);
  }

  /** Quita un usuario agregado que aún no se ha guardado. */
  discardAdded(email: string): void {
    const index = this.added.findIndex((user) => user.email === email);
    if (index >= 0) this.added.splice(index, 1);
  }

  setRole(user: ManagedUser, role: Role): void {
    if (role === user.role) this.roles.delete(user.email);
    else this.roles.set(user.email, role);
  }

  /** Marca o desmarca un usuario para eliminar. Eliminarlo anula un cambio de rol pendiente. */
  toggleRemove(email: string): void {
    if (this.removed.delete(email)) return;
    this.removed.add(email);
    this.roles.delete(email);
  }

  clear(): void {
    this.added.length = 0;
    this.roles.clear();
    this.removed.clear();
  }

  /** Descarta lo que ya no aplica porque otro equipo cambió la lista mientras tanto. */
  prune(users: readonly ManagedUser[]): void {
    const active = new Map(users.filter((user) => user.active).map((user) => [user.email, user]));
    for (const [email, role] of this.roles) {
      if (active.get(email)?.role === role || !active.has(email)) this.roles.delete(email);
    }
    for (const email of this.removed) if (!active.has(email)) this.removed.delete(email);
    for (const user of [...this.added]) if (active.has(user.email)) this.discardAdded(user.email);
  }

  toChangeSet(): UserChangeSet {
    return { added: this.added, roles: this.roles, removed: this.removed };
  }
}

export type ChangeKind = 'add' | 'role' | 'remove';

export interface ChangeLine {
  kind: ChangeKind;
  title: string;
  detail: string;
}

function accessText(user: NewUser): string {
  if (isInternalAccount(user.email)) return `Entra con el usuario "${displayIdentifier(user.email)}" y contraseña`;
  return user.access === 'password' ? `Entra con el correo ${user.email} y contraseña` : `Entra con Google: ${user.email}`;
}

/** Descripción de cada cambio para el popup de confirmación. */
export function describeChanges(changes: PendingChanges, users: readonly ManagedUser[]): ChangeLine[] {
  const byEmail = new Map(users.map((user) => [user.email, user]));
  const nameOf = (email: string) => byEmail.get(email)?.name ?? displayIdentifier(email);

  const added = changes.added.map<ChangeLine>((user) => ({
    kind: 'add',
    title: `${user.reactivate ? 'Reactivar' : 'Agregar'} a ${user.name} como ${ROLE_LABELS[user.role]}`,
    detail: `${accessText(user)}.${user.reactivate && user.password === null && user.access === 'password' ? ' Conserva su contraseña anterior.' : ''}`,
  }));
  const roles = [...changes.roles].map<ChangeLine>(([email, role]) => ({
    kind: 'role',
    title: `Cambiar el rol de ${nameOf(email)}`,
    detail: `${ROLE_LABELS[byEmail.get(email)?.role ?? 'basic']} → ${ROLE_LABELS[role]}`,
  }));
  const removed = [...changes.removed].map<ChangeLine>((email) => ({
    kind: 'remove',
    title: `Eliminar a ${nameOf(email)}`,
    detail: 'Ya no podrá entrar al sistema ni aparecerá como vendedor. Sus ventas y comisiones anteriores se conservan.',
  }));
  return [...added, ...roles, ...removed];
}
