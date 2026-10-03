import shellHtml from '../../html/partials/app-shell.html?raw';
import logoUrl from '../../assets/images/logo.png';
import { navItemsFor, type NavBadgeVariant, type NavItem } from '../config/navigation';
import { logout, ROUTES, type SessionUser } from '../lib/auth';
import { formatLongDate, initials } from '../lib/format';
import { ROLE_LABELS } from '../lib/roles';
import { byId } from './dom';
import { cloneTemplate, field } from './template';
import { showToast } from './toast';

/** Ítems que caben en la barra inferior del celular (el resto queda en "Menú"). */
const MOBILE_NAV_LIMIT = 3;

function setBadge(badge: HTMLElement, text: string, variant: NavBadgeVariant): void {
  badge.textContent = text;
  badge.dataset.variant = variant;
  badge.hidden = false;
}

function renderNavItem(templateId: string, item: NavItem, activeId: string): HTMLAnchorElement {
  const link = cloneTemplate<HTMLAnchorElement>(templateId);
  link.dataset.navId = item.id;
  field(link, 'icon').textContent = item.icon;
  field(link, 'label').textContent = item.label;

  if (item.href) {
    link.href = item.href;
    if (item.id === activeId) link.setAttribute('aria-current', 'page');
  } else {
    // Sin href el <a> pierde su rol: se declara como enlace deshabilitado para lectores de pantalla.
    link.setAttribute('role', 'link');
    link.setAttribute('aria-disabled', 'true');
    link.title = 'Módulo en construcción';
  }

  const badge = link.querySelector<HTMLElement>('[data-field="badge"]');
  if (badge) {
    if (!item.href) setBadge(badge, 'Pronto', 'muted');
    else if (item.badge) setBadge(badge, item.badge.text, item.badge.variant);
  }
  return link;
}

/** En pantallas grandes el menú lateral siempre está visible; en celular es un panel desplegable. */
function setupDrawer(): void {
  const sidebar = byId('sidebar');
  const backdrop = byId('drawer-backdrop');
  const menuBtn = byId<HTMLButtonElement>('btn-menu');
  const desktop = window.matchMedia('(min-width: 64rem)'); // breakpoint lg de Tailwind

  const isOpen = () => sidebar.dataset.open === 'true';
  const setOpen = (open: boolean) => {
    sidebar.dataset.open = String(open);
    // Cerrado en celular: fuera del orden de tabulación y del lector de pantalla.
    sidebar.inert = !open && !desktop.matches;
    backdrop.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  const close = () => {
    if (!isOpen()) return;
    setOpen(false);
    menuBtn.focus();
  };

  setOpen(false);
  desktop.addEventListener('change', () => setOpen(false));
  menuBtn.addEventListener('click', () => setOpen(!isOpen()));
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}

function renderUser({ user, profile }: SessionUser): void {
  const name = profile.name || user.displayName || user.email || '';
  byId('header-name').textContent = name;
  byId('header-role').textContent = ROLE_LABELS[profile.role];

  const initialsEl = byId('header-initials');
  initialsEl.textContent = initials(name);
  if (user.photoURL) {
    const avatar = byId<HTMLImageElement>('header-avatar');
    avatar.addEventListener('load', () => {
      avatar.hidden = false;
      initialsEl.hidden = true;
    });
    avatar.src = user.photoURL;
  }
}

/**
 * Monta la estructura común y mueve el <main> de la página dentro de ella.
 * `activeId` es el id del ítem del menú que corresponde a la página actual.
 */
export function mountShell(session: SessionUser, activeId: string): void {
  const main = document.querySelector('main');
  if (!main) throw new Error('La página debe tener un <main>');

  document.body.insertAdjacentHTML('afterbegin', shellHtml);
  document.querySelector('[data-slot="content"]')?.append(main);
  document.querySelectorAll<HTMLImageElement>('img[data-logo]').forEach((img) => (img.src = logoUrl));

  const items = navItemsFor(session.profile.role);
  byId('nav-desktop').append(...items.map((item) => renderNavItem('tpl-nav-item', item, activeId)));
  byId('nav-mobile').prepend(
    ...items.slice(0, MOBILE_NAV_LIMIT).map((item) => renderNavItem('tpl-nav-item-mobile', item, activeId)),
  );

  byId('header-date').textContent = formatLongDate(new Date());
  renderUser(session);
  setupDrawer();

  byId<HTMLButtonElement>('btn-logout').addEventListener('click', async () => {
    try {
      await logout();
      window.location.replace(ROUTES.login);
    } catch {
      showToast('No se pudo cerrar la sesión. Intenta de nuevo.', 'error');
    }
  });
}
