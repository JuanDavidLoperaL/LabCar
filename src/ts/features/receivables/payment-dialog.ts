import { markSalePaid, SaleNotPendingError } from '../../data/sales';
import { firestoreErrorMessage } from '../../lib/errors';
import { formatCOP } from '../../lib/format';
import { PAYMENT_METHOD_LABELS, SETTLEMENT_METHODS, type Sale } from '../../models/sale';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';
import { formatPlate } from '../sales/plate';
import { sellersSummary } from '../sales/summary';
import { documentLabel } from './render';

/**
 * Popup para confirmar el pago total de una venta a crédito y elegir cómo pagó el cliente.
 * Al guardar, la venta desaparece sola de la lista (la cartera se escucha en tiempo real).
 */
export function setupPaymentDialog(registeredBy: { email: string; name: string }): (sale: Sale) => void {
  const dialog = byId<HTMLDialogElement>('payment-dialog');
  const form = byId<HTMLFormElement>('payment-form');
  const error = byId('payment-error');
  const confirmBtn = byId<HTMLButtonElement>('btn-payment-confirm');
  let current: Sale | null = null;

  const showError = (text: string) => {
    error.textContent = text;
    error.hidden = false;
  };

  dialog.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !confirmBtn.disabled) dialog.close();
  });
  // Mientras se guarda no se puede cerrar con Escape (el resultado se mostraría en un diálogo cerrado).
  dialog.addEventListener('cancel', (event) => {
    if (confirmBtn.disabled) event.preventDefault();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = new FormData(form).get('payment-method');
    const method = SETTLEMENT_METHODS.find((option) => option === value);
    if (!current) return;
    if (!method) {
      showError('Elige si pagó en efectivo o por transferencia.');
      return;
    }
    const sale = current;
    error.hidden = true;
    confirmBtn.disabled = true;
    try {
      await markSalePaid(sale.id, method, registeredBy);
      dialog.close();
      showToast(`${sale.customer?.name || sale.id}: pago registrado (${PAYMENT_METHOD_LABELS[method].toLowerCase()}).`, 'check_circle');
    } catch (cause) {
      console.error(cause);
      if (cause instanceof SaleNotPendingError) {
        dialog.close();
        showToast(`La venta ${sale.id} ya no estaba pendiente (la cobraron o anularon desde otro equipo).`, 'warning');
      } else {
        showError(firestoreErrorMessage(cause, 'registrar el pago'));
      }
    } finally {
      confirmBtn.disabled = false;
    }
  });

  return (sale: Sale) => {
    current = sale;
    form.reset();
    error.hidden = true;
    byId('payment-order').textContent = `Orden ${sale.id}`;
    byId('payment-customer').textContent = `${sale.customer?.name || 'Sin nombre'} · ${documentLabel(sale)}`;
    byId('payment-vehicle').textContent = [formatPlate(sale.plate), sale.vehicleLine].filter(Boolean).join(' · ');
    byId('payment-sellers').textContent = sellersSummary(sale);
    byId('payment-total').textContent = formatCOP(sale.total);
    dialog.showModal();
  };
}
