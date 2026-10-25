import type { Loan, LoanCategory } from '../../models/loan';
import type { Payout } from '../../models/payout';

/**
 * Saldo de préstamos de un empleado. Lógica pura (sin Firebase ni DOM).
 *
 * Los préstamos se descuentan de las comisiones al registrar un pago (`payout.loanDeduction`). Lo
 * descontado se aplica a los préstamos del más antiguo al más reciente: así cada préstamo sabe si ya
 * se descontó completo, en parte o nada. Los anulados no cuentan.
 */

export type LoanState = 'deducted' | 'partial' | 'pending' | 'void';

export const LOAN_STATE_LABELS: Record<LoanState, string> = {
  deducted: 'Descontado',
  partial: 'Descontado en parte',
  pending: 'Por descontar',
  void: 'Anulado',
};

export interface LoanEntry {
  loan: Loan;
  state: LoanState;
  /** Lo que falta por descontar de este préstamo. */
  remaining: number;
}

export function totalDeducted(payouts: readonly Payout[]): number {
  return payouts.reduce((total, payout) => total + payout.loanDeduction, 0);
}

function isActive(loan: Loan): boolean {
  return loan.void === null;
}

/** Cada préstamo con su estado. `loans` del más antiguo al más reciente. */
export function loanEntries(loans: readonly Loan[], payouts: readonly Payout[]): LoanEntry[] {
  let deducted = totalDeducted(payouts);
  return loans.map((loan) => {
    if (!isActive(loan)) return { loan, state: 'void', remaining: 0 };
    const applied = Math.min(deducted, loan.amount);
    deducted -= applied;
    const remaining = loan.amount - applied;
    const state: LoanState = remaining === 0 ? 'deducted' : applied > 0 ? 'partial' : 'pending';
    return { loan, state, remaining };
  });
}

/** Lo que el empleado debe en préstamos registrados antes de `asOf`, menos lo ya descontado. */
export function outstandingBalance(loans: readonly Loan[], payouts: readonly Payout[], asOf: Date): number {
  const lent = loans.filter((loan) => isActive(loan) && loan.date < asOf).reduce((total, loan) => total + loan.amount, 0);
  return Math.max(lent - totalDeducted(payouts), 0);
}

/** Préstamos activos de un rango, sumados por tipo. */
export function totalsByCategory(loans: readonly Loan[], range: { start: Date; end: Date }): Record<LoanCategory, number> {
  const totals: Record<LoanCategory, number> = { general: 0, store: 0 };
  for (const loan of loans) {
    if (isActive(loan) && loan.date >= range.start && loan.date < range.end) totals[loan.category] += loan.amount;
  }
  return totals;
}
