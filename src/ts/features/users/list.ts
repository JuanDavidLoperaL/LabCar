import { displayIdentifier, isInternalAccount } from '../../lib/auth';
import { initials, pluralize } from '../../lib/format';
import { isRole, ROLE_LABELS, type Role } from '../../lib/roles';
import { searchKey } from '../../lib/text';
import type { ManagedUser } from '../../models/user';
import { byId } from '../../ui/dom';
import { cloneTemplate, field, setField } from '../../ui/template';
import type { PendingChanges } from './changes';

export type RoleFilter = Role | 'all';

export interface ListFilters {
  term: string;
  role: RoleFilter;
}

/** Fila de la lista: un empleado guardado o uno agregado que aún no se guarda. */
interface Row {
  email: string;
  name: string;
  access: ManagedUser['access'];
  /** Rol que tendrá al guardar. */
  role: Role;
  savedRole: Role | null;
  state: 'saved' | 'added' | 'removed';
}

function buildRows(users: readonly ManagedUser[], changes: PendingChanges): Row[] {
  const added = changes.added.map<Row>((user) => ({ email: user.email, name: user.name, access: user.access, role: user.role, savedRole: null, state: 'added' }));
  const saved = users
    .filter((user) => user.active)
    .map<Row>((user) => ({
      email: user.email,
      name: user.name,
      access: user.access,
      role: changes.roles.get(user.email) ?? user.role,
      savedRole: user.role,
      state: changes.removed.has(user.email) ? 'removed' : 'saved',
    }));
  return [...added, ...saved];
}

/** Nombre, correo, usuario o rol; ignora tildes y mayúsculas ("perez jua" encuentra a Juan Pérez). */
function matches(row: Row, term: string): boolean {
  const words = searchKey(term).split(/\s+/).filter(Boolean);
  const text = searchKey(`${row.name} ${row.email} ${displayIdentifier(row.email)} ${ROLE_LABELS[row.role]}`);
  return words.every((word) => text.includes(word));
}

export interface UserListActions {
  onRoleChange: (email: string, role: Role) => void;
  onToggleRemove: (email: string) => void;
  onDiscardAdded: (email: string) => void;
  onResetPassword: (user: Pick<ManagedUser, 'email' | 'name' | 'access'>) => void;
}

/** Pinta la lista con la búsqueda, el filtro por rol y los cambios pendientes marcados en cada fila. */
export function renderUserList(
  users: readonly ManagedUser[],
  changes: PendingChanges,
  filters: ListFilters,
  selfEmail: string,
  actions: UserListActions,
): void {
  const found = buildRows(users, changes).filter((row) => matches(row, filters.term));
  const visible = found.filter((row) => filters.role === 'all' || row.role === filters.role);

  // Conteos de los chips: después de la búsqueda, antes del filtro por rol.
  byId('role-filter')
    .querySelectorAll<HTMLButtonElement>('[data-role]')
    .forEach((chip) => {
      const role = chip.dataset.role;
      const count = isRole(role) ? found.filter((row) => row.role === role).length : found.length;
      chip.querySelector('[data-count]')!.textContent = String(count);
      chip.setAttribute('aria-pressed', String(role === filters.role));
    });

  const activeCount = users.filter((user) => user.active).length;
  byId('list-count').textContent = pluralize(activeCount, 'empleado', 'empleados');
  byId('user-list').replaceChildren(...visible.map((row) => renderRow(row, row.email === selfEmail, actions)));
  byId('user-empty').hidden = visible.length > 0;
  byId('user-empty-text').textContent =
    activeCount === 0 && changes.added.length === 0 ? 'Aún no hay empleados. Agrega el primero.' : 'Ningún empleado coincide con la búsqueda.';
}

function renderRow(row: Row, isSelf: boolean, actions: UserListActions): HTMLLIElement {
  const item = cloneTemplate<HTMLLIElement>('tpl-user');
  const roleChanged = row.savedRole !== null && row.role !== row.savedRole && row.state === 'saved';
  item.dataset.state = row.state;
  item.dataset.roleChanged = String(roleChanged);
  item.dataset.self = String(isSelf);

  setField(item, 'initials', initials(row.name));
  setField(item, 'name', row.name);
  setField(item, 'identifier', displayIdentifier(row.email));
  // Usuario sin correo, correo con contraseña o cuenta de Google.
  setField(item, 'access-icon', isInternalAccount(row.email) ? 'badge' : row.access === 'password' ? 'key' : 'mail');
  setField(item, 'previous-role', row.savedRole ? ROLE_LABELS[row.savedRole] : '');

  const select = field<HTMLSelectElement>(item, 'role');
  const selectId = `role-${row.email}`;
  select.id = selectId;
  field(item, 'role-label').setAttribute('for', selectId);
  setField(item, 'role-label', `Rol de ${row.name}`);
  select.value = row.role;
  // Un agregado sin guardar se corrige quitándolo y agregándolo de nuevo.
  select.disabled = isSelf || row.state !== 'saved';
  if (isSelf) select.title = 'No puedes cambiar tu propio rol';
  select.addEventListener('change', () => {
    if (isRole(select.value)) actions.onRoleChange(row.email, select.value);
  });

  const removeBtn = item.querySelector<HTMLButtonElement>('[data-action="remove"]')!;
  removeBtn.disabled = isSelf;
  removeBtn.title = isSelf ? 'No puedes eliminar tu propia cuenta' : 'Eliminar usuario';
  removeBtn.setAttribute('aria-label', `Eliminar a ${row.name}`);
  removeBtn.addEventListener('click', () => actions.onToggleRemove(row.email));

  // Solo en empleados ya guardados; el popup explica si no aplica (sin correo o cuenta de Google).
  const resetBtn = item.querySelector<HTMLButtonElement>('[data-action="reset-password"]')!;
  resetBtn.setAttribute('aria-label', `Reestablecer la contraseña de ${row.name}`);
  resetBtn.addEventListener('click', () => actions.onResetPassword(row));

  const undoBtn = item.querySelector<HTMLButtonElement>('[data-action="undo"]')!;
  undoBtn.title = row.state === 'added' ? 'Quitar de la lista' : 'No eliminar';
  undoBtn.setAttribute('aria-label', `${undoBtn.title}: ${row.name}`);
  undoBtn.addEventListener('click', () =>
    row.state === 'added' ? actions.onDiscardAdded(row.email) : actions.onToggleRemove(row.email),
  );
  return item;
}
