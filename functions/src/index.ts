import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { configureAlegra } from '../../src/ts/integrations/alegra/client';
import * as invoicing from './invoicing';
import { loadSale, type ServerSale } from './sales';

/**
 * Functions de LAB CAR. Facturación electrónica con Alegra: el correo y el token de Alegra son
 * secretos del servidor y nunca llegan al navegador.
 *
 *   firebase functions:secrets:set ALEGRA_EMAIL
 *   firebase functions:secrets:set ALEGRA_TOKEN
 */

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

const ALEGRA_EMAIL = defineSecret('ALEGRA_EMAIL');
const ALEGRA_TOKEN = defineSecret('ALEGRA_TOKEN');

type Role = 'admin' | 'manager' | 'sales' | 'basic';
/** Emitir, ver, consultar y enviar: quien registra ventas. */
const OPERATORS: readonly Role[] = ['admin', 'manager', 'sales'];
/** Anular con nota crédito y eliminar borradores: admin y manager (como anular ventas). */
const SUPERVISORS: readonly Role[] = ['admin', 'manager'];

/** Mismo criterio que las reglas de Firestore: perfil activo, del rol pedido, que le pertenece a la sesión. */
async function requireRole(request: CallableRequest, roles: readonly Role[]): Promise<void> {
  const token = request.auth?.token;
  const email = token?.email?.toLowerCase();
  if (!email) throw new HttpsError('unauthenticated', 'Inicia sesión para continuar.');
  const profile = (await getFirestore().collection('users').doc(email).get()).data();
  const ownsProfile = token?.email_verified === true || email.endsWith('@usuarios.labcar.local') || profile?.access === 'password';
  if (!profile || profile.active !== true || !ownsProfile || !roles.includes(profile.role as Role)) {
    throw new HttpsError('permission-denied', 'Tu rol no permite esta acción con la factura electrónica.');
  }
}

async function requireSale(data: unknown): Promise<ServerSale> {
  const saleId = typeof (data as { saleId?: unknown })?.saleId === 'string' ? (data as { saleId: string }).saleId : '';
  if (!/^LC-\d+$/.test(saleId)) throw new HttpsError('invalid-argument', 'Venta no válida.');
  const sale = await loadSale(saleId);
  if (!sale) throw new HttpsError('not-found', `No existe la venta ${saleId}.`);
  if (sale.invoice.status === 'not-requested') throw new HttpsError('failed-precondition', 'Esta venta no pidió factura electrónica.');
  return sale;
}

/** Callable con secretos de Alegra, rol requerido y errores de Alegra con su mensaje en español. */
function invoiceCall<T>(roles: readonly Role[], handler: (sale: ServerSale, data: Record<string, unknown>) => Promise<T>) {
  return onCall({ secrets: [ALEGRA_EMAIL, ALEGRA_TOKEN] }, async (request) => {
    await requireRole(request, roles);
    const sale = await requireSale(request.data);
    configureAlegra({ email: ALEGRA_EMAIL.value(), token: ALEGRA_TOKEN.value() });
    try {
      return await handler(sale, (request.data ?? {}) as Record<string, unknown>);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error(error);
      throw new HttpsError('failed-precondition', invoicing.invoiceErrorMessage(error));
    }
  });
}

/** Emite (o reintenta) la factura de una venta. Devuelve el estado guardado en la venta. */
export const issueInvoice = invoiceCall(OPERATORS, async (sale) => {
  const invoice = await invoicing.issue(sale);
  return { status: invoice.status, number: invoice.number, error: invoice.error };
});

export const previewInvoice = invoiceCall(OPERATORS, async (sale) => ({ url: await invoicing.preview(sale) }));

export const invoicePdf = invoiceCall(OPERATORS, async (sale) => ({ url: await invoicing.pdf(sale) }));

export const refreshInvoice = invoiceCall(OPERATORS, async (sale) => {
  const invoice = await invoicing.refresh(sale);
  return { status: invoice.status, number: invoice.number };
});

export const emailInvoice = invoiceCall(OPERATORS, async (sale, data) => {
  const to = typeof data.email === 'string' ? data.email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new HttpsError('invalid-argument', 'Escribe un correo válido.');
  await invoicing.email(sale, to);
  return { sent: true };
});

export const voidInvoice = invoiceCall(SUPERVISORS, async (sale, data) => {
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (reason.length < 5) throw new HttpsError('invalid-argument', 'Escribe el motivo de la anulación.');
  const invoice = await invoicing.voidWithCreditNote(sale, reason);
  return { status: invoice.status };
});

export const deleteInvoiceDraft = invoiceCall(SUPERVISORS, async (sale) => {
  const invoice = await invoicing.deleteDraft(sale);
  return { status: invoice.status };
});
