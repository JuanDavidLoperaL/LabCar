/** Obtiene un elemento por id o falla con un mensaje claro si no existe en el HTML. */
export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`No existe el elemento #${id}`);
  return el as T;
}
