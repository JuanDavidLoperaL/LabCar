/**
 * Pago de comisiones a un empleado (colección `commissionPayouts`, ID = "{semana}_{correo}").
 * Cubre todas las ventas del empleado con fecha en [coveredFrom, coveredTo): las de la semana y las
 * de semanas anteriores que no se habían pagado. Lo que se venda después de coveredTo queda pendiente.
 */
export interface Payout {
  id: string;
  /** Día del corte de la semana pagada, "AAAA-MM-DD" (hora de Colombia). */
  weekId: string;
  sellerEmail: string;
  sellerName: string;
  /** Fin del pago anterior; null si es el primero del empleado. */
  coveredFrom: Date | null;
  coveredTo: Date;
  saleIds: string[];
  /** Comisión pagada, en pesos. */
  amount: number;
  paidAt: Date;
  paidBy: { email: string; name: string };
}

/**
 * Decisión de no pagar una semana y acumular el saldo a la siguiente (colección `payoutDeferrals`,
 * mismo ID que el pago: "{semana}_{correo}"). Es solo un registro: el saldo se arrastra igual.
 */
export interface PayoutDeferral {
  id: string;
  weekId: string;
  sellerEmail: string;
  /** Saldo pendiente al momento de acumular, en pesos. */
  amount: number;
  deferredAt: Date;
  deferredBy: { email: string; name: string };
}
