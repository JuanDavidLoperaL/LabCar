/** Texto para búsquedas: minúsculas y sin tildes ("Cerámico" → "ceramico"). */
export function searchKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** "650.000" o "$ 650.000" → 650000. Vacío o inválido → 0. */
export function parsePesos(value: string): number {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

/** 650000 → "650.000" (para inputs de precio mientras se escribe). */
export function formatThousands(value: number): string {
  return value > 0 ? value.toLocaleString('es-CO') : '';
}
