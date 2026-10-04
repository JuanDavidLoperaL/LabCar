import { formatCOP, formatShortDateTime, pluralize } from '../../lib/format';
import { finalConsumerLabel } from '../receipt/content';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SALE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  type InvoiceStatus,
  type Sale,
} from '../../models/sale';
import { byId } from '../../ui/dom';
import { cloneTemplate, field, setField } from '../../ui/template';
import { formatPlate } from '../sales/plate';
import { itemsSummary, sellersSummary } from '../sales/summary';

const INVOICE_ICONS: Record<InvoiceStatus, string> = {
  'not-requested': 'remove',
  pending: 'schedule_send',
  issued: 'verified',
  error: 'error',
};

function setText(id: string, text: string): void {
  byId(id).textContent = text;
}

export function renderRows(sales: readonly Sale[], onOpen: (sale: Sale) => void): void {
  const rows = sales.map((sale) => {
    const row = cloneTemplate<HTMLTableRowElement>('tpl-history-row');
    row.dataset.status = sale.status;
    setField(row, 'order', sale.id);
    setField(row, 'date', formatShortDateTime(sale.date));
    setField(row, 'plate', formatPlate(sale.plate) || '—');
    setField(row, 'vehicle-line', sale.vehicleLine);
    setField(row, 'services', itemsSummary(sale));
    setField(row, 'sellers', sellersSummary(sale));
    setField(row, 'payment', PAYMENT_METHOD_LABELS[sale.paymentMethod]);
    setField(row, 'total', formatCOP(sale.total));
    setField(row, 'status', SALE_STATUS_LABELS[sale.status]);
    field(row, 'status').dataset.status = sale.status;
    const invoice = field(row, 'invoice');
    invoice.textContent = INVOICE_ICONS[sale.invoice.status];
    invoice.dataset.invoice = sale.invoice.status;
    invoice.parentElement!.title = INVOICE_STATUS_LABELS[sale.invoice.status];
    setField(row, 'invoice-label', INVOICE_STATUS_LABELS[sale.invoice.status]);

    row.title = `Ver detalle de la venta ${sale.id}`;
    row.addEventListener('click', () => onOpen(sale));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpen(sale);
      }
    });
    return row;
  });
  byId('history-rows').replaceChildren(...rows);
  byId('history-empty').hidden = rows.length > 0;
}

/**
 * Totales de los resultados (sin anuladas). `commissionOf` es el correo cuya comisión se suma
 * (el propio empleado o el filtrado); null = comisión total.
 */
export function renderSummary(sales: readonly Sale[], commissionOf: string | null): void {
  const valid = sales.filter((sale) => sale.status !== 'void');
  const commission = valid.reduce(
    (total, sale) =>
      total +
      (commissionOf
        ? (sale.sellers.find((seller) => seller.email === commissionOf)?.commission ?? 0)
        : sale.commission),
    0,
  );
  setText('summary-count', String(valid.length));
  setText('summary-total', formatCOP(valid.reduce((total, sale) => total + sale.total, 0)));
  setText(
    'summary-pending',
    formatCOP(valid.filter((sale) => sale.status === 'pending').reduce((total, sale) => total + sale.total, 0)),
  );
  setText('summary-commission', formatCOP(commission));
}

/** "Pagado el 10 oct, 3:15 p. m. · Transferencia · registró Juan" o "Pendiente (en cartera)". */
function creditPaymentLabel(sale: Sale): string {
  if (!sale.payment) return 'Pendiente (en cartera)';
  const { at, method, by } = sale.payment;
  return `Pagado el ${formatShortDateTime(at)} · ${PAYMENT_METHOD_LABELS[method]} · registró ${by.name || by.email}`;
}

export function renderDetail(sale: Sale): void {
  setText('detail-title', `Venta ${sale.id}`);
  setText('detail-date', formatShortDateTime(sale.date));
  const status = byId('detail-status');
  status.textContent = SALE_STATUS_LABELS[sale.status];
  status.dataset.status = sale.status;

  byId('detail-void').hidden = !sale.void;
  if (sale.void) {
    setText('detail-void-text', `Anulada el ${formatShortDateTime(sale.void.at)} por ${sale.void.by}. Motivo: ${sale.void.reason}`);
  }

  setText('detail-plate', formatPlate(sale.plate) || '—');
  setText('detail-vehicle', `${VEHICLE_TYPE_LABELS[sale.vehicleType]} · ${sale.vehicleLine}`);

  byId('detail-items').replaceChildren(
    ...sale.items.map((item) => {
      const row = cloneTemplate<HTMLLIElement>('tpl-detail-item');
      setField(row, 'name', item.name);
      setField(row, 'total', formatCOP(item.total));
      setField(row, 'discount', item.discount > 0 ? `${formatCOP(item.price)} − ${item.discountPercent}% (${formatCOP(item.discount)})` : '');
      return row;
    }),
  );

  setText('detail-subtotal', formatCOP(sale.subtotal));
  setText('detail-discount', sale.discount > 0 ? `−${formatCOP(sale.discount)}` : formatCOP(0));
  setText('detail-total', formatCOP(sale.total));
  setText('detail-payment', PAYMENT_METHOD_LABELS[sale.paymentMethod]);
  byId('detail-paid-row').hidden = sale.paymentMethod !== 'credit' || sale.status === 'void';
  setText('detail-paid', creditPaymentLabel(sale));
  const invoiceExtra = sale.invoice.number ? ` · N.º ${sale.invoice.number}` : sale.invoice.error ? ` · ${sale.invoice.error}` : '';
  setText('detail-invoice', `${INVOICE_STATUS_LABELS[sale.invoice.status]}${invoiceExtra}`);

  setText('detail-rate', `${Math.round(sale.commissionRate * 100)}%`);
  byId('detail-sellers').replaceChildren(
    ...sale.sellers.map((seller) => {
      const row = cloneTemplate<HTMLLIElement>('tpl-detail-seller');
      setField(row, 'name', seller.name);
      setField(row, 'commission', formatCOP(seller.commission));
      return row;
    }),
  );

  const finalConsumer = finalConsumerLabel(sale);
  byId('detail-customer-block').hidden = !sale.customer && !finalConsumer;
  if (!sale.customer && finalConsumer) setText('detail-customer', `Factura a ${finalConsumer}`);
  if (sale.customer) {
    const { customer } = sale;
    const dv = customer.verificationDigit ? `-${customer.verificationDigit}` : '';
    setText(
      'detail-customer',
      [
        customer.name,
        `${customer.documentType} ${customer.documentNumber}${dv}`,
        customer.phone && `Cel. ${customer.phone}`,
        customer.email,
        [customer.address, customer.city].filter(Boolean).join(', '),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  byId('detail-notes-block').hidden = !sale.notes;
  setText('detail-notes', sale.notes);
  setText('detail-created', `Registrada por ${sale.createdBy.name || sale.createdBy.email || '—'} · ${pluralize(sale.items.length, 'servicio', 'servicios')}`);
}
