import type { VehicleType } from '../../models/sale';

/** Placas colombianas: carro ABC123 · moto ABC12D. "Otra placa" admite extranjeras/especiales. */
const PLATE_PATTERNS: Record<VehicleType, RegExp> = {
  car: /^[A-Z]{3}\d{3}$/,
  motorcycle: /^[A-Z]{3}\d{2}[A-Z]$/,
};

const OTHER_PLATE_PATTERN = /^[A-Z0-9]{3,10}$/;

export const PLATE_HINTS: Record<VehicleType, { placeholder: string; help: string }> = {
  car: { placeholder: 'ABC-123', help: 'Carro: 3 letras y 3 números' },
  motorcycle: { placeholder: 'ABC-12D', help: 'Moto: 3 letras, 2 números y 1 letra' },
};

/** L = letra, D = dígito, por posición. */
const PLATE_MASKS: Record<VehicleType, readonly ('L' | 'D')[]> = {
  car: ['L', 'L', 'L', 'D', 'D', 'D'],
  motorcycle: ['L', 'L', 'L', 'D', 'D', 'L'],
};

/** Largo máximo del campo con máscara: 6 caracteres + guion. */
export const MASKED_PLATE_LENGTH = 7;
export const OTHER_PLATE_LENGTH = 10;

/**
 * Máscara de placa colombiana mientras se escribe: solo acepta el tipo de carácter que va en cada
 * posición (lo demás se ignora) y pone el guion. "abc1234" (carro) → "ABC-123"; "abc12d" (moto) → "ABC-12D".
 */
export function maskPlate(value: string, type: VehicleType): string {
  const mask = PLATE_MASKS[type];
  let plate = '';
  for (const char of value.toUpperCase()) {
    if (plate.length === mask.length) break;
    const expected = mask[plate.length];
    if ((expected === 'L' && /[A-Z]/.test(char)) || (expected === 'D' && /\d/.test(char))) plate += char;
  }
  return plate.length > 3 ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;
}

/** Deja solo letras y números en mayúscula: "abc-123 " → "ABC123". */
export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Formato de lectura: "ABC123" → "ABC-123", "ABC12D" → "ABC-12D"; otras placas sin cambio. */
export function formatPlate(plate: string): string {
  return /^[A-Z]{3}[0-9]/.test(plate) && plate.length === 6 ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;
}

export function isValidPlate(plate: string, type: VehicleType, otherFormat: boolean): boolean {
  return otherFormat ? OTHER_PLATE_PATTERN.test(plate) : PLATE_PATTERNS[type].test(plate);
}
