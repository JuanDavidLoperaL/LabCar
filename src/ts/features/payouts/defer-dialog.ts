import { createDeferral, DeferralAlreadyExistsError } from '../../data/payouts';
import { firestoreErrorMessage } from '../../lib/errors';
import { formatCOP } from '../../lib/format';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';
import { weekLabel, type Employee } from './render';
import type { PayoutWeek } from './week';

export interface DeferRequest {
  employee: Employee;
  week: PayoutWeek;
  /** Saldo pendiente que se acumula. */
  amount: number;
}

/**
 * Popup para confirmar que no se paga la semana y el saldo pasa a la siguiente (solo admin).
 * Solo deja registro de la decisión: el saldo se arrastra igual aunque nadie lo confirme.
 */
export function setupDeferDialog(deferredBy: { email: string; name: string }, onDeferred: () => void): (request: DeferRequest) => void {
  const dialog = byId<HTMLDialogElement>('defer-dialog');
  const form = byId<HTMLFormElement>('defer-form');
  const error = byId('defer-error');
  const confirmBtn = byId<HTMLButtonElement>('btn-defer-confirm');
  let current: DeferRequest | null = null;

  dialog.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !confirmBtn.disabled) dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (confirmBtn.disabled) event.preventDefault();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!current) return;
    const { employee, week, amount } = current;
    error.hidden = true;
    confirmBtn.disabled = true;
    try {
      await createDeferral({ weekId: week.id, seller: { email: employee.email, name: employee.name }, amount, deferredBy });
      dialog.close();
      showToast(`${employee.name}: ${formatCOP(amount)} se acumulan a la próxima semana.`, 'history_toggle_off');
      onDeferred();
    } catch (cause) {
      console.error(cause);
      if (cause instanceof DeferralAlreadyExistsError) {
        dialog.close();
        showToast(`La semana de ${employee.name} ya estaba acumulada.`, 'warning');
        onDeferred();
      } else {
        error.textContent = firestoreErrorMessage(cause, 'acumular la semana');
        error.hidden = false;
      }
    } finally {
      confirmBtn.disabled = false;
    }
  });

  return (request: DeferRequest) => {
    current = request;
    error.hidden = true;
    byId('defer-week').textContent = weekLabel(request.week);
    byId('defer-employee').textContent = request.employee.name;
    byId('defer-amount').textContent = formatCOP(request.amount);
    dialog.showModal();
  };
}
