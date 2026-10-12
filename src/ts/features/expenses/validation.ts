import { EXPENSE_LIMITS } from '../../config/business';
import { formatCOP } from '../../lib/format';

/** Validación del formulario de gasto. Lógica pura: las reglas de Firestore validan lo mismo. */

export interface ExpenseInput {
  /** "AAAA-MM-DD" */
  date: string;
  description: string;
  amount: number;
}

export type ExpenseField = keyof ExpenseInput;

export interface DateBounds {
  /** Hoy, "AAAA-MM-DD". */
  today: string;
  /** Fecha más antigua permitida; igual a `today` si no puede registrar días pasados. */
  min: string;
}

/** Primer error por campo; vacío si todo está bien. Las fechas "AAAA-MM-DD" se comparan como texto. */
export function validateExpense(input: ExpenseInput, bounds: DateBounds): Partial<Record<ExpenseField, string>> {
  const errors: Partial<Record<ExpenseField, string>> = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = 'Elige la fecha del gasto.';
  else if (input.date > bounds.today) errors.date = 'La fecha no puede ser futura.';
  else if (input.date < bounds.min) {
    errors.date = bounds.min === bounds.today
      ? 'Solo puedes registrar gastos de hoy.'
      : `Solo se permiten gastos de los últimos ${EXPENSE_LIMITS.backdateDays} días.`;
  }

  const length = input.description.trim().length;
  if (length < EXPENSE_LIMITS.descriptionMin) errors.description = 'Describe el gasto (mínimo 3 caracteres).';
  else if (length > EXPENSE_LIMITS.descriptionMax) errors.description = `Máximo ${EXPENSE_LIMITS.descriptionMax} caracteres.`;

  if (input.amount < 1) errors.amount = 'Escribe el valor del gasto.';
  else if (input.amount > EXPENSE_LIMITS.amountMax) errors.amount = `El valor máximo es ${formatCOP(EXPENSE_LIMITS.amountMax)}. Revisa que no sobre un cero.`;

  return errors;
}
