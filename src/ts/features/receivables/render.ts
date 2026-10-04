import { formatCOP, formatShortDate, initials, pluralize } from '../../lib/format';
import type { Sale } from '../../models/sale';
import { byId } from '../../ui/dom';
import { cloneTemplate, field, setField } from '../../ui/template';
import { formatPlate } from '../sales/plate';
import { itemsSummary, sellersSummary } from '../sales/summary';
import { daysLabel } from './aging';
import { formatPhone } from './reminder';
import type { AgingFilter, Receivable, ReceivablesSummary, ReceivablesView } from './search';

export interface CardActions {
  onRemind: (sale: Sale) => void;
  onPay: (sale: Sale) => void;
}

/** "CC 1017234988" · "NIT 900823114-1" */
export function documentLabel(sale: Sale): string {
  const customer = sale.customer;
  if (!customer?.documentNumber) return 'Sin documento';
  const dv = customer.verificationDigit ? `-${customer.verificationDigit}` : '';
  return `${customer.documentType} ${customer.documentNumber}${dv}`;
}

function renderCard({ sale, aging }: Receivable, actions: CardActions): HTMLLIElement {
  const card = cloneTemplate<HTMLLIElement>('tpl-receivable');
  const customer = sale.customer;
  card.dataset.overdue = String(aging.overdue);

  setField(card, 'initials', initials(customer?.name || '?'));
  setField(card, 'name', customer?.name || 'Cliente sin nombre');
  setField(card, 'document', documentLabel(sale));
  setField(card, 'city', customer?.city ? `• ${customer.city}` : '');
  setField(card, 'plate', formatPlate(sale.plate) || '—');
  setField(card, 'vehicle-line', sale.vehicleLine);
  setField(card, 'services', itemsSummary(sale));
  setField(card, 'date', formatShortDate(sale.date));
  setField(card, 'sellers', sellersSummary(sale));
  setField(card, 'phone', customer?.phone ? formatPhone(customer.phone) : 'Sin celular');
  setField(card, 'total', formatCOP(sale.total));
  setField(card, 'balance-label', aging.overdue ? 'Saldo en mora' : 'Saldo pendiente');
  setField(card, 'aging', aging.overdue ? `⚠ ${daysLabel(aging.days)} en mora` : `${daysLabel(aging.days)} · al día`);

  const order = field<HTMLAnchorElement>(card, 'order');
  order.textContent = sale.id;
  order.href = `/html/historial.html?venta=${encodeURIComponent(sale.id)}`;

  card.querySelector('[data-action="remind"]')?.addEventListener('click', () => actions.onRemind(sale));
  card.querySelector('[data-action="pay"]')?.addEventListener('click', () => actions.onPay(sale));
  return card;
}

const EMPTY_TEXT: Record<AgingFilter, string> = {
  all: 'No hay clientes con este criterio de búsqueda.',
  overdue: 'Ningún cliente en mora con este criterio de búsqueda.',
  current: 'Ningún cliente al día con este criterio de búsqueda.',
};

export function renderList(view: ReceivablesView, filter: AgingFilter, hasSearch: boolean, actions: CardActions): void {
  byId('receivable-list').replaceChildren(...view.visible.map((item) => renderCard(item, actions)));
  byId('list-count').textContent = pluralize(view.visible.length, 'registro', 'registros');
  byId('list-empty').hidden = view.visible.length > 0;
  byId('list-empty-text').textContent =
    !hasSearch && filter === 'all' ? '¡Todo al día! No hay ventas a crédito pendientes de pago.' : EMPTY_TEXT[filter];

  document.querySelectorAll<HTMLElement>('#aging-filter [data-aging]').forEach((button) => {
    const key = button.dataset.aging as AgingFilter;
    button.setAttribute('aria-pressed', String(key === filter));
    const count = button.querySelector('[data-count]');
    if (count) count.textContent = String(view.counts[key]);
  });
}

export function renderSummary(summary: ReceivablesSummary, overdueDays: number): void {
  byId('summary-total').textContent = formatCOP(summary.total);
  byId('summary-count').textContent = `${pluralize(summary.count, 'venta', 'ventas')} · ${pluralize(summary.customers, 'cliente', 'clientes')}`;
  byId('summary-overdue').dataset.overdue = String(summary.overdueCount > 0);
  byId('summary-overdue-text').textContent =
    summary.overdueCount > 0
      ? `${summary.overdueCount} en mora (${formatCOP(summary.overdueTotal)})`
      : `Ninguna con ${overdueDays}+ días`;
}
