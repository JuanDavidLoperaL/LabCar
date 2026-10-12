import { PAYOUT_CUTOFF } from '../../config/business';
import { toDateInputValue, weekEndingAtCutoff, type DateRange } from '../../lib/dates';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** El negocio abre de lunes a sábado: son los días que se muestran como "la semana". */
const BUSINESS_DAYS = 6;

/** Semana de liquidación: del corte del sábado anterior (7:00 p. m.) al corte de este sábado. */
export interface PayoutWeek {
  /** Día del corte, "AAAA-MM-DD". Identifica la semana en los pagos registrados. */
  id: string;
  /** Rango real de las ventas que entran (semiabierto). */
  range: DateRange;
  /** Lunes a sábado, solo para mostrar el nombre de la semana. */
  days: DateRange;
  /** 0 = semana en curso, -1 = la anterior, etc. */
  offset: number;
  isCurrent: boolean;
}

export function payoutWeek(offset: number, now = new Date()): PayoutWeek {
  const range = weekEndingAtCutoff(PAYOUT_CUTOFF, offset, now);
  // Colombia no tiene horario de verano: restar horas exactas siempre cae en la medianoche del sábado.
  const saturdayMidnight = range.end.getTime() - PAYOUT_CUTOFF.hour * HOUR_MS;
  return {
    id: toDateInputValue(range.end),
    range,
    days: { start: new Date(saturdayMidnight - (BUSINESS_DAYS - 1) * DAY_MS), end: new Date(saturdayMidnight + DAY_MS) },
    offset,
    isCurrent: offset === 0,
  };
}
