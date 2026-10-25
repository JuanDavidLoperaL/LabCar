import '../../css/main.css';
import { DEFAULT_COMMISSION_RATE, PAYOUT_TRACKING_START } from '../config/business';
import { fetchEmployeeInfo } from '../data/employees';
import { fetchLoansByEmployee } from '../data/loans';
import { fetchDeferrals, fetchPayouts } from '../data/payouts';
import { fetchSalesBySeller } from '../data/sales';
import { fetchCommissionRate } from '../data/settings';
import { fetchActiveUsers } from '../data/users';
import { buildSettlement, settlementRange, type Settlement } from '../features/payouts/calculation';
import { downloadCsv, settlementCsv } from '../features/payouts/export';
import { setupDeferDialog } from '../features/payouts/defer-dialog';
import { setupPayDialog } from '../features/payouts/pay-dialog';
import {
  renderEmployee,
  renderLoading,
  renderPrintSheet,
  renderRateRule,
  renderSettlement,
  renderWeek,
  type Employee,
} from '../features/payouts/render';
import { payoutWeek, type PayoutWeek } from '../features/payouts/week';
import { requireSession, type SessionUser } from '../lib/auth';
import { firestoreErrorMessage } from '../lib/errors';
import { canAccessPayouts, canMarkPayoutPaid, canSeeAllPayouts, canSeeCompanyShare, ROLE_LABELS } from '../lib/roles';
import type { EmployeeInfo } from '../models/user';
import { byId } from '../ui/dom';
import { mountShell } from '../ui/shell';
import { showToast } from '../ui/toast';

/** Parámetros de la URL para poder compartir o recargar la misma vista: ?empleado=correo&semana=-1 */
const PARAMS = { employee: 'empleado', week: 'semana' } as const;

function showLoadError(message: string): void {
  byId('payouts').hidden = true;
  byId('load-error').hidden = false;
  byId('load-error-text').textContent = message;
  byId('btn-retry').addEventListener('click', () => window.location.reload(), { once: true });
}

/** Quita del DOM (no solo oculta) lo que solo ve el administrador, también dentro de los <template>. */
function removeAdminOnly(): void {
  const roots: ParentNode[] = [document, ...[...document.querySelectorAll('template')].map((template) => template.content)];
  roots.forEach((root) => root.querySelectorAll('[data-admin-only]').forEach((element) => element.remove()));
}

function initialWeekOffset(): number {
  const value = Number(new URLSearchParams(window.location.search).get(PARAMS.week));
  return Number.isInteger(value) && value < 0 ? value : 0;
}

