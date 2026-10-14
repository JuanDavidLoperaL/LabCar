import { deleteCustomer, saveCustomer, watchCustomers } from '../../data/customers';
import { normalizeDocumentNumber } from '../../lib/dian';
import { firestoreErrorMessage } from '../../lib/errors';
import { initials, pluralize } from '../../lib/format';
import { searchKey } from '../../lib/text';
import type { Customer } from '../../models/customer';
import { DOCUMENT_TYPES, PERSON_TYPES, TAX_REGIMES } from '../../models/sale';
import { byId } from '../../ui/dom';
import { cloneTemplate, setField } from '../../ui/template';
import { showToast } from '../../ui/toast';
import { formatPhone } from '../receivables/reminder';
import { validateCustomer, type CustomerDraft, type CustomerField } from './validation';

const INPUT_IDS: Record<CustomerField, string> = {
  documentNumber: 'c-document',
  name: 'c-name',
  phone: 'c-phone',
  email: 'c-email',
  city: 'c-city',
  address: 'c-address',
};

/** Nombre, documento o celular; ignora tildes, mayúsculas, puntos y espacios. */
function matches(customer: Customer, term: string): boolean {
  const words = searchKey(term).split(/\s+/).filter(Boolean);
  const code = searchKey(term).replace(/[^a-z0-9]/g, '');
  if (code.length >= 3 && (customer.documentNumber.toLowerCase().includes(code) || customer.phone.includes(code))) return true;
  const name = searchKey(customer.name);
  return words.every((word) => name.includes(word));
}

function closeOnBackdrop(dialog: HTMLDialogElement, busy: () => boolean): void {
  dialog.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => !busy() && dialog.close()));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !busy()) dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (busy()) event.preventDefault();
  });
}

