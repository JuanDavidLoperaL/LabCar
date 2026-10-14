import { initials } from '../../lib/format';
import { searchKey } from '../../lib/text';
import type { Customer } from '../../models/customer';
import { cloneTemplate, setField } from '../../ui/template';

const MAX_RESULTS = 8;

/** Nombre o documento (ignora tildes, mayúsculas, puntos y espacios). */
function matches(customer: Customer, words: string[], code: string): boolean {
  if (code.length >= 3 && customer.documentNumber.toLowerCase().includes(code)) return true;
  const name = searchKey(customer.name);
  return words.length > 0 && words.every((word) => name.includes(word));
}

/**
 * Buscador para preseleccionar un cliente registrado en una venta a crédito o con factura a su nombre.
 * Al elegirlo se llama `onPick` para llenar los campos, que se siguen pudiendo editar: los cambios
 * solo aplican a la venta, no al cliente guardado.
 */
export function createCustomerPicker(elements: {
  search: HTMLInputElement;
  results: HTMLUListElement;
  customers: readonly Customer[];
  onPick: (customer: Customer) => void;
}): void {
  const { search, results, customers, onPick } = elements;
  let options: Customer[] = [];
  let activeIndex = -1;

  function close(): void {
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

  function choose(index: number): void {
    const customer = options[index];
    if (!customer) return;
    search.value = '';
    close();
    onPick(customer);
  }

  function renderResults(): void {
    const text = searchKey(search.value);
    if (!text) {
      close();
      return;
    }
    const words = text.split(/\s+/).filter(Boolean);
    const code = text.replace(/[^a-z0-9]/g, '');
    options = customers.filter((customer) => matches(customer, words, code)).slice(0, MAX_RESULTS);

    const items = options.map((customer, index) => {
      const item = cloneTemplate<HTMLLIElement>('tpl-customer-option');
      item.id = `customer-option-${index}`;
      setField(item, 'initials', initials(customer.name));
      setField(item, 'name', customer.name);
      setField(item, 'document', `${customer.documentType} ${customer.documentNumber}`);
      // mousedown (no click) para que el input no pierda el foco antes de elegir.
      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
        choose(index);
      });
      return item;
    });
    if (items.length === 0) {
      const empty = cloneTemplate<HTMLLIElement>('tpl-customer-option');
      empty.removeAttribute('role');
      empty.classList.remove('cursor-pointer');
      setField(empty, 'initials', '–');
      setField(empty, 'name', 'No hay clientes registrados con ese nombre o documento');
      items.push(empty);
    }
    results.replaceChildren(...items);
    results.hidden = false;
    search.setAttribute('aria-expanded', 'true');
    highlight(options.length > 0 ? 0 : -1);
  }

  search.addEventListener('input', renderResults);
  search.addEventListener('focus', renderResults);
  search.addEventListener('blur', close);
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
        event.preventDefault();
        if (activeIndex >= 0) choose(activeIndex);
        break;
      case 'Escape':
        search.value = '';
        close();
        break;
    }
  });
}
