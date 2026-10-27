import type { SaleCustomer } from '../../models/sale';
import { AlegraError, alegraRequest } from './client';
import { contactPayload, type AlegraContactPayload, type AlegraCreditNotePayload, type AlegraInvoicePayload } from './mapping';

/** Operaciones de Alegra que usa LAB CAR. Documentación: https://developer.alegra.com/ */

type Raw = Record<string, unknown>;

function record(value: unknown): Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : typeof value === 'number' ? String(value) : null;
}

/** Identificación genérica de la DIAN para "consumidor final" (Alegra trae este cliente creado). */
const FINAL_CONSUMER_ID = '222222222222';

// ---------- Clientes ----------

async function findContactId(identification: string): Promise<string | null> {
  const contacts = await alegraRequest<unknown[]>('GET', `/contacts?type=client&identification=${encodeURIComponent(identification)}`);
  const match = contacts.map(record).find((contact) => {
    const number = text(record(contact.identificationObject).number) ?? text(contact.identification);
    return number === identification;
  });
  return match ? text(match.id) : null;
}

/** ID del cliente en Alegra: lo busca por cédula/NIT y si no existe lo crea. Sin cliente = consumidor final. */
export async function ensureClient(customer: SaleCustomer | null): Promise<string> {
  if (!customer) {
    const id = await findContactId(FINAL_CONSUMER_ID);
    if (!id) throw new AlegraError('No existe el cliente "Consumidor Final" (222222222222) en Alegra.', 0, null, null);
    return id;
  }
  const existing = await findContactId(customer.documentNumber);
  if (existing) return existing;
  const payload: AlegraContactPayload = contactPayload(customer);
  let created: Raw;
  try {
    created = record(await alegraRequest('POST', '/contacts', payload));
  } catch (error) {
    // Si Alegra no acepta la ciudad o el departamento, se crea sin dirección (la factura no la exige).
    const locationError = error instanceof AlegraError && error.status === 400 && /departamento|ciudad|municipio/i.test(error.message);
    if (!locationError || !payload.address) throw error;
    const { address: _address, ...withoutAddress } = payload;
    created = record(await alegraRequest('POST', '/contacts', withoutAddress));
  }
  const id = text(created.id);
  if (!id) throw new AlegraError('Alegra no devolvió el ID del cliente creado.', 0, null, created);
  return id;
}

// ---------- Servicios (ítems) ----------

/** Cache en memoria por nombre de servicio (evita buscar el mismo ítem en cada factura). */
const itemCache = new Map<string, string>();

async function ensureItem(name: string): Promise<string> {
  const key = name.trim().toLowerCase();
  const cached = itemCache.get(key);
  if (cached) return cached;
  const items = await alegraRequest<unknown[]>('GET', `/items?name=${encodeURIComponent(name.trim())}`);
  const match = items.map(record).find((item) => text(item.name)?.trim().toLowerCase() === key && item.status !== 'inactive');
  let id = match ? text(match.id) : null;
  if (id && match && !text(record(match.inventory).unit)) {
    // La DIAN exige la unidad de medida: se completa en ítems creados sin ella.
    await alegraRequest('PUT', `/items/${encodeURIComponent(id)}`, { inventory: { unit: 'service' } });
  }
  if (!id) {
    // El precio real va en cada factura; el ítem solo identifica el servicio.
    const created = record(
      await alegraRequest('POST', '/items', { name: name.trim(), price: 0, type: 'service', inventory: { unit: 'service' } }),
    );
    id = text(created.id);
  }
  if (!id) throw new AlegraError(`Alegra no devolvió el ID del servicio "${name}".`, 0, null, null);
  itemCache.set(key, id);
  return id;
}

/** Nombre del servicio → ID del ítem en Alegra (los crea si no existen). */
export async function ensureItems(names: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(names)];
  const ids = new Map<string, string>();
  for (const name of unique) ids.set(name, await ensureItem(name));
  return ids;
}

// ---------- IVA ----------

let vatTaxId: string | null = null;

/** ID del impuesto "IVA 19%" en la cuenta de Alegra (se busca una vez por instancia). */
export async function ensureVatTax(): Promise<string> {
  if (vatTaxId) return vatTaxId;
  const taxes = await alegraRequest<unknown[]>('GET', '/taxes');
  const vat = taxes.map(record).find((tax) => text(tax.type) === 'IVA' && Number(tax.percentage) === 19 && tax.status !== 'inactive');
  const id = vat ? text(vat.id) : null;
  if (!id) throw new AlegraError('No existe el impuesto "IVA 19%" en Alegra.', 0, null, null);
  vatTaxId = id;
  return id;
}

