import '../../css/main.css';
import { SERVICE_LIMITS } from '../config/business';
import { createService, watchServices } from '../data/services';
import { setupDeleteDialog } from '../features/services/delete-dialog';
import { setupServiceList } from '../features/services/list';
import { normalizeServiceName, serviceNameError } from '../features/services/validation';
import { requireSession, type SessionUser } from '../lib/auth';
import { firestoreErrorMessage } from '../lib/errors';
import { canManageServices } from '../lib/roles';
import type { Service } from '../models/service';
import { byId } from '../ui/dom';
import { mountShell } from '../ui/shell';
import { showToast } from '../ui/toast';

function showLoadError(message: string): void {
  byId('services').hidden = true;
  byId('load-error').hidden = false;
  byId('load-error-text').textContent = message;
  byId('btn-retry').addEventListener('click', () => window.location.reload(), { once: true });
}

function main(session: SessionUser): void {
  if (!canManageServices(session.profile.role)) {
    byId('no-access').hidden = false;
    return;
  }
  byId('services').hidden = false;

  let services: Service[] = [];
  const renderList = setupServiceList(setupDeleteDialog());

  // ---------- Agregar ----------

  const form = byId<HTMLFormElement>('service-form');
  const input = byId<HTMLInputElement>('service-name');
  const error = byId('service-name-error');
  const addBtn = byId<HTMLButtonElement>('btn-add-service');
  input.maxLength = SERVICE_LIMITS.nameMax;

  const showError = (message: string | null) => {
    input.setAttribute('aria-invalid', String(message !== null));
    error.textContent = message ?? '';
    error.hidden = message === null;
  };
  input.addEventListener('input', () => showError(null));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = normalizeServiceName(input.value);
    const message = serviceNameError(name, services);
    showError(message);
    if (message) {
      input.focus();
      return;
    }
    addBtn.disabled = true;
    try {
      await createService(name);
      showToast(`"${name}" se agregó al catálogo.`, 'check_circle');
      form.reset();
      input.focus();
    } catch (cause) {
      console.error(cause);
      showError(firestoreErrorMessage(cause, 'agregar el servicio'));
    } finally {
      addBtn.disabled = false;
    }
  });

  // ---------- Catálogo en tiempo real ----------

  const catalog = byId('catalog');
  watchServices(
    (next) => {
      services = next;
      renderList(services);
      catalog.dataset.loading = 'false';
      catalog.setAttribute('aria-busy', 'false');
    },
    (cause) => {
      console.error(cause);
      showLoadError(firestoreErrorMessage(cause, 'cargar los servicios'));
    },
  );
}

requireSession()
  .then((session) => {
    mountShell(session, 'servicios');
    document.body.classList.remove('invisible');
    main(session);
  })
  .catch((error: unknown) => {
    console.error(error);
    document.body.classList.remove('invisible');
    showLoadError('Revisa tu conexión a internet e intenta de nuevo.');
  });
