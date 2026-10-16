import { watchSales } from '../../data/sales';
import { watchInvoiceLimit } from '../../data/settings';
import { periodRange } from '../../lib/dates';
import { formatCOP } from '../../lib/format';
import type { Sale } from '../../models/sale';
import { byId } from '../../ui/dom';

/** Total del mes en ventas con factura electrónica (a nombre del cliente o de consumidor final). Las anuladas no cuentan. */
export function invoicedTotal(sales: readonly Sale[]): number {
  return sales
    .filter((sale) => sale.status !== 'void' && sale.invoice.status !== 'not-requested')
    .reduce((total, sale) => total + sale.total, 0);
}

/**
 * Alerta en Nueva Venta cuando lo facturado electrónicamente en el mes llega al tope que configura el
 * administrador. Solo avisa: no impide registrar ventas ni pedir factura. Se actualiza en tiempo real.
 * Si no se puede cargar, no se muestra (la venta es más importante).
 */
export function mountInvoiceLimitAlert(): void {
  const alert = byId('invoice-limit-alert');
  let limit: number | null = null;
  let invoiced: number | null = null;

  function render(): void {
    const exceeded = limit !== null && invoiced !== null && invoiced >= limit;
    alert.hidden = !exceeded;
    if (exceeded && limit !== null && invoiced !== null) {
      byId('invoice-limit-alert-text').textContent =
        `Este mes ya se facturaron ${formatCOP(invoiced)} con factura electrónica y el máximo es ${formatCOP(limit)}. ` +
        'Puedes seguir registrando ventas y facturando normalmente.';
    }
  }

  watchInvoiceLimit(
    (amount) => {
      limit = amount;
      render();
    },
    (error) => console.error(error),
  );
  watchSales(
    periodRange('month'),
    (sales) => {
      invoiced = invoicedTotal(sales);
      render();
    },
    (error) => console.error(error),
  );
}
