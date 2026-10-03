import { fetchHistory, HISTORY_LIMIT, type HistoryQuery } from '../../data/sales';
import type { DateRange } from '../../lib/dates';
import type { Sale, SaleStatus } from '../../models/sale';

export interface HistoryFilters {
  /** Placa o cédula/NIT; vacío = sin búsqueda. */
  term: string;
  range: DateRange;
  sellerEmail: string | null;
  status: SaleStatus | null;
}

export interface HistoryResult {
  sales: Sale[];
  /** true si la consulta llegó al máximo y puede haber más ventas. */
  truncated: boolean;
  /** La búsqueda por placa/cédula ignora el rango de fechas (historial completo del cliente). */
  ignoredDates: boolean;
}

interface Term {
  /** Posible placa (letras y números, sin guiones). */
  plate: string | null;
  /** Posible cédula/NIT/CE/pasaporte. */
  documentNumber: string | null;
}

/**
 * Lo escrito puede ser placa o documento. Si es ambiguo (ej. "AB123456": pasaporte o placa
 * especial; "123456": cédula o placa) se buscan las dos cosas.
 * Un NIT escrito con su dígito de verificación ("900123456-7") se busca sin él.
 */
export function parseTerm(term: string): Term | null {
  const trimmed = term.trim().toUpperCase();
  if (!trimmed) return null;
  const nitWithDv = /^([\d.]+)-\d$/.exec(trimmed);
  if (nitWithDv) return { plate: null, documentNumber: nitWithDv[1].replace(/\D/g, '') };
  const compact = trimmed.replace(/[^A-Z0-9]/g, '');
  const onlyDigits = /^\d+$/.test(compact);
  return {
    plate: compact.length >= 3 && compact.length <= 10 ? compact : null,
    documentNumber: onlyDigits || /^[A-Z0-9]{4,20}$/.test(compact) ? compact : null,
  };
}

function matchesTerm(sale: Sale, term: Term | null): boolean {
  if (!term) return true;
  return (term.plate !== null && sale.plate === term.plate) || (term.documentNumber !== null && sale.customer?.documentNumber === term.documentNumber);
}

/**
 * Busca ventas según el rol:
 * - Admin/manager: con placa o cédula consultan todo el historial de ese cliente; sin búsqueda, por fechas.
 * - Basic (`restrictTo` = su correo): solo sus propias ventas en el rango de fechas, y ahí se filtra por placa/cédula.
 */
export async function searchHistory(filters: HistoryFilters, restrictTo: string | null): Promise<HistoryResult> {
  const term = parseTerm(filters.term);
  const sellerEmail = restrictTo ?? filters.sellerEmail;
  const useTermQuery = term !== null && restrictTo === null;

  const queries: HistoryQuery[] = useTermQuery
    ? [
        ...(term.plate ? [{ kind: 'plate', plate: term.plate } as const] : []),
        ...(term.documentNumber ? [{ kind: 'document', documentNumber: term.documentNumber } as const] : []),
      ]
    : [{ kind: 'range', range: filters.range, sellerEmail }];
  const results = await Promise.all(queries.map(fetchHistory));

  // Une resultados de placa y documento sin repetir, de la más reciente a la más antigua.
  const byId = new Map<string, Sale>();
  results.flat().forEach((sale) => byId.set(sale.id, sale));
  const merged = [...byId.values()].sort((a, b) => b.date.getTime() - a.date.getTime());

  const sales = merged.filter(
    (sale) =>
      matchesTerm(sale, term) &&
      (!filters.status || sale.status === filters.status) &&
      (!sellerEmail || sale.sellers.some((seller) => seller.email === sellerEmail)),
  );
  return {
    sales,
    truncated: results.some((result) => result.length >= HISTORY_LIMIT),
    ignoredDates: useTermQuery,
  };
}
