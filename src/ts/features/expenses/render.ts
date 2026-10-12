import { bogotaDaysBetween } from '../../lib/dates';
import { formatCOP, formatShortDate, formatShortDateTime, pluralize } from '../../lib/format';
import { EXPENSE_PAYMENT_METHOD_LABELS, type Expense } from '../../models/expense';
import { byId } from '../../ui/dom';
import { cloneTemplate, field, setField } from '../../ui/template';

export interface ExpensesSummary {
  total: number;
  cash: number;
  transfer: number;
  count: number;
  voided: number;
}

/** Totales del periodo: los anulados no suman, solo se cuentan aparte. */
export function summarize(expenses: readonly Expense[]): ExpensesSummary {
  const active = expenses.filter((expense) => expense.void === null);
  const sumBy = (method: Expense['paymentMethod']) =>
    active.filter((expense) => expense.paymentMethod === method).reduce((total, expense) => total + expense.amount, 0);
  const cash = sumBy('cash');
  const transfer = sumBy('transfer');
  return { total: cash + transfer, cash, transfer, count: active.length, voided: expenses.length - active.length };
}

/** Hora si es de hoy; los registrados con fecha pasada (al mediodía) muestran solo el día. */
function dateLabel(expense: Expense): string {
  const created = expense.createdAt;
  const backdated = created !== null && bogotaDaysBetween(expense.date, created) > 0;
  return backdated ? `${formatShortDate(expense.date)} · registrado el ${formatShortDate(created)}` : formatShortDateTime(expense.date);
}

export interface ListActions {
  canVoid: (expense: Expense) => boolean;
  onVoid: (expense: Expense) => void;
}

function renderItem(expense: Expense, actions: ListActions): HTMLLIElement {
  const item = cloneTemplate<HTMLLIElement>('tpl-expense');
  item.dataset.void = String(expense.void !== null);
  item.dataset.method = expense.paymentMethod;
  setField(item, 'icon', expense.paymentMethod === 'cash' ? 'payments' : 'account_balance');
  setField(item, 'description', expense.description || 'Sin descripción');
  setField(item, 'date', dateLabel(expense));
  setField(item, 'method', EXPENSE_PAYMENT_METHOD_LABELS[expense.paymentMethod]);
  setField(item, 'created-by', expense.createdBy.name || expense.createdBy.email || 'Sin registro');
  setField(item, 'amount', `- ${formatCOP(expense.amount)}`);

  const voidInfo = field(item, 'void-info');
  voidInfo.hidden = expense.void === null;
  if (expense.void) {
    voidInfo.textContent = `Anulado el ${formatShortDateTime(expense.void.at)} por ${expense.void.by.name || expense.void.by.email}: ${expense.void.reason}`;
  }

  const voidButton = field<HTMLButtonElement>(item, 'void');
  voidButton.hidden = expense.void !== null || !actions.canVoid(expense);
  voidButton.addEventListener('click', () => actions.onVoid(expense));
  return item;
}

export function renderExpenses(expenses: readonly Expense[], emptyText: string, actions: ListActions): void {
  byId('expense-list').replaceChildren(...expenses.map((expense) => renderItem(expense, actions)));
  byId('expense-empty').hidden = expenses.length > 0;
  byId('expense-empty-text').textContent = emptyText;

  const summary = summarize(expenses);
  byId('summary-total').textContent = formatCOP(summary.total);
  byId('summary-cash').textContent = formatCOP(summary.cash);
  byId('summary-transfer').textContent = formatCOP(summary.transfer);
  byId('list-count').textContent =
    pluralize(summary.count, 'gasto', 'gastos') + (summary.voided > 0 ? ` · ${pluralize(summary.voided, 'anulado', 'anulados')}` : '');
}

export function renderLoading(loading: boolean): void {
  const container = byId('history');
  container.dataset.loading = String(loading);
  container.setAttribute('aria-busy', String(loading));
}
