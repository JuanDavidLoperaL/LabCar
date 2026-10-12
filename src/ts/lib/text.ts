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

/** Palabras que van en minúscula dentro de un nombre ("Corrección de Pintura", "Vidrios y Rines"). */
const LOWERCASE_WORDS = new Set(['a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'o', 'para', 'por', 'sin', 'u', 'y', 'e']);

const MAX_ACRONYM_LENGTH = 4;

/**
 * Cada palabra con mayúscula inicial: "lavado de motor" → "Lavado de Motor".
 * Los conectores quedan en minúscula (salvo al inicio) y las siglas cortas se respetan ("PPF", "9H").
 */
export function capitalizeWords(value: string): string {
  return value
    .split(' ')
    .map((word, index) => {
      // Sigla corta en mayúsculas ("PPF", "9H"); una palabra larga en mayúsculas es Bloq Mayús, no sigla.
      if (word.length > 1 && word.length <= MAX_ACRONYM_LENGTH && word === word.toUpperCase() && /\p{L}/u.test(word)) return word;
      const lower = word.toLocaleLowerCase('es');
      if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
    })
    .join(' ');
}
