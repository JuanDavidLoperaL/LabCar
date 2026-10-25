import { bogotaDaysBetween } from '../../lib/dates';
import { formatCOP, formatShortDate, formatShortDateTime, pluralize } from '../../lib/format';
import { LOAN_CATEGORY_LABELS, type Loan, type LoanCategory } from '../../models/loan';
import { byId } from '../../ui/dom';
import { cloneTemplate, field, setField } from '../../ui/template';

export interface LoansSummary {
  total: number;
  byCategory: Record<LoanCategory, number>;
  count: number;
  voided: number;
}

/** Totales del periodo: los anulados no suman, solo se cuentan aparte. */
export function summarize(loans: readonly Loan[]): LoansSummary {
  const active = loans.filter((loan) => loan.void === null);
  const byCategory: Record<LoanCategory, number> = { general: 0, store: 0 };
  active.forEach((loan) => (byCategory[loan.category] += loan.amount));
  return { total: byCategory.general + byCategory.store, byCategory, count: active.length, voided: loans.length - active.length };
}

/** Hora si es de hoy; los registrados con fecha pasada (al mediodía) muestran solo el día. */
export function loanDateLabel(loan: Loan): string {
  const created = loan.createdAt;
  const backdated = created !== null && bogotaDaysBetween(loan.date, created) > 0;
  return backdated ? `${formatShortDate(loan.date)} · registrado el ${formatShortDate(created)}` : formatShortDateTime(loan.date);
}

export function loanVoidLabel(loan: Loan): string {
  return loan.void
    ? `Anulado el ${formatShortDateTime(loan.void.at)} por ${loan.void.by.name || loan.void.by.email}: ${loan.void.reason}`
    : '';
}

export interface ListActions {
  canVoid: (loan: Loan) => boolean;
  onVoid: (loan: Loan) => void;
}

function renderItem(loan: Loan, actions: ListActions): HTMLLIElement {
  const item = cloneTemplate<HTMLLIElement>('tpl-loan');
  item.dataset.void = String(loan.void !== null);
  item.dataset.category = loan.category;
  setField(item, 'icon', loan.category === 'store' ? 'storefront' : 'payments');
  setField(item, 'employee', loan.employeeName || loan.employeeEmail);
  setField(item, 'category', LOAN_CATEGORY_LABELS[loan.category]);
  setField(item, 'description', loan.description || 'Sin descripción');
  setField(item, 'date', loanDateLabel(loan));
  setField(item, 'created-by', loan.createdBy.name || loan.createdBy.email || 'Sin registro');
  setField(item, 'amount', formatCOP(loan.amount));

  const voidInfo = field(item, 'void-info');
  voidInfo.hidden = loan.void === null;
  voidInfo.textContent = loanVoidLabel(loan);

  const voidButton = field<HTMLButtonElement>(item, 'void');
  voidButton.hidden = loan.void !== null || !actions.canVoid(loan);
  voidButton.addEventListener('click', () => actions.onVoid(loan));
  return item;
}

export function renderLoans(loans: readonly Loan[], emptyText: string, actions: ListActions): void {
  byId('loan-list').replaceChildren(...loans.map((loan) => renderItem(loan, actions)));
  byId('loan-empty').hidden = loans.length > 0;
  byId('loan-empty-text').textContent = emptyText;

  const summary = summarize(loans);
  byId('summary-total').textContent = formatCOP(summary.total);
  byId('summary-general').textContent = formatCOP(summary.byCategory.general);
  byId('summary-store').textContent = formatCOP(summary.byCategory.store);
  byId('list-count').textContent =
    pluralize(summary.count, 'préstamo', 'préstamos') + (summary.voided > 0 ? ` · ${pluralize(summary.voided, 'anulado', 'anulados')}` : '');
}

export function renderLoading(loading: boolean): void {
  const container = byId('history');
  container.dataset.loading = String(loading);
  container.setAttribute('aria-busy', String(loading));
}
