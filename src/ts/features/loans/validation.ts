import { LOAN_LIMITS } from '../../config/business';
import { formatCOP } from '../../lib/format';
import type { DateBounds } from '../expenses/validation';

/** Validación del formulario de préstamo. Lógica pura: las reglas de Firestore validan lo mismo. */

export interface LoanInput {
  /** Correo del empleado elegido; vacío si no eligió. */
  employee: string;
  /** "AAAA-MM-DD" */
  date: string;
  description: string;
  amount: number;
}

export type LoanField = keyof LoanInput;

/** Primer error por campo; vacío si todo está bien. Las fechas "AAAA-MM-DD" se comparan como texto. */
export function validateLoan(input: LoanInput, bounds: DateBounds): Partial<Record<LoanField, string>> {
  const errors: Partial<Record<LoanField, string>> = {};

  if (!input.employee) errors.employee = 'Elige a qué empleado se le presta.';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = 'Elige la fecha del préstamo.';
  else if (input.date > bounds.today) errors.date = 'La fecha no puede ser futura.';
  else if (input.date < bounds.min) {
    errors.date = bounds.min === bounds.today
      ? 'Solo puedes registrar préstamos de hoy.'
      : `Solo se permiten préstamos de los últimos ${LOAN_LIMITS.backdateDays} días.`;
  }

  const length = input.description.trim().length;
  if (length < LOAN_LIMITS.descriptionMin) errors.description = 'Describe el préstamo (mínimo 3 caracteres).';
  else if (length > LOAN_LIMITS.descriptionMax) errors.description = `Máximo ${LOAN_LIMITS.descriptionMax} caracteres.`;

  if (input.amount < 1) errors.amount = 'Escribe el valor del préstamo.';
  else if (input.amount > LOAN_LIMITS.amountMax) errors.amount = `El valor máximo es ${formatCOP(LOAN_LIMITS.amountMax)}. Revisa que no sobre un cero.`;

  return errors;
}
