import { EXPENSE_LIMITS } from '../../config/business';
import { createExpense } from '../../data/expenses';
import { bogotaNoonFromDateInput, dateInputDaysBefore, toDateInputValue } from '../../lib/dates';
import { firestoreErrorMessage } from '../../lib/errors';
import { formatCOP } from '../../lib/format';
import { formatThousands, parsePesos } from '../../lib/text';
import { EXPENSE_PAYMENT_METHODS, EXPENSE_PAYMENT_METHOD_LABELS } from '../../models/expense';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';
import { validateExpense, type DateBounds, type ExpenseField } from './validation';

const FIELD_INPUTS: Record<ExpenseField, string> = {
  date: 'expense-date',
  description: 'expense-description',
  amount: 'expense-amount',
};

/**
 * Formulario "Registrar gasto". El admin puede elegir un día de los últimos 60; el manager solo hoy.
 * Lo guardado aparece solo en la lista (se escucha en tiempo real).
 */
export function setupExpenseForm(options: { canBackdate: boolean; createdBy: { email: string; name: string } }): void {
  const form = byId<HTMLFormElement>('expense-form');
  const dateInput = byId<HTMLInputElement>('expense-date');
  const descriptionInput = byId<HTMLInputElement>('expense-description');
  const amountInput = byId<HTMLInputElement>('expense-amount');
  const counter = byId('expense-description-count');
  const submitBtn = byId<HTMLButtonElement>('btn-save-expense');
  const formError = byId('expense-form-error');
  // Un ID por intento: si se reintenta después de un corte, no se duplica el gasto.
  let requestId = crypto.randomUUID();

  descriptionInput.maxLength = EXPENSE_LIMITS.descriptionMax;
  byId('expense-date-help').textContent = options.canBackdate
    ? `Hoy o hasta ${EXPENSE_LIMITS.backdateDays} días atrás.`
    : 'Solo puedes registrar gastos de hoy.';

  // "Hoy" se recalcula cada vez: la página puede quedar abierta de un día para otro.
  const dateBounds = (): DateBounds => {
    const now = new Date();
    const today = toDateInputValue(now);
    return { today, min: options.canBackdate ? dateInputDaysBefore(now, EXPENSE_LIMITS.backdateDays) : today };
  };
  const resetDate = () => {
    const { today, min } = dateBounds();
    dateInput.value = today;
    dateInput.max = today;
    dateInput.min = min;
    dateInput.readOnly = !options.canBackdate;
  };

  const updateCounter = () => {
    counter.textContent = `${descriptionInput.value.length}/${EXPENSE_LIMITS.descriptionMax}`;
  };

  const showErrors = (errors: Partial<Record<ExpenseField, string>>) => {
    for (const [fieldName, inputId] of Object.entries(FIELD_INPUTS) as [ExpenseField, string][]) {
      const message = errors[fieldName];
      byId(inputId).setAttribute('aria-invalid', String(Boolean(message)));
      const error = byId(`${inputId}-error`);
      error.textContent = message ?? '';
      error.hidden = !message;
    }
  };

  descriptionInput.addEventListener('input', updateCounter);
  amountInput.addEventListener('input', () => {
    amountInput.value = formatThousands(parsePesos(amountInput.value));
  });
  // Al corregir un campo se quita su error.
  Object.values(FIELD_INPUTS).forEach((inputId) =>
    byId(inputId).addEventListener('input', () => {
      byId(inputId).setAttribute('aria-invalid', 'false');
      byId(`${inputId}-error`).hidden = true;
    }),
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const bounds = dateBounds();
    const input = { date: dateInput.value, description: descriptionInput.value, amount: parsePesos(amountInput.value) };
    const errors = validateExpense(input, bounds);
    showErrors(errors);
    formError.hidden = true;
    const firstInvalid = (Object.keys(FIELD_INPUTS) as ExpenseField[]).find((fieldName) => errors[fieldName]);
    if (firstInvalid) {
      byId(FIELD_INPUTS[firstInvalid]).focus();
      return;
    }

    const value = new FormData(form).get('expense-method');
    const paymentMethod = EXPENSE_PAYMENT_METHODS.find((method) => method === value) ?? 'cash';
    submitBtn.disabled = true;
    try {
      await createExpense(
        {
          date: input.date === bounds.today ? null : bogotaNoonFromDateInput(input.date),
          description: input.description,
          amount: input.amount,
          paymentMethod,
          createdBy: options.createdBy,
        },
        requestId,
      );
      showToast(`Gasto de ${formatCOP(input.amount)} registrado (${EXPENSE_PAYMENT_METHOD_LABELS[paymentMethod].toLowerCase()}).`, 'check_circle');
      requestId = crypto.randomUUID();
      form.reset();
      resetDate();
      updateCounter();
      descriptionInput.focus();
    } catch (error) {
      console.error(error);
      formError.textContent = firestoreErrorMessage(error, 'registrar el gasto');
      formError.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  resetDate();
  updateCounter();
}
