import { EXPENSE_LIMITS } from '../../config/business';
import { voidExpense } from '../../data/expenses';
import { firestoreErrorMessage } from '../../lib/errors';
import { formatCOP, formatShortDateTime } from '../../lib/format';
import type { Expense } from '../../models/expense';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';

/** Popup para anular un gasto con su motivo. Al guardar, la lista se actualiza sola (tiempo real). */
export function setupVoidDialog(by: { email: string; name: string }): (expense: Expense) => void {
  const dialog = byId<HTMLDialogElement>('void-dialog');
  const form = byId<HTMLFormElement>('void-form');
  const reason = byId<HTMLTextAreaElement>('void-reason');
  const error = byId('void-error');
  const confirmBtn = byId<HTMLButtonElement>('btn-void-confirm');
  let current: Expense | null = null;

  reason.maxLength = EXPENSE_LIMITS.voidReasonMax;
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
    if (!current) return;
    if (reason.value.trim().length < EXPENSE_LIMITS.voidReasonMin) {
      showError(`Escribe el motivo de la anulación (mínimo ${EXPENSE_LIMITS.voidReasonMin} caracteres).`);
      reason.focus();
      return;
    }
    const expense = current;
    error.hidden = true;
    confirmBtn.disabled = true;
    try {
      await voidExpense(expense.id, reason.value, by);
      dialog.close();
      showToast(`Gasto de ${formatCOP(expense.amount)} anulado.`, 'block');
    } catch (cause) {
      console.error(cause);
      showError(firestoreErrorMessage(cause, 'anular el gasto'));
    } finally {
      confirmBtn.disabled = false;
    }
  });

  return (expense: Expense) => {
    current = expense;
    form.reset();
    error.hidden = true;
    byId('void-description').textContent = expense.description;
    byId('void-detail').textContent = `${formatCOP(expense.amount)} · ${formatShortDateTime(expense.date)}`;
    dialog.showModal();
    reason.focus();
  };
}
