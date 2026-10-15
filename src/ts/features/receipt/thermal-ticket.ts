import logoUrl from '../../../assets/images/logo.png';
import { BUSINESS } from '../../config/business';
import { FINAL_CONSUMER } from '../../lib/dian';
import { formatCOP, formatShortDate, formatShortDateTime } from '../../lib/format';
import { PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS, type Sale } from '../../models/sale';
import { formatPlate } from '../sales/plate';
import { sellersSummary } from '../sales/summary';
import { businessNit, invoiceNotice } from './content';
import { columns, imageToRaster, LINE_WIDTH, Ticket, wrap } from './escpos';

/** Ancho del logo en puntos (la TM-m30II imprime 576 puntos en papel de 80 mm). */
const LOGO_WIDTH = 256;

/**
 * Tirilla de 80 mm en ESC/POS con los mismos datos del recibo HTML (src/html/recibo.html):
 * negocio, orden, vehículo, servicios, totales, pago, vendedores, cliente, notas y aviso de factura.
 */
export async function buildReceiptTicket(sale: Sale): Promise<string> {
  const ticket = new Ticket();
  // El logo es claro sobre fondo transparente (para el tema oscuro): se imprime en negro lo que tiene forma.
  const logo = await imageToRaster(logoUrl, LOGO_WIDTH, 'opaque');

  // ---------- Negocio ----------
  ticket.align('center').raw(logo);
  // El logo ya dice LAB CAR: el nombre en grande solo va si el logo no se pudo cargar.
  if (logo.length === 0) ticket.bold(true).large(true).line(BUSINESS.name).large(false).bold(false);
  ticket.lines([BUSINESS.tagline, BUSINESS.ownerName, `NIT ${businessNit()}`, BUSINESS.city]);
  if (sale.status === 'void') ticket.line().bold(true).line('*** VENTA ANULADA ***').bold(false);
  ticket.align('left').separator();

  // ---------- Orden y vehículo ----------
  ticket.bold(true).lines(columns('Orden', sale.id)).bold(false);
  ticket.lines(columns('Fecha', formatShortDateTime(sale.date)));
  ticket.lines(columns('Vehículo', `${formatPlate(sale.plate)} (${VEHICLE_TYPE_LABELS[sale.vehicleType]})`));
  ticket.lines(wrap(sale.vehicleLine));
  ticket.separator();

  // ---------- Servicios ----------
  for (const item of sale.items) {
    ticket.lines(columns(item.name, formatCOP(item.price)));
    if (item.discount > 0) ticket.lines(columns(`  Desc. ${item.discountPercent}%`, `-${formatCOP(item.discount)}`));
  }
  ticket.separator();

  // ---------- Totales y pago ----------
  ticket.lines(columns('Subtotal', formatCOP(sale.subtotal)));
  if (sale.discount > 0) ticket.lines(columns('Descuentos', `-${formatCOP(sale.discount)}`));
  ticket.bold(true).large(true).lines(columns('TOTAL', formatCOP(sale.total), LINE_WIDTH / 2)).large(false).bold(false);
  ticket.separator();
  ticket.lines(columns('Forma de pago', PAYMENT_METHOD_LABELS[sale.paymentMethod]));
  if (sale.paymentMethod === 'credit' && sale.status !== 'void') {
    const credit = sale.payment
      ? `Pagado ${formatShortDate(sale.payment.at)} (${PAYMENT_METHOD_LABELS[sale.payment.method]})`
      : 'Pendiente de pago';
    ticket.lines(columns('Estado', credit));
  }
  ticket.lines(wrap(`Atendido por: ${sellersSummary(sale)}`));

  // ---------- Cliente ----------
  const customer = sale.customer
    ? {
        name: sale.customer.name,
        document: `${sale.customer.documentType} ${sale.customer.documentNumber}${sale.customer.verificationDigit ? `-${sale.customer.verificationDigit}` : ''}`,
      }
    : sale.invoice.recipient === 'final-consumer'
      ? { name: FINAL_CONSUMER.name, document: FINAL_CONSUMER.documentNumber }
      : null;
  if (customer) {
    ticket.separator();
    ticket.lines(columns('Cliente', customer.name));
    ticket.lines(columns('Documento', customer.document));
  }

  // ---------- Notas y pie ----------
  if (sale.notes) {
    ticket.separator().bold(true).line('Notas').bold(false);
    ticket.lines(wrap(sale.notes));
  }
  ticket.separator().align('center');
  ticket.lines(wrap(invoiceNotice(sale)));
  ticket.line().bold(true).line('¡Gracias por confiar en LAB CAR!').bold(false);
  ticket.cut();
  return ticket.toBase64();
}
