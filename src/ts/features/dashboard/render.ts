import type { DateRange, Period } from '../../lib/dates';
import {
  formatCOP,
  formatRangeLabel,
  formatShortDateTime,
  initials,
  pluralize,
} from '../../lib/format';
import { PAYMENT_METHOD_LABELS, SALE_STATUS_LABELS, type Sale } from '../../models/sale';
import { byId } from '../../ui/dom';
import { cloneTemplate, field, setField } from '../../ui/template';
import { formatPlate } from '../sales/plate';
import { itemsSummary, sellersSummary } from '../sales/summary';
import type { DashboardMetrics, PayoutEntry, SellerPayout } from './metrics';

const RECENT_SALES_LIMIT = 8;

const PERIOD_TEXT: Record<Period, { sales: string; expenses: string }> = {
  day: { sales: 'Ventas del Día', expenses: 'Gastos del Día' },
  week: { sales: 'Ventas de la Semana', expenses: 'Gastos de la Semana' },
  month: { sales: 'Ventas del Mes', expenses: 'Gastos del Mes' },
};

const TODAY_TEXT = { sales: 'Ventas de Hoy', expenses: 'Gastos de Hoy' };

function setText(id: string, text: string): void {
  byId(id).textContent = text;
}

/** Títulos de las tarjetas y los días que se están sumando ("lun 28 sep – sáb 3 oct"). */
export function renderPeriodLabels(period: Period, offset: number, range: DateRange): void {
  const text = period === 'day' && offset === 0 ? TODAY_TEXT : PERIOD_TEXT[period];
  setText('kpi-sales-title', text.sales);
  setText('kpi-expenses-title', text.expenses);
  setText('period-range', formatRangeLabel(range));
}

const VALUE_IDS = [
  'kpi-sales-value',
  'kpi-net-value',
  'kpi-receivables-value',
  'kpi-expenses-value',
  'kpi-commissions-value',
  'payroll-total',
];
const DETAIL_IDS = ['kpi-sales-detail', 'kpi-receivables-detail', 'kpi-expenses-detail', 'kpi-commissions-detail'];

/** Deja los indicadores en blanco ("—") para no mostrar cifras de otro periodo si la carga falla. */
export function renderEmpty(): void {
  for (const id of VALUE_IDS) {
    const element = document.getElementById(id);
    if (element) element.textContent = '—';
  }
  for (const id of DETAIL_IDS) {
    const element = document.getElementById(id);
    if (element) element.textContent = '';
  }
  const overdue = document.getElementById('kpi-receivables-overdue');
  if (overdue) overdue.hidden = true;
  document.getElementById('sales-rows')?.replaceChildren();
  document.getElementById('payroll-list')?.replaceChildren();
}

/** Activa el estado de carga (skeleton en tarjetas, secciones atenuadas, indicador "Actualizando…"). */
export function renderLoading(loading: boolean): void {
  const dashboard = byId('dashboard');
  dashboard.dataset.loading = String(loading);
  dashboard.setAttribute('aria-busy', String(loading));
  byId('loading-indicator').hidden = !loading;
}

/** Tarjetas visibles para todos los roles con acceso al panel. */
export function renderSummary(metrics: DashboardMetrics): void {
  const { sales, expenses } = metrics;
  setText('kpi-sales-value', formatCOP(sales.total));
  setText(
    'kpi-sales-detail',
    sales.count === 0
      ? 'Sin servicios'
      : `${pluralize(sales.count, 'servicio', 'servicios')} · ${pluralize(sales.cars, 'carro', 'carros')}, ${pluralize(sales.motorcycles, 'moto', 'motos')}`,
  );
  setText('kpi-expenses-value', formatCOP(expenses.total));
  setText(
    'kpi-expenses-detail',
    expenses.topCategories.length > 0 ? expenses.topCategories.join(', ') : 'Sin gastos registrados',
  );
}

