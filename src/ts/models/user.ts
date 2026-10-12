import type { Role } from '../lib/roles';

/** Usuario del sistema (colección users/, ID = correo en minúsculas). Todos pueden ser vendedores. */
export interface AppUser {
  email: string;
  name: string;
  role: Role;
}

/**
 * Datos de contacto del empleado (colección employees/, ID = correo). Van aparte de users/ porque
 * users/ lo lee todo el equipo; estos solo los ven admin, manager y el propio empleado.
 */
export interface EmployeeInfo {
  /** Cédula; vacío si no está registrada. */
  documentNumber: string;
  phone: string;
}
