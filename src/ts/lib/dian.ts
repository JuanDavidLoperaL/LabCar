import type { DocumentType } from '../models/sale';

/** Identificación genérica de la DIAN para facturar a "consumidor final". */
export const FINAL_CONSUMER = {
  documentNumber: '222222222222',
  name: 'Consumidor Final',
} as const;

const DV_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Dígito de verificación de un NIT (algoritmo de la DIAN, módulo 11). */
export function nitVerificationDigit(nit: string): string {
  const digits = nit.replace(/\D/g, '');
  if (digits.length === 0 || digits.length > DV_WEIGHTS.length) return '';
  const sum = [...digits].reverse().reduce((total, digit, index) => total + Number(digit) * DV_WEIGHTS[index], 0);
  const remainder = sum % 11;
  return String(remainder > 1 ? 11 - remainder : remainder);
}

/** Números de documento: solo dígitos para CC/NIT; alfanumérico para CE/pasaporte. */
export function normalizeDocumentNumber(value: string, type: DocumentType): string {
  return type === 'CC' || type === 'NIT' ? value.replace(/\D/g, '') : value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidDocumentNumber(value: string, type: DocumentType): boolean {
  return type === 'CC' || type === 'NIT' ? /^\d{5,15}$/.test(value) : /^[A-Z0-9]{4,20}$/.test(value);
}

/** Celular colombiano: 10 dígitos empezando por 3 (se aceptan +57 y espacios al escribir). */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('57') ? digits.slice(2) : digits;
}

export function isValidPhone(phone: string): boolean {
  return /^3\d{9}$/.test(phone);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
