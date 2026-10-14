import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  browserSessionPersistence,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { getAccountsAuth, getDb, getFirebaseAuth } from './firebase';
import { isRole, type Role } from './roles';

export const ROUTES = {
  login: '/html/login.html',
} as const;

/**
 * Los empleados sin correo entran con un nombre de usuario. Firebase Auth exige un correo,
 * así que el usuario "juan" se guarda en Auth como "juan@usuarios.labcar.local".
 */
export const USERNAME_DOMAIN = 'usuarios.labcar.local';

/** Cómo entra un empleado: con Google o con contraseña (cuenta creada por el administrador). */
export type AccessType = 'google' | 'password';

/** Perfil del sistema guardado en Firestore: users/{correo}. Solo quien tenga perfil activo puede entrar. */
export interface UserProfile {
  name: string;
  role: Role;
  access: AccessType;
  active: boolean;
}

/** Un rol desconocido o mal escrito se trata como el de menor privilegio. */
function parseProfile(data: Record<string, unknown>): UserProfile {
  return {
    name: typeof data.name === 'string' ? data.name : '',
    role: isRole(data.role) ? data.role : 'basic',
    access: data.access === 'password' ? 'password' : 'google',
    active: data.active === true,
  };
}

export interface SessionUser {
  user: User;
  profile: UserProfile;
}

class NotAuthorizedError extends Error {
  constructor(email: string | undefined) {
    super(`La cuenta ${email ?? ''} no tiene acceso a LAB CAR. Pide al administrador que te habilite.`);
  }
}

export function isUsername(identifier: string): boolean {
  return !identifier.includes('@');
}

/** Convierte lo que escribe la persona (usuario o correo) en el correo que usa Firebase Auth. */
export function toAuthEmail(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  return isUsername(value) ? `${value}@${USERNAME_DOMAIN}` : value;
}

/**
 * "Recordar mi sesión": guarda la sesión en el navegador (local) o solo mientras la pestaña esté abierta.
 * Se llama al cargar el login y al cambiar la casilla, no al hacer clic en Google: la ventana de Google
 * debe abrirse de inmediato tras el clic o el navegador puede bloquearla.
 */
export function setRememberSession(remember: boolean): Promise<void> {
  return setPersistence(getFirebaseAuth(), remember ? browserLocalPersistence : browserSessionPersistence);
}

export function isInternalAccount(email: string): boolean {
  return email.endsWith(`@${USERNAME_DOMAIN}`);
}

/** Lo que se le muestra a la persona: el usuario ("juan") o el correo. */
export function displayIdentifier(email: string): string {
  return isInternalAccount(email) ? email.slice(0, -USERNAME_DOMAIN.length - 1) : email;
}

/** La cuenta ya existe en Firebase Auth con otra contraseña: no se puede reutilizar. */
class AccountExistsError extends Error {
  constructor(email: string) {
    super(
      `Ya existe una cuenta de acceso para ${displayIdentifier(email)} con otra contraseña. ` +
        'Escribe la contraseña que tenía, o borra esa cuenta en Firebase → Authentication y vuelve a intentarlo.',
    );
  }
}

/**
 * Crea la cuenta con contraseña (Auth) de un empleado: con su correo o con usuario@usuarios.labcar.local.
 * Solo la cuenta: el acceso lo da su perfil en users/, que guarda el administrador. Usa una conexión
 * aparte para no cambiar la sesión del administrador.
 *
 * Si la cuenta ya existe (p. ej. se borró el perfil desde la consola de Firebase, pero no la cuenta),
 * se reutiliza solo si la contraseña escrita es la suya: así se sabe que no la creó un extraño.
 */
export async function createPasswordAccount(email: string, password: string): Promise<void> {
  const auth = getAccountsAuth();
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    if (!(error instanceof FirebaseError && error.code === 'auth/email-already-in-use')) throw error;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      throw new AccountExistsError(email);
    }
  }
  await signOut(auth);
}

/** Verifica que el usuario autenticado tenga un perfil activo; si no, cierra la sesión. */
async function authorize(user: User): Promise<SessionUser> {
  const email = user.email?.toLowerCase();
  let profile: UserProfile | undefined;
  if (email) {
    try {
      const snap = await getDoc(doc(getDb(), 'users', email));
      profile = snap.exists() ? parseProfile(snap.data()) : undefined;
    } catch (error) {
      // Las reglas de Firestore niegan la lectura cuando el perfil no corresponde a este usuario.
      if (!(error instanceof FirebaseError && error.code === 'permission-denied')) throw error;
    }
  }
  // Un correo sin verificar podría pertenecer a otra persona: no se le asigna el perfil. Salvo las
  // cuentas con contraseña que creó el administrador (nadie más pudo crear una con ese correo).
  const ownsProfile = user.emailVerified || (email !== undefined && isInternalAccount(email)) || profile?.access === 'password';
  if (!profile?.active || !ownsProfile) {
    await signOut(getFirebaseAuth());
    throw new NotAuthorizedError(email);
  }
  return { user, profile };
}

export async function loginWithPassword(identifier: string, password: string): Promise<SessionUser> {
  const { user } = await signInWithEmailAndPassword(getFirebaseAuth(), toAuthEmail(identifier), password);
  return authorize(user);
}

export async function loginWithGoogle(): Promise<SessionUser> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const { user } = await signInWithPopup(getFirebaseAuth(), provider);
  return authorize(user);
}

export function logout(): Promise<void> {
  return signOut(getFirebaseAuth());
}

export function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(getFirebaseAuth(), email.trim());
}

/** Sesión actual autorizada (o null), cuando Firebase termina de restaurarla. */
export async function currentSession(): Promise<SessionUser | null> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  if (!auth.currentUser) return null;
  try {
    return await authorize(auth.currentUser);
  } catch (error) {
    if (error instanceof NotAuthorizedError) return null;
    throw error;
  }
}

/** Protege una página: si no hay sesión autorizada, redirige al login. */
export async function requireSession(): Promise<SessionUser> {
  const session = await currentSession();
  if (!session) {
    window.location.replace(ROUTES.login);
    // La página se está yendo al login: no se resuelve para que no siga ejecutándose.
    return new Promise<never>(() => {});
  }
  return session;
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof NotAuthorizedError || error instanceof AccountExistsError) return error.message;
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
  switch (error.code) {
    case 'auth/invalid-email':
      return 'El usuario o correo no es válido.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Usuario o contraseña incorrectos.';
    case 'auth/user-disabled':
      return 'Este usuario está deshabilitado.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Se cerró la ventana de Google antes de terminar.';
    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes e intenta de nuevo.';
    case 'auth/unauthorized-domain':
      return 'Este dominio no está autorizado en Firebase Authentication.';
    case 'auth/configuration-not-found':
    case 'auth/operation-not-allowed':
      return 'Este método de inicio de sesión no está activado en Firebase.';
    case 'auth/weak-password':
      return 'La contraseña es muy débil: usa al menos 6 caracteres.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Revisa tu internet.';
    default:
      return 'No se pudo completar la operación. Intenta de nuevo.';
  }
}
