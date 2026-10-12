import { BUSINESS, PAYOUT_TRACKING_START } from '../../config/business';
import { USERNAME_DOMAIN } from '../../lib/auth';
import { formatCOP, formatRangeLabel, formatShortDate, formatShortDateTime, formatWeekdayDateTime, initials, pluralize } from '../../lib/format';
import { ROLE_LABELS, type Role } from '../../lib/roles';
import type { EmployeeInfo } from '../../models/user';
import { byId } from '../../ui/dom';
import { cloneTemplate, field, setField } from '../../ui/template';
import { formatPhone } from '../receivables/reminder';
import { formatPlate } from '../sales/plate';
import { itemsSummary } from '../sales/summary';
import { ENTRY_STATE_LABELS, type PayoutEntry, type Settlement } from './calculation';
import type { PayoutWeek } from './week';

/**
 * Pintado de la página de pagos. Las columnas y tarjetas de LAB CAR (data-admin-only) ya no existen
 * en el DOM para manager y basic: por eso se llenan con setOptional.
 */

export interface Employee {
  email: string;
  name: string;
  role: Role;
}

function setOptional(root: ParentNode, selector: string, text: string): void {
  const element = root.querySelector(selector);
  if (element) element.textContent = text;
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** "CC 1.036.782.901" · "Sin cédula registrada" */
export function documentLabel(info: EmployeeInfo | null): string {
  const number = info?.documentNumber.trim();
  if (!number) return 'Sin cédula registrada';
  return `CC ${/^\d+$/.test(number) ? Number(number).toLocaleString('es-CO') : number}`;
}

export function phoneLabel(info: EmployeeInfo | null): string {
  return info?.phone ? formatPhone(info.phone) : 'Sin teléfono registrado';
}

/** Los usuarios sin correo propio (usuario@usuarios.labcar.local) no tienen correo que mostrar. */
export function emailLabel(email: string): string {
  return email.endsWith(`@${USERNAME_DOMAIN}`) ? 'Sin correo' : email;
}

export function weekLabel(week: PayoutWeek): string {
  return `Semana ${formatRangeLabel(week.days)}`;
}

// ---------- Semana ----------

export function renderWeek(week: PayoutWeek): void {
  byId('week-label').textContent = weekLabel(week);
  byId('week-status').dataset.current = String(week.isCurrent);
  byId('week-status-text').textContent = week.isCurrent
    ? `Semana en curso · el corte es el ${formatWeekdayDateTime(week.range.end)}`
    : 'Semana cerrada';
  byId('cutoff-label').textContent = `Corte: ${formatWeekdayDateTime(week.range.end)}`;
  byId('orders-range').textContent = `Ventas del ${formatWeekdayDateTime(week.range.start)} al ${formatWeekdayDateTime(week.range.end)}`;
  byId<HTMLButtonElement>('btn-week-next').disabled = week.isCurrent;
  byId('btn-week-current').hidden = week.isCurrent;
}

// ---------- Empleado ----------

/** `info` undefined = todavía cargando la cédula y el teléfono. */
export function renderEmployee(employee: Employee, info: EmployeeInfo | null | undefined): void {
  byId('employee-initials').textContent = initials(employee.name);
  byId('employee-name').textContent = employee.name;
  byId('employee-role').textContent = ROLE_LABELS[employee.role];
  byId('employee-email').textContent = emailLabel(employee.email);
  byId('employee-document').textContent = info === undefined ? '' : documentLabel(info);
  byId('employee-phone').textContent = info === undefined ? '' : phoneLabel(info);
}

// ---------- Estado del pago y cifras ----------

function renderStatus(settlement: Settlement): void {
  const { status, toPay } = settlement;
  const badge = byId('payout-status');
  const icon = byId('payout-status-icon');
  const text = byId('payout-status-text');
  switch (status.kind) {
    case 'pending':
      badge.dataset.state = 'pending';
      icon.textContent = 'schedule';
      text.textContent = `Pendiente por pagar ${formatCOP(toPay)}`;
      break;
    case 'paid':
      badge.dataset.state = 'paid';
      icon.textContent = 'check_circle';
      text.textContent = status.inLaterWeek
        ? `Pagado el ${formatShortDate(status.payout.paidAt)}, junto con una semana posterior`
        : `Pagado el ${formatShortDateTime(status.payout.paidAt)} por ${status.payout.paidBy.name || status.payout.paidBy.email}`;
      break;
    case 'deferred':
      badge.dataset.state = 'deferred';
      icon.textContent = 'history_toggle_off';
      text.textContent = `Acumulado a la próxima semana · ${formatCOP(toPay)}`;
      break;
    case 'empty':
      badge.dataset.state = 'neutral';
      icon.textContent = 'remove_done';
      text.textContent = 'Sin comisiones por pagar';
      break;
    case 'untracked':
      badge.dataset.state = 'neutral';
      icon.textContent = 'history';
      text.textContent = `Liquidada antes del control de pagos (${formatShortDate(PAYOUT_TRACKING_START)})`;
      break;
  }

  const payButton = document.getElementById('btn-mark-paid');
  const deferButton = document.getElementById('btn-defer');
  if (payButton instanceof HTMLButtonElement && deferButton instanceof HTMLButtonElement) {
    const canPay = status.kind === 'pending' || status.kind === 'deferred';
    payButton.disabled = !canPay;
    deferButton.disabled = status.kind !== 'pending';
    byId('btn-mark-paid-label').textContent = canPay ? `Marcar pagado (${formatCOP(toPay)})` : 'Marcar pagado';
    const hint = actionsHint(status);
    const hintEl = byId('btn-mark-paid-hint');
    hintEl.hidden = hint === null;
    hintEl.textContent = hint ?? '';
  }
}

/** Explica por qué los botones están deshabilitados, o qué se decidió (null = nada que aclarar). */
function actionsHint(status: Settlement['status']): string | null {
  switch (status.kind) {
    case 'pending':
      return null;
    case 'deferred': {
      const by = status.deferral.deferredBy.name || status.deferral.deferredBy.email;
      return `Acumulado el ${formatShortDateTime(status.deferral.deferredAt)} por ${by}. Aún puedes marcarlo pagado.`;
    }
    case 'paid':
      return 'Esta semana ya está pagada.';
    case 'empty':
      return 'No hay comisiones por pagar en esta semana.';
    case 'untracked':
      return 'Semana anterior al control de pagos: se liquidó por fuera del sistema.';
  }
}

function toPayCard(settlement: Settlement): { label: string; value: number; detail: string; paid: boolean } {
  const { status, toPay, weekTotals, carryoverTotal } = settlement;
  switch (status.kind) {
    case 'pending': {
      const detail = carryoverTotal > 0
        ? `Semana ${formatCOP(toPay - carryoverTotal)} + saldo de semanas anteriores ${formatCOP(carryoverTotal)}`
        : pluralize(weekTotals.count, 'servicio esta semana', 'servicios esta semana');
      return { label: 'A pagar', value: toPay, detail, paid: false };
    }
    case 'paid': {
      if (status.inLaterWeek) {
        return { label: 'Pagado', value: weekTotals.commission, detail: `Incluido en el pago del ${formatShortDate(status.payout.paidAt)}`, paid: true };
      }
      // Lo vendido después de registrar el pago (antes del corte) pasa a la próxima semana.
      const later = toPay > 0 ? ` · ${formatCOP(toPay)} vendidos después del pago pasan a la próxima semana` : '';
      return { label: 'Pagado', value: status.payout.amount, detail: `El ${formatShortDate(status.payout.paidAt)}${later}`, paid: true };
    }
    case 'deferred':
      return { label: 'Acumulado a la próxima semana', value: toPay, detail: `Se decidió no pagarlo esta semana (${formatShortDate(status.deferral.deferredAt)})`, paid: false };
    case 'empty':
      return { label: 'A pagar', value: 0, detail: 'Sin servicios por pagar esta semana', paid: false };
    case 'untracked':
      return { label: 'Comisión de la semana', value: weekTotals.commission, detail: 'Liquidada por fuera del sistema', paid: false };
  }
}

function renderKpis(settlement: Settlement): void {
  const card = toPayCard(settlement);
  byId('kpi-to-pay').dataset.state = card.paid ? 'paid' : 'pending';
  byId('kpi-to-pay-label').textContent = card.label;
  byId('kpi-to-pay-value').textContent = formatCOP(card.value);
  byId('kpi-to-pay-detail').textContent = card.detail;

  const { sold, commission, company, count } = settlement.weekTotals;
  setOptional(document, '#kpi-sold-value', formatCOP(sold));
  setOptional(document, '#kpi-sold-detail', `${pluralize(count, 'servicio', 'servicios')} · las ventas compartidas cuentan por partes iguales`);
  setOptional(document, '#kpi-company-value', formatCOP(company));
  setOptional(document, '#kpi-company-detail', sold > 0 ? `${percent(company, sold)}% de lo vendido · comisión ${percent(commission, sold)}%` : 'Sin ventas esta semana');
  const bar = document.getElementById('split-bar-commission');
  if (bar) bar.style.width = `${percent(commission, sold)}%`;
}

// ---------- Órdenes ----------

function historyUrl(saleId: string): string {
  return `/html/historial.html?venta=${encodeURIComponent(saleId)}`;
}

function fillEntry(root: HTMLElement, entry: PayoutEntry): void {
  const { sale } = entry;
  setField(root, 'date', formatShortDateTime(sale.date));
  const order = field<HTMLAnchorElement>(root, 'order');
  order.textContent = sale.id;
  order.href = historyUrl(sale.id);
  setField(root, 'customer', sale.customer?.name || 'Consumidor final');
  setField(root, 'plate', formatPlate(sale.plate) || '—');
  setField(root, 'vehicle-line', sale.vehicleLine);
  setField(root, 'services', itemsSummary(sale));
  setField(root, 'commission', formatCOP(entry.commission));
  setOptional(root, '[data-field="sold"]', formatCOP(entry.sold));
  setOptional(root, '[data-field="sold-detail"]', entry.sellerCount > 1 ? `de ${formatCOP(sale.total)} · ${entry.sellerCount} vendedores` : '');
  setOptional(root, '[data-field="company"]', formatCOP(entry.company));
  const state = field(root, 'state');
  state.dataset.state = entry.state;
  state.textContent = ENTRY_STATE_LABELS[entry.state];
  // La comisión se paga aunque el cliente aún no haya pagado su crédito; se avisa para tenerlo presente.
  field(root, 'unpaid-customer').hidden = sale.status !== 'pending';
}

interface EntryGroup {
  title: string | null;
  entries: readonly PayoutEntry[];
}

function entryGroups(settlement: Settlement): EntryGroup[] {
  if (!settlement.carryover.length) return [{ title: null, entries: settlement.week }];
  return [
    { title: `Semanas anteriores sin pagar · ${formatCOP(settlement.carryoverTotal)}`, entries: settlement.carryover },
    { title: `Esta semana · ${formatCOP(settlement.weekTotals.commission)}`, entries: settlement.week },
  ].filter((group) => group.entries.length > 0);
}

function renderOrders(settlement: Settlement, employeeName: string, commissionRate: number): void {
  const groups = entryGroups(settlement);
  const columns = byId('orders-head').children.length;
  const rows: HTMLElement[] = [];
  const cards: HTMLElement[] = [];

  for (const group of groups) {
    if (group.title) {
      const header = cloneTemplate<HTMLTableRowElement>('tpl-order-group');
      const cell = field<HTMLTableCellElement>(header, 'title');
      cell.colSpan = columns;
      cell.textContent = group.title;
      rows.push(header);
      const cardHeader = cloneTemplate('tpl-order-card-group');
      cardHeader.textContent = group.title;
      cards.push(cardHeader);
    }
    for (const entry of group.entries) {
      const row = cloneTemplate<HTMLTableRowElement>('tpl-order-row');
      fillEntry(row, entry);
      rows.push(row);
      const card = cloneTemplate<HTMLLIElement>('tpl-order-card');
      fillEntry(card, entry);
      cards.push(card);
    }
  }

  byId('order-rows').replaceChildren(...rows);
  byId('order-cards').replaceChildren(...cards);
  const total = settlement.week.length + settlement.carryover.length;
  byId('orders-count').textContent = pluralize(total, 'registro', 'registros');
  byId('orders-empty').hidden = total > 0;
  byId('orders-empty-text').textContent = `${employeeName} no tiene servicios en esta semana.`;
  byId('orders-foot').hidden = settlement.week.length === 0;

  const { sold, commission, company } = settlement.weekTotals;
  byId('foot-commission').textContent = formatCOP(commission);
  setOptional(document, '#foot-sold', formatCOP(sold));
  setOptional(document, '#foot-company', formatCOP(company));

  const rate = Math.round(commissionRate * 100);
  byId('orders-note').textContent =
    `La comisión es el ${rate}% del valor cobrado de cada venta (después de descuentos) y se reparte por partes iguales entre sus vendedores. ` +
    'Se paga aunque el cliente aún no haya pagado su crédito. Lo que no se paga en su semana se suma a la siguiente.';
}

export function renderSettlement(settlement: Settlement, employeeName: string, commissionRate: number): void {
  renderStatus(settlement);
  renderKpis(settlement);
  renderOrders(settlement, employeeName, commissionRate);
}

export function renderRateRule(commissionRate: number): void {
  const rate = Math.round(commissionRate * 100);
  setOptional(document, '#rate-rule-text', `Regla: ${rate}% vendedor / ${100 - rate}% LAB CAR`);
}

// ---------- Hoja para imprimir ----------

export function renderPrintSheet(employee: Employee, info: EmployeeInfo | null, week: PayoutWeek, settlement: Settlement): void {
  byId('print-business').textContent = `${BUSINESS.name} · ${BUSINESS.tagline} · NIT ${BUSINESS.nit}`;
  byId('print-week').textContent = weekLabel(week);
  byId('print-cutoff').textContent = `Corte: ${formatWeekdayDateTime(week.range.end)}`;
  byId('print-name').textContent = employee.name;
  byId('print-document').textContent = documentLabel(info);
  byId('print-phone').textContent = phoneLabel(info);
  byId('print-email').textContent = emailLabel(employee.email);

  byId('print-rows').replaceChildren(
    ...[...settlement.carryover, ...settlement.week].map((entry) => {
      const row = cloneTemplate<HTMLTableRowElement>('tpl-print-row');
      setField(row, 'date', formatShortDateTime(entry.sale.date));
      setField(row, 'order', entry.sale.id);
      setField(row, 'customer', [entry.sale.customer?.name || 'Consumidor final', formatPlate(entry.sale.plate)].filter(Boolean).join(' · '));
      setField(row, 'services', itemsSummary(entry.sale));
      setOptional(row, '[data-field="sold"]', formatCOP(entry.sold));
      setField(row, 'commission', formatCOP(entry.commission));
      return row;
    }),
  );

  // Un pago ya registrado puede incluir saldo de semanas anteriores que no aparece en la tabla.
  const { status } = settlement;
  const ownPayout = status.kind === 'paid' && !status.inLaterWeek ? status.payout : null;
  const weekCommission = ownPayout
    ? settlement.week.filter((entry) => entry.state === 'paid').reduce((sum, entry) => sum + entry.commission, 0)
    : settlement.weekTotals.commission;
  const total = ownPayout ? ownPayout.amount : settlement.toPay;
  byId('print-week-total').textContent = formatCOP(weekCommission);
  byId('print-carryover').textContent = formatCOP(ownPayout ? total - weekCommission : settlement.carryoverTotal);
  byId('print-to-pay-label').textContent = ownPayout ? 'Total pagado' : 'Total a pagar';
  byId('print-to-pay').textContent = formatCOP(total);
  byId('print-status').textContent =
    status.kind === 'paid'
      ? `Pagado el ${formatShortDateTime(status.payout.paidAt)} · registró ${status.payout.paidBy.name || status.payout.paidBy.email}`
      : status.kind === 'pending'
        ? 'Pendiente de pago'
        : status.kind === 'deferred'
          ? `Acumulado a la próxima semana el ${formatShortDateTime(status.deferral.deferredAt)} · registró ${status.deferral.deferredBy.name || status.deferral.deferredBy.email}`
          : '';
}

// ---------- Carga ----------

export function renderLoading(loading: boolean): void {
  const container = byId('payouts');
  container.dataset.loading = String(loading);
  container.setAttribute('aria-busy', String(loading));
  byId<HTMLButtonElement>('btn-print').disabled = loading;
  byId<HTMLButtonElement>('btn-export-csv').disabled = loading;
}
