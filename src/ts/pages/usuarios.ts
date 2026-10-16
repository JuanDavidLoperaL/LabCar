import '../../css/main.css';
import { DEFAULT_INVOICE_MONTHLY_LIMIT } from '../config/business';
import { isValidInvoiceLimit, saveInvoiceLimit, watchInvoiceLimit } from '../data/settings';
import { saveUserChanges, watchUsers } from '../data/users';
import { describeChanges, PendingChanges } from '../features/users/changes';
import { setupAddDialog } from '../features/users/add-dialog';
import { setupConfirmDialog } from '../features/users/confirm-dialog';
import { renderUserList, type ListFilters } from '../features/users/list';
import { requireSession, type SessionUser } from '../lib/auth';
import { firestoreErrorMessage } from '../lib/errors';
import { formatCOP, pluralize } from '../lib/format';
import { canEditInvoiceLimit, canManageUsers, isRole } from '../lib/roles';
import { formatThousands, parsePesos } from '../lib/text';
import type { ManagedUser } from '../models/user';
import { byId } from '../ui/dom';
import { mountShell } from '../ui/shell';
import { showToast } from '../ui/toast';

function showLoadError(message: string): void {
  byId('users').hidden = true;
  byId('load-error').hidden = false;
  byId('load-error-text').textContent = message;
  byId('btn-retry').addEventListener('click', () => window.location.reload(), { once: true });
}

function main(session: SessionUser): void {
  if (!canManageUsers(session.profile.role)) {
    byId('no-access').hidden = false;
    return;
  }
  byId('users').hidden = false;

  const selfEmail = session.user.email?.toLowerCase() ?? '';
  let users: ManagedUser[] = [];
  const changes = new PendingChanges();
  const filters: ListFilters = { term: '', role: 'all' };

  function render(): void {
    changes.prune(users);
    renderUserList(users, changes, filters, selfEmail, {
      onRoleChange: (email, role) => {
        const user = users.find((candidate) => candidate.email === email);
        if (user) changes.setRole(user, role);
        render();
      },
      onToggleRemove: (email) => {
        changes.toggleRemove(email);
        render();
      },
      onDiscardAdded: (email) => {
        changes.discardAdded(email);
        render();
      },
    });
    byId('save-bar').hidden = changes.count === 0;
    byId('save-bar-text').textContent = `${pluralize(changes.count, 'cambio', 'cambios')} sin guardar`;
  }

  // ---------- Tope mensual de facturación electrónica ----------

  const limitInput = byId<HTMLInputElement>('invoice-limit');
  const limitSaveBtn = byId<HTMLButtonElement>('btn-save-invoice-limit');
  const limitHelp = byId('invoice-limit-help');
  const canEditLimit = canEditInvoiceLimit(session.profile.role);
  let invoiceLimit = DEFAULT_INVOICE_MONTHLY_LIMIT;
  limitInput.readOnly = !canEditLimit;
  limitSaveBtn.hidden = !canEditLimit;
  const limitDefaultHelp =
    'Suma de las ventas con factura electrónica del mes. Al llegar a este valor, Nueva Venta muestra una alerta a todos; se puede seguir facturando normal.';
  limitHelp.textContent = limitDefaultHelp;

  const showLimit = (amount: number) => (limitInput.value = formatThousands(amount));
  const typedLimit = () => parsePesos(limitInput.value);
  const limitDirty = () => typedLimit() !== invoiceLimit;
  limitInput.addEventListener('input', () => {
    showLimit(typedLimit());
    const valid = isValidInvoiceLimit(typedLimit());
    limitSaveBtn.disabled = !limitDirty() || !valid;
    limitHelp.textContent = valid ? limitDefaultHelp : 'Escribe un valor mayor a cero.';
  });
  byId<HTMLFormElement>('invoice-limit-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const amount = typedLimit();
    if (!canEditLimit || !isValidInvoiceLimit(amount) || !limitDirty()) return;
    limitSaveBtn.disabled = true;
    try {
      await saveInvoiceLimit(amount, selfEmail);
      showToast(`Máximo de facturación electrónica: ${formatCOP(amount)} al mes.`, 'check_circle');
    } catch (error) {
      console.error(error);
      limitSaveBtn.disabled = false;
      showToast(firestoreErrorMessage(error, 'guardar el máximo de facturación electrónica'), 'error');
    }
  });
  watchInvoiceLimit(
    (amount) => {
      // Si el admin está escribiendo un valor sin guardar, no se le borra.
      const editing = document.activeElement === limitInput && limitDirty();
      invoiceLimit = amount;
      if (!editing) {
        showLimit(amount);
        limitSaveBtn.disabled = true;
      }
    },
    (error) => {
      console.error(error);
      showLimit(invoiceLimit);
      showToast(firestoreErrorMessage(error, 'cargar el máximo de facturación electrónica'), 'warning');
    },
  );

  // ---------- Búsqueda y filtro ----------

  const search = byId<HTMLInputElement>('search');
  search.addEventListener('input', () => {
    filters.term = search.value;
    render();
  });
  byId('role-filter').addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-role]');
    const role = chip?.dataset.role;
    if (!role) return;
    filters.role = isRole(role) ? role : 'all';
    render();
  });

  // ---------- Agregar, revisar y guardar ----------

  const openAdd = setupAddDialog(
    () => ({ users, pending: changes.added }),
    (user) => {
      changes.add(user);
      render();
      showToast(`${user.name} quedó en la lista. Guarda los cambios para confirmarlo.`, 'person_add');
    },
  );
  byId('btn-open-add').addEventListener('click', openAdd);

  const openConfirm = setupConfirmDialog(async () => {
    const count = changes.count;
    await saveUserChanges(changes.toChangeSet(), selfEmail);
    changes.clear();
    render();
    showToast(`Se ${count === 1 ? 'guardó 1 cambio' : `guardaron ${count} cambios`}.`, 'check_circle');
  });
  byId('btn-review').addEventListener('click', () => openConfirm(describeChanges(changes, users)));
  byId('btn-discard').addEventListener('click', () => {
    changes.clear();
    render();
    showToast('Se descartaron los cambios.', 'undo');
  });

  // Avisa antes de salir de la página con cambios sin guardar.
  window.addEventListener('beforeunload', (event) => {
    if (changes.count > 0) event.preventDefault();
  });

  // ---------- Lista en tiempo real ----------

  const team = byId('team');
  watchUsers(
    (next) => {
      users = next;
      render();
      team.dataset.loading = 'false';
      team.setAttribute('aria-busy', 'false');
    },
    (cause) => {
      console.error(cause);
      showLoadError(firestoreErrorMessage(cause, 'cargar los usuarios'));
    },
  );
}

requireSession()
  .then((session) => {
    mountShell(session, 'usuarios');
    document.body.classList.remove('invisible');
    main(session);
  })
  .catch((error: unknown) => {
    console.error(error);
    document.body.classList.remove('invisible');
    showLoadError('Revisa tu conexión a internet e intenta de nuevo.');
  });
