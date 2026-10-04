import { BUSINESS_WHATSAPP, PAYMENT_ACCOUNT } from '../../config/business';
import type { Sale } from '../../models/sale';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';
import { formatPhone, reminderMessage, reminderUrl } from './reminder';

const COPIED_MS = 2000;

/** Popup del recordatorio de cobro: muestra el mensaje, deja ajustarlo y abre el chat del cliente. */
export function setupReminderDialog(): (sale: Sale) => void {
  const dialog = byId<HTMLDialogElement>('reminder-dialog');
  const message = byId<HTMLTextAreaElement>('reminder-message');
  const sendBtn = byId<HTMLButtonElement>('btn-reminder-send');
  const copyBtn = byId<HTMLButtonElement>('btn-reminder-copy');
  const copyLabel = copyBtn.querySelector('[data-label]');
  let current: Sale | null = null;

  byId('reminder-sender').textContent = formatPhone(BUSINESS_WHATSAPP);
  byId('reminder-placeholder-account').hidden = !PAYMENT_ACCOUNT.isPlaceholder;

  dialog.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close(); // clic en el fondo
  });

  byId('btn-reminder-reset').addEventListener('click', () => {
    if (current) message.value = reminderMessage(current);
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
    const url = current ? reminderUrl(current.customer?.phone ?? '', message.value.trim()) : null;
    if (!url) return;
    window.open(url, '_blank', 'noopener');
    dialog.close();
  });

  return (sale: Sale) => {
    current = sale;
    const phone = sale.customer?.phone ?? '';
    const hasPhone = reminderUrl(phone, '') !== null;
    byId('reminder-recipient').textContent = `Para ${sale.customer?.name || 'el cliente'}${hasPhone ? ` · ${formatPhone(phone)}` : ''}`;
    byId('reminder-no-phone').hidden = hasPhone;
    sendBtn.disabled = !hasPhone;
    message.value = reminderMessage(sale);
    if (copyLabel) copyLabel.textContent = 'Copiar';
    dialog.showModal();
    message.focus();
    message.setSelectionRange(0, 0);
    message.scrollTop = 0;
  };
}
