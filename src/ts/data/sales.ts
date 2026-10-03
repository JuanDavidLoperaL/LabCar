import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore';
import { CREDIT_TERM_DAYS, ORDER_PREFIX } from '../config/business';
import { computeSaleTotals, type ItemInput, type SellerInput } from '../features/sales/pricing';
import type { DateRange } from '../lib/dates';
import { getDb } from '../lib/firebase';
import {
  DOCUMENT_TYPES,
  INVOICE_RECIPIENTS,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  PERSON_TYPES,
  SALE_STATUSES,
  TAX_REGIMES,
  VEHICLE_TYPES,
  type InvoiceRecipient,
  type PaymentMethod,
  type Sale,
  type SaleCustomer,
  type VehicleType,
} from '../models/sale';
import { asDate, asNumber, asOneOf, asRecord, asRecords, asString, type Raw } from './parse';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Máximo de ventas por consulta del historial. */
export const HISTORY_LIMIT = 300;

// ---------- Lectura ----------

function parseCustomer(raw: Raw | null): SaleCustomer | null {
  if (!raw) return null;
  return {
    documentType: asOneOf(raw.documentType, DOCUMENT_TYPES, 'CC'),
    documentNumber: asString(raw.documentNumber),
    verificationDigit: typeof raw.verificationDigit === 'string' ? raw.verificationDigit : null,
    personType: asOneOf(raw.personType, PERSON_TYPES, 'natural'),
    name: asString(raw.name),
    phone: asString(raw.phone),
    email: asString(raw.email),
    address: asString(raw.address),
    city: asString(raw.city),
    taxRegime: typeof raw.taxRegime === 'string' ? asOneOf(raw.taxRegime, TAX_REGIMES, 'not-vat-responsible') : null,
  };
}

export function parseSale(snapshot: DocumentSnapshot): Sale | null {
  const data = snapshot.data();
  const date = asDate(data?.date);
  if (!data || !date) return null; // sin fecha no se puede ubicar en ningún periodo

  const invoice = asRecord(data.invoice);
  const createdBy = asRecord(data.createdBy);
  const voided = asRecord(data.void);
  const voidedAt = asDate(voided?.at);

  return {
    id: snapshot.id,
    number: typeof data.number === 'number' ? data.number : null,
    date,
    vehicleType: asOneOf(data.vehicleType, VEHICLE_TYPES, 'car'),
    plate: asString(data.plate),
    vehicleLine: asString(data.vehicleLine),
    items: asRecords(data.items).map((item) => ({
      serviceId: typeof item.serviceId === 'string' ? item.serviceId : null,
      name: asString(item.name, 'Servicio'),
      price: asNumber(item.price),
      discountPercent: asNumber(item.discountPercent),
      discount: asNumber(item.discount),
      total: asNumber(item.total),
    })),
    subtotal: asNumber(data.subtotal),
    discount: asNumber(data.discount),
    total: asNumber(data.total),
    commissionRate: asNumber(data.commissionRate),
    commission: asNumber(data.commission),
    sellers: asRecords(data.sellers).map((seller) => ({
      email: asString(seller.email),
      name: asString(seller.name, 'Sin nombre'),
      commission: asNumber(seller.commission),
    })),
    paymentMethod: asOneOf(data.paymentMethod, PAYMENT_METHODS, 'cash'),
    // Si el estado no es válido se asume pendiente: es mejor revisarla en cartera que darla por pagada.
    status: asOneOf(data.status, SALE_STATUSES, 'pending'),
    dueDate: asDate(data.dueDate),
    customer: parseCustomer(asRecord(data.customer)),
    invoice: {
      status: asOneOf(invoice?.status, INVOICE_STATUSES, 'not-requested'),
      recipient: typeof invoice?.recipient === 'string' ? asOneOf(invoice.recipient, INVOICE_RECIPIENTS, 'final-consumer') : null,
      number: typeof invoice?.number === 'string' ? invoice.number : null,
      cufe: typeof invoice?.cufe === 'string' ? invoice.cufe : null,
      pdfUrl: typeof invoice?.pdfUrl === 'string' ? invoice.pdfUrl : null,
      error: typeof invoice?.error === 'string' ? invoice.error : null,
    },
    notes: asString(data.notes),
    createdBy: { email: asString(createdBy?.email), name: asString(createdBy?.name) },
    void: voided && voidedAt ? { at: voidedAt, by: asString(voided.by), reason: asString(voided.reason) } : null,
  };
}

function toSales(snapshots: readonly DocumentSnapshot[]): Sale[] {
  return snapshots.map(parseSale).filter((sale): sale is Sale => sale !== null);
}

function salesCollection() {
  return collection(getDb(), 'sales');
}

function dateConstraints(range: DateRange): QueryConstraint[] {
  return [
    where('date', '>=', Timestamp.fromDate(range.start)),
    where('date', '<', Timestamp.fromDate(range.end)),
    orderBy('date', 'desc'),
  ];
}

