/** Conexión de los scripts a Firestore con firebase-admin (cuenta de servicio). */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'labcar-f04e5';

/**
 * Requiere una clave de cuenta de servicio (Firebase → Configuración del proyecto →
 * Cuentas de servicio → Generar nueva clave privada) guardada como ./service-account.json
 * o indicada en GOOGLE_APPLICATION_CREDENTIALS. Nunca subas esa clave al repositorio.
 */
export function connect(): Firestore {
  const keyPath = resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? 'service-account.json');
  if (!existsSync(keyPath)) {
    console.error(`No encontré la clave de cuenta de servicio en ${keyPath}.`);
    console.error('Descárgala en Firebase → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8')) as ServiceAccount;
  initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
  return getFirestore();
}