/** Pestaña Clientes de Servicios y Clientes (solo admin): lista en tiempo real, buscar, agregar, editar y eliminar. */
export function setupCustomersTab(adminEmail: string): void {
  let customers: Customer[] = [];
  let term = '';
  let editing: Customer | null = null;
  let deleting: Customer | null = null;

  // ---------- Formulario (agregar / editar) ----------

  const dialog = byId<HTMLDialogElement>('customer-dialog');
  const form = byId<HTMLFormElement>('customer-form');
  const saveBtn = byId<HTMLButtonElement>('btn-save-customer');
  const saveError = byId('customer-save-error');
  const documentType = byId<HTMLSelectElement>('c-document-type');
  const input = (name: CustomerField) => byId<HTMLInputElement>(INPUT_IDS[name]);
  closeOnBackdrop(dialog, () => saveBtn.disabled);

  const showError = (name: CustomerField, message: string | undefined) => {
    input(name).setAttribute('aria-invalid', String(message !== undefined));
    const error = byId(`${INPUT_IDS[name]}-error`);
    error.textContent = message ?? '';
    error.hidden = message === undefined;
  };
  const fieldNames = Object.keys(INPUT_IDS) as CustomerField[];
  fieldNames.forEach((name) => input(name).addEventListener('input', () => showError(name, undefined)));

  const normalizeDocument = () => {
    const type = DOCUMENT_TYPES.find((value) => value === documentType.value) ?? 'CC';
    input('documentNumber').value = normalizeDocumentNumber(input('documentNumber').value, type);
    input('documentNumber').inputMode = type === 'CC' || type === 'NIT' ? 'numeric' : 'text';
  };
  input('documentNumber').addEventListener('input', normalizeDocument);
  documentType.addEventListener('change', normalizeDocument);
  // Una empresa factura con NIT: se sugiere al elegir persona jurídica.
  form.querySelectorAll<HTMLInputElement>('input[name="customer-person-type"]').forEach((radio) =>
    radio.addEventListener('change', () => {
      if (radio.checked && radio.value === 'legal' && documentType.value === 'CC') documentType.value = 'NIT';
    }),
  );

  function open(customer: Customer | null): void {
    editing = customer;
    form.reset();
    fieldNames.forEach((name) => showError(name, undefined));
    saveError.hidden = true;
    byId('customer-dialog-title').textContent = customer ? 'Editar cliente' : 'Agregar cliente';
    if (customer) {
      documentType.value = customer.documentType;
      input('documentNumber').value = customer.documentNumber;
      input('name').value = customer.name;
      input('phone').value = customer.phone;
      input('email').value = customer.email;
      input('city').value = customer.city;
      input('address').value = customer.address;
      byId<HTMLSelectElement>('c-tax-regime').value = customer.taxRegime;
      form.querySelector<HTMLInputElement>(`input[name="customer-person-type"][value="${customer.personType}"]`)!.checked = true;
    }
    dialog.showModal();
    input('name').focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const personType = form.querySelector<HTMLInputElement>('input[name="customer-person-type"]:checked')?.value;
    const draft: CustomerDraft = {
      documentType: DOCUMENT_TYPES.find((value) => value === documentType.value) ?? 'CC',
      documentNumber: input('documentNumber').value,
      personType: PERSON_TYPES.find((value) => value === personType) ?? 'natural',
      name: input('name').value,
      phone: input('phone').value,
      email: input('email').value,
      city: input('city').value,
      address: input('address').value,
      taxRegime: TAX_REGIMES.find((value) => value === byId<HTMLSelectElement>('c-tax-regime').value) ?? 'not-vat-responsible',
    };
    const result = validateCustomer(draft, customers, editing?.id ?? null);
    fieldNames.forEach((name) => showError(name, result.ok ? undefined : result.errors[name]));
    if (!result.ok) {
      input(fieldNames.find((name) => result.errors[name]) ?? 'name').focus();
      return;
    }
    saveBtn.disabled = true;
    saveError.hidden = true;
    try {
      await saveCustomer(result.customer, editing?.id ?? null, adminEmail);
      dialog.close();
      showToast(editing ? `Se actualizó a ${result.customer.name}.` : `${result.customer.name} quedó registrado.`, 'check_circle');
    } catch (cause) {
      console.error(cause);
      saveError.textContent = firestoreErrorMessage(cause, 'guardar el cliente');
      saveError.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });
  byId('btn-open-customer').addEventListener('click', () => open(null));

  // ---------- Eliminar ----------

  const deleteDialog = byId<HTMLDialogElement>('customer-delete-dialog');
  const deleteBtn = byId<HTMLButtonElement>('btn-customer-delete-confirm');
  const deleteError = byId('customer-delete-error');
  closeOnBackdrop(deleteDialog, () => deleteBtn.disabled);

  byId<HTMLFormElement>('customer-delete-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!deleting) return;
    const customer = deleting;
    deleteBtn.disabled = true;
    deleteError.hidden = true;
    try {
      await deleteCustomer(customer.id);
      deleteDialog.close();
      showToast(`${customer.name} se eliminó de los clientes.`, 'delete');
    } catch (cause) {
      console.error(cause);
      deleteError.textContent = firestoreErrorMessage(cause, 'eliminar el cliente');
      deleteError.hidden = false;
    } finally {
      deleteBtn.disabled = false;
    }
  });

  // ---------- Lista ----------

  function renderRow(customer: Customer): HTMLLIElement {
    const row = cloneTemplate<HTMLLIElement>('tpl-customer');
    setField(row, 'initials', initials(customer.name));
    setField(row, 'name', customer.name);
    setField(row, 'document', `${customer.documentType} ${customer.documentNumber}`);
    setField(row, 'phone', formatPhone(customer.phone));
    const edit = row.querySelector<HTMLButtonElement>('[data-action="edit"]')!;
    edit.setAttribute('aria-label', `Editar a ${customer.name}`);
    edit.addEventListener('click', () => open(customer));
    const remove = row.querySelector<HTMLButtonElement>('[data-action="delete"]')!;
    remove.setAttribute('aria-label', `Eliminar a ${customer.name}`);
    remove.addEventListener('click', () => {
      deleting = customer;
      deleteError.hidden = true;
      byId('customer-delete-name').textContent = customer.name;
      deleteDialog.showModal();
    });
    return row;
  }

  function render(): void {
    const visible = customers.filter((customer) => matches(customer, term));
    byId('customer-list').replaceChildren(...visible.map(renderRow));
    byId('customer-count').textContent = pluralize(customers.length, 'cliente', 'clientes');
    byId('customer-empty').hidden = visible.length > 0;
    byId('customer-empty-text').textContent =
      customers.length === 0 ? 'Aún no hay clientes. Agrega el primero.' : 'Ningún cliente coincide con la búsqueda.';
  }

  const search = byId<HTMLInputElement>('customer-search');
  search.addEventListener('input', () => {
    term = search.value;
    render();
  });

  const catalog = byId('customer-catalog');
  watchCustomers(
    (next) => {
      customers = next;
      render();
      catalog.dataset.loading = 'false';
      catalog.setAttribute('aria-busy', 'false');
    },
    (cause) => {
      console.error(cause);
      catalog.dataset.loading = 'false';
      byId('customer-empty').hidden = false;
      byId('customer-empty-text').textContent = firestoreErrorMessage(cause, 'cargar los clientes');
    },
  );
}
