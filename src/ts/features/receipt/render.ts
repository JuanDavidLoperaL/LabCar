import { BUSINESS } from '../../config/business';
import { FINAL_CONSUMER } from '../../lib/dian';
import { formatCOP, formatShortDate, formatShortDateTime } from '../../lib/format';
import { PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS, type Sale } from '../../models/sale';
import { byId } from '../../ui/dom';
import { cloneTemplate, field, setField } from '../../ui/template';
import { formatPlate } from '../sales/plate';
import { sellersSummary } from '../sales/summary';
import { businessNit, finalConsumerLabel, invoiceNotice, whatsappUrl } from './content';

function setText(id: string, text: string): void {
  byId(id).textContent = text;
}

/** Llena la tirilla (src/html/recibo.html) con los datos de la venta. */
export function renderReceipt(sale: Sale): void {
  setText('r-business', BUSINESS.name);
  setText('r-tagline', BUSINESS.tagline);
  setText('r-owner', BUSINESS.ownerName);
  setText('r-nit', businessNit());
  setText('r-city', BUSINESS.city);
  byId('r-void').hidden = sale.status !== 'void';

  setText('r-order', sale.id);
  setText('r-date', formatShortDateTime(sale.date));
  setText('r-plate', formatPlate(sale.plate));
  setText('r-type', `(${VEHICLE_TYPE_LABELS[sale.vehicleType]})`);
  setText('r-line', sale.vehicleLine);

  byId('r-items').replaceChildren(
    ...sale.items.map((item) => {
      const row = cloneTemplate<HTMLLIElement>('tpl-receipt-item');
      setField(row, 'name', item.name);
      setField(row, 'price', formatCOP(item.price));
      field(row, 'discount-row').hidden = item.discount === 0;
      setField(row, 'discount-label', `  Desc. ${item.discountPercent}%`);
      setField(row, 'discount', `−${formatCOP(item.discount)}`);
      return row;
    }),
  );

  setText('r-subtotal', formatCOP(sale.subtotal));
  byId('r-discount-row').hidden = sale.discount === 0;
  setText('r-discount', `−${formatCOP(sale.discount)}`);
  setText('r-total', formatCOP(sale.total));
  setText('r-payment', PAYMENT_METHOD_LABELS[sale.paymentMethod]);
  // Crédito: si ya se pagó, cuándo y cómo; si no, queda claro que está pendiente.
  byId('r-credit-row').hidden = sale.paymentMethod !== 'credit' || sale.status === 'void';
  setText(
    'r-credit',
    sale.payment ? `Pagado ${formatShortDate(sale.payment.at)} (${PAYMENT_METHOD_LABELS[sale.payment.method]})` : 'Pendiente de pago',
  );
  setText('r-sellers', sellersSummary(sale));

  const finalConsumer = finalConsumerLabel(sale);
  byId('r-customer').hidden = !sale.customer && !finalConsumer;
  if (sale.customer) {
    setText('r-customer-name', sale.customer.name);
    const dv = sale.customer.verificationDigit ? `-${sale.customer.verificationDigit}` : '';
    setText('r-customer-doc', `${sale.customer.documentType} ${sale.customer.documentNumber}${dv}`);
  } else if (finalConsumer) {
    setText('r-customer-name', FINAL_CONSUMER.name);
    setText('r-customer-doc', FINAL_CONSUMER.documentNumber);
  }
  byId('r-notes-block').hidden = !sale.notes;
  setText('r-notes', sale.notes);
  setText('r-invoice', invoiceNotice(sale));

  byId<HTMLAnchorElement>('btn-whatsapp').href = whatsappUrl(sale);
  byId('receipt').hidden = false;
  byId('receipt-status').hidden = true;
  document.title = `Recibo ${sale.id} · LAB CAR`;
}
