import { SERVICE_LIMITS } from '../../config/business';
import { renameService, setServiceQuick } from '../../data/services';
import { firestoreErrorMessage } from '../../lib/errors';
import { pluralize } from '../../lib/format';
import type { Service } from '../../models/service';
import { byId } from '../../ui/dom';
import { cloneTemplate, field, setField } from '../../ui/template';
import { showToast } from '../../ui/toast';
import { normalizeServiceName, quickCount, serviceNameError } from './validation';

/**
 * Lista del catálogo: estrella de acceso rápido (máximo 5), renombrar en la misma fila y eliminar.
 * La lista se vuelve a pintar con cada cambio en Firestore; si en ese momento se está renombrando
 * un servicio, la fila conserva lo que se lleva escrito.
 */
export function setupServiceList(onDelete: (service: Service) => void): (services: readonly Service[]) => void {
  let services: readonly Service[] = [];
  let editing: { id: string; draft: string; error: string | null; saving: boolean } | null = null;

  async function toggleQuick(service: Service): Promise<void> {
    if (!service.quick && quickCount(services) >= SERVICE_LIMITS.quickMax) {
      showToast(`Ya hay ${SERVICE_LIMITS.quickMax} accesos rápidos. Desmarca uno primero.`, 'warning');
      return;
    }
    try {
      await setServiceQuick(service.id, !service.quick);
    } catch (error) {
      console.error(error);
      showToast(firestoreErrorMessage(error, 'cambiar el acceso rápido'), 'error');
    }
  }

  async function saveName(service: Service): Promise<void> {
    if (!editing) return;
    const name = normalizeServiceName(editing.draft);
    if (name === service.name) {
      editing = null;
      render();
      return;
    }
    editing.error = serviceNameError(name, services, service.id);
    if (editing.error) {
      render();
      return;
    }
    editing.saving = true;
    render();
    try {
      await renameService(service.id, name);
      editing = null;
      showToast(`"${service.name}" ahora se llama "${name}".`, 'check_circle');
    } catch (error) {
      console.error(error);
      if (editing) {
        editing.saving = false;
        editing.error = firestoreErrorMessage(error, 'cambiar el nombre');
      }
    }
    render();
  }

  function renderRow(service: Service): HTMLLIElement {
    const row = cloneTemplate<HTMLLIElement>('tpl-service');
    const isEditing = editing?.id === service.id;
    row.dataset.quick = String(service.quick);
    row.dataset.editing = String(isEditing);
    setField(row, 'name', service.name);

    const quickButton = row.querySelector<HTMLButtonElement>('[data-action="quick"]')!;
    quickButton.setAttribute('aria-pressed', String(service.quick));
    quickButton.title = service.quick ? 'Quitar de accesos rápidos' : 'Marcar como acceso rápido';
    quickButton.setAttribute('aria-label', `${quickButton.title}: ${service.name}`);
    quickButton.addEventListener('click', () => void toggleQuick(service));

    row.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
      editing = { id: service.id, draft: service.name, error: null, saving: false };
      render();
    });
    row.querySelector('[data-action="delete"]')?.addEventListener('click', () => onDelete(service));
    row.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      editing = null;
      render();
    });

    const input = field<HTMLInputElement>(row, 'edit-input');
    const error = field(row, 'edit-error');
    input.maxLength = SERVICE_LIMITS.nameMax;
    if (isEditing && editing) {
      const state = editing;
      input.value = state.draft;
      input.setAttribute('aria-invalid', String(state.error !== null));
      error.textContent = state.error ?? '';
      error.hidden = state.error === null;
      field<HTMLButtonElement>(row, 'edit-save').disabled = state.saving;
      input.addEventListener('input', () => (state.draft = input.value));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          editing = null;
          render();
        }
      });
    }
    field<HTMLFormElement>(row, 'edit-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void saveName(service);
    });
    return row;
  }

  function render(): void {
    // El servicio que se renombraba pudo borrarse desde otro equipo.
    if (editing && !services.some((service) => service.id === editing?.id)) editing = null;
    const list = byId('service-list');
    list.replaceChildren(...services.map(renderRow));
    byId('service-empty').hidden = services.length > 0;
    byId('list-count').textContent = pluralize(services.length, 'servicio', 'servicios');

    const quick = quickCount(services);
    byId('quick-count').dataset.full = String(quick >= SERVICE_LIMITS.quickMax);
    byId('quick-count-text').textContent = `${quick}/${SERVICE_LIMITS.quickMax} accesos rápidos`;

    // Al volver a pintar, el foco sigue en el campo que se está editando.
    if (editing) list.querySelector<HTMLInputElement>('[data-editing="true"] [data-field="edit-input"]')?.focus();
  }

  return (next) => {
    services = next;
    render();
  };
}
