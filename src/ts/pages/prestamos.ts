import type { Unsubscribe } from 'firebase/firestore';
import '../../css/main.css';
import { watchLoans } from '../data/loans';
import { fetchActiveUsers } from '../data/users';
import { setupLoanForm } from '../features/loans/form';
import { renderLoading, renderLoans } from '../features/loans/render';
import { setupVoidDialog } from '../features/loans/void-dialog';
import { requireSession, type SessionUser } from '../lib/auth';
import { isPeriod, periodRange, type Period } from '../lib/dates';
import { firestoreErrorMessage } from '../lib/errors';
import { formatRangeLabel } from '../lib/format';
import { canAccessLoans } from '../lib/roles';
import type { Loan } from '../models/loan';
import { byId } from '../ui/dom';
import { mountShell } from '../ui/shell';
import { showToast } from '../ui/toast';

/** Título del historial según el periodo: "Préstamos de hoy", "Préstamos de esta semana", … */
const PERIOD_TITLES: Record<Period, { current: string; past: string }> = {
  day: { current: 'hoy', past: 'ese día' },
  week: { current: 'esta semana', past: 'esa semana' },
  month: { current: 'este mes', past: 'ese mes' },
};

function showLoadError(message: string): void {
  byId('loans').hidden = true;
  byId('load-error').hidden = false;
  byId('load-error-text').textContent = message;
  byId('btn-retry').addEventListener('click', () => window.location.reload(), { once: true });
}

async function main(session: SessionUser): Promise<void> {
  const role = session.profile.role;
  if (!canAccessLoans(role)) {
    byId('no-access').hidden = false;
    return;
  }

  const email = session.user.email?.toLowerCase() ?? '';
  const user = { email, name: session.profile.name || session.user.displayName || email };
  const employees = await fetchActiveUsers();
  byId('loans').hidden = false;
  byId('page-subtitle').textContent =
    'Dinero o productos de la tienda que se le prestan a un empleado. Se descuentan de sus comisiones en Pagos Vendedores. Pesos colombianos (COP).';

  setupLoanForm({ employees, canBackdate: true, createdBy: user });
  // Se puede anular cualquier préstamo que aún no se haya descontado (el diálogo lo revisa).
  const listActions = { canVoid: () => true, onVoid: setupVoidDialog(user) };

  const employeeFilter = byId<HTMLSelectElement>('filter-employee');
  employeeFilter.append(...employees.map((employee) => new Option(employee.name, employee.email)));

  const state: { period: Period; offset: number } = { period: 'day', offset: 0 };
  let loans: Loan[] = [];
  let unsubscribe: Unsubscribe | null = null;
  let loadedOnce = false;

  function render(): void {
    const selected = employeeFilter.value;
    const visible = selected ? loans.filter((loan) => loan.employeeEmail === selected) : loans;
    renderLoans(visible, selected ? 'Este empleado no tiene préstamos en este periodo.' : 'No hay préstamos registrados en este periodo.', listActions);
  }

  /** Escucha en tiempo real los préstamos del periodo: lo que se registre o anule aparece solo. */
  function show(period: Period, offset: number): void {
    state.period = period;
    state.offset = Math.min(offset, 0); // no hay datos del futuro
    const range = periodRange(state.period, state.offset);
    const titles = PERIOD_TITLES[state.period];
    byId('history-period').textContent = state.offset === 0 ? titles.current : titles.past;
    byId('history-range').textContent = formatRangeLabel(range);
    document.querySelectorAll<HTMLElement>('#period-filter [data-period]').forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.period === state.period)),
    );
    byId<HTMLButtonElement>('btn-period-next').disabled = state.offset === 0;
    byId('btn-period-current').hidden = state.offset === 0;

    unsubscribe?.();
    renderLoading(true);
    unsubscribe = watchLoans(
      range,
      (next) => {
        loadedOnce = true;
        loans = next;
        render();
        renderLoading(false);
      },
      (error) => {
        console.error(error);
        const message = firestoreErrorMessage(error, 'cargar los préstamos');
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

  employeeFilter.addEventListener('change', render);
  byId('period-filter').addEventListener('click', (event) => {
    const period = (event.target as HTMLElement).closest<HTMLElement>('[data-period]')?.dataset.period;
    if (isPeriod(period) && period !== state.period) show(period, 0);
  });
  byId('btn-period-prev').addEventListener('click', () => show(state.period, state.offset - 1));
  byId('btn-period-next').addEventListener('click', () => show(state.period, state.offset + 1));
  byId('btn-period-current').addEventListener('click', () => show(state.period, 0));

  show('day', 0);
}

requireSession()
  .then((session) => {
    mountShell(session, 'prestamos');
    document.body.classList.remove('invisible');
    return main(session);
  })
  .catch((error: unknown) => {
    console.error(error);
    document.body.classList.remove('invisible');
    showLoadError('Revisa tu conexión a internet e intenta de nuevo.');
  });
