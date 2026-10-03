import { BOGOTA_TIME_ZONE, toBogotaDay, type DateRange } from './dates';

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const longDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const shortDateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const shortDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** 18 oct 2026 */
export function formatShortDate(date: Date): string {
  return shortDateFormatter.format(date);
}

/** $ 1.850.000 */
export function formatCOP(value: number): string {
  return copFormatter.format(Math.round(value));
}

/** Jueves, 24 de octubre */
export function formatLongDate(date: Date): string {
  const text = longDateFormatter.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 24 oct, 3:15 p. m. */
export function formatShortDateTime(date: Date): string {
  return shortDateTimeFormatter.format(date);
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/**
 * Días que abarca un rango, en hora de Colombia:
 * un día → "vie 2 oct" · varios días → "lun 28 sep – sáb 3 oct" · mismo mes → "1 – 31 oct".
 * El año se muestra si el rango cruza de año o no es del año actual ("1 – 30 sep 2025").
 */
export function formatRangeLabel(range: DateRange, now = new Date()): string {
  const first = toBogotaDay(range.start);
  const last = toBogotaDay(new Date(range.end.getTime() - 1));
  const withYear = first.year !== last.year || first.year !== toBogotaDay(now).year;
  const day = (d: typeof first, weekday: boolean) =>
    `${weekday ? `${WEEKDAYS[d.weekday]} ` : ''}${d.day} ${MONTHS[d.month]}${withYear ? ` ${d.year}` : ''}`;

  if (first.year === last.year && first.month === last.month && first.day === last.day) return day(first, true);
  const isWholeMonth = first.day === 1 && first.month === last.month && toBogotaDay(range.end).day === 1;
  if (isWholeMonth) return `${first.day} – ${last.day} ${MONTHS[last.month]}${withYear ? ` ${last.year}` : ''}`;
  return `${day(first, true)} – ${day(last, true)}`;
}

/** "Carlos Mendoza" → "CM" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
