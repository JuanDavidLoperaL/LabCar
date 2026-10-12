import { BUSINESS_WHATSAPP, PAYMENT_ACCOUNT } from '../../config/business';
import type { Sale } from '../../models/sale';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';
import { formatPhone, groupReminderMessage, latestSale, reminderUrl } from './reminder';

const COPIED_MS = 2000;

/**
 * Popup del recordatorio de cobro: muestra el mensaje, deja ajustarlo y abre el chat del cliente.
 * Recibe una venta o varias del mismo cliente (un solo mensaje para todas).
 */
export function setupReminderDialog(): (sales: readonly Sale[]) => void {
  const dialog = byId<HTMLDialogElement>('reminder-dialog');
  const message = byId<HTMLTextAreaElement>('reminder-message');
  const sendBtn = byId<HTMLButtonElement>('btn-reminder-send');
  const copyBtn = byId<HTMLButtonElement>('btn-reminder-copy');
  const copyLabel = copyBtn.querySelector('[data-label]');
  let current: readonly Sale[] = [];
  let phone = '';

  byId('reminder-sender').textContent = formatPhone(BUSINESS_WHATSAPP);
  byId('reminder-placeholder-account').hidden = !PAYMENT_ACCOUNT.isPlaceholder;

  dialog.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close(); // clic en el fondo
  });

  byId('btn-reminder-reset').addEventListener('click', () => {
    if (current.length) message.value = groupReminderMessage(current);
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(message.value);
      if (copyLabel) copyLabel.textContent = '¡Copiado!';
      window.setTimeout(() => copyLabel && (copyLabel.textContent = 'Copiar'), COPIED_MS);
    } catch {
      showToast('No se pudo copiar. Selecciona el texto y cópialo manualmente.', 'error');
    }
  });

  byId<HTMLFormElement>('reminder-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const url = current.length ? reminderUrl(phone, message.value.trim()) : null;
    if (!url) return;
    window.open(url, '_blank', 'noopener');
    dialog.close();
  });

  return (sales: readonly Sale[]) => {
    if (!sales.length) return;
    current = sales;
    // Si el cliente cambió de celular entre ventas, se usa el de la más reciente.
    const customer = latestSale(sales).customer;
    phone = customer?.phone ?? '';
    const hasPhone = reminderUrl(phone, '') !== null;
    const count = sales.length > 1 ? ` · ${sales.length} ventas` : '';
    byId('reminder-recipient').textContent = `Para ${customer?.name || 'el cliente'}${hasPhone ? ` · ${formatPhone(phone)}` : ''}${count}`;
    byId('reminder-no-phone').hidden = hasPhone;
    sendBtn.disabled = !hasPhone;
    message.value = groupReminderMessage(sales);
    if (copyLabel) copyLabel.textContent = 'Copiar';
    dialog.showModal();
    message.focus();
    message.setSelectionRange(0, 0);
    message.scrollTop = 0;
  };
}
