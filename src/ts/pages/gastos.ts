import type { Unsubscribe } from 'firebase/firestore';
import '../../css/main.css';
import { watchExpenses } from '../data/expenses';
import { setupExpenseForm } from '../features/expenses/form';
import { renderExpenses, renderLoading } from '../features/expenses/render';
import { setupVoidDialog } from '../features/expenses/void-dialog';
import { requireSession, type SessionUser } from '../lib/auth';
import { bogotaDaysBetween, isPeriod, periodRange, type Period } from '../lib/dates';
import { firestoreErrorMessage } from '../lib/errors';
import { formatRangeLabel } from '../lib/format';
import { canAccessExpenses, canSeeExpenseHistory, canVoidExpense } from '../lib/roles';
import type { Expense } from '../models/expense';
import { byId } from '../ui/dom';
import { mountShell } from '../ui/shell';
import { showToast } from '../ui/toast';

/** Título del historial según el periodo: "Gastos de hoy", "Gastos de esta semana", … */
const PERIOD_TITLES: Record<Period, { current: string; past: string }> = {
  day: { current: 'hoy', past: 'ese día' },
  week: { current: 'esta semana', past: 'esa semana' },
  month: { current: 'este mes', past: 'ese mes' },
};

function showLoadError(message: string): void {
  byId('expenses').hidden = true;
  byId('load-error').hidden = false;
  byId('load-error-text').textContent = message;
  byId('btn-retry').addEventListener('click', () => window.location.reload(), { once: true });
}

function main(session: SessionUser): void {
  const role = session.profile.role;
  if (!canAccessExpenses(role)) {
    byId('no-access').hidden = false;
    return;
  }

  const email = session.user.email?.toLowerCase() ?? '';
  const user = { email, name: session.profile.name || session.user.displayName || email };
  const seesHistory = canSeeExpenseHistory(role);
  // Quitar del DOM (no solo ocultar) lo que el manager no puede usar.
  if (!seesHistory) document.querySelectorAll('[data-admin-only]').forEach((element) => element.remove());

  byId('expenses').hidden = false;
  byId('page-subtitle').textContent = seesHistory
    ? 'Registro de las salidas de dinero del taller. Pesos colombianos (COP).'
    : 'Registro de las salidas de dinero de hoy. Pesos colombianos (COP).';

  setupExpenseForm({ canBackdate: seesHistory, createdBy: user });
  const openVoid = setupVoidDialog(user);
  const listActions = {
    canVoid: (expense: Expense) => canVoidExpense(role, bogotaDaysBetween(expense.date, new Date()) === 0),
    onVoid: openVoid,
  };

  const state: { period: Period; offset: number } = { period: 'day', offset: 0 };
  let unsubscribe: Unsubscribe | null = null;
  let loadedOnce = false;

  /** Escucha en tiempo real los gastos del periodo: lo que se registre o anule aparece solo. */
  function show(period: Period, offset: number): void {
    state.period = period;
    state.offset = Math.min(offset, 0); // no hay datos del futuro
    const range = periodRange(state.period, state.offset);
    const titles = PERIOD_TITLES[state.period];
    byId('history-period').textContent = state.offset === 0 ? titles.current : titles.past;
    byId('history-range').textContent = formatRangeLabel(range);
    if (seesHistory) {
      document.querySelectorAll<HTMLElement>('#period-filter [data-period]').forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.period === state.period)),
      );
      byId<HTMLButtonElement>('btn-period-next').disabled = state.offset === 0;
      byId('btn-period-current').hidden = state.offset === 0;
    }

    unsubscribe?.();
    renderLoading(true);
    unsubscribe = watchExpenses(
      range,
      (expenses) => {
        loadedOnce = true;
        renderExpenses(expenses, 'No hay gastos registrados en este periodo.', listActions);
        renderLoading(false);
      },
      (error) => {
        console.error(error);
        const message = firestoreErrorMessage(error, 'cargar los gastos');
        // Si ya se había cargado algo, se avisa sin perder la página (puede ser un corte momentáneo).
        if (loadedOnce) {
          renderLoading(false);
          showToast(message, 'error');
        } else {
          showLoadError(message);
        }
      },
    );
  }

  if (seesHistory) {
    byId('period-filter').addEventListener('click', (event) => {
      const period = (event.target as HTMLElement).closest<HTMLElement>('[data-period]')?.dataset.period;
      if (isPeriod(period) && period !== state.period) show(period, 0);
    });
    byId('btn-period-prev').addEventListener('click', () => show(state.period, state.offset - 1));
    byId('btn-period-next').addEventListener('click', () => show(state.period, state.offset + 1));
    byId('btn-period-current').addEventListener('click', () => show(state.period, 0));
  }

  show('day', 0);
}

requireSession()
  .then((session) => {
    mountShell(session, 'gastos');
    document.body.classList.remove('invisible');
    main(session);
  })
  .catch((error: unknown) => {
    console.error(error);
    document.body.classList.remove('invisible');
    showLoadError('Revisa tu conexión a internet e intenta de nuevo.');
  });