function syncUrl(employee: Employee, offset: number, isSelf: boolean): void {
  const params = new URLSearchParams();
  if (!isSelf) params.set(PARAMS.employee, employee.email);
  if (offset !== 0) params.set(PARAMS.week, String(offset));
  const query = params.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

async function main(session: SessionUser): Promise<void> {
  const role = session.profile.role;
  const email = session.user.email?.toLowerCase() ?? '';
  const name = session.profile.name || session.user.displayName || email;
  const self: Employee = { email, name, role };
  if (!canAccessPayouts(role)) {
    byId('no-access').hidden = false;
    return;
  }
  const isAdmin = canSeeCompanyShare(role);
  const seesAll = canSeeAllPayouts(role);

  if (!isAdmin) removeAdminOnly();
  byId('page-subtitle').textContent = seesAll
    ? 'Comisiones de cada empleado por semana, con el detalle de sus servicios. Pesos colombianos (COP).'
    : 'Tus comisiones de la semana, con el detalle de tus servicios. Pesos colombianos (COP).';

  const container = byId('payouts');
  container.hidden = false;

  // Basic solo se ve a sí mismo: ni siquiera se consulta la lista de empleados.
  const employees: Employee[] = seesAll ? await fetchActiveUsers() : [self];
  const requested = new URLSearchParams(window.location.search).get(PARAMS.employee);
  const select = byId<HTMLSelectElement>('employee-select');
  if (seesAll) {
    select.replaceChildren(
      ...employees.map((employee) => new Option(`${employee.name} — ${ROLE_LABELS[employee.role]}`, employee.email)),
    );
  } else {
    byId('employee-picker').remove();
  }

  const state: { employee: Employee; offset: number } = {
    employee: employees.find((employee) => employee.email === requested) ?? employees.find((employee) => employee.email === email) ?? employees[0],
    offset: initialWeekOffset(),
  };
  if (!state.employee) {
    showLoadError('No hay empleados activos para mostrar.');
    return;
  }
  select.value = state.employee.email;

  const commissionRate = await fetchCommissionRate().catch(() => DEFAULT_COMMISSION_RATE);
  renderRateRule(commissionRate);

  // La cédula y el teléfono no cambian al cambiar de semana: se leen una vez por empleado.
  const infoCache = new Map<string, Promise<EmployeeInfo | null>>();
  const loadInfo = (employeeEmail: string) => {
    let info = infoCache.get(employeeEmail);
    if (!info) {
      // Sin datos de contacto la liquidación igual se puede ver.
      info = fetchEmployeeInfo(employeeEmail).catch((error: unknown) => {
        console.error(error);
        return null;
      });
      infoCache.set(employeeEmail, info);
    }
    return info;
  };

  // Lo último que se pintó, para imprimir, exportar y pagar.
  let current: { employee: Employee; week: PayoutWeek; settlement: Settlement } | null = null;
  // Evita que una respuesta lenta de una selección anterior pise la actual.
  let latestRequest = 0;
  let loadedOnce = false;

  async function load(): Promise<void> {
    const requestId = ++latestRequest;
    const { employee, offset } = state;
    const week = payoutWeek(offset);
    current = null;
    syncUrl(employee, offset, employee.email === email);
    renderWeek(week);
    renderEmployee(employee, undefined);
    renderLoading(true);
    try {
      const [payouts, deferrals, loans, info] = await Promise.all([
        fetchPayouts(employee.email),
        fetchDeferrals(employee.email),
        fetchLoansByEmployee(employee.email),
        loadInfo(employee.email),
      ]);
      const sales = await fetchSalesBySeller(employee.email, settlementRange(week, payouts, PAYOUT_TRACKING_START));
      if (requestId !== latestRequest) return;

      const settlement = buildSettlement({ sellerEmail: employee.email, sales, payouts, deferrals, loans, week, trackingStart: PAYOUT_TRACKING_START });
      current = { employee, week, settlement };
      renderEmployee(employee, info);
      renderSettlement(settlement, employee.name, commissionRate);
      renderPrintSheet(employee, info, week, settlement);
      renderLoading(false);
      loadedOnce = true;
    } catch (error) {
      if (requestId !== latestRequest) return;
      console.error(error);
      const message = firestoreErrorMessage(error, 'cargar los pagos');
      // Si ya se había cargado algo, se avisa sin perder la página (puede ser un corte momentáneo).
      if (loadedOnce) {
        renderLoading(false);
        showToast(message, 'error');
      } else {
        showLoadError(message);
      }
    }
  }

  const show = (offset: number) => {
    state.offset = Math.min(offset, 0); // no hay semanas futuras
    void load();
  };

  select.addEventListener('change', () => {
    const employee = employees.find((option) => option.email === select.value);
    if (!employee) return;
    state.employee = employee;
    void load();
  });
  byId('btn-week-prev').addEventListener('click', () => show(state.offset - 1));
  byId('btn-week-next').addEventListener('click', () => show(state.offset + 1));
  byId('btn-week-current').addEventListener('click', () => show(0));

  byId('btn-print').addEventListener('click', () => {
    if (current) window.print();
  });
  byId('btn-export-csv').addEventListener('click', () => {
    if (!current) return;
    downloadCsv(settlementCsv(current.settlement, isAdmin), current.employee.name, current.week.id);
  });

  if (canMarkPayoutPaid(role)) {
    const openPayDialog = setupPayDialog({ email, name }, () => void load());
    byId('btn-mark-paid').addEventListener('click', () => {
      const coverage = current?.settlement.coverage;
      if (current && coverage) openPayDialog({ ...current, coverage });
    });
    const openDeferDialog = setupDeferDialog({ email, name }, () => void load());
    byId('btn-defer').addEventListener('click', () => {
      if (current?.settlement.status.kind === 'pending') {
        openDeferDialog({ employee: current.employee, week: current.week, amount: current.settlement.toPay });
      }
    });
  }

  await load();
}

requireSession()
  .then((session) => {
    mountShell(session, 'pagos-vendedores');
    document.body.classList.remove('invisible');
    return main(session);
  })
  .catch((error: unknown) => {
    console.error(error);
    document.body.classList.remove('invisible');
    showLoadError(firestoreErrorMessage(error, 'cargar los pagos'));
  });
