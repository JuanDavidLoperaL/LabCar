import { SERVICE_LIMITS } from '../../config/business';
import { capitalizeWords, searchKey } from '../../lib/text';
import type { Service } from '../../models/service';

/** "  lavado   de motor " → "Lavado de Motor" (sin espacios de más y con mayúscula inicial en cada palabra). */
export function normalizeServiceName(value: string): string {
  return capitalizeWords(value.trim().replace(/\s+/g, ' '));
}

/**
 * Error del nombre o null si es válido. No se permiten nombres repetidos sin importar mayúsculas ni
 * tildes ("ceramico" = "Cerámico"). `exceptId`: el servicio que se está renombrando.
 */
export function serviceNameError(name: string, services: readonly Service[], exceptId: string | null = null): string | null {
  if (name.length < SERVICE_LIMITS.nameMin) return `Escribe el nombre del servicio (mínimo ${SERVICE_LIMITS.nameMin} caracteres).`;
  if (name.length > SERVICE_LIMITS.nameMax) return `Máximo ${SERVICE_LIMITS.nameMax} caracteres.`;
  const key = searchKey(name);
  const duplicate = services.find((service) => service.id !== exceptId && searchKey(service.name) === key);
  return duplicate ? `Ya existe el servicio "${duplicate.name}".` : null;
}

/** Cuántos accesos rápidos hay marcados. */
export function quickCount(services: readonly Service[]): number {
  return services.filter((service) => service.quick).length;
}
