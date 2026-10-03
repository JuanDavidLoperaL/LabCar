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
