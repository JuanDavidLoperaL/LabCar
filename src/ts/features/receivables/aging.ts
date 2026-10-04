import { bogotaDaysBetween } from '../../lib/dates';
import type { Sale } from '../../models/sale';

/** Antigüedad de una venta a crédito y si ya está en mora. */
export interface Aging {
  /** Días calendario desde la venta (hora de Colombia). */
  days: number;
  overdue: boolean;
}

/** Un crédito entra en mora cuando han pasado `overdueDays` días o más desde la venta. */
export function agingOf(sale: Pick<Sale, 'date'>, overdueDays: number, now = new Date()): Aging {
  const days = Math.max(0, bogotaDaysBetween(sale.date, now));
  return { days, overdue: days >= overdueDays };
}

/** "Hoy" · "1 día" · "42 días" */
export function daysLabel(days: number): string {
  if (days === 0) return 'Hoy';
  return days === 1 ? '1 día' : `${days} días`;
}
