import { DEFAULT_OVERDUE_DAYS } from '../../config/business';
import { fetchSale, saveSaleInvoice } from '../../data/sales';
import { fetchOverdueDays } from '../../data/settings';
import {
  createCreditNote,
  createDraftInvoice,
  deleteInvoice,
  emailInvoice,
  ensureClient,
  ensureItems,
  getInvoice,
  previewInvoice,
  stampInvoice,
  updateDraftInvoice,
} from '../../integrations/alegra/api';
import { AlegraError } from '../../integrations/alegra/client';
import { belongsToSale, invoicePayload, voidCreditNotePayload } from '../../integrations/alegra/mapping';
import type { Sale, SaleInvoice } from '../../models/sale';

/**
 * Factura electrónica de una venta (DIAN vía Alegra). Las páginas solo usan estas funciones.
 *
 * PRUEBAS INTERNAS: hoy corren en el navegador. Con Firebase Functions, cada una pasa a ser una
 * Function con el mismo nombre y la misma entrada (el ID de la venta), y aquí solo queda la llamada.
 *
 * Emitir es en dos pasos para no gastar un número de la resolución en una factura equivocada:
 * 1) se crea en Alegra como borrador y se compara su total con el de la venta;
 * 2) si coincide, se envía a la DIAN. Si no, se borra el borrador.
 */

export function invoiceErrorMessage(error: unknown): string {
  if (error instanceof AlegraError) return error.message;
  return error instanceof Error ? error.message : 'Error inesperado con la factura electrónica.';
}

async function creditDays(): Promise<number> {
  return fetchOverdueDays().catch(() => DEFAULT_OVERDUE_DAYS);
}

async function buildPayload(sale: Sale) {
  const [clientId, itemIds, days] = await Promise.all([
    ensureClient(sale.invoice.recipient === 'customer' ? sale.customer : null),
    ensureItems(sale.items.map((item) => item.name)),
    creditDays(),
  ]);
  return { clientId, itemIds, payload: invoicePayload(sale, clientId, itemIds, days) };
}

async function save(sale: Sale, patch: Partial<SaleInvoice>): Promise<SaleInvoice> {
  const invoice: SaleInvoice = { ...sale.invoice, ...patch };
  await saveSaleInvoice(sale.id, invoice);
  sale.invoice = invoice;
  return invoice;
}

/**
 * La factura de Alegra guardada en la venta, solo si de verdad es de esa venta. Si Alegra ya no la
 * tiene o reutilizó el ID para otra factura, se olvida (queda como si nunca se hubiera creado).
 */
async function ownInvoice(sale: Sale) {
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

/**
 * Emite la factura de una venta (o reintenta una que falló). Nunca lanza error: si algo falla deja
 * la venta en "error" con el motivo, para reintentar desde el historial.
 */
export async function issueSaleInvoice(sale: Sale): Promise<SaleInvoice> {
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
    console.info('Factura emitida en Alegra', issued.raw);
    const saved = await save(sale, { status: 'issued', number: issued.number, cufe: issued.cufe, pdfUrl: issued.pdfUrl, error: null });
    await sendToCustomer(sale, id);
    return saved;
  } catch (error) {
    console.error(error);
    return save(sale, { status: 'error', error: invoiceErrorMessage(error) }).catch((saveError: unknown) => {
      console.error(saveError);
      return sale.invoice;
    });
  }
}

/**
 * Envía la factura emitida al correo que registró el cliente. Si falla no se pierde la factura: se
 * avisa en la consola y se puede reenviar desde el historial.
 */
async function sendToCustomer(sale: Sale, invoiceId: string): Promise<void> {
  const email = sale.invoice.recipient === 'customer' ? sale.customer?.email.trim() : '';
  if (!email) return;
  await emailInvoice(invoiceId, [email]).catch((error: unknown) => console.error('No se pudo enviar la factura por correo', error));
}

/** Emite la factura de una venta recién registrada (la lee de nuevo para tener los totales guardados). */
export async function issueInvoiceForSale(saleId: string): Promise<SaleInvoice | null> {
  const sale = await fetchSale(saleId);
  return sale ? issueSaleInvoice(sale) : null;
}

/** PDF de vista previa con los datos actuales de la venta. No crea nada en Alegra ni ante la DIAN. */
export async function previewSaleInvoice(sale: Sale): Promise<string> {
  const { payload } = await buildPayload(sale);
  return previewInvoice(payload);
}

/** Enlace actual al PDF (los enlaces de Alegra vencen: se pide uno nuevo cada vez). */
export async function saleInvoicePdf(sale: Sale): Promise<string> {
  if (!sale.invoice.providerId) throw new AlegraError('Esta venta no tiene factura en Alegra.', 0, null, null);
  const invoice = await getInvoice(sale.invoice.providerId);
  if (!invoice.pdfUrl) throw new AlegraError('Alegra no devolvió el PDF de la factura.', 0, null, invoice.raw);
  return invoice.pdfUrl;
}

/** Consulta la factura en Alegra y actualiza número, CUFE y estado guardados. */
export async function refreshSaleInvoice(sale: Sale): Promise<SaleInvoice> {
  const invoice = await ownInvoice(sale);
  if (!invoice) return sale.invoice;
  console.info('Factura en Alegra', invoice.raw);
  if (invoice.status === 'draft' || sale.invoice.status === 'voided') return sale.invoice;
  return save(sale, { status: 'issued', number: invoice.number, cufe: invoice.cufe, pdfUrl: invoice.pdfUrl, error: null });
}

export async function emailSaleInvoice(sale: Sale, email: string): Promise<void> {
  if (sale.invoice.status !== 'issued' || !sale.invoice.providerId) {
    throw new AlegraError('Solo se puede enviar por correo una factura ya emitida.', 0, null, null);
  }
  await emailInvoice(sale.invoice.providerId, [email.trim()]);
}

/**
 * Anula una factura emitida con una nota crédito (en Colombia una factura aceptada por la DIAN no
 * se puede borrar). Lanza el error si falla, para no anular la venta sin anular la factura.
 */
export async function voidSaleInvoice(sale: Sale, reason: string): Promise<SaleInvoice> {
  if (sale.invoice.status !== 'issued' || !sale.invoice.providerId) return sale.invoice;
  const { clientId, itemIds } = await buildPayload(sale);
  const note = await createCreditNote(voidCreditNotePayload(sale, sale.invoice.providerId, clientId, itemIds, reason, new Date()));
  return save(sale, {
    status: 'voided',
    creditNote: { id: note.id, number: note.number, cufe: note.cufe, at: new Date(), reason: reason.trim() },
  });
}

/** Borra el borrador de una factura que no se pudo emitir (nunca llegó a la DIAN) y la deja pendiente. */
export async function deleteSaleInvoiceDraft(sale: Sale): Promise<SaleInvoice> {
  if (sale.invoice.status === 'issued' || sale.invoice.status === 'voided') return sale.invoice;
  const invoice = await ownInvoice(sale);
  if (!invoice) return save(sale, { status: 'pending', error: null }); // en Alegra ya no había borrador
  if (invoice.status !== 'draft') {
    throw new AlegraError('La factura ya no es un borrador en Alegra: no se puede eliminar. Consúltala para actualizarla.', 0, null, invoice.raw);
  }
  await deleteInvoice(invoice.id);
  return save(sale, { status: 'pending', providerId: null, error: null });
}