/** Ventas del rango, de la más reciente a la más antigua (incluye anuladas; quien consulta decide). */
export async function fetchSales(range: DateRange): Promise<Sale[]> {
  const snapshot = await getDocs(query(salesCollection(), ...dateConstraints(range)));
  return toSales(snapshot.docs);
}

export async function fetchSale(id: string): Promise<Sale | null> {
  const snapshot = await getDoc(doc(salesCollection(), id));
  return snapshot.exists() ? parseSale(snapshot) : null;
}

export type HistoryQuery =
  | { kind: 'range'; range: DateRange; sellerEmail: string | null }
  | { kind: 'plate'; plate: string }
  | { kind: 'document'; documentNumber: string };

/** Consultas del historial. Cada una tiene su índice compuesto en firestore.indexes.json. */
export async function fetchHistory(search: HistoryQuery): Promise<Sale[]> {
  const constraints: QueryConstraint[] = [];
  switch (search.kind) {
    case 'range':
      if (search.sellerEmail) constraints.push(where('sellerEmails', 'array-contains', search.sellerEmail));
      constraints.push(...dateConstraints(search.range));
      break;
    case 'plate':
      constraints.push(where('plate', '==', search.plate), orderBy('date', 'desc'));
      break;
    case 'document':
      constraints.push(where('customer.documentNumber', '==', search.documentNumber), orderBy('date', 'desc'));
      break;
  }
  const snapshot = await getDocs(query(salesCollection(), ...constraints, limit(HISTORY_LIMIT)));
  return toSales(snapshot.docs);
}

// ---------- Escritura ----------

export interface NewSale {
  vehicleType: VehicleType;
  plate: string;
  vehicleLine: string;
  items: ItemInput[];
  sellers: SellerInput[];
  commissionRate: number;
  paymentMethod: PaymentMethod;
  customer: SaleCustomer | null;
  /** null = sin factura electrónica. */
  invoiceRecipient: InvoiceRecipient | null;
  notes: string;
  createdBy: { email: string; name: string };
}

/**
 * Registra la venta con el siguiente consecutivo (LC-1, LC-2, …).
 * La transacción lee y aumenta counters/sales: si dos equipos venden al mismo tiempo, Firestore
 * reintenta una de las dos, así que el número nunca se repite ni se salta.
 * `requestId` identifica el intento (se genera al abrir el formulario): reintentar con el mismo
 * requestId devuelve la venta ya creada en vez de registrar otra.
 * Cuando exista la Firebase Function, este cálculo se moverá allá (computeSaleTotals es compartido).
 */
export async function createSale(sale: NewSale, requestId: string): Promise<string> {
  const db = getDb();
  const totals = computeSaleTotals(sale.items, sale.sellers, sale.commissionRate);
  const isCredit = sale.paymentMethod === 'credit';
  const counterRef = doc(db, 'counters', 'sales');

  const requestRef = doc(db, 'saleRequests', requestId);

  return runTransaction(db, async (transaction) => {
    // Si este mismo intento ya se guardó (la respuesta se perdió y el usuario reintentó), no se duplica.
    const previous = await transaction.get(requestRef);
    const existingId = previous.data()?.saleId;
    if (typeof existingId === 'string') return existingId;

    const counter = await transaction.get(counterRef);
    const number = asNumber(counter.data()?.value) + 1;
    const id = `${ORDER_PREFIX}${number}`;

    transaction.set(counterRef, { value: number });
    transaction.set(requestRef, { saleId: id, createdBy: sale.createdBy.email });
    transaction.set(doc(db, 'sales', id), {
      number,
      requestId,
      date: serverTimestamp(),
      vehicleType: sale.vehicleType,
      plate: sale.plate,
      vehicleLine: sale.vehicleLine.trim(),
      items: totals.items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      commissionRate: sale.commissionRate,
      commission: totals.commission,
      sellers: totals.sellers,
      sellerEmails: totals.sellers.map((seller) => seller.email),
      paymentMethod: sale.paymentMethod,
      status: isCredit ? 'pending' : 'paid',
      dueDate: isCredit ? Timestamp.fromMillis(Date.now() + CREDIT_TERM_DAYS * DAY_MS) : null,
      customer: sale.customer,
      invoice: {
        // "pending" = en cola para Siigo; la integración actualizará number/cufe/pdfUrl/error.
        status: sale.invoiceRecipient ? 'pending' : 'not-requested',
        recipient: sale.invoiceRecipient,
        number: null,
        cufe: null,
        pdfUrl: null,
        error: null,
      },
      notes: sale.notes.trim(),
      createdBy: sale.createdBy,
      void: null,
    });
    return id;
  });
}

/** Anula una venta (solo admin y manager; las reglas lo validan). Nunca se borra: queda en el historial. */
export async function voidSale(id: string, reason: string, byEmail: string): Promise<void> {
  await updateDoc(doc(salesCollection(), id), {
    status: 'void',
    void: { at: serverTimestamp(), by: byEmail, reason: reason.trim() },
  });
}
