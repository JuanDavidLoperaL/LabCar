import {
  createCreditNote,
  createDraftInvoice,
  deleteInvoice,
  emailInvoice,
  ensureClient,
  ensureItems,
  ensureVatTax,
  getInvoice,
  previewInvoice,
  stampInvoice,
  updateDraftInvoice,
} from '../../src/ts/integrations/alegra/api';
import { AlegraError } from '../../src/ts/integrations/alegra/client';
import { belongsToSale, invoicePayload, voidCreditNotePayload } from '../../src/ts/integrations/alegra/mapping';
import type { SaleInvoice } from '../../src/ts/models/sale';
import { overdueDays, saveInvoice, type ServerSale } from './sales';

/**
 * Factura electrónica de una venta (DIAN vía Alegra), del lado del servidor.
 *
 * Emitir es en dos pasos para no gastar un número de la resolución en una factura equivocada:
 * 1) se crea en Alegra como borrador y se compara su total con el de la venta;
 * 2) si coincide, se envía a la DIAN. Si no, queda el error y el borrador para revisar.
 */

export function invoiceErrorMessage(error: unknown): string {
  if (error instanceof AlegraError) return error.message;
  return error instanceof Error ? error.message : 'Error inesperado con la factura electrónica.';
}

async function buildPayload(sale: ServerSale) {
  const [clientId, itemIds, vatTaxId, days] = await Promise.all([
    ensureClient(sale.invoice.recipient === 'customer' ? sale.customer : null),
    ensureItems(sale.items.map((item) => item.name)),
    ensureVatTax(),
    overdueDays(),
  ]);
  return { clientId, itemIds, vatTaxId, payload: invoicePayload(sale, clientId, itemIds, vatTaxId, days) };
}

async function save(sale: ServerSale, patch: Partial<SaleInvoice>): Promise<SaleInvoice> {
  const invoice: SaleInvoice = { ...sale.invoice, ...patch };
  await saveInvoice(sale.id, invoice);
  sale.invoice = invoice;
  return invoice;
}

/**
 * La factura de Alegra guardada en la venta, solo si de verdad es de esa venta. Si Alegra ya no la
 * tiene o reutilizó el ID para otra factura, se olvida (queda como si nunca se hubiera creado).
 */
async function ownInvoice(sale: ServerSale) {
  const id = sale.invoice.providerId;
  if (!id) return null;
  const invoice = await getInvoice(id).catch((error: unknown) => {
    if (error instanceof AlegraError && error.status === 404) return null;
    throw error;
  });
  if (invoice && belongsToSale(invoice.anotation, sale.id)) return invoice;
  await save(sale, { providerId: null });
  return null;
}

/** Envía la factura emitida al correo que registró el cliente (si falla, se reenvía desde el historial). */
async function sendToCustomer(sale: ServerSale, invoiceId: string): Promise<void> {
  const email = sale.invoice.recipient === 'customer' ? sale.customer?.email.trim() : '';
  if (!email) return;
  await emailInvoice(invoiceId, [email]).catch((error: unknown) => console.error('No se pudo enviar la factura por correo', error));
}

/**
 * Emite la factura de una venta (o reintenta una que falló). No lanza errores de Alegra: deja la
 * venta en "error" con el motivo, para reintentar desde el historial.
 */
