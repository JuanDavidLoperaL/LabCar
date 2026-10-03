import { isValidDocumentNumber, isValidEmail, isValidPhone } from '../../lib/dian';
import type { DocumentType, InvoiceRecipient, PaymentMethod, VehicleType } from '../../models/sale';
import type { ItemValue } from './items-editor';
import { isValidPlate } from './plate';

/** Valores del formulario ya normalizados (placa sin guion, documento y celular solo dígitos, etc.). */
export interface SaleFormValues {
  sellerEmails: string[];
  vehicleType: VehicleType;
  plate: string;
  plateOther: boolean;
  vehicleLine: string;
  items: ItemValue[];
  paymentMethod: PaymentMethod | null;
  invoiceEnabled: boolean;
  invoiceRecipient: InvoiceRecipient;
  customer: {
    documentType: DocumentType;
    documentNumber: string;
    name: string;
    phone: string;
    email: string;
    city: string;
    address: string;
  };
}

/** Límites (iguales a los de firestore.rules). */
export const MAX_SELLERS = 4;
export const MAX_ITEMS = 20;
export const MAX_PRICE = 99_999_999;

export type FieldName =
  | 'sellers'
  | 'plate'
  | 'vehicleLine'
  | 'items'
  | 'paymentMethod'
  | 'documentNumber'
  | 'customerName'
  | 'phone'
  | 'email'
  | 'city'
  | 'address';

/** Orden en que aparecen en pantalla: el primer error se enfoca primero. */
export const FIELD_ORDER: readonly FieldName[] = [
  'sellers',
  'plate',
  'vehicleLine',
  'items',
  'paymentMethod',
  'documentNumber',
  'customerName',
  'phone',
  'email',
  'city',
  'address',
];

export interface ValidationResult {
  fields: Partial<Record<FieldName, string>>;
  /** Errores por fila de servicio (clave de la fila → mensaje). */
  items: Map<string, string>;
}

/** Qué datos del cliente se piden: por venta a crédito (cartera) y/o factura a nombre del cliente. */
export function customerRequirement(values: Pick<SaleFormValues, 'paymentMethod' | 'invoiceEnabled' | 'invoiceRecipient'>) {
  return {
    credit: values.paymentMethod === 'credit',
    invoice: values.invoiceEnabled && values.invoiceRecipient === 'customer',
  };
}

export function hasErrors(result: ValidationResult): boolean {
  return Object.keys(result.fields).length > 0 || result.items.size > 0;
}

export function validateSale(values: SaleFormValues): ValidationResult {
  const fields: ValidationResult['fields'] = {};
  const items = new Map<string, string>();

  if (values.sellerEmails.length === 0) fields.sellers = 'Selecciona al menos un vendedor.';
  else if (values.sellerEmails.length > MAX_SELLERS) fields.sellers = `Máximo ${MAX_SELLERS} vendedores por venta.`;

  if (!values.plate) fields.plate = 'Escribe la placa.';
  else if (!isValidPlate(values.plate, values.vehicleType, values.plateOther)) {
    fields.plate = values.plateOther
      ? 'La placa debe tener entre 3 y 10 letras o números.'
      : values.vehicleType === 'car'
        ? 'Placa de carro inválida: 3 letras y 3 números (ABC-123).'
        : 'Placa de moto inválida: 3 letras, 2 números y 1 letra (ABC-12D).';
  }

  if (values.vehicleLine.trim().length < 2) fields.vehicleLine = 'Escribe la línea del vehículo (y el color si quieres).';

  if (values.items.length === 0) fields.items = 'Agrega al menos un servicio.';
  else if (values.items.length > MAX_ITEMS) fields.items = `Máximo ${MAX_ITEMS} servicios por venta.`;
  for (const item of values.items) {
    if (item.name.trim().length < 2) items.set(item.key, 'Escribe el nombre del servicio.');
    else if (item.price <= 0) items.set(item.key, 'Escribe el precio.');
    else if (item.price > MAX_PRICE) items.set(item.key, 'El precio es demasiado alto.');
    else if (!Number.isInteger(item.discountPercent) || item.discountPercent < 0 || item.discountPercent > 100) {
      items.set(item.key, 'El descuento debe estar entre 0 y 100%.');
    }
  }

  if (!values.paymentMethod) fields.paymentMethod = 'Selecciona la forma de pago.';

  const required = customerRequirement(values);
  if (required.credit || required.invoice) {
    const { customer } = values;
    if (!isValidDocumentNumber(customer.documentNumber, customer.documentType)) {
      fields.documentNumber = 'Escribe un número de documento válido.';
    }
    if (customer.name.trim().length < 3) fields.customerName = 'Escribe el nombre del cliente.';
    if (required.credit && !isValidPhone(customer.phone)) fields.phone = 'Escribe un celular válido (10 dígitos, empieza por 3).';
    else if (customer.phone && !isValidPhone(customer.phone)) fields.phone = 'El celular debe tener 10 dígitos y empezar por 3.';
    if (required.invoice) {
      if (!isValidEmail(customer.email)) fields.email = 'Escribe un correo válido para enviar la factura.';
      if (customer.city.trim().length < 3) fields.city = 'Escribe la ciudad.';
      if (customer.address.trim().length < 5) fields.address = 'Escribe la dirección.';
    }
  }

  return { fields, items };
}
