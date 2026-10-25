import { LOAN_LIMITS } from '../../config/business';
import { createLoan } from '../../data/loans';
import { bogotaNoonFromDateInput, dateInputDaysBefore, toDateInputValue } from '../../lib/dates';
import { firestoreErrorMessage } from '../../lib/errors';
import { formatCOP } from '../../lib/format';
import { formatThousands, parsePesos } from '../../lib/text';
import { LOAN_CATEGORIES, LOAN_CATEGORY_LABELS } from '../../models/loan';
import type { AppUser } from '../../models/user';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';
import type { DateBounds } from '../expenses/validation';
import { validateLoan, type LoanField } from './validation';

const FIELD_INPUTS: Record<LoanField, string> = {
  employee: 'loan-employee',
  date: 'loan-date',
  description: 'loan-description',
  amount: 'loan-amount',
};

/**
 * Formulario "Registrar préstamo". El admin puede elegir un día de los últimos 60; el manager solo hoy.
 * Lo guardado aparece solo en la lista (se escucha en tiempo real).
 */
export function setupLoanForm(options: {
  employees: readonly AppUser[];
  canBackdate: boolean;
  createdBy: { email: string; name: string };
}): void {
  const form = byId<HTMLFormElement>('loan-form');
  const employeeSelect = byId<HTMLSelectElement>('loan-employee');
  const dateInput = byId<HTMLInputElement>('loan-date');
  const descriptionInput = byId<HTMLInputElement>('loan-description');
  const amountInput = byId<HTMLInputElement>('loan-amount');
  const counter = byId('loan-description-count');
  const submitBtn = byId<HTMLButtonElement>('btn-save-loan');
  const formError = byId('loan-form-error');
  // Un ID por intento: si se reintenta después de un corte, no se duplica el préstamo.
  let requestId = crypto.randomUUID();

  // Sin empleado por defecto: así nadie le carga un préstamo a quien no es por descuido.
  employeeSelect.replaceChildren(
    new Option('Elige un empleado', ''),
    ...options.employees.map((employee) => new Option(employee.name, employee.email)),
  );
  descriptionInput.maxLength = LOAN_LIMITS.descriptionMax;
  byId('loan-date-help').textContent = options.canBackdate
    ? `Hoy o hasta ${LOAN_LIMITS.backdateDays} días atrás.`
    : 'Solo puedes registrar préstamos de hoy.';

  // "Hoy" se recalcula cada vez: la página puede quedar abierta de un día para otro.
  const dateBounds = (): DateBounds => {
    const now = new Date();
    const today = toDateInputValue(now);
    return { today, min: options.canBackdate ? dateInputDaysBefore(now, LOAN_LIMITS.backdateDays) : today };
  };
  const resetDate = () => {
    const { today, min } = dateBounds();
    dateInput.value = today;
    dateInput.max = today;
    dateInput.min = min;
    dateInput.readOnly = !options.canBackdate;
  };

  const updateCounter = () => {
    counter.textContent = `${descriptionInput.value.length}/${LOAN_LIMITS.descriptionMax}`;
  };

  const showErrors = (errors: Partial<Record<LoanField, string>>) => {
    for (const [fieldName, inputId] of Object.entries(FIELD_INPUTS) as [LoanField, string][]) {
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
  Object.values(FIELD_INPUTS).forEach((inputId) => {
    const clear = () => {
      byId(inputId).setAttribute('aria-invalid', 'false');
      byId(`${inputId}-error`).hidden = true;
    };
    byId(inputId).addEventListener('input', clear);
    byId(inputId).addEventListener('change', clear);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const bounds = dateBounds();
    const input = {
      employee: employeeSelect.value,
      date: dateInput.value,
      description: descriptionInput.value,
      amount: parsePesos(amountInput.value),
    };
    const errors = validateLoan(input, bounds);
    showErrors(errors);
    formError.hidden = true;
    const firstInvalid = (Object.keys(FIELD_INPUTS) as LoanField[]).find((fieldName) => errors[fieldName]);
    const employee = options.employees.find((candidate) => candidate.email === input.employee);
    if (firstInvalid || !employee) {
      byId(FIELD_INPUTS[firstInvalid ?? 'employee']).focus();
      return;
    }

    const value = new FormData(form).get('loan-category');
    const category = LOAN_CATEGORIES.find((option) => option === value) ?? 'general';
    submitBtn.disabled = true;
    try {
      await createLoan(
        {
          employee: { email: employee.email, name: employee.name },
          category,
          date: input.date === bounds.today ? null : bogotaNoonFromDateInput(input.date),
          description: input.description,
          amount: input.amount,
          createdBy: options.createdBy,
        },
        requestId,
      );
      showToast(`${LOAN_CATEGORY_LABELS[category]} de ${formatCOP(input.amount)} a ${employee.name} registrado.`, 'check_circle');
      requestId = crypto.randomUUID();
      form.reset();
      resetDate();
      updateCounter();
      employeeSelect.focus();
    } catch (error) {
      console.error(error);
      formError.textContent = firestoreErrorMessage(error, 'registrar el préstamo');
      formError.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  resetDate();
  updateCounter();
}
