import {
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { getDb, getFirebaseAuth } from './firebase';

export const ROUTES = {
  login: '/html/login.html',
  home: '/html/inicio.html',
} as const;

/**
 * Los empleados sin correo entran con un nombre de usuario. Firebase Auth exige un correo,
 * así que el usuario "juan" se guarda en Auth como "juan@usuarios.labcar.local".
 */
export const USERNAME_DOMAIN = 'usuarios.labcar.local';

/** Perfil del sistema guardado en Firestore: users/{correo}. Solo quien tenga perfil activo puede entrar. */
export interface UserProfile {
  name: string;
  role: 'admin' | 'employee';
  active: boolean;
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

async function applyPersistence(remember: boolean): Promise<void> {
  await setPersistence(getFirebaseAuth(), remember ? browserLocalPersistence : browserSessionPersistence);
}

/** Verifica que el usuario autenticado tenga un perfil activo; si no, cierra la sesión. */
async function authorize(user: User): Promise<SessionUser> {
  const email = user.email?.toLowerCase();
  let profile: UserProfile | undefined;
  if (email) {
    try {
      const snap = await getDoc(doc(getDb(), 'users', email));
      profile = snap.exists() ? (snap.data() as UserProfile) : undefined;
    } catch (error) {
      // Las reglas de Firestore niegan la lectura cuando el perfil no corresponde a este usuario.
      if (!(error instanceof FirebaseError && error.code === 'permission-denied')) throw error;
    }
  }
  if (!profile || profile.active !== true) {
    await signOut(getFirebaseAuth());
    throw new NotAuthorizedError(email);
  }
  return { user, profile };
}

export async function loginWithPassword(identifier: string, password: string, remember: boolean): Promise<SessionUser> {
  await applyPersistence(remember);
  const { user } = await signInWithEmailAndPassword(getFirebaseAuth(), toAuthEmail(identifier), password);
  return authorize(user);
}

export async function loginWithGoogle(remember: boolean): Promise<SessionUser> {
  await applyPersistence(remember);
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

/** Resuelve con la sesión actual autorizada (o null) cuando Firebase termina de restaurarla. */
export function currentSession(): Promise<SessionUser | null> {
  const auth = getFirebaseAuth();
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (!user) return resolve(null);
      authorize(user).then(resolve, (error) => (error instanceof NotAuthorizedError ? resolve(null) : reject(error)));
    });
  });
}

/** Protege una página: si no hay sesión autorizada, redirige al login. */
export async function requireSession(): Promise<SessionUser> {
  const session = await currentSession();
  if (!session) {
    window.location.replace(ROUTES.login);
    throw new Error('Sin sesión');
  }
  return session;
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof NotAuthorizedError) return error.message;
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
    case 'auth/network-request-failed':
      return 'Sin conexión. Revisa tu internet.';
    default:
      return 'No se pudo completar la operación. Intenta de nuevo.';
  }
}
