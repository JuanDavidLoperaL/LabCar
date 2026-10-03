import type { Role } from '../lib/roles';

export type NavBadgeVariant = 'info' | 'muted';

export interface NavItem {
  id: string;
  label: string;
  /** Nombre del ícono de Material Symbols. */
  icon: string;
  /** null mientras el módulo no esté construido: se muestra deshabilitado con "Pronto". */
  href: string | null;
  roles: readonly Role[];
  badge?: { text: string; variant: NavBadgeVariant };
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'panel', label: 'Panel Principal', icon: 'speed', href: '/html/panel.html', roles: ['admin', 'manager'] },
  { id: 'ventas', label: 'Ventas', icon: 'point_of_sale', href: null, roles: ['admin', 'manager', 'basic'] },
  { id: 'cartera', label: 'Cartera', icon: 'account_balance_wallet', href: null, roles: ['admin', 'manager'] },
  { id: 'gastos', label: 'Gastos', icon: 'payments', href: null, roles: ['admin', 'manager'] },
  {
    id: 'pagos-vendedores',
    label: 'Pagos Vendedores',
    icon: 'percent',
    href: null,
    roles: ['admin'],
    badge: { text: 'Sábado', variant: 'info' },
  },
  { id: 'reportes', label: 'Reportes', icon: 'bar_chart', href: null, roles: ['admin'] },
  { id: 'servicios', label: 'Servicios', icon: 'minor_crash', href: null, roles: ['admin'] },
  { id: 'usuarios', label: 'Usuarios y Roles', icon: 'admin_panel_settings', href: null, roles: ['admin'] },
];

export function navItemsFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
