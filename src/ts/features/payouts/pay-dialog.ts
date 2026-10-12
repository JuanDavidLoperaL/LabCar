import { createPayout, PayoutAlreadyExistsError } from '../../data/payouts';
import { firestoreErrorMessage } from '../../lib/errors';
import { formatCOP } from '../../lib/format';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';
import type { PayoutCoverage, Settlement } from './calculation';
import { weekLabel, type Employee } from './render';
import type { PayoutWeek } from './week';

export interface PayRequest {
  employee: Employee;
  week: PayoutWeek;
  settlement: Settlement;
  coverage: PayoutCoverage;
}

/**
 * Popup para confirmar que se le pagó la comisión a un empleado (solo admin).
 * `onPaid` se llama después de guardar, o si otro equipo ya lo había registrado, para recargar.
 */
export function setupPayDialog(paidBy: { email: string; name: string }, onPaid: () => void): (request: PayRequest) => void {
  const dialog = byId<HTMLDialogElement>('pay-dialog');
  const form = byId<HTMLFormElement>('pay-form');
  const error = byId('pay-error');
  const confirmBtn = byId<HTMLButtonElement>('btn-pay-confirm');
  let current: PayRequest | null = null;

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
    if (!current) return;
    const { employee, week, coverage } = current;
    error.hidden = true;
    confirmBtn.disabled = true;
    try {
      await createPayout({
        weekId: week.id,
        seller: { email: employee.email, name: employee.name },
        coveredFrom: coverage.coveredFrom,
        coveredTo: coverage.coveredTo,
        saleIds: coverage.saleIds,
        amount: coverage.amount,
        paidBy,
      });
      dialog.close();
      showToast(`${employee.name}: pago de ${formatCOP(coverage.amount)} registrado.`, 'check_circle');
      onPaid();
    } catch (cause) {
      console.error(cause);
      if (cause instanceof PayoutAlreadyExistsError) {
        dialog.close();
        showToast(`El pago de ${employee.name} para esta semana ya estaba registrado.`, 'warning');
        onPaid();
      } else {
        error.textContent = firestoreErrorMessage(cause, 'registrar el pago');
        error.hidden = false;
      }
    } finally {
      confirmBtn.disabled = false;
    }
  });

  return (request: PayRequest) => {
    current = request;
    const { employee, week, settlement, coverage } = request;
    error.hidden = true;
    byId('pay-week').textContent = weekLabel(week);
    byId('pay-employee').textContent = employee.name;
    byId('pay-week-amount').textContent = formatCOP(coverage.amount - settlement.carryoverTotal);
    byId('pay-carryover-row').hidden = settlement.carryoverTotal === 0;
    byId('pay-carryover').textContent = formatCOP(settlement.carryoverTotal);
    byId('pay-total').textContent = formatCOP(coverage.amount);
    byId('pay-help').textContent = week.isCurrent
      ? 'La semana aún no ha cerrado: lo que el empleado venda después de este pago se sumará a la próxima semana.'
      : 'Se registra con la fecha y hora de hoy y no se puede deshacer desde el sistema.';
    dialog.showModal();
  };
}
