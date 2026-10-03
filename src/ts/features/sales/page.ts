import { BUSINESS } from '../../config/business';
import { createSale, type NewSale } from '../../data/sales';
import { errorCode, firestoreErrorMessage } from '../../lib/errors';
import { businessNit, whatsappUrl } from '../receipt/content';
import { printReceipt } from '../receipt/print';
import { createItemsEditor } from './items-editor';
import { maskPlate, MASKED_PLATE_LENGTH, normalizePlate, OTHER_PLATE_LENGTH, PLATE_HINTS } from './plate';
import { computeSaleTotals } from './pricing';
import { setStep, showProgress } from './progress';
import { createSellersPicker } from './sellers-picker';
import { renderTicket } from './ticket';
import {
  customerRequirement,
  FIELD_ORDER,
  hasErrors,
  validateSale,
  type FieldName,
  type SaleFormValues,
  type ValidationResult,
} from './validation';
import type { SessionUser } from '../../lib/auth';
import type { Service } from '../../models/service';
import type { AppUser } from '../../models/user';
import { nitVerificationDigit, normalizeDocumentNumber, normalizePhone } from '../../lib/dian';
import { formatShortDateTime } from '../../lib/format';
import {
  DOCUMENT_TYPES,
  INVOICE_RECIPIENTS,
  PAYMENT_METHODS,
  PERSON_TYPES,
  TAX_REGIMES,
  VEHICLE_TYPES,
  type PaymentMethod,
  type SaleCustomer,
  type VehicleType,
} from '../../models/sale';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';

/** Campo de pantalla al que se lleva el foco cuando tiene error. */
const FIELD_INPUTS: Partial<Record<FieldName, string>> = {
  plate: 'plate',
  vehicleLine: 'vehicle-line',
  documentNumber: 'customer-document',
  customerName: 'customer-name',
  phone: 'customer-phone',
  email: 'customer-email',
  city: 'customer-city',
  address: 'customer-address',
};

function inputValue(id: string): string {
  return byId<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(id).value;
}

function checkedValue<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value;
  return allowed.find((option) => option === value) ?? fallback;
}

export interface SalePageData {
  users: AppUser[];
  services: Service[];
  commissionRate: number;
}

