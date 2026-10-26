import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { fetchSale } from '../../data/sales';
import { getFunctionsClient } from '../../lib/firebase';
import type { Sale, SaleInvoice } from '../../models/sale';

/**
 * Factura electrónica de una venta (DIAN vía Alegra). Las páginas solo usan estas funciones.
 * Todo corre en Firebase Functions (functions/src): ahí están el correo y el token de Alegra, y
 * ahí se guarda el estado de la factura en la venta. Aquí solo se llama y se relee la venta.
 */

export function invoiceErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    // Los errores de la Function ya vienen en español; los de red, no.
    if (error.code === 'functions/unavailable' || error.code === 'functions/internal') {
      return 'No se pudo conectar con el servicio de facturación. Revisa tu conexión e intenta de nuevo.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Error inesperado con la factura electrónica.';
}

async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const result = await httpsCallable<Record<string, unknown>, T>(getFunctionsClient(), name)(data);
  return result.data;
}

/** Relee la venta para tener el estado de la factura que guardó la Function. */
async function reload(sale: Sale): Promise<SaleInvoice> {
  const fresh = await fetchSale(sale.id);
  if (fresh) sale.invoice = fresh.invoice;
  return sale.invoice;
}

/**
 * Emite la factura de una venta (o reintenta una que falló). Nunca lanza error: si algo falla, la
 * devuelve en "error" con el motivo, para reintentar desde el historial.
 */
export async function issueSaleInvoice(sale: Sale): Promise<SaleInvoice> {
  const { status } = sale.invoice;
  if (status !== 'pending' && status !== 'error') return sale.invoice;
  try {
    await call('issueInvoice', { saleId: sale.id });
    return await reload(sale);
  } catch (error) {
    console.error(error);
    const invoice = await reload(sale).catch(() => sale.invoice);
    return invoice.status === 'issued' ? invoice : { ...invoice, status: 'error', error: invoiceErrorMessage(error) };
  }
}

/** Emite la factura de una venta recién registrada. */
export async function issueInvoiceForSale(saleId: string): Promise<SaleInvoice | null> {
  const sale = await fetchSale(saleId);
  return sale ? issueSaleInvoice(sale) : null;
}

/** PDF de vista previa con los datos actuales de la venta. No crea nada en Alegra ni ante la DIAN. */
export async function previewSaleInvoice(sale: Sale): Promise<string> {
  return (await call<{ url: string }>('previewInvoice', { saleId: sale.id })).url;
}

/** Enlace actual al PDF (los enlaces de Alegra vencen: se pide uno nuevo cada vez). */
export async function saleInvoicePdf(sale: Sale): Promise<string> {
  return (await call<{ url: string }>('invoicePdf', { saleId: sale.id })).url;
}

/** Consulta la factura en Alegra y actualiza número, CUFE y estado guardados. */
export async function refreshSaleInvoice(sale: Sale): Promise<SaleInvoice> {
  await call('refreshInvoice', { saleId: sale.id });
  return reload(sale);
}

export async function emailSaleInvoice(sale: Sale, email: string): Promise<void> {
  await call('emailInvoice', { saleId: sale.id, email });
}

/**
 * Anula una factura emitida con una nota crédito. Lanza el error si falla, para no anular la venta
 * sin anular la factura.
 */
export async function voidSaleInvoice(sale: Sale, reason: string): Promise<SaleInvoice> {
  if (sale.invoice.status !== 'issued') return sale.invoice;
  await call('voidInvoice', { saleId: sale.id, reason });
  return reload(sale);
}

/** Borra el borrador de una factura que no se pudo emitir (nunca llegó a la DIAN) y la deja pendiente. */
export async function deleteSaleInvoiceDraft(sale: Sale): Promise<SaleInvoice> {
  await call('deleteInvoiceDraft', { saleId: sale.id });
  return reload(sale);
}
