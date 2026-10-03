export const ROLES = ['admin', 'manager', 'basic'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  manager: 'Manager',
  basic: 'Básico',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Qué parte del panel principal ve cada rol:
 * - full: todas las tarjetas, filtro de periodo, últimas ventas y comisiones.
 * - today-summary: solo ventas y gastos de hoy.
 * - none: sin acceso al panel.
 */
export type DashboardAccess = 'full' | 'today-summary' | 'none';

export function dashboardAccess(role: Role): DashboardAccess {
  switch (role) {
    case 'admin':
      return 'full';
    case 'manager':
      return 'today-summary';
    case 'basic':
      return 'none';
  }
}

/** Admin y manager ven el historial de todos; basic solo el suyo. */
export function canSeeAllSales(role: Role): boolean {
  return role === 'admin' || role === 'manager';
}

/** Solo admin y manager pueden anular ventas. */
export function canVoidSales(role: Role): boolean {
  return role === 'admin' || role === 'manager';
}

/** Página de inicio después del login: basic no tiene panel principal, entra directo a ventas. */
export function homeFor(role: Role): string {
  return role === 'basic' ? '/html/ventas.html' : '/html/panel.html';
}