/** Tarjetas y secciones exclusivas del administrador. */
export function renderAdminDetails(metrics: DashboardMetrics, sales: readonly Sale[]): void {
  const { sales: salesMetrics, receivables, commissions, netProfit } = metrics;

  const netValue = byId('kpi-net-value');
  netValue.textContent = formatCOP(netProfit);
  netValue.dataset.negative = String(netProfit < 0);
  const fromReceivables = salesMetrics.fromReceivables > 0 ? ` (incl. ${formatCOP(salesMetrics.fromReceivables)} de cartera)` : '';
  setText('kpi-net-detail', `Cobrado ${formatCOP(salesMetrics.collected)}${fromReceivables} − gastos − comisiones`);

  setText('kpi-receivables-value', formatCOP(receivables.total));
  setText('kpi-receivables-detail', pluralize(receivables.count, 'venta pendiente', 'ventas pendientes'));
  const overdue = byId('kpi-receivables-overdue');
  overdue.hidden = receivables.overdue === 0;
  overdue.textContent = `${receivables.overdue} en mora`;

  setText('kpi-commissions-value', formatCOP(commissions.total));
  setText('kpi-commissions-detail', pluralize(commissions.payouts.length, 'detallador', 'detalladores'));

  renderRecentSales(sales.filter((sale) => sale.status !== 'void').slice(0, RECENT_SALES_LIMIT));
  renderPayroll(commissions.total, commissions.payouts);
}

function renderRecentSales(sales: readonly Sale[]): void {
  const rows = sales.map((sale) => {
    const row = cloneTemplate<HTMLTableRowElement>('tpl-sale-row');
    row.dataset.status = sale.status;
    setField(row, 'date', formatShortDateTime(sale.date));
    setField(row, 'plate', formatPlate(sale.plate) || '—');
    setField(row, 'vehicle-line', sale.vehicleLine);
    setField(row, 'customer', sale.customer?.name || '—');
    setField(row, 'service', itemsSummary(sale));
    setField(row, 'seller-initials', initials(sale.sellers[0]?.name ?? '?'));
    setField(row, 'seller', sellersSummary(sale));
    setField(row, 'method', PAYMENT_METHOD_LABELS[sale.paymentMethod]);
    setField(row, 'total', formatCOP(sale.total));
    setField(row, 'status', SALE_STATUS_LABELS[sale.status]);
    field(row, 'status').dataset.status = sale.status;
    return row;
  });
  byId('sales-rows').replaceChildren(...rows);
  byId('sales-empty').hidden = rows.length > 0;
}

function renderPayrollRow({ sale, commission }: PayoutEntry): HTMLLIElement {
  const row = cloneTemplate<HTMLLIElement>('tpl-payroll-row');
  setField(row, 'service', itemsSummary(sale));
  field(row, 'pending').hidden = sale.status !== 'pending';
  setField(row, 'date', formatShortDateTime(sale.date));
  setField(row, 'plate', formatPlate(sale.plate) || '—');
  setField(row, 'vehicle-line', sale.vehicleLine);
  setField(row, 'commission', formatCOP(commission));
  const shared = sale.sellers.length > 1 ? ` · compartida entre ${sale.sellers.length}` : '';
  setField(row, 'sale-detail', `de ${formatCOP(sale.total)}${shared}`);
  return row;
}

function renderPayroll(total: number, payouts: readonly SellerPayout[]): void {
  setText('payroll-total', formatCOP(total));
  const cards = payouts.map((payout) => {
    const card = cloneTemplate('tpl-payroll-card');
    setField(card, 'initials', initials(payout.sellerName));
    setField(card, 'name', payout.sellerName);
    setField(
      card,
      'summary',
      `${pluralize(payout.entries.length, 'venta', 'ventas')} · por ${formatCOP(payout.soldTotal)}`,
    );
    setField(card, 'amount', formatCOP(payout.commission));
    field(card, 'rows').replaceChildren(...payout.entries.map(renderPayrollRow));
    return card;
  });
  byId('payroll-list').replaceChildren(...cards);
  byId('payroll-empty').hidden = cards.length > 0;
}
