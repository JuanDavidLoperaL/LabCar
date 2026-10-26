import type { PaymentMethod, Sale, SaleCustomer } from '../../models/sale';

/**
 * Conversión de una venta de LAB CAR al formato de Alegra. Lógica pura (sin Firebase, DOM ni red):
 * se puede llevar tal cual a Firebase Functions.
 *
 * Valores de Alegra para Colombia: https://developer.alegra.com/reference/colombia
 */

/** Medio de pago DIAN según cómo pagó el cliente. El crédito no lleva medio (forma de pago CREDIT). */
const PAYMENT_METHODS: Record<Exclude<PaymentMethod, 'credit'>, string> = {
  cash: 'CASH',
  transfer: 'DEBIT_TRANSFER',
};

const IDENTIFICATION_TYPES: Record<SaleCustomer['documentType'], string> = {
  CC: 'CC',
  NIT: 'NIT',
  CE: 'CE',
  PP: 'PP',
};

export interface AlegraLine {
  id: string;
  price: number;
  quantity: number;
  /** Descuento en % (sin el símbolo). */
  discount: number;
  /** Unidad de medida que exige la DIAN: LAB CAR solo vende servicios. */
  unit: 'service';
}

export interface AlegraInvoicePayload {
  date: string;
  dueDate: string;
  client: { id: string };
  items: AlegraLine[];
  paymentForm: 'CASH' | 'CREDIT';
  paymentMethod?: string;
  status: 'draft';
  anotation: string;
}

export interface AlegraContactPayload {
  name: string;
  nameObject?: { firstName: string; lastName: string };
  identificationObject: { type: string; number: string; dv?: string };
  kindOfPerson: 'PERSON_ENTITY' | 'LEGAL_ENTITY';
  regime: 'COMMON_REGIME' | 'SIMPLIFIED_REGIME';
  email?: string;
  mobile?: string;
  address?: { address: string; city: string; department: string };
  type: ['client'];
}

export interface AlegraCreditNotePayload {
  date: string;
  client: { id: string };
  items: AlegraLine[];
  invoices: { id: string; amount: number }[];
  cause: string;
  type: 'VOID_ELECTRONIC_INVOICE';
  creditNoteOperationType: 'REFERENCE_TO_ELECTRONIC_INVOICE';
  stamp: { generateStamp: true };
}

/** "AAAA-MM-DD" en hora de Colombia. */
export function alegraDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(date);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Municipios que Alegra reconoce, con su departamento (Alegra los pide por separado y LAB CAR guarda
 * la ciudad como texto libre: "Medellín, Antioquia", "medellin"). Clientes del Valle de Aburrá y
 * el oriente antioqueño; si la ciudad no está aquí, el cliente se crea sin dirección.
 */
const KNOWN_CITIES: readonly { city: string; department: string }[] = [
  'Medellín', 'Envigado', 'Itagüí', 'Sabaneta', 'Bello', 'La Estrella', 'Caldas', 'Copacabana', 'Girardota',
  'Barbosa', 'Rionegro', 'Marinilla', 'El Retiro', 'La Ceja', 'Guarne', 'El Carmen de Viboral', 'Santa Fe de Antioquia',
].map((city) => ({ city, department: 'Antioquia' }));

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** "Medellín, Antioquia" / "medellin" → { city: 'Medellín', department: 'Antioquia' }; null si no se reconoce. */
export function resolveCity(text: string): { city: string; department: string } | null {
  const city = normalize(text.split(',')[0] ?? '');
  return KNOWN_CITIES.find((known) => normalize(known.city) === city) ?? null;
}

/** Persona natural: Alegra pide nombre y apellido por separado ("Juan Pérez Gómez" → "Juan" / "Pérez Gómez"). */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const words = fullName.trim().split(/\s+/);
  return words.length > 1 ? { firstName: words[0], lastName: words.slice(1).join(' ') } : { firstName: words[0] ?? '', lastName: words[0] ?? '' };
}

export function contactPayload(customer: SaleCustomer): AlegraContactPayload {
  const natural = customer.personType === 'natural';
  const location = resolveCity(customer.city);
  return {
    name: customer.name.trim(),
    ...(natural && { nameObject: splitName(customer.name) }),
    identificationObject: {
      type: IDENTIFICATION_TYPES[customer.documentType],
      number: customer.documentNumber,
      ...(customer.verificationDigit && { dv: customer.verificationDigit }),
    },
    kindOfPerson: natural ? 'PERSON_ENTITY' : 'LEGAL_ENTITY',
    regime: customer.taxRegime === 'vat-responsible' ? 'COMMON_REGIME' : 'SIMPLIFIED_REGIME',
    ...(customer.email && { email: customer.email }),
    ...(customer.phone && { mobile: customer.phone }),
    ...(location && { address: { address: customer.address, ...location } }),
    type: ['client'],
  };
}

/** Líneas de la factura: cada servicio con su precio y su descuento (LAB CAR no cobra IVA). */
export function invoiceLines(sale: Sale, itemIds: ReadonlyMap<string, string>): AlegraLine[] {
  return sale.items.map((item) => {
    const id = itemIds.get(item.name);
    if (!id) throw new Error(`Falta el ítem de Alegra para "${item.name}".`);
    // El nombre del servicio ya es el del ítem en Alegra: no se repite como descripción.
    return { id, price: item.price, quantity: 1, discount: item.discountPercent, unit: 'service' };
  });
}

/** Marca de la venta en las notas de la factura: "Orden LC-80". */
export function saleTag(saleId: string): string {
  return `Orden ${saleId}`;
}

/** La factura de Alegra es de esta venta (Alegra reutiliza IDs de borradores borrados). */
export function belongsToSale(anotation: string, saleId: string): boolean {
  return anotation.split(' · ')[0]?.trim() === saleTag(saleId);
}

/**
 * Factura en borrador: se crea así para comparar su total con el de la venta antes de enviarla a
 * la DIAN. La numeración es la preferida de la cuenta (la resolución vigente).
 */
export function invoicePayload(sale: Sale, clientId: string, itemIds: ReadonlyMap<string, string>, creditDays: number): AlegraInvoicePayload {
  const credit = sale.paymentMethod === 'credit';
  return {
    date: alegraDate(sale.date),
    dueDate: alegraDate(credit ? addDays(sale.date, creditDays) : sale.date),
    client: { id: clientId },
    items: invoiceLines(sale, itemIds),
    paymentForm: credit ? 'CREDIT' : 'CASH',
    ...(sale.paymentMethod !== 'credit' && { paymentMethod: PAYMENT_METHODS[sale.paymentMethod] }),
    status: 'draft',
    anotation: [saleTag(sale.id), sale.plate && `Placa ${sale.plate}`, sale.vehicleLine].filter(Boolean).join(' · '),
  };
}

/** Nota crédito que anula por completo una factura ya emitida ante la DIAN. */
export function voidCreditNotePayload(
  sale: Sale,
  invoiceId: string,
  clientId: string,
  itemIds: ReadonlyMap<string, string>,
  reason: string,
  today: Date,
): AlegraCreditNotePayload {
  return {
    date: alegraDate(today),
    client: { id: clientId },
    items: invoiceLines(sale, itemIds),
    invoices: [{ id: invoiceId, amount: sale.total }],
    cause: reason.trim() || `Anulación de la orden ${sale.id}`,
    type: 'VOID_ELECTRONIC_INVOICE',
    creditNoteOperationType: 'REFERENCE_TO_ELECTRONIC_INVOICE',
    stamp: { generateStamp: true },
  };
}
