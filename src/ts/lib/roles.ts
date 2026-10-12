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

/** Cartera (ventas a crédito por cobrar): solo admin y manager. */
export function canAccessReceivables(role: Role): boolean {
  return role === 'admin' || role === 'manager';
}

/** Solo el administrador cambia cuántos días deben pasar para que un crédito quede en mora. */
export function canEditOverdueDays(role: Role): boolean {
  return role === 'admin';
}

/** Gastos: admin y manager registran; basic no tiene acceso. */
export function canAccessExpenses(role: Role): boolean {
  return role === 'admin' || role === 'manager';
}

/**
 * Solo el administrador ve el historial de gastos (semanas y meses anteriores) y registra gastos con
 * fecha pasada. El manager solo ve y registra los de hoy.
 */
export function canSeeExpenseHistory(role: Role): boolean {
  return role === 'admin';
}

/** El admin anula cualquier gasto; el manager solo los de hoy (las reglas lo validan). */
export function canVoidExpense(role: Role, isFromToday: boolean): boolean {
  return role === 'admin' || (role === 'manager' && isFromToday);
}

/** Pagos a vendedores: admin y manager eligen a cualquier empleado; basic solo ve lo suyo. */
export function canSeeAllPayouts(role: Role): boolean {
  return role === 'admin' || role === 'manager';
}

/** Solo el administrador ve cuánto vendió cada empleado y la parte que le queda a LAB CAR. */
export function canSeeCompanyShare(role: Role): boolean {
  return role === 'admin';
}

/** Solo el administrador registra que se le pagó la comisión a un empleado. */
export function canMarkPayoutPaid(role: Role): boolean {
  return role === 'admin';
}

/** Página de inicio después del login: basic no tiene panel principal, entra directo a ventas. */
export function homeFor(role: Role): string {
  return role === 'basic' ? '/html/ventas.html' : '/html/panel.html';
}
