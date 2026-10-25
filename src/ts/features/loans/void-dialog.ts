import { LOAN_LIMITS } from '../../config/business';
import { fetchLoansByEmployee, voidLoan } from '../../data/loans';
import { fetchPayouts } from '../../data/payouts';
import { firestoreErrorMessage } from '../../lib/errors';
import { formatCOP, formatShortDateTime } from '../../lib/format';
import type { Loan } from '../../models/loan';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';
import { loanEntries } from './ledger';

/**
 * Un préstamo que ya se descontó (todo o en parte) en un pago de comisiones no se puede anular: el
 * pago ya se hizo con ese descuento. Se revisa justo antes de anular.
 */
async function alreadyDeducted(loan: Loan): Promise<boolean> {
  const [loans, payouts] = await Promise.all([fetchLoansByEmployee(loan.employeeEmail), fetchPayouts(loan.employeeEmail)]);
  const entry = loanEntries(loans, payouts).find((candidate) => candidate.loan.id === loan.id);
  return entry !== undefined && (entry.state === 'deducted' || entry.state === 'partial');
}

/** Popup para anular un préstamo con su motivo. Al guardar, la lista se actualiza sola (tiempo real). */
export function setupVoidDialog(by: { email: string; name: string }): (loan: Loan) => void {
  const dialog = byId<HTMLDialogElement>('void-dialog');
  const form = byId<HTMLFormElement>('void-form');
  const reason = byId<HTMLTextAreaElement>('void-reason');
  const error = byId('void-error');
  const confirmBtn = byId<HTMLButtonElement>('btn-void-confirm');
  let current: Loan | null = null;

  reason.maxLength = LOAN_LIMITS.voidReasonMax;
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
    if (reason.value.trim().length < LOAN_LIMITS.voidReasonMin) {
      showError(`Escribe el motivo de la anulación (mínimo ${LOAN_LIMITS.voidReasonMin} caracteres).`);
      reason.focus();
      return;
    }
    const loan = current;
    error.hidden = true;
    confirmBtn.disabled = true;
    try {
      if (await alreadyDeducted(loan)) {
        showError('Este préstamo ya se descontó en un pago de comisiones: no se puede anular.');
        return;
      }
      await voidLoan(loan.id, reason.value, by);
      dialog.close();
      showToast(`Préstamo de ${formatCOP(loan.amount)} a ${loan.employeeName} anulado.`, 'block');
    } catch (cause) {
      console.error(cause);
      showError(firestoreErrorMessage(cause, 'anular el préstamo'));
    } finally {
      confirmBtn.disabled = false;
    }
  });

  return (loan: Loan) => {
    current = loan;
    form.reset();
    error.hidden = true;
    byId('void-description').textContent = `${loan.employeeName} · ${loan.description}`;
    byId('void-detail').textContent = `${formatCOP(loan.amount)} · ${formatShortDateTime(loan.date)}`;
    dialog.showModal();
    reason.focus();
  };
}
