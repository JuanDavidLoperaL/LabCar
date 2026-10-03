import { FirebaseError } from 'firebase/app';

/** Mensaje claro para errores al leer o escribir en Firestore. */
export function firestoreErrorMessage(error: unknown, action: string): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'permission-denied':
        return `No tienes permiso para ${action}. Si crees que es un error, habla con el administrador.`;
      case 'unavailable':
      case 'deadline-exceeded':
        return `No se pudo ${action}: sin conexión. Revisa tu internet e intenta de nuevo.`;
      case 'aborted':
        return `Hubo mucho movimiento al mismo tiempo y no se pudo ${action}. Intenta de nuevo.`;
      case 'failed-precondition':
        return `No se pudo ${action}: falta configurar la base de datos (índices). Avísale al administrador.`;
    }
  }
  return `No se pudo ${action}. Intenta de nuevo.`;
}

/** Código técnico del error (ej. "permission-denied") para mostrarlo junto al mensaje y poder diagnosticar. */
export function errorCode(error: unknown): string {
  if (error instanceof FirebaseError) return error.code;
  return error instanceof Error ? error.name : 'desconocido';
}
