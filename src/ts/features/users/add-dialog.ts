import { USER_LIMITS } from '../../config/business';
import { ROLE_DESCRIPTIONS, isRole } from '../../lib/roles';
import type { ManagedUser, NewUser } from '../../models/user';
import { byId } from '../../ui/dom';
import { setupPasswordToggle } from '../../ui/password-toggle';
import { isInternalAccount, type AccessType } from '../../lib/auth';
import { draftEmail, findRemovedUser, validateNewUser, type DraftField, type NewUserDraft } from './validation';

const INPUT_IDS: Record<DraftField, string> = {
  name: 'add-name',
  email: 'add-email',
  login: 'add-login',
  password: 'add-password',
  documentNumber: 'add-document',
  phone: 'add-phone',
};

/**
 * Popup para agregar un empleado. No guarda nada: lo deja en la lista como cambio pendiente.
 * `context` da la lista actual y los agregados pendientes para detectar duplicados y reactivaciones.
 */
export function setupAddDialog(
  context: () => { users: readonly ManagedUser[]; pending: readonly NewUser[] },
  onAdd: (user: NewUser) => void,
): () => void {
  const dialog = byId<HTMLDialogElement>('add-dialog');
  const form = byId<HTMLFormElement>('add-form');
  const input = (fieldName: DraftField) => byId<HTMLInputElement>(INPUT_IDS[fieldName]);
  const roleSelect = byId<HTMLSelectElement>('add-role');
  const roleHelp = byId('add-role-help');

  input('name').maxLength = USER_LIMITS.nameMax;
  input('login').maxLength = USER_LIMITS.nameMax;
  input('documentNumber').maxLength = USER_LIMITS.documentMax;
  input('phone').maxLength = USER_LIMITS.phoneMax;
  setupPasswordToggle(input('password'), byId('toggle-add-password'), byId('add-password-icon'));

  const access = (): AccessType => (form.elements.namedItem('access') as RadioNodeList).value === 'password' ? 'password' : 'google';

  const showError = (fieldName: DraftField, message: string | undefined) => {
    input(fieldName).setAttribute('aria-invalid', String(message !== undefined));
    const error = byId(`${INPUT_IDS[fieldName]}-error`);
    error.textContent = message ?? '';
    error.hidden = message === undefined;
  };
  const clearErrors = () => (Object.keys(INPUT_IDS) as DraftField[]).forEach((name) => showError(name, undefined));

  /** Muestra los campos del tipo de acceso y avisa si el usuario se va a reactivar (no pide contraseña). */
  function syncFields(): void {
    const type = access();
    byId('field-email').hidden = type !== 'google';
    byId('field-login').hidden = type !== 'password';
    // Una cuenta con contraseña eliminada se reactiva con su contraseña anterior: no se pide otra.
    const login = input('login').value.trim();
    const removed = type === 'password' && login !== '' ? findRemovedUser(draftEmail({ access: type, email: '', login }), context().users) : undefined;
    const keepsPassword = removed !== undefined && (removed.access === 'password' || isInternalAccount(removed.email));
    byId('field-password').hidden = keepsPassword;
    byId('reactivate-help').hidden = !keepsPassword;
    roleHelp.textContent = isRole(roleSelect.value) ? ROLE_DESCRIPTIONS[roleSelect.value] : '';
  }

  form.addEventListener('change', syncFields);
  input('login').addEventListener('input', syncFields);
  (Object.keys(INPUT_IDS) as DraftField[]).forEach((name) => input(name).addEventListener('input', () => showError(name, undefined)));
  dialog.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft: NewUserDraft = {
      name: input('name').value,
      access: access(),
      email: input('email').value,
      login: input('login').value,
      password: input('password').value,
      role: isRole(roleSelect.value) ? roleSelect.value : 'basic',
      documentNumber: input('documentNumber').value,
      phone: input('phone').value,
    };
    const { users, pending } = context();
    const result = validateNewUser(draft, users, pending);
    clearErrors();
    if (!result.ok) {
      const fields = Object.keys(result.errors) as DraftField[];
      fields.forEach((name) => showError(name, result.errors[name]));
      input(fields[0]).focus();
      return;
    }
    onAdd(result.user);
    dialog.close();
  });

  return () => {
    form.reset();
    input('password').type = 'password';
    byId('add-password-icon').textContent = 'visibility';
    clearErrors();
    syncFields();
    dialog.showModal();
    input('name').focus();
  };
}