/** Monta el formulario de nueva venta con los datos ya cargados (vendedores, catálogo, comisión). */
export function mountSalePage(session: SessionUser, { users, services, commissionRate }: SalePageData): void {
  const currentEmail = session.user.email?.toLowerCase() ?? '';
  const currentName = session.profile.name || session.user.displayName || currentEmail;

  byId('sale-form').hidden = false;
  byId('ticket-business').textContent = `${BUSINESS.name} ${BUSINESS.tagline.toUpperCase()}`;
  byId('ticket-nit').textContent = `NIT ${businessNit()} · ${BUSINESS.city}`;
  byId('ticket-date').textContent = formatShortDateTime(new Date());

  const form = byId<HTMLFormElement>('sale-form');
  const fields = byId<HTMLFieldSetElement>('sale-fields');
  const submitBtn = byId<HTMLButtonElement>('btn-submit');
  const plateInput = byId<HTMLInputElement>('plate');
  const plateOther = byId<HTMLInputElement>('plate-other');
  const documentInput = byId<HTMLInputElement>('customer-document');
  const documentType = byId<HTMLSelectElement>('customer-document-type');
  const invoiceToggle = byId<HTMLInputElement>('invoice-toggle');
  const notes = byId<HTMLTextAreaElement>('notes');

  let vehicleType: VehicleType = 'car';
  let paymentMethod: PaymentMethod | null = null;
  /** Después del primer intento de registrar, los errores se actualizan mientras se corrigen. */
  let attempted = false;
  let dirty = false;
  let saved = false;
  /** Identifica este intento de venta: si se reintenta tras un error de red, no se duplica (ver createSale). */
  const requestId = crypto.randomUUID();

  const sellers = createSellersPicker({
    search: byId<HTMLInputElement>('seller-search'),
    results: byId<HTMLUListElement>('seller-results'),
    selectedList: byId<HTMLUListElement>('sellers-selected'),
    users,
    defaultEmail: currentEmail,
    onChange: () => update(),
  });
  const items = createItemsEditor({
    search: byId<HTMLInputElement>('service-search'),
    results: byId<HTMLUListElement>('service-results'),
    quick: byId('quick-services'),
    list: byId('items-list'),
    empty: byId('items-empty'),
    services,
    onChange: () => update(),
  });

  // ---------- Lectura del formulario ----------

  function readValues(): SaleFormValues {
    return {
      sellerEmails: sellers.selected().map((user) => user.email),
      vehicleType,
      plate: normalizePlate(plateInput.value),
      plateOther: plateOther.checked,
      vehicleLine: inputValue('vehicle-line'),
      items: items.values(),
      paymentMethod,
      invoiceEnabled: invoiceToggle.checked,
      invoiceRecipient: checkedValue('invoice-recipient', INVOICE_RECIPIENTS, 'customer'),
      customer: {
        documentType: DOCUMENT_TYPES.find((type) => type === documentType.value) ?? 'CC',
        documentNumber: documentInput.value,
        name: inputValue('customer-name'),
        phone: normalizePhone(inputValue('customer-phone')),
        email: inputValue('customer-email').trim().toLowerCase(),
        city: inputValue('customer-city'),
        address: inputValue('customer-address'),
      },
    };
  }

  function buildCustomer(values: SaleFormValues): SaleCustomer | null {
    const required = customerRequirement(values);
    if (!required.credit && !required.invoice) return null;
    const { customer } = values;
    return {
      documentType: customer.documentType,
      documentNumber: customer.documentNumber,
      verificationDigit: customer.documentType === 'NIT' ? nitVerificationDigit(customer.documentNumber) : null,
      personType: required.invoice ? checkedValue('person-type', PERSON_TYPES, 'natural') : 'natural',
      name: customer.name.trim(),
      phone: customer.phone,
      email: required.invoice ? customer.email : '',
      address: required.invoice ? customer.address.trim() : '',
      city: required.invoice ? customer.city.trim() : '',
      taxRegime: required.invoice ? (TAX_REGIMES.find((regime) => regime === inputValue('customer-tax-regime')) ?? null) : null,
    };
  }

  // ---------- Errores ----------

  function showErrors(result: ValidationResult): void {
    for (const name of FIELD_ORDER) {
      const message = result.fields[name];
      const errorEl = document.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
      if (errorEl) {
        errorEl.textContent = message ?? '';
        errorEl.hidden = !message;
      }
      const inputId = FIELD_INPUTS[name];
      if (inputId) byId(inputId).setAttribute('aria-invalid', String(Boolean(message)));
    }
    items.setErrors(result.items);
  }

  function focusFirstError(result: ValidationResult): void {
    const first = FIELD_ORDER.find((name) => result.fields[name]);
    const firstIndex = first ? FIELD_ORDER.indexOf(first) : FIELD_ORDER.length;
    // Los errores de las filas de servicios van en la posición de "items".
    if (result.items.size > 0 && firstIndex >= FIELD_ORDER.indexOf('items') && items.focusFirstError()) return;
    if (!first) return;
    const target =
      first === 'sellers'
        ? byId('seller-search')
        : first === 'items'
          ? byId('service-search')
          : first === 'paymentMethod'
            ? byId('payment-methods').querySelector<HTMLElement>('button')
            : byId(FIELD_INPUTS[first] ?? '');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.focus({ preventScroll: true });
  }

  // ---------- Vista ----------

  function update(): void {
    dirty = true;
    const values = readValues();
    const required = customerRequirement(values);

    // Datos del cliente: solo cuando hacen falta.
    const showCustomer = required.credit || required.invoice;
    byId('customer-block').hidden = !showCustomer;
    document.querySelectorAll<HTMLElement>('[data-invoice-only]').forEach((el) => (el.hidden = !required.invoice));
    byId('customer-phone-required').hidden = !required.credit;
    byId('customer-reason').textContent = [
      required.credit ? 'Venta a crédito: cédula, nombre y celular son obligatorios para la cartera.' : '',
      required.invoice ? 'Factura a nombre del cliente: datos requeridos por la DIAN.' : '',
    ]
      .filter(Boolean)
      .join(' ');
    byId('invoice-block').hidden = !values.invoiceEnabled;

    const isNit = values.customer.documentType === 'NIT';
    byId('customer-dv-wrapper').hidden = !isNit;
    byId<HTMLInputElement>('customer-dv').value = isNit ? nitVerificationDigit(values.customer.documentNumber) : '';

    const hint = PLATE_HINTS[vehicleType];
    plateInput.placeholder = plateOther.checked ? 'Placa' : hint.placeholder;
    byId('plate-help').textContent = plateOther.checked ? 'Placa extranjera o especial: letras y números' : hint.help;
    byId('notes-count').textContent = String(notes.value.length);

    const selectedSellers = sellers.selected();
    renderTicket({
      totals: computeSaleTotals(values.items, selectedSellers, commissionRate),
      plate: values.plate,
      vehicleType,
      vehicleLine: values.vehicleLine,
      paymentMethod,
      commissionRate,
    });

    if (attempted) showErrors(validateSale(values));
  }

  // ---------- Controles ----------

  byId('vehicle-type')
    .querySelectorAll<HTMLButtonElement>('[data-vehicle-type]')
    .forEach((button, _, all) =>
      button.addEventListener('click', () => {
        vehicleType = VEHICLE_TYPES.find((type) => type === button.dataset.vehicleType) ?? 'car';
        all.forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
        applyPlateFormat(); // la placa se ajusta a la máscara del nuevo tipo
        update();
      }),
    );

  /** Placa colombiana con máscara según carro/moto; placa extranjera o especial sin máscara. */
  function applyPlateFormat(): void {
    plateInput.maxLength = plateOther.checked ? OTHER_PLATE_LENGTH : MASKED_PLATE_LENGTH;
    plateInput.value = plateOther.checked
      ? normalizePlate(plateInput.value).slice(0, OTHER_PLATE_LENGTH)
      : maskPlate(plateInput.value, vehicleType);
  }

  plateInput.addEventListener('input', () => {
    applyPlateFormat();
    update();
  });
  plateOther.addEventListener('change', () => {
    applyPlateFormat();
    update();
  });
  byId('btn-clear-plate').addEventListener('click', () => {
    plateInput.value = '';
    plateInput.focus();
    update();
  });

  byId('payment-methods')
    .querySelectorAll<HTMLButtonElement>('[data-payment]')
    .forEach((button, _, all) =>
      button.addEventListener('click', () => {
        paymentMethod = PAYMENT_METHODS.find((method) => method === button.dataset.payment) ?? null;
        all.forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
        update();
      }),
    );

  documentType.addEventListener('change', () => {
    documentInput.value = normalizeDocumentNumber(documentInput.value, readValues().customer.documentType);
    documentInput.inputMode = documentType.value === 'CC' || documentType.value === 'NIT' ? 'numeric' : 'text';
    update();
  });
  documentInput.addEventListener('input', () => {
    documentInput.value = normalizeDocumentNumber(documentInput.value, readValues().customer.documentType);
    update();
  });
  // Una empresa factura con NIT: se sugiere al elegir persona jurídica.
  document.querySelectorAll<HTMLInputElement>('input[name="person-type"]').forEach((radio) =>
    radio.addEventListener('change', () => {
      if (radio.checked && radio.value === 'legal' && documentType.value === 'CC') documentType.value = 'NIT';
      update();
    }),
  );

  // El resto de campos solo necesita refrescar la vista.
  form.addEventListener('input', (event) => {
    const target = event.target as HTMLElement;
    if (target === plateInput || target === documentInput || target.closest('#items-list')) return;
    update();
  });
  form.addEventListener('change', (event) => {
    if ((event.target as HTMLElement).matches('input[type="radio"], input[type="checkbox"], select')) update();
  });

  window.addEventListener('beforeunload', (event) => {
    if (dirty && !saved) event.preventDefault();
  });

  // ---------- Registro ----------

  function lock(locked: boolean): void {
    fields.disabled = locked;
    submitBtn.disabled = locked;
  }

  async function submit(): Promise<void> {
    attempted = true;
    const values = readValues();
    const result = validateSale(values);
    showErrors(result);
    if (hasErrors(result) || !values.paymentMethod) {
      showToast('Revisa los campos marcados antes de registrar la venta.', 'warning');
      focusFirstError(result);
      return;
    }

    const selectedSellers = sellers.selected();
    const sale: NewSale = {
      vehicleType,
      plate: values.plate,
      vehicleLine: values.vehicleLine,
      items: values.items.map(({ serviceId, name, price, discountPercent }) => ({ serviceId, name, price, discountPercent })),
      sellers: selectedSellers.map((user) => ({ email: user.email, name: user.name })),
      commissionRate,
      paymentMethod: values.paymentMethod,
      customer: buildCustomer(values),
      invoiceRecipient: values.invoiceEnabled ? values.invoiceRecipient : null,
      notes: notes.value,
      createdBy: { email: currentEmail, name: currentName },
    };

    lock(true);
    showProgress(true);
    setStep('save', 'active', 'Guardando la venta…');
    setStep('invoice', 'waiting', 'Factura electrónica');
    setStep('print', 'waiting', 'Imprimir tirilla');

    let saleId: string;
    try {
      saleId = await createSale(sale, requestId);
    } catch (error) {
      console.error(error);
      setStep('save', 'error', `${firestoreErrorMessage(error, 'guardar la venta')} (código: ${errorCode(error)})`);
      showToast('La venta NO se guardó. Intenta de nuevo.', 'error');
      lock(false);
      return;
    }
    saved = true;
    setStep('save', 'done', `Venta ${saleId} guardada`);
    setStep(
      'invoice',
      sale.invoiceRecipient ? 'done' : 'skipped',
      sale.invoiceRecipient ? 'Factura electrónica en cola (se emitirá al activar Siigo)' : 'Sin factura electrónica',
    );

    byId('success-order').textContent = `Orden ${saleId}`;
    byId('success-invoice').textContent = sale.invoiceRecipient
      ? 'La factura electrónica quedó pendiente y se enviará a la DIAN cuando la integración con Siigo esté activa.'
      : 'Se registró sin factura electrónica.';
    byId<HTMLAnchorElement>('btn-history').href = `/html/historial.html?venta=${encodeURIComponent(saleId)}`;
    byId('btn-print').addEventListener('click', () => void printReceipt(saleId).catch(() => showToast('No se pudo imprimir.', 'error')));
    byId('btn-new-sale').addEventListener('click', () => window.location.reload());
    const totals = computeSaleTotals(sale.items, sale.sellers, sale.commissionRate);
    byId<HTMLAnchorElement>('btn-whatsapp').href = whatsappUrl({
      id: saleId,
      date: new Date(),
      plate: sale.plate,
      vehicleLine: sale.vehicleLine,
      items: totals.items,
      total: totals.total,
      paymentMethod: sale.paymentMethod,
      status: sale.paymentMethod === 'credit' ? 'pending' : 'paid',
      customer: sale.customer,
    });

    submitBtn.hidden = true;
    const successCard = byId('success-card');
    successCard.hidden = false;
    successCard.focus({ preventScroll: true });
    successCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    setStep('print', 'active', 'Abriendo la impresión…');
    try {
      const outcome = await printReceipt(saleId);
      setStep(
        'print',
        'done',
        outcome === 'opened' ? 'Recibo abierto en otra pestaña para imprimir' : 'Diálogo de impresión cerrado',
      );
    } catch (error) {
      console.error(error);
      setStep('print', 'error', 'No se pudo imprimir. Usa el botón "Imprimir tirilla".');
    }
  }

  // Enter dentro de un campo no registra la venta: solo el botón "Registrar venta".
  form.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (event.key === 'Enter' && target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'radio') {
      event.preventDefault();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!submitBtn.disabled) void submit();
  });

  update();
  dirty = false;
}
