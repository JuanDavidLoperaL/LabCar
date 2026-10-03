import { formatThousands, parsePesos, searchKey } from '../../lib/text';
import { formatCOP } from '../../lib/format';
import type { Service } from '../../models/service';
import { cloneTemplate, field, setField } from '../../ui/template';
import { priceItem } from './pricing';
import { MAX_PRICE } from './validation';

/** Cuántos accesos rápidos mostrar si ningún servicio está marcado como `quick`. */
const DEFAULT_QUICK_COUNT = 5;
const MAX_RESULTS = 8;

export interface ItemValue {
  key: string;
  serviceId: string | null;
  name: string;
  price: number;
  discountPercent: number;
}

export interface ItemsEditor {
  values(): ItemValue[];
  setErrors(errors: ReadonlyMap<string, string>): void;
  /** Enfoca el primer campo con error; devuelve false si no hay. */
  focusFirstError(): boolean;
}

interface Option {
  label: string;
  icon: string;
  pick: () => void;
}

export function createItemsEditor(elements: {
  search: HTMLInputElement;
  results: HTMLUListElement;
  quick: HTMLElement;
  list: HTMLElement;
  empty: HTMLElement;
  services: readonly Service[];
  onChange: () => void;
}): ItemsEditor {
  const { search, results, quick, list, empty, services, onChange } = elements;
  let nextKey = 0;
  let options: Option[] = [];
  let activeIndex = -1;

  // ---------- Filas ----------

  function readRow(row: HTMLElement): ItemValue {
    return {
      key: row.dataset.key ?? '',
      serviceId: row.dataset.serviceId || null,
      name: field<HTMLInputElement>(row, 'name').value,
      price: parsePesos(field<HTMLInputElement>(row, 'price').value),
      discountPercent: Number(field<HTMLInputElement>(row, 'discount').value || 0),
    };
  }

  function refreshRow(row: HTMLElement): void {
    const value = readRow(row);
    const priced = priceItem(value);
    setField(
      row,
      'line-total',
      priced.discount > 0 ? `${formatCOP(priced.total)} con ${value.discountPercent}% de descuento` : formatCOP(priced.total),
    );
  }

  function refreshEmptyState(): void {
    empty.hidden = list.children.length > 0;
  }

  function addRow(name: string, serviceId: string | null): void {
    const row = cloneTemplate('tpl-item-row');
    row.dataset.key = String(nextKey++);
    if (serviceId) row.dataset.serviceId = serviceId;

    const nameInput = field<HTMLInputElement>(row, 'name');
    const priceInput = field<HTMLInputElement>(row, 'price');
    const discountInput = field<HTMLInputElement>(row, 'discount');
    nameInput.value = name;

    const changed = () => {
      refreshRow(row);
      onChange();
    };
    nameInput.addEventListener('input', changed);
    priceInput.addEventListener('input', () => {
      // Formatea con puntos de mil mientras se escribe: 650000 → 650.000
      priceInput.value = formatThousands(parsePesos(priceInput.value));
      changed();
    });
    // Descuento: solo números enteros de 0 a 100 (no admite signo menos, decimales ni letras).
    discountInput.addEventListener('input', () => {
      const digits = discountInput.value.replace(/\D/g, '');
      discountInput.value = digits ? String(Math.min(100, Number(digits))) : '';
      changed();
    });
    discountInput.addEventListener('blur', () => {
      if (!discountInput.value) discountInput.value = '0';
      changed();
    });
    field(row, 'remove').addEventListener('click', () => {
      row.remove();
      refreshEmptyState();
      onChange();
      search.focus();
    });

    list.append(row);
    refreshRow(row);
    refreshEmptyState();
    onChange();
    // Sin nombre (personalizado) se empieza por el nombre; si no, por el precio.
    (name ? priceInput : nameInput).focus();
  }

  // ---------- Buscador ----------

  function closeResults(): void {
    results.hidden = true;
    search.setAttribute('aria-expanded', 'false');
    search.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function highlight(index: number): void {
    activeIndex = index;
    [...results.children].forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    const active = results.children[index];
    if (active) {
      search.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderResults(): void {
    const term = search.value.trim();
    const key = searchKey(term);
    // Coincide si cada palabra escrita aparece en el nombre: "corr pint" → "Corrección de Pintura".
    const words = key.split(/\s+/).filter(Boolean);
    const matches = services.filter((service) => words.every((word) => searchKey(service.name).includes(word))).slice(0, MAX_RESULTS);

    options = matches.map((service) => ({
      label: service.name,
      icon: 'add_circle',
      pick: () => addRow(service.name, service.id),
    }));
    const exact = matches.some((service) => searchKey(service.name) === key);
    if (term && !exact) options.push({ label: `Agregar «${term}» como servicio personalizado`, icon: 'edit_note', pick: () => addRow(term, null) });
    if (options.length === 0) options.push({ label: 'No hay servicios en el catálogo', icon: 'info', pick: () => undefined });

    results.replaceChildren(
      ...options.map((option, index) => {
        const item = cloneTemplate<HTMLLIElement>('tpl-service-option');
        item.id = `service-option-${index}`;
        setField(item, 'name', option.label);
        setField(item, 'icon', option.icon);
        // mousedown (no click) para que el input no pierda el foco antes de elegir.
        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          choose(index);
        });
        return item;
      }),
    );
    results.hidden = false;
    search.setAttribute('aria-expanded', 'true');
    highlight(term ? 0 : -1);
  }

  function choose(index: number): void {
    const option = options[index];
    if (!option) return;
    search.value = '';
    closeResults();
    option.pick();
  }

  search.addEventListener('input', renderResults);
  search.addEventListener('focus', renderResults);
  search.addEventListener('blur', closeResults);
  search.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (results.hidden) renderResults();
        highlight(Math.min(activeIndex + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        highlight(Math.max(activeIndex - 1, 0));
        break;
      case 'Enter':
        // Enter elige el resultado resaltado en vez de enviar el formulario.
        event.preventDefault();
        if (activeIndex >= 0) choose(activeIndex);
        break;
      case 'Escape':
        if (search.value) event.stopPropagation();
        search.value = '';
        closeResults();
        break;
    }
  });

  // ---------- Accesos rápidos ----------

  const flagged = services.filter((service) => service.quick);
  const quickServices = flagged.length > 0 ? flagged : services.slice(0, DEFAULT_QUICK_COUNT);
  const quickButtons = quickServices.map((service) => {
    const button = cloneTemplate<HTMLButtonElement>('tpl-quick-service');
    setField(button, 'name', service.name);
    button.addEventListener('click', () => addRow(service.name, service.id));
    return button;
  });
  const customButton = cloneTemplate<HTMLButtonElement>('tpl-quick-service');
  setField(customButton, 'name', 'Personalizado');
  setField(customButton, 'icon', 'edit_note');
  customButton.addEventListener('click', () => addRow('', null));
  quick.replaceChildren(...quickButtons, customButton);

  refreshEmptyState();

  return {
    values: () => [...list.children].map((row) => readRow(row as HTMLElement)),
    setErrors(errors) {
      for (const row of list.children as HTMLCollectionOf<HTMLElement>) {
        const message = errors.get(row.dataset.key ?? '');
        const errorEl = field(row, 'error');
        errorEl.textContent = message ?? '';
        errorEl.hidden = !message;
        // Marca el campo que causa el error (nombre → precio → descuento).
        const value = readRow(row);
        const invalidName = Boolean(message) && value.name.trim().length < 2;
        const invalidPrice = Boolean(message) && !invalidName && (value.price <= 0 || value.price > MAX_PRICE);
        const invalidDiscount = Boolean(message) && !invalidName && !invalidPrice;
        field(row, 'name').setAttribute('aria-invalid', String(invalidName));
        field(row, 'price').setAttribute('aria-invalid', String(invalidPrice));
        field(row, 'discount').setAttribute('aria-invalid', String(invalidDiscount));
      }
    },
    focusFirstError() {
      const invalid = list.querySelector<HTMLElement>('[aria-invalid="true"]');
      invalid?.focus();
      return invalid !== null;
    },
  };
}
