import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { DEFAULT_OVERDUE_DAYS, MAX_OVERDUE_DAYS, MIN_OVERDUE_DAYS } from '../../src/ts/config/business';
import type { InvoiceSale } from '../../src/ts/integrations/alegra/mapping';
import type {
  DocumentType,
  InvoiceCreditNote,
  PaymentMethod,
  PersonType,
  SaleCustomer,
  SaleInvoice,
  SaleItem,
  SaleStatus,
  TaxRegime,
} from '../../src/ts/models/sale';

/** Lo que el servidor lee de una venta para facturarla. */
export interface ServerSale extends InvoiceSale {
  status: SaleStatus;
  customer: SaleCustomer | null;
  invoice: SaleInvoice;
}

type Raw = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const strOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const rec = (value: unknown): Raw | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : null);
const date = (value: unknown): Date | null => (value instanceof Timestamp ? value.toDate() : null);

function parseCustomer(data: Raw | null): SaleCustomer | null {
  if (!data) return null;
  return {
    documentType: (str(data.documentType) || 'CC') as DocumentType,
    documentNumber: str(data.documentNumber),
    verificationDigit: strOrNull(data.verificationDigit),
    personType: (str(data.personType) || 'natural') as PersonType,
    name: str(data.name),
    phone: str(data.phone),
    email: str(data.email),
    address: str(data.address),
    city: str(data.city),
    taxRegime: (strOrNull(data.taxRegime) as TaxRegime | null) ?? null,
  };
}

function parseInvoice(data: Raw | null): SaleInvoice {
  const note = rec(data?.creditNote);
  const noteAt = date(note?.at);
  const creditNote: InvoiceCreditNote | null = note && noteAt && typeof note.id === 'string'
    ? { id: note.id, number: strOrNull(note.number), cufe: strOrNull(note.cufe), at: noteAt, reason: str(note.reason) }
    : null;
  return {
    status: (str(data?.status) || 'not-requested') as SaleInvoice['status'],
    recipient: (strOrNull(data?.recipient) as SaleInvoice['recipient']) ?? null,
    number: strOrNull(data?.number),
    cufe: strOrNull(data?.cufe),
    pdfUrl: strOrNull(data?.pdfUrl),
    error: strOrNull(data?.error),
    providerId: strOrNull(data?.providerId),
    creditNote,
  };
}

export async function loadSale(id: string): Promise<ServerSale | null> {
  const snapshot = await getFirestore().collection('sales').doc(id).get();
  const data = snapshot.data();
  const saleDate = date(data?.date);
  if (!data || !saleDate) return null;
  const items = Array.isArray(data.items) ? data.items.map(rec).filter((item): item is Raw => item !== null) : [];
  return {
    id: snapshot.id,
    date: saleDate,
    items: items.map((item): SaleItem => ({
      serviceId: strOrNull(item.serviceId),
      name: str(item.name),
      price: num(item.price),
      discountPercent: num(item.discountPercent),
      discount: num(item.discount),
      total: num(item.total),
    })),
    total: num(data.total),
    paymentMethod: (str(data.paymentMethod) || 'cash') as PaymentMethod,
    plate: str(data.plate),
    vehicleLine: str(data.vehicleLine),
    status: (str(data.status) || 'paid') as SaleStatus,
    customer: parseCustomer(rec(data.customer)),
    invoice: parseInvoice(rec(data.invoice)),
  };
}

export async function saveInvoice(id: string, invoice: SaleInvoice): Promise<void> {
  const { creditNote } = invoice;
  await getFirestore().collection('sales').doc(id).update({
    invoice: { ...invoice, creditNote: creditNote ? { ...creditNote, at: Timestamp.fromDate(creditNote.at) } : null },
  });
}

/** Días de mora configurados (settings/receivables): son el plazo de las facturas a crédito. */
export async function overdueDays(): Promise<number> {
  const snapshot = await getFirestore().collection('settings').doc('receivables').get();
  const days = snapshot.data()?.overdueDays;
  return typeof days === 'number' && Number.isInteger(days) && days >= MIN_OVERDUE_DAYS && days <= MAX_OVERDUE_DAYS
    ? days
    : DEFAULT_OVERDUE_DAYS;
}
