import '../../css/main.css';
import { DEFAULT_OVERDUE_DAYS, MAX_OVERDUE_DAYS, MIN_OVERDUE_DAYS } from '../config/business';
import { watchPendingSales } from '../data/sales';
import { isValidOverdueDays, saveOverdueDays, watchOverdueDays } from '../data/settings';
import { setupPaymentDialog } from '../features/receivables/payment-dialog';
import { renderList, renderSummary } from '../features/receivables/render';
import { setupReminderDialog } from '../features/receivables/reminder-dialog';
import { AGING_FILTERS, buildView, SORT_ORDERS, summarize, type ReceivableFilters } from '../features/receivables/search';
import { requireSession, type SessionUser } from '../lib/auth';
import { firestoreErrorMessage } from '../lib/errors';
import { canAccessReceivables, canEditOverdueDays } from '../lib/roles';
import type { Sale } from '../models/sale';
import { byId } from '../ui/dom';
import { mountShell } from '../ui/shell';
import { showToast } from '../ui/toast';

function showLoadError(message: string): void {
  byId('receivables').hidden = true;
  byId('load-error').hidden = false;
  byId('load-error-text').textContent = message;
  byId('btn-retry').addEventListener('click', () => window.location.reload(), { once: true });
}

function main(session: SessionUser): void {
  const role = session.profile.role;
  if (!canAccessReceivables(role)) {
    byId('no-access').hidden = false;
    return;
  }

  const email = session.user.email?.toLowerCase() ?? '';
  const container = byId('receivables');
  container.hidden = false;

  const state: { sales: Sale[]; overdueDays: number; filters: ReceivableFilters } = {
    sales: [],
    overdueDays: DEFAULT_OVERDUE_DAYS,
    filters: { term: '', aging: 'all', sort: 'oldest' },
  };

  const openReminder = setupReminderDialog();
  const openPayment = setupPaymentDialog({ email, name: session.profile.name || session.user.displayName || email });

  function render(): void {
    const now = new Date();
    renderSummary(summarize(state.sales, state.overdueDays, now), state.overdueDays);
    renderList(buildView(state.sales, state.overdueDays, state.filters, now), state.filters.aging, state.filters.term.trim() !== '', {
      onRemind: openReminder,
      onPay: openPayment,
    });
  }

  // ---------- Búsqueda, filtros y orden (todo en el navegador, sin consultas extra) ----------

  const searchInput = byId<HTMLInputElement>('search');
  searchInput.addEventListener('input', () => {
    state.filters.term = searchInput.value;
    render();
  });
  byId('aging-filter').addEventListener('click', (event) => {
    const value = (event.target as HTMLElement).closest<HTMLElement>('[data-aging]')?.dataset.aging;
    const aging = AGING_FILTERS.find((option) => option === value);
    if (aging) {
      state.filters.aging = aging;
      render();
    }
  });
  const sortSelect = byId<HTMLSelectElement>('sort');
  sortSelect.addEventListener('change', () => {
    state.filters.sort = SORT_ORDERS.find((option) => option === sortSelect.value) ?? 'oldest';
    render();
  });

  // ---------- Días para entrar en mora (solo el admin los cambia) ----------

  const daysInput = byId<HTMLInputElement>('overdue-days');
  const saveBtn = byId<HTMLButtonElement>('btn-save-overdue');
  const help = byId('overdue-help');
  const canEdit = canEditOverdueDays(role);
  daysInput.readOnly = !canEdit;
  saveBtn.hidden = !canEdit;
  const defaultHelp = canEdit
    ? `Entre ${MIN_OVERDUE_DAYS} y ${MAX_OVERDUE_DAYS} días. Aplica para todos los equipos.`
    : 'Solo el administrador puede cambiarlo.';
  help.textContent = defaultHelp;

  const typedDays = () => Number(daysInput.value);
  const isDirty = () => typedDays() !== state.overdueDays;
  daysInput.addEventListener('input', () => {
    saveBtn.disabled = !isDirty() || !isValidOverdueDays(typedDays());
    help.textContent = isValidOverdueDays(typedDays()) ? defaultHelp : `Escribe un número entero entre ${MIN_OVERDUE_DAYS} y ${MAX_OVERDUE_DAYS}.`;
  });
  byId<HTMLFormElement>('overdue-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const days = typedDays();
    if (!canEdit || !isValidOverdueDays(days) || !isDirty()) return;
    saveBtn.disabled = true;
    try {
      await saveOverdueDays(days, email);
      showToast(`Alerta de mora: ${days} días. Ya aplica en todos los equipos.`, 'check_circle');
    } catch (error) {
      console.error(error);
      saveBtn.disabled = false;
      showToast(firestoreErrorMessage(error, 'guardar los días de mora'), 'error');
    }
  });

  // ---------- Datos en tiempo real ----------

  watchOverdueDays(
    (days) => {
      // Si el admin está escribiendo un valor sin guardar, no se le borra.
      const editing = canEdit && document.activeElement === daysInput && isDirty();
      state.overdueDays = days;
      if (!editing) {
        daysInput.value = String(days);
        saveBtn.disabled = true;
      }
      render();
    },
    (error) => {
      // Sin la configuración se sigue con 30 días: la cartera es más importante.
      console.error(error);
      daysInput.value = String(state.overdueDays);
      showToast(firestoreErrorMessage(error, 'cargar los días de mora'), 'warning');
    },
  );

  watchPendingSales(
    (sales) => {
      state.sales = sales;
      container.dataset.loading = 'false';
      container.setAttribute('aria-busy', 'false');
      render();
    },
    (error) => {
      console.error(error);
      showLoadError(firestoreErrorMessage(error, 'cargar la cartera'));
    },
  );

  // Los días de mora cambian con la fecha: al volver a la pestaña (p. ej. al día siguiente) se recalculan.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });
}

requireSession()
  .then((session) => {
    mountShell(session, 'cartera');
    document.body.classList.remove('invisible');
    main(session);
  })
  .catch((error: unknown) => {
    console.error(error);
    document.body.classList.remove('invisible');
    showLoadError('Revisa tu conexión a internet e intenta de nuevo.');
  });
