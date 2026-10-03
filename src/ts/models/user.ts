import type { Role } from '../lib/roles';

/** Usuario del sistema (colección users/, ID = correo en minúsculas). Todos pueden ser vendedores. */
export interface AppUser {
  email: string;
  name: string;
  role: Role;
}
