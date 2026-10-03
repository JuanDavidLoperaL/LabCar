import type { Sale } from '../../models/sale';

/** "Polichado, Cerámico" — nombres de los servicios de la venta. */
export function itemsSummary(sale: Pick<Sale, 'items'>): string {
  return sale.items.map((item) => item.name).join(', ') || '—';
}

/** "Carlos Mendoza, Andrés Parra" — vendedores de la venta. */
export function sellersSummary(sale: Pick<Sale, 'sellers'>): string {
  return sale.sellers.map((seller) => seller.name).join(', ') || 'Sin asignar';
}
