import { Timestamp } from 'firebase/firestore';

/** Lectura defensiva de documentos de Firestore: un campo mal escrito no rompe la página. */

export type Raw = Record<string, unknown>;

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function asDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

export function asOneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function asRecord(value: unknown): Raw | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : null;
}

export function asRecords(value: unknown): Raw[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Raw => item !== null) : [];
}
