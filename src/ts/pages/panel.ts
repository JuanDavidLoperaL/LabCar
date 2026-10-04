import '../../css/main.css';
import { DEFAULT_OVERDUE_DAYS } from '../config/business';
import { fetchExpenses } from '../data/expenses';
import { fetchSales, fetchSettledCredits } from '../data/sales';
import { fetchOverdueDays } from '../data/settings';
import { computeMetrics } from '../features/dashboard/metrics';
import {
  renderAdminDetails,
  renderEmpty,
  renderLoading,
  renderPeriodLabels,
  renderSummary,
} from '../features/dashboard/render';
import { requireSession } from '../lib/auth';
import { isPeriod, periodRange, type Period } from '../lib/dates';
import { dashboardAccess, ROLE_LABELS, type DashboardAccess } from '../lib/roles';
import { byId } from '../ui/dom';
import { mountShell } from '../ui/shell';
import { showToast } from '../ui/toast';

const SUBTITLE: Record<Exclude<DashboardAccess, 'none'>, string> = {
  full: 'LAB CAR Medellín • Resumen operativo y financiero • Pesos colombianos (COP)',
  'today-summary': 'LAB CAR Medellín • Resumen de hoy • Pesos colombianos (COP)',
};

function showLoadError(): void {
  document.body.classList.remove('invisible');
  byId('dashboard').hidden = true;
  byId('load-error').hidden = false;
  byId('btn-retry').addEventListener('click', () => window.location.reload(), { once: true });
}

async function main(): Promise<void> {
  const session = await requireSession();
  mountShell(session, 'panel');
  document.body.classList.remove('invisible');

  const access = dashboardAccess(session.profile.role);
  if (access === 'none') {
    byId('no-access').hidden = false;
    return;
  }

  const isFull = access === 'full';
  byId('dashboard').hidden = false;
  byId('role-label').textContent = ROLE_LABELS[session.profile.role];
  byId('dashboard-subtitle').textContent = SUBTITLE[access];
  byId('kpi-grid').dataset.layout = access;
  // Quitar del DOM (no solo ocultar) lo que este rol no puede ver.
  if (!isFull) document.querySelectorAll('[data-admin-only]').forEach((el) => el.remove());

  // Los días de mora se leen una sola vez por visita (no en cada cambio de periodo).
  let overdueDays: Promise<number> | null = null;
  const loadOverdueDays = () => (overdueDays ??= fetchOverdueDays().catch(() => DEFAULT_OVERDUE_DAYS));

  // Evita que una respuesta lenta de un filtro anterior pise la del filtro actual.
  let latestRequest = 0;

  /** offset 0 = periodo actual, -1 = anterior, etc. */
  async function load(period: Period, offset: number): Promise<void> {
    const requestId = ++latestRequest;
    const now = new Date();
    const range = periodRange(period, offset, now);
    renderPeriodLabels(period, offset, range);
    renderLoading(true);
    try {
      // Cobros de cartera y días de mora solo se usan en las tarjetas del administrador.
      const [sales, expenses, settledCredits, days] = await Promise.all([
        fetchSales(range),
        fetchExpenses(range),
        isFull ? fetchSettledCredits(range) : [],
        isFull ? loadOverdueDays() : DEFAULT_OVERDUE_DAYS,
      ]);
      if (requestId !== latestRequest) return;

      const metrics = computeMetrics(sales, expenses, settledCredits, days, now);
      renderSummary(metrics);
      if (isFull) renderAdminDetails(metrics, sales);
    } catch (error) {
      if (requestId !== latestRequest) return;
      console.error(error);
      renderEmpty();
      showToast('No se pudieron cargar los datos del panel. Revisa tu conexión e intenta de nuevo.', 'error');
    } finally {
      if (requestId === latestRequest) renderLoading(false);
    }
  }

  if (!isFull) {
    void load('day', 0);
    return;
  }

  const periodButtons = [...byId('period-filter').querySelectorAll<HTMLButtonElement>('[data-period]')];
  const prevBtn = byId<HTMLButtonElement>('btn-period-prev');
  const nextBtn = byId<HTMLButtonElement>('btn-period-next');
  const currentBtn = byId<HTMLButtonElement>('btn-period-current');
  const state: { period: Period; offset: number } = { period: 'day', offset: 0 };

  const show = (period: Period, offset: number) => {
    state.period = period;
    state.offset = Math.min(offset, 0); // no hay datos del futuro
    periodButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.period === period)));
    nextBtn.disabled = state.offset === 0;
    currentBtn.hidden = state.offset === 0;
    void load(state.period, state.offset);
  };

  periodButtons.forEach((button) =>
    button.addEventListener('click', () => {
      const period = button.dataset.period;
      if (isPeriod(period) && period !== state.period) show(period, 0);
    }),
  );
  prevBtn.addEventListener('click', () => show(state.period, state.offset - 1));
  nextBtn.addEventListener('click', () => show(state.period, state.offset + 1));
  currentBtn.addEventListener('click', () => show(state.period, 0));
  show('day', 0);
}

main().catch((error: unknown) => {
  console.error(error);
  showLoadError();
});
