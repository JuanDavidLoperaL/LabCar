import { BUSINESS, BUSINESS_WHATSAPP, PAYMENT_ACCOUNT } from '../../config/business';
import { isValidPhone } from '../../lib/dian';
import { formatCOP, formatShortDate } from '../../lib/format';
import type { Sale } from '../../models/sale';
import { formatPlate } from '../sales/plate';

/** "3114179913" → "311 417 9913" */
export function formatPhone(phone: string): string {
  return /^\d{10}$/.test(phone) ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : phone;
}

/** Personas: solo el primer nombre ("Hola Sebastián"); empresas: la razón social completa. */
function greetingName(sale: Sale): string {
  const customer = sale.customer;
  if (!customer?.name) return '';
  return customer.personType === 'legal' ? customer.name : customer.name.trim().split(/\s+/)[0];
}

/** Recordatorio amable de cobro: servicios con su valor, total y cómo pagar. Se puede editar antes de enviarlo. */
export function reminderMessage(sale: Sale): string {
  const name = greetingName(sale);
  const vehicle = [formatPlate(sale.plate), sale.vehicleLine].filter(Boolean).join(' · ');
  return [
    `¡Hola${name ? ` ${name}` : ''}! 👋 Te saludamos de *${BUSINESS.name} – ${BUSINESS.tagline}*.`,
    '',
    `Te escribimos para recordarte, de manera amable, que tienes un saldo pendiente por los servicios que le realizamos a tu vehículo ${vehicle} el ${formatShortDate(sale.date)} (orden ${sale.id}):`,
    '',
    ...sale.items.map((item) => `• ${item.name}: ${formatCOP(item.total)}`),
    '',
    `*Total pendiente: ${formatCOP(sale.total)}*`,
    '',
    'Puedes pagar por transferencia a:',
    `${PAYMENT_ACCOUNT.bank} · ${PAYMENT_ACCOUNT.type}`,
    `N.º ${PAYMENT_ACCOUNT.number}`,
    `A nombre de: ${PAYMENT_ACCOUNT.holder}`,
    '',
    `Cuando hagas el pago, por favor envíanos el comprobante por este WhatsApp (${formatPhone(BUSINESS_WHATSAPP)}). Si ya pagaste, ignora este mensaje.`,
    '',
    `¡Muchas gracias por confiar en ${BUSINESS.name}! 🚗✨`,
  ].join('\n');
}

/** Mismo cliente = mismo tipo y número de documento. null si la venta no tiene documento (solo se cobra sola). */
export function customerKey(sale: Sale): string | null {
  const customer = sale.customer;
  return customer?.documentNumber ? `${customer.documentType}:${customer.documentNumber}` : null;
}

/** La venta más reciente tiene los datos del cliente más actualizados (nombre, celular). */
export function latestSale(sales: readonly Sale[]): Sale {
  return sales.reduce((latest, sale) => (sale.date > latest.date ? sale : latest));
}

/** Un bloque por vehículo; un mismo servicio con el mismo valor repetido se resume ("Lavado general ×3"). */
function vehicleBlocks(sales: readonly Sale[]): string[] {
  const vehicles = new Map<string, { title: string; items: Map<string, { name: string; count: number; total: number }> }>();
  for (const sale of sales) {
    const key = sale.plate || sale.id;
    if (!vehicles.has(key)) {
      vehicles.set(key, { title: [formatPlate(sale.plate), sale.vehicleLine].filter(Boolean).join(' · ') || 'Vehículo', items: new Map() });
    }
    const items = vehicles.get(key)!.items;
    for (const item of sale.items) {
      const itemKey = `${item.name}|${item.total}`;
      const entry = items.get(itemKey) ?? { name: item.name, count: 0, total: 0 };
      entry.count += 1;
      entry.total += item.total;
      items.set(itemKey, entry);
    }
  }
  return [...vehicles.values()].flatMap(({ title, items }) => [
    `🚗 ${title}`,
    ...[...items.values()].map(({ name, count, total }) => `• ${name}${count > 1 ? ` ×${count}` : ''}: ${formatCOP(total)}`),
    '',
  ]);
}

/**
 * Un solo recordatorio para varias deudas del mismo cliente: servicios agrupados por vehículo,
 * el total de todo y solo la fecha de la deuda más antigua. Con una sola venta es el mensaje de siempre.
 */
export function groupReminderMessage(sales: readonly Sale[]): string {
  if (sales.length === 1) return reminderMessage(sales[0]);
  const sorted = [...sales].sort((a, b) => a.date.getTime() - b.date.getTime());
  const name = greetingName(latestSale(sorted));
  const total = sorted.reduce((sum, sale) => sum + sale.total, 0);
  return [
    `¡Hola${name ? ` ${name}` : ''}! 👋 Te saludamos de *${BUSINESS.name} – ${BUSINESS.tagline}*.`,
    '',
    `Te escribimos para recordarte, de manera amable, que tienes un saldo pendiente por servicios realizados desde el ${formatShortDate(sorted[0].date)}:`,
    '',
    ...vehicleBlocks(sorted),
    `*Total pendiente: ${formatCOP(total)}*`,
    '',
    'Puedes pagar por transferencia a:',
    `${PAYMENT_ACCOUNT.bank} · ${PAYMENT_ACCOUNT.type}`,
    `N.º ${PAYMENT_ACCOUNT.number}`,
    `A nombre de: ${PAYMENT_ACCOUNT.holder}`,
    '',
    `Cuando hagas el pago, por favor envíanos el comprobante por este WhatsApp (${formatPhone(BUSINESS_WHATSAPP)}). Si ya pagaste, ignora este mensaje.`,
    '',
    `¡Muchas gracias por confiar en ${BUSINESS.name}! 🚗✨`,
  ].join('\n');
}

/** Enlace que abre el chat del cliente con el mensaje escrito. null si la venta no tiene un celular válido. */
export function reminderUrl(phone: string, message: string): string | null {
  return isValidPhone(phone) ? `https://wa.me/57${phone}?text=${encodeURIComponent(message)}` : null;
}
