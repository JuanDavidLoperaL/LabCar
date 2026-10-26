import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, initializeAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | undefined;

function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase no está configurado. Llena el archivo .env con los datos del proyecto.');
  }
  app ??= initializeApp(config);
  return app;
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

/** Firebase Functions (misma región que en functions/src/index.ts). */
export function getFunctionsClient(): Functions {
  return getFunctions(getFirebaseApp(), 'us-central1');
}

let accountsApp: FirebaseApp | undefined;

/**
 * Segunda conexión de Auth solo para crear cuentas de empleados. Crear una cuenta inicia sesión con
 * ella; si se hiciera con la conexión principal, el administrador quedaría con la sesión del empleado.
 * Va en memoria para que esa sesión no se guarde en el navegador.
 */
export function getAccountsAuth(): Auth {
  if (!accountsApp) {
    accountsApp = initializeApp(getFirebaseApp().options, 'accounts');
    return initializeAuth(accountsApp, { persistence: inMemoryPersistence });
  }
  return getAuth(accountsApp);
}
