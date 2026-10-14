import { USER_LIMITS } from '../../config/business';
import { isInternalAccount, USERNAME_DOMAIN, type AccessType } from '../../lib/auth';
import type { Role } from '../../lib/roles';
import { capitalizeWords } from '../../lib/text';
import type { ManagedUser, NewUser } from '../../models/user';

export interface NewUserDraft {
  name: string;
  access: AccessType;
  /** Cuenta de Google. */
  email: string;
  /** Cuenta con contraseña: un usuario (sin @) o un correo. */
  login: string;
  password: string;
  role: Role;
  documentNumber: string;
  phone: string;
}

export type DraftField = 'name' | 'email' | 'login' | 'password' | 'documentNumber' | 'phone';

export type DraftResult = { ok: true; user: NewUser } | { ok: false; errors: Partial<Record<DraftField, string>> };

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

export function normalizeUserName(value: string): string {
  return capitalizeWords(value.trim().replace(/\s+/g, ' '));
}

function normalizeLogin(value: string): string {
  return value.trim().toLowerCase();
}

/** ID en users/ que tendría el borrador: el correo, o usuario@usuarios.labcar.local si es un usuario. */
export function draftEmail(draft: Pick<NewUserDraft, 'access' | 'email' | 'login'>): string {
  if (draft.access === 'google') return draft.email.trim().toLowerCase();
  const login = normalizeLogin(draft.login);
  return login.includes('@') ? login : `${login}@${USERNAME_DOMAIN}`;
}

function emailError(email: string): string | undefined {
  if (!EMAIL_PATTERN.test(email)) return 'Escribe un correo válido, ej. nombre@gmail.com.';
  if (isInternalAccount(email)) return 'Ese correo es interno del sistema. Escribe solo el usuario (sin @).';
  return undefined;
}

/** Usuario eliminado con ese ID: al agregarlo de nuevo se reactiva (y conserva su contraseña). */
export function findRemovedUser(email: string, users: readonly ManagedUser[]): ManagedUser | undefined {
  return users.find((user) => user.email === email && !user.active);
}

export function validateNewUser(draft: NewUserDraft, users: readonly ManagedUser[], pending: readonly NewUser[]): DraftResult {
  const errors: Partial<Record<DraftField, string>> = {};
  const name = normalizeUserName(draft.name);
  if (name.length < USER_LIMITS.nameMin) errors.name = 'Escribe el nombre completo del empleado.';
  else if (name.includes('@')) errors.name = 'Aquí va el nombre de la persona, no un correo.';

  const email = draftEmail(draft);
  const identifierField: DraftField = draft.access === 'google' ? 'email' : 'login';
  const login = normalizeLogin(draft.login);
  if (draft.access === 'google') {
    errors.email = emailError(email);
  } else if (login.includes('@')) {
    errors.login = emailError(login);
  } else if (login.length < USER_LIMITS.usernameMin || login.length > USER_LIMITS.usernameMax) {
    errors.login = `El usuario debe tener entre ${USER_LIMITS.usernameMin} y ${USER_LIMITS.usernameMax} caracteres.`;
  } else if (!USERNAME_PATTERN.test(login)) {
    errors.login = 'Usa solo letras sin tildes, números, punto, guion o guion bajo (sin espacios).';
  }
  if (errors[identifierField] === undefined) delete errors[identifierField];

  if (!errors[identifierField]) {
    if (users.some((user) => user.email === email && user.active)) errors[identifierField] = 'Ya hay un empleado activo con ese acceso.';
    else if (pending.some((user) => user.email === email)) errors[identifierField] = 'Ya lo agregaste a la lista de cambios.';
  }

  // Reactivar una cuenta con contraseña no la crea de nuevo: conserva la contraseña anterior.
  const removed = findRemovedUser(email, users);
  const reactivate = removed !== undefined;
  const needsPassword = draft.access === 'password' && !(removed?.access === 'password' || (removed && isInternalAccount(email)));
  if (needsPassword && draft.password.length < USER_LIMITS.passwordMin) {
    errors.password = `La contraseña debe tener al menos ${USER_LIMITS.passwordMin} caracteres.`;
  }

  const documentNumber = draft.documentNumber.replace(/\D/g, '');
  const phone = draft.phone.replace(/\D/g, '');
  if (documentNumber.length > USER_LIMITS.documentMax) errors.documentNumber = 'La cédula es demasiado larga.';
  if (phone && phone.length !== 10) errors.phone = 'El celular debe tener 10 dígitos.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    user: { email, name, role: draft.role, access: draft.access, password: needsPassword ? draft.password : null, reactivate, documentNumber, phone },
  };
}
