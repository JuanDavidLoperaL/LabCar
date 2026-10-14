import type { AccessType } from '../lib/auth';
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

/** Empleado tal como lo ve el administrador en Usuarios y Roles (incluye los eliminados). */
export interface ManagedUser extends AppUser {
  access: AccessType;
  /** false = eliminado: no entra al sistema ni aparece como vendedor, pero sus ventas se conservan. */
  active: boolean;
}

/** Empleado nuevo que el administrador agrega (aún sin guardar). */
export interface NewUser {
  /** ID en users/: correo de Google o usuario@usuarios.labcar.local. */
  email: string;
  name: string;
  role: Role;
  access: AccessType;
  /** Solo para cuentas con contraseña que no existían antes: se crea su cuenta con esta contraseña. */
  password: string | null;
  /** Ya existía y fue eliminado: se reactiva (conserva su contraseña anterior). */
  reactivate: boolean;
  documentNumber: string;
  phone: string;
}
