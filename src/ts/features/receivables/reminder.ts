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

/** Enlace que abre el chat del cliente con el mensaje escrito. null si la venta no tiene un celular válido. */
export function reminderUrl(phone: string, message: string): string | null {
  return isValidPhone(phone) ? `https://wa.me/57${phone}?text=${encodeURIComponent(message)}` : null;
}
