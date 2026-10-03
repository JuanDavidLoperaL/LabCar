/**
 * Rangos de fechas calculados en hora de Colombia (UTC-5, sin horario de verano),
 * sin importar la zona horaria del computador desde donde se abra el sistema.
 */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
export const BOGOTA_TIME_ZONE = 'America/Bogota';

export type Period = 'day' | 'week' | 'month';

export const PERIODS: readonly Period[] = ['day', 'week', 'month'];

/** Rango semiabierto: incluye `start`, excluye `end`. */
export interface DateRange {
  start: Date;
  end: Date;
}

export function isPeriod(value: unknown): value is Period {
  return typeof value === 'string' && (PERIODS as readonly string[]).includes(value);
}

export interface BogotaDay {
  year: number;
  month: number;
  day: number;
  /** 0 = domingo … 6 = sábado */
  weekday: number;
}

export function toBogotaDay(date: Date): BogotaDay {
  const shifted = new Date(date.getTime() - BOGOTA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** Medianoche en Bogotá. Acepta días/meses fuera de rango (Date.UTC los normaliza). */
function bogotaMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) + BOGOTA_OFFSET_MS);
}

/** El negocio abre de lunes a sábado: la semana del filtro termina el sábado a medianoche. */
const BUSINESS_DAYS_PER_WEEK = 6;
const SUNDAY = 0;

function mondayOffset(weekday: number): number {
  return (weekday + 6) % 7;
}

/** Día hábil que está `offset` días hábiles antes (negativo) o después (positivo); los domingos se saltan. */
function shiftBusinessDays(year: number, month: number, day: number, offset: number): number {
  const step = Math.sign(offset);
  let target = day;
  for (let remaining = Math.abs(offset); remaining > 0; ) {
    target += step;
    if (toBogotaDay(bogotaMidnight(year, month, target)).weekday !== SUNDAY) remaining--;
  }
  return target;
}

/**
 * Rango de un periodo: `offset` 0 es el actual (hoy, esta semana de lunes a sábado, este mes),
 * -1 el anterior, -2 el de antes, etc. En "día" se cuentan días hábiles: el anterior al lunes es el sábado.
 */
export function periodRange(period: Period, offset = 0, now = new Date()): DateRange {
  const { year, month, day, weekday } = toBogotaDay(now);
  switch (period) {
    case 'day': {
      const target = shiftBusinessDays(year, month, day, offset);
      return { start: bogotaMidnight(year, month, target), end: bogotaMidnight(year, month, target + 1) };
    }
    case 'week': {
      const monday = day - mondayOffset(weekday) + 7 * offset;
      return { start: bogotaMidnight(year, month, monday), end: bogotaMidnight(year, month, monday + BUSINESS_DAYS_PER_WEEK) };
    }
    case 'month':
      return { start: bogotaMidnight(year, month + offset, 1), end: bogotaMidnight(year, month + offset + 1, 1) };
  }
}
