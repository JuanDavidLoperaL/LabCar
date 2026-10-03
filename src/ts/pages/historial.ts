import '../../css/main.css';
import { fetchSale, voidSale } from '../data/sales';
import { fetchActiveUsers } from '../data/users';
import { renderDetail, renderRows, renderSummary } from '../features/history/render';
import { searchHistory, type HistoryFilters } from '../features/history/search';
import { whatsappUrl } from '../features/receipt/content';
import { printReceipt } from '../features/receipt/print';
import { requireSession, type SessionUser } from '../lib/auth';
import { firestoreErrorMessage } from '../lib/errors';
import { periodRange, rangeFromDateInputs, toDateInputValue } from '../lib/dates';
import { canSeeAllSales, canVoidSales } from '../lib/roles';
import { SALE_STATUSES, type Sale } from '../models/sale';
import { byId } from '../ui/dom';
import { mountShell } from '../ui/shell';
import { showToast } from '../ui/toast';

const MIN_VOID_REASON = 5;

async function main(session: SessionUser): Promise<void> {
  const email = session.user.email?.toLowerCase() ?? '';
  const role = session.profile.role;
  const seesAll = canSeeAllSales(role);
  const canVoid = canVoidSales(role);
  /** Basic solo ve sus propias ventas. */
  const restrictTo = seesAll ? null : email;

  const container = byId('history');
  const searchInput = byId<HTMLInputElement>('filter-search');
  const fromInput = byId<HTMLInputElement>('filter-from');
  const toInput = byId<HTMLInputElement>('filter-to');
  const sellerSelect = byId<HTMLSelectElement>('filter-seller');
  const statusSelect = byId<HTMLSelectElement>('filter-status');
  const dialog = byId<HTMLDialogElement>('sale-dialog');

  byId('history-subtitle').textContent = seesAll
    ? 'Todas las ventas. Busca por placa o cédula para ver el historial completo de un cliente.'
    : 'Tus ventas y tus comisiones.';
  byId('summary-commission-label').textContent = seesAll ? 'Comisiones' : 'Tu comisión';

  function setDefaultDates(): void {
    const month = periodRange('month');
    fromInput.value = toDateInputValue(month.start);
    toInput.value = toDateInputValue(new Date());
  }
  setDefaultDates();

  if (seesAll) {
    byId('filter-seller-wrapper').hidden = false;
    const users = await fetchActiveUsers();
    sellerSelect.append(...users.map((user) => new Option(user.name, user.email)));
  }

  // ---------- Detalle ----------

  let current: Sale | null = null;

  function openDetail(sale: Sale): void {
    current = sale;
    renderDetail(sale);
    byId<HTMLAnchorElement>('detail-whatsapp').href = whatsappUrl(sale);
    byId('btn-void').hidden = !canVoid || sale.status === 'void';
    byId('void-form').hidden = true;
    if (!dialog.open) dialog.showModal();
  }

  dialog.querySelector('[data-close-dialog]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close(); // clic en el fondo
  });
  byId('btn-reprint').addEventListener('click', () => {
    if (current) printReceipt(current.id).catch(() => showToast('No se pudo imprimir el recibo.', 'error'));
  });

  // ---------- Anulación (admin y manager) ----------

  const voidForm = byId<HTMLFormElement>('void-form');
  const voidReason = byId<HTMLTextAreaElement>('void-reason');
  const voidError = byId('void-error');
  const voidConfirm = byId<HTMLButtonElement>('btn-void-confirm');

  byId('btn-void').addEventListener('click', () => {
    voidForm.hidden = false;
    voidReason.value = '';
    voidError.hidden = true;
    voidReason.focus();
  });
  byId('btn-void-cancel').addEventListener('click', () => (voidForm.hidden = true));
  voidForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!current || !canVoid) return;
    if (voidReason.value.trim().length < MIN_VOID_REASON) {
      voidError.textContent = 'Escribe el motivo de la anulación.';
      voidError.hidden = false;
      voidReason.focus();
      return;
    }
    voidConfirm.disabled = true;
    const saleId = current.id;
    try {
      await voidSale(saleId, voidReason.value, email);
    } catch (error) {
      console.error(error);
      voidError.textContent = firestoreErrorMessage(error, 'anular la venta');
      voidError.hidden = false;
      voidConfirm.disabled = false;
      return;
    }
    voidConfirm.disabled = false;
    showToast(`Venta ${saleId} anulada.`, 'block');
    void runSearch();
    // La anulación ya quedó guardada: si falla la recarga del detalle, solo se cierra.
    try {
      const updated = await fetchSale(saleId);
      if (updated) openDetail(updated);
      else dialog.close();
    } catch {
      dialog.close();
    }
  });

  // ---------- Búsqueda ----------

  let latestRequest = 0;

  function readFilters(): HistoryFilters | null {
    const range = rangeFromDateInputs(fromInput.value, toInput.value);
    const error = byId('filter-error');
    error.hidden = range !== null;
    if (!range) {
      error.textContent = 'Revisa las fechas: "Desde" debe ser anterior o igual a "Hasta".';
      return null;
    }
    return {
      term: searchInput.value,
      range,
      sellerEmail: sellerSelect.value || null,
      status: SALE_STATUSES.find((status) => status === statusSelect.value) ?? null,
    };
  }

  async function runSearch(): Promise<void> {
    const filters = readFilters();
    if (!filters) return;
    const requestId = ++latestRequest;
    container.dataset.loading = 'true';
    container.setAttribute('aria-busy', 'true');
    try {
      const result = await searchHistory(filters, restrictTo);
      if (requestId !== latestRequest) return;
      renderRows(result.sales, openDetail);
      renderSummary(result.sales, restrictTo ?? filters.sellerEmail);
      byId('filter-note').textContent = result.ignoredDates
        ? 'Búsqueda por placa/cédula: se muestran todas las fechas.'
        : restrictTo && filters.term.trim()
          ? 'Se busca dentro de tus ventas en el rango de fechas elegido.'
          : '';
      const limit = byId('history-limit');
      limit.hidden = !result.truncated;
      limit.textContent = 'Se muestran las ventas más recientes del límite. Acorta el rango de fechas para ver las demás.';
    } catch (error) {
      if (requestId !== latestRequest) return;
      console.error(error);
      showToast(firestoreErrorMessage(error, 'cargar el historial'), 'error');
    } finally {
      if (requestId === latestRequest) {
        container.dataset.loading = 'false';
        container.setAttribute('aria-busy', 'false');
      }
    }
  }

  byId<HTMLFormElement>('filters').addEventListener('submit', (event) => {
    event.preventDefault();
    void runSearch();
  });
  for (const control of [fromInput, toInput, sellerSelect, statusSelect]) {
    control.addEventListener('change', () => void runSearch());
  }
  byId('btn-clear-filters').addEventListener('click', () => {
    searchInput.value = '';
    sellerSelect.value = '';
    statusSelect.value = '';
    setDefaultDates();
    void runSearch();
  });

  await runSearch();

  // Enlace directo a una venta (ej. desde "Ver en el historial" al registrarla).
  const linked = new URLSearchParams(window.location.search).get('venta');
  if (linked) {
    const sale = await fetchSale(linked).catch(() => null);
    if (sale) openDetail(sale);
    else showToast('No se encontró esa venta o no tienes acceso a ella.', 'warning');
  }
}

requireSession()
  .then((session) => {
    mountShell(session, 'historial');
    document.body.classList.remove('invisible');
    return main(session);
  })
  .catch((error: unknown) => {
    console.error(error);
    document.body.classList.remove('invisible');
    showToast('No se pudo cargar el historial. Recarga la página.', 'error');
  });
