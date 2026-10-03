import { initials } from '../../lib/format';
import { searchKey } from '../../lib/text';
import type { AppUser } from '../../models/user';
import { cloneTemplate, field, setField } from '../../ui/template';
import { MAX_SELLERS } from './validation';

const MAX_RESULTS = 8;

export interface SellersPicker {
  selected(): AppUser[];
}

/**
 * Vendedores con buscador: escala a muchos empleados. Lo elegido se muestra como etiquetas
 * que se pueden quitar. El usuario que registra la venta queda seleccionado por defecto.
 */
export function createSellersPicker(elements: {
  search: HTMLInputElement;
  results: HTMLUListElement;
  selectedList: HTMLUListElement;
  users: readonly AppUser[];
  defaultEmail: string;
  onChange: () => void;
}): SellersPicker {
  const { search, results, selectedList, users, defaultEmail, onChange } = elements;
  const selected: AppUser[] = users.filter((user) => user.email === defaultEmail);
  let options: AppUser[] = [];
  let activeIndex = -1;

  function renderSelected(): void {
    selectedList.replaceChildren(
      ...selected.map((user) => {
        const chip = cloneTemplate<HTMLLIElement>('tpl-seller-chip');
        setField(chip, 'initials', initials(user.name));
        setField(chip, 'name', user.name);
        const remove = field<HTMLButtonElement>(chip, 'remove');
        remove.setAttribute('aria-label', `Quitar a ${user.name}`);
        remove.addEventListener('click', () => {
          selected.splice(selected.indexOf(user), 1);
          renderSelected();
          onChange();
          search.focus();
        });
        return chip;
      }),
    );
    const full = selected.length >= MAX_SELLERS;
    search.disabled = full;
    search.placeholder = full ? `Máximo ${MAX_SELLERS} vendedores` : 'Buscar vendedor por nombre…';
  }

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
    const user = options[index];
    if (!user) return;
    selected.push(user);
    search.value = '';
    close();
    renderSelected();
    onChange();
  }

  function renderResults(): void {
    const words = searchKey(search.value).split(/\s+/).filter(Boolean);
    options = users
      .filter((user) => !selected.includes(user))
      .filter((user) => words.every((word) => searchKey(user.name).includes(word)))
      .slice(0, MAX_RESULTS);

    const items = options.map((user, index) => {
      const item = cloneTemplate<HTMLLIElement>('tpl-seller-option');
      item.id = `seller-option-${index}`;
      setField(item, 'initials', initials(user.name));
      setField(item, 'name', user.name);
      // mousedown (no click) para que el input no pierda el foco antes de elegir.
      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
        choose(index);
      });
      return item;
    });
    if (items.length === 0) {
      const empty = cloneTemplate<HTMLLIElement>('tpl-seller-option');
      empty.removeAttribute('role');
      empty.classList.remove('cursor-pointer');
      setField(empty, 'initials', '–');
      setField(empty, 'name', 'No hay vendedores con ese nombre');
      items.push(empty);
    }
    results.replaceChildren(...items);
    results.hidden = false;
    search.setAttribute('aria-expanded', 'true');
    highlight(options.length > 0 && search.value.trim() ? 0 : -1);
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
      case 'Backspace':
        // Borrar con el buscador vacío quita el último vendedor agregado.
        if (!search.value && selected.length > 0) {
          selected.pop();
          renderSelected();
          onChange();
        }
        break;
    }
  });

  renderSelected();
  return { selected: () => [...selected] };
}