export async function issue(sale: ServerSale): Promise<SaleInvoice> {
  const { status } = sale.invoice;
  if (status !== 'pending' && status !== 'error') return sale.invoice;
  try {
    const existing = await ownInvoice(sale);
    if (existing && existing.status !== 'draft') {
      // Se emitió y no alcanzó a guardarse en LAB CAR: se guarda.
      return await save(sale, { status: 'issued', number: existing.number, cufe: existing.cufe, pdfUrl: existing.pdfUrl, error: null });
    }
    const { payload } = await buildPayload(sale);
    // Un borrador propio se actualiza (conserva el número que tiene reservado, sin dejar huecos).
    const draft = existing ? await updateDraftInvoice(existing.id, payload) : await createDraftInvoice(payload);
    const id = draft.id;
    // Se guarda de inmediato: si algo falla después, el reintento usa este borrador y no crea otro.
    await save(sale, { providerId: id, error: null });
    if (draft.total !== sale.total) {
      return await save(sale, {
        status: 'error',
        error: `El total en Alegra (${draft.total}) no coincide con el de la venta (${sale.total}). No se envió a la DIAN.`,
      });
    }

    await stampInvoice(id);
    const issued = await getInvoice(id);
    const saved = await save(sale, { status: 'issued', number: issued.number, cufe: issued.cufe, pdfUrl: issued.pdfUrl, error: null });
    await sendToCustomer(sale, id);
    return saved;
  } catch (error) {
    console.error(error);
    return save(sale, { status: 'error', error: invoiceErrorMessage(error) });
  }
}

/** PDF de vista previa con los datos actuales de la venta. No crea nada en Alegra ni ante la DIAN. */
export async function preview(sale: ServerSale): Promise<string> {
  const { payload } = await buildPayload(sale);
  return previewInvoice(payload);
}

/** Enlace actual al PDF (los enlaces de Alegra vencen: se pide uno nuevo cada vez). */
export async function pdf(sale: ServerSale): Promise<string> {
  const invoice = await ownInvoice(sale);
  if (!invoice) throw new AlegraError('Esta venta no tiene factura en Alegra.', 0, null, null);
  if (!invoice.pdfUrl) throw new AlegraError('Alegra no devolvió el PDF de la factura.', 0, null, null);
  return invoice.pdfUrl;
}

/** Consulta la factura en Alegra y actualiza número, CUFE y estado guardados. */
export async function refresh(sale: ServerSale): Promise<SaleInvoice> {
  const invoice = await ownInvoice(sale);
  if (!invoice || invoice.status === 'draft' || sale.invoice.status === 'voided') return sale.invoice;
  return save(sale, { status: 'issued', number: invoice.number, cufe: invoice.cufe, pdfUrl: invoice.pdfUrl, error: null });
}

export async function email(sale: ServerSale, to: string): Promise<void> {
  if (sale.invoice.status !== 'issued' || !sale.invoice.providerId) {
    throw new AlegraError('Solo se puede enviar por correo una factura ya emitida.', 0, null, null);
  }
  await emailInvoice(sale.invoice.providerId, [to.trim()]);
}

/**
 * Anula una factura emitida con una nota crédito (en Colombia una factura aceptada por la DIAN no
 * se puede borrar). Lanza el error si falla, para no anular la venta sin anular la factura.
 */
export async function voidWithCreditNote(sale: ServerSale, reason: string): Promise<SaleInvoice> {
  if (sale.invoice.status !== 'issued' || !sale.invoice.providerId) return sale.invoice;
  const { clientId, itemIds, vatTaxId } = await buildPayload(sale);
  const note = await createCreditNote(voidCreditNotePayload(sale, sale.invoice.providerId, clientId, itemIds, vatTaxId, reason, new Date()));
  return save(sale, {
    status: 'voided',
    creditNote: { id: note.id, number: note.number, cufe: note.cufe, at: new Date(), reason: reason.trim() },
  });
}

/** Borra el borrador de una factura que no se pudo emitir (nunca llegó a la DIAN) y la deja pendiente. */
export async function deleteDraft(sale: ServerSale): Promise<SaleInvoice> {
  if (sale.invoice.status === 'issued' || sale.invoice.status === 'voided') return sale.invoice;
  const invoice = await ownInvoice(sale);
  if (!invoice) return save(sale, { status: 'pending', error: null }); // en Alegra ya no había borrador
  if (invoice.status !== 'draft') {
    throw new AlegraError('La factura ya no es un borrador en Alegra: no se puede eliminar. Consúltala para actualizarla.', 0, null, null);
  }
  await deleteInvoice(invoice.id);
  return save(sale, { status: 'pending', providerId: null, error: null });
}
