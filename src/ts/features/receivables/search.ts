import { searchKey } from '../../lib/text';
import type { Sale } from '../../models/sale';
import { agingOf, type Aging } from './aging';

/** Venta en cartera con su antigüedad ya calculada. */
export interface Receivable {
  sale: Sale;
  aging: Aging;
}

export const AGING_FILTERS = ['all', 'overdue', 'current'] as const;
export type AgingFilter = (typeof AGING_FILTERS)[number];

export const SORT_ORDERS = ['oldest', 'amount', 'name', 'newest'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export interface ReceivableFilters {
  /** Cédula/NIT, nombre, celular o placa; vacío = todas. */
  term: string;
  aging: AgingFilter;
  sort: SortOrder;
}

export interface ReceivablesView {
  /** Resultado de búsqueda + filtro + orden: lo que se muestra. */
  visible: Receivable[];
  /** Conteos de los chips (después de la búsqueda, antes del filtro por mora). */
  counts: Record<AgingFilter, number>;
}

/** Con menos de 3 caracteres casi todo coincidiría por documento, celular o placa. */
const MIN_CODE_LENGTH = 3;

/**
 * La búsqueda ignora tildes, mayúsculas, puntos, guiones y espacios:
 * "1.017.234" encuentra la CC 1017234988, "300 456" el celular 3004567890, "abc-123" la placa ABC123
 * y "morales seb" a Sebastián Morales. Un NIT con dígito de verificación ("900823114-1") se busca sin él.
 */
function matches(sale: Sale, term: string): boolean {
  const text = searchKey(term.replace(/^([\d.\s]+)-\d$/, '$1'));
  if (!text) return true;
  const customer = sale.customer;
  const code = text.replace(/[^a-z0-9]/g, '');
  if (code.length >= MIN_CODE_LENGTH) {
    const isNumber = /^\d+$/.test(code);
    if (searchKey(customer?.documentNumber ?? '').includes(code)) return true;
    if (isNumber && (customer?.phone ?? '').includes(code)) return true;
    if (sale.plate.toLowerCase().includes(code)) return true;
  }
  const name = searchKey(customer?.name ?? '');
  return text.split(/\s+/).every((word) => name.includes(word));
}

const COMPARATORS: Record<SortOrder, (a: Receivable, b: Receivable) => number> = {
  oldest: (a, b) => a.sale.date.getTime() - b.sale.date.getTime(),
  newest: (a, b) => b.sale.date.getTime() - a.sale.date.getTime(),
  amount: (a, b) => b.sale.total - a.sale.total,
  name: (a, b) => (a.sale.customer?.name ?? '').localeCompare(b.sale.customer?.name ?? '', 'es', { sensitivity: 'base' }),
};

export function buildView(sales: readonly Sale[], overdueDays: number, filters: ReceivableFilters, now = new Date()): ReceivablesView {
  const found = sales
    .filter((sale) => matches(sale, filters.term))
    .map((sale) => ({ sale, aging: agingOf(sale, overdueDays, now) }));
  const overdue = found.filter((item) => item.aging.overdue).length;
  const visible = found
    .filter((item) => filters.aging === 'all' || (filters.aging === 'overdue') === item.aging.overdue)
    .sort(COMPARATORS[filters.sort]);
  return { visible, counts: { all: found.length, overdue, current: found.length - overdue } };
}

export interface ReceivablesSummary {
  total: number;
  count: number;
  /** Clientes distintos (por documento). */
  customers: number;
  overdueCount: number;
  overdueTotal: number;
}

/** Totales de toda la cartera (sin filtros): tarjeta de resumen. */
export function summarize(sales: readonly Sale[], overdueDays: number, now = new Date()): ReceivablesSummary {
  const overdue = sales.filter((sale) => agingOf(sale, overdueDays, now).overdue);
  const customers = new Set(sales.map((sale) => sale.customer?.documentNumber || sale.id));
  return {
    total: sales.reduce((sum, sale) => sum + sale.total, 0),
    count: sales.length,
    customers: customers.size,
    overdueCount: overdue.length,
    overdueTotal: overdue.reduce((sum, sale) => sum + sale.total, 0),
  };
}
