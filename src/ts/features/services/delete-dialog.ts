import { deleteService } from '../../data/services';
import { firestoreErrorMessage } from '../../lib/errors';
import type { Service } from '../../models/service';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';

/** Popup para confirmar el borrado definitivo de un servicio. La lista se actualiza sola (tiempo real). */
export function setupDeleteDialog(): (service: Service) => void {
  const dialog = byId<HTMLDialogElement>('delete-dialog');
  const form = byId<HTMLFormElement>('delete-form');
  const error = byId('delete-error');
  const confirmBtn = byId<HTMLButtonElement>('btn-delete-confirm');
  let current: Service | null = null;

  dialog.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !confirmBtn.disabled) dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (confirmBtn.disabled) event.preventDefault();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!current) return;
    const service = current;
    error.hidden = true;
    confirmBtn.disabled = true;
    try {
      await deleteService(service.id);
      dialog.close();
      showToast(`"${service.name}" se eliminó del catálogo.`, 'delete');
    } catch (cause) {
      console.error(cause);
      error.textContent = firestoreErrorMessage(cause, 'eliminar el servicio');
      error.hidden = false;
    } finally {
      confirmBtn.disabled = false;
    }
  });

  return (service: Service) => {
    current = service;
    error.hidden = true;
    byId('delete-name').textContent = service.name;
    dialog.showModal();
  };
}
