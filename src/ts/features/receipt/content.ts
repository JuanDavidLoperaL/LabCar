import { BUSINESS } from '../../config/business';
import { formatCOP, formatShortDateTime } from '../../lib/format';
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS, type Sale } from '../../models/sale';
import { formatPlate } from '../sales/plate';
import { FINAL_CONSUMER, nitVerificationDigit } from '../../lib/dian';

/** NIT del negocio con dígito de verificación: 1039474010-0 */
export function businessNit(): string {
  return `${BUSINESS.nit}-${nitVerificationDigit(BUSINESS.nit)}`;
}

/** Lo mínimo de una venta para compartirla (sirve también antes de releerla de Firestore). */
export type ShareableSale = Pick<Sale, 'id' | 'date' | 'plate' | 'vehicleLine' | 'items' | 'total' | 'paymentMethod' | 'status' | 'customer'>;

/** "Consumidor Final · 222222222222" cuando la factura va a ese nombre; null si no aplica. */
export function finalConsumerLabel(sale: Pick<Sale, 'invoice'>): string | null {
  return sale.invoice.recipient === 'final-consumer' ? `${FINAL_CONSUMER.name} · ${FINAL_CONSUMER.documentNumber}` : null;
}

/** Texto legal sobre la factura electrónica que va al pie del recibo. */
export function invoiceNotice(sale: Sale): string {
  if (sale.invoice.status === 'issued' && sale.invoice.number) {
    return `Factura electrónica N.º ${sale.invoice.number}${sale.invoice.cufe ? ` · CUFE ${sale.invoice.cufe}` : ''}`;
  }
  const status = sale.invoice.status === 'not-requested' ? '' : ` (${INVOICE_STATUS_LABELS[sale.invoice.status].toLowerCase()})`;
  return `Este recibo no es una factura electrónica${status}.`;
}

/** Resumen de la venta para enviar por WhatsApp. */
export function whatsappMessage(sale: ShareableSale): string {
  const lines = [
    `*${BUSINESS.name} – ${BUSINESS.tagline}*`,
    `Orden ${sale.id} · ${formatShortDateTime(sale.date)}`,
    `Vehículo: ${formatPlate(sale.plate)} ${sale.vehicleLine}`.trim(),
    '',
    ...sale.items.map((item) => `• ${item.name}: ${formatCOP(item.total)}${item.discountPercent > 0 ? ` (−${item.discountPercent}%)` : ''}`),
    '',
    `*Total: ${formatCOP(sale.total)}*`,
    `Forma de pago: ${PAYMENT_METHOD_LABELS[sale.paymentMethod]}`,
  ];
  if (sale.status === 'void') lines.push('⚠️ Venta anulada');
  lines.push('', '¡Gracias por confiar en LAB CAR!');
  return lines.join('\n');
}

/** Enlace de WhatsApp: al celular del cliente si se conoce; si no, WhatsApp elige el contacto. */
export function whatsappUrl(sale: ShareableSale): string {
  const phone = sale.customer?.phone ? `57${sale.customer.phone}` : '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage(sale))}`;
}
