/** Tipo de préstamo a un empleado: dinero prestado o algo que tomó de la tienda. */
export const LOAN_CATEGORIES = ['general', 'store'] as const;
export type LoanCategory = (typeof LOAN_CATEGORIES)[number];

export const LOAN_CATEGORY_LABELS: Record<LoanCategory, string> = {
  general: 'Préstamo general',
  store: 'Préstamo de tienda',
};

/**
 * Préstamo a un empleado (colección `loans`). Valores en pesos colombianos. Se descuenta de sus
 * comisiones en Pagos Vendedores; no es un gasto ni cuenta en el panel. Nunca se borra: se anula.
 */
export interface Loan {
  id: string;
  employeeEmail: string;
  employeeName: string;
  category: LoanCategory;
  /** Día del préstamo: hora real si es de hoy; mediodía (hora de Colombia) si el admin lo registró con fecha pasada. */
  date: Date;
  description: string;
  amount: number;
  createdAt: Date | null;
  createdBy: { email: string; name: string };
  /** Anulado: no se descuenta ni suma en ningún total. */
  void: { at: Date; by: { email: string; name: string }; reason: string } | null;
}