// ---------- Facturas ----------

export interface AlegraInvoiceSummary {
  id: string;
  /** draft | open | closed | void */
  status: string;
  total: number;
  /** "FE1" (prefijo + número); null mientras sea borrador. */
  number: string | null;
  cufe: string | null;
  pdfUrl: string | null;
  /** Estado ante la DIAN según Alegra, si lo envía. */
  legalStatus: string | null;
  /** Notas de la factura ("Orden LC-80 · Placa …"): sirven para saber de qué venta es. */
  anotation: string;
}

/** Lee los datos útiles de una factura de Alegra (la forma exacta varía; se lee a la defensiva). */
export function summarizeInvoice(value: unknown): AlegraInvoiceSummary {
  const invoice = record(value);
  const template = record(invoice.numberTemplate);
  const stamp = record(invoice.stamp);
  const prefix = text(template.prefix) ?? '';
  const number = text(template.fullNumber) ?? text(template.formattedNumber) ?? (text(template.number) ? `${prefix}${text(template.number)}` : null);
  return {
    id: text(invoice.id) ?? '',
    status: text(invoice.status) ?? '',
    total: typeof invoice.total === 'number' ? invoice.total : Number(invoice.total ?? NaN),
    number: invoice.status === 'draft' ? null : number,
    cufe: text(stamp.cufe) ?? text(invoice.cufe),
    pdfUrl: text(invoice.pdf) ?? text(record(invoice.pdf).url),
    legalStatus: text(stamp.legalStatus) ?? text(invoice.legalStatus),
    anotation: text(invoice.anotation) ?? '',
  };
}

export async function createDraftInvoice(payload: AlegraInvoicePayload): Promise<AlegraInvoiceSummary> {
  return summarizeInvoice(await alegraRequest('POST', '/invoices', payload));
}

/** Actualiza un borrador con los datos actuales de la venta (conserva su número reservado). */
export async function updateDraftInvoice(id: string, payload: AlegraInvoicePayload): Promise<AlegraInvoiceSummary> {
  return summarizeInvoice(await alegraRequest('PUT', `/invoices/${encodeURIComponent(id)}`, payload));
}

/** Envía a la DIAN una factura en borrador o abierta. */
export async function stampInvoice(id: string): Promise<void> {
  // La documentación de Alegra muestra los IDs como números: [1, 2, 3].
  const response = record(await alegraRequest('POST', '/invoices/stamp', { ids: [/^\d+$/.test(id) ? Number(id) : id] }));
  const results = Array.isArray(response.data) ? response.data.map(record) : [];
  const result = results.find((item) => text(item.id) === id) ?? results[0];
  if (result && result.success === false) {
    throw new AlegraError(text(result.message) ?? 'La DIAN no aceptó la factura.', 400, text(result.code), response);
  }
}

export async function getInvoice(id: string): Promise<AlegraInvoiceSummary & { raw: unknown }> {
  const raw = await alegraRequest('GET', `/invoices/${encodeURIComponent(id)}?fields=pdf,xml,events`);
  return { ...summarizeInvoice(raw), raw };
}

/** PDF de vista previa sin crear nada en Alegra. */
export async function previewInvoice(payload: AlegraInvoicePayload): Promise<string> {
  const { status: _draft, ...data } = payload;
  const response = record(await alegraRequest('POST', '/invoices/preview', data));
  const url = text(response.pdfUrl);
  if (!url) throw new AlegraError('Alegra no devolvió el PDF de la vista previa.', 0, null, response);
  return url;
}

export async function emailInvoice(id: string, emails: readonly string[]): Promise<void> {
  await alegraRequest('POST', `/invoices/${encodeURIComponent(id)}/email`, { emails, sendCopyToUser: false });
}

/** Solo borradores (facturas que nunca llegaron a la DIAN). */
export async function deleteInvoice(id: string): Promise<void> {
  await alegraRequest('DELETE', `/invoices/${encodeURIComponent(id)}`);
}

// ---------- Notas crédito ----------

export interface AlegraCreditNoteSummary {
  id: string;
  number: string | null;
  cufe: string | null;
}

export async function createCreditNote(payload: AlegraCreditNotePayload): Promise<AlegraCreditNoteSummary> {
  const note = record(await alegraRequest('POST', '/credit-notes', payload));
  const template = record(note.numberTemplate);
  const prefix = text(template.prefix) ?? '';
  return {
    id: text(note.id) ?? '',
    number: text(template.fullNumber) ?? (text(template.number) ? `${prefix}${text(template.number)}` : null),
    cufe: text(record(note.stamp).cufe) ?? text(note.cufe),
  };
}
