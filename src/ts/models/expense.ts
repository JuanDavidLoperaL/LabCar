/** Cómo se pagó el gasto: sirve para cuadrar la caja de efectivo del día. */
export const EXPENSE_PAYMENT_METHODS = ['cash', 'transfer'] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
};

/** Documento de la colección `expenses`. Valores en pesos colombianos. Nunca se borra: se anula. */
export interface Expense {
  id: string;
  /** Día del gasto: hora real si es de hoy; mediodía (hora de Colombia) si el admin lo registró con fecha pasada. */
  date: Date;
  description: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  /** Cuándo se registró en el sistema; null en datos antiguos o de prueba. */
  createdAt: Date | null;
  createdBy: { email: string; name: string };
  /** Anulado: no cuenta en ningún total. */
  void: { at: Date; by: { email: string; name: string }; reason: string } | null;
}
