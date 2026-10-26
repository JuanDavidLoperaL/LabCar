/**
 * Conexión con la API de Alegra (facturación electrónica DIAN).
 *
 * PRUEBAS INTERNAS: por ahora el navegador llama a Alegra con las credenciales de .env.local, así
 * que quedan visibles en el navegador. Este es el ÚNICO archivo que conoce la URL, el correo y el
 * token: al pasar a Firebase Functions, `alegraRequest` se mueve al servidor (con las credenciales
 * como secretos) y en el navegador se reemplaza por una llamada a la Function. Nada más cambia.
 */

const BASE_URL = 'https://api.alegra.com/api/v1';

export class AlegraError extends Error {
  constructor(
    message: string,
    /** Código HTTP (0 = sin conexión o sin credenciales). */
    readonly status: number,
    /** Código de error de Alegra, si lo envía. */
    readonly code: number | string | null,
    /** Cuerpo de la respuesta, por si trae datos útiles (p. ej. la factura creada en borrador). */
    readonly data: unknown,
  ) {
    super(message);
  }
}

function authorization(): string {
  // Solo en `npm run dev`: en el build de producción Vite elimina estas líneas y el token nunca
  // llega al sitio publicado (un deploy por error no lo expone).
  const email = import.meta.env.DEV ? (import.meta.env.VITE_ALEGRA_EMAIL as string | undefined) : undefined;
  const token = import.meta.env.DEV ? (import.meta.env.VITE_ALEGRA_TOKEN as string | undefined) : undefined;
  if (!email || !token) {
    throw new AlegraError(
      import.meta.env.DEV
        ? 'Faltan las credenciales de Alegra (VITE_ALEGRA_EMAIL y VITE_ALEGRA_TOKEN en .env.local).'
        : 'La facturación electrónica aún no está disponible en este sitio.',
      0,
      null,
      null,
    );
  }
  return `Basic ${btoa(`${email}:${token}`)}`;
}

/**
 * Mensaje de error de Alegra: viene en `message` o `error`, a veces anidado, y en las operaciones
 * por lote dentro de `data: [{ id, code, message }]`.
 */
function errorMessage(body: unknown, status: number): { message: string; code: number | string | null } {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const nested = typeof record.error === 'object' && record.error !== null ? (record.error as Record<string, unknown>) : {};
  const list = Array.isArray(record.data) ? record.data : Array.isArray(record.error) ? record.error : [];
  const first = typeof list[0] === 'object' && list[0] !== null ? (list[0] as Record<string, unknown>) : {};
  const message = [record.message, nested.message, record.error, first.message].find((value): value is string => typeof value === 'string');
  const code = [record.code, nested.code, first.code].find((value): value is number | string => typeof value === 'number' || typeof value === 'string');
  // La DIAN devuelve el detalle en HTML ("…validaciones necesarias:<ul><li>el campo … es requerido.</li></ul>").
  const plain = message?.replace(/<li>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return { message: plain || `Alegra respondió con un error (HTTP ${status}).`, code: code ?? null };
}

export async function alegraRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: authorization(),
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    if (cause instanceof AlegraError) throw cause;
    throw new AlegraError('No se pudo conectar con Alegra. Revisa tu conexión a internet.', 0, null, null);
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const { message, code } = errorMessage(data, response.status);
    throw new AlegraError(message, response.status, code, data);
  }
  return data as T;
}
