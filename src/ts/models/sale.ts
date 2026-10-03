export const VEHICLE_TYPES = ['car', 'motorcycle'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  car: 'Carro',
  motorcycle: 'Moto',
};

export const PAYMENT_METHODS = ['cash', 'transfer', 'credit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  credit: 'Crédito',
};

/** paid = pagada · pending = a crédito, en cartera · void = anulada (no cuenta en ningún total). */
export const SALE_STATUSES = ['paid', 'pending', 'void'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  paid: 'Pagado',
  pending: 'Por cobrar',
  void: 'Anulada',
};

/** Un servicio dentro de la venta. Valores en pesos colombianos. */
export interface SaleItem {
  /** ID del servicio del catálogo; null si fue un servicio personalizado. */
  serviceId: string | null;
  name: string;
  /** Precio antes de descuento. */
  price: number;
  /** Descuento en % (0–100). */
  discountPercent: number;
  /** Valor del descuento en pesos. */
  discount: number;
  /** price − discount. */
  total: number;
}

/** Vendedor de la venta y su parte de la comisión. */
export interface SaleSeller {
  /** Correo del usuario (ID del documento en users/). */
  email: string;
  name: string;
  commission: number;
}

export interface SaleCustomer {
  documentType: DocumentType;
  documentNumber: string;
  /** Dígito de verificación (solo NIT). */
  verificationDigit: string | null;
  personType: PersonType;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  taxRegime: TaxRegime | null;
}

export const DOCUMENT_TYPES = ['CC', 'NIT', 'CE', 'PP'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const PERSON_TYPES = ['natural', 'legal'] as const;
export type PersonType = (typeof PERSON_TYPES)[number];

export const TAX_REGIMES = ['not-vat-responsible', 'vat-responsible'] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];

/**
 * Estado de la factura electrónica (DIAN vía Siigo):
 * not-requested → no se pidió · pending → en cola para enviarse a Siigo ·
 * issued → emitida · error → Siigo la rechazó (ver `error`).
 */
export const INVOICE_STATUSES = ['not-requested', 'pending', 'issued', 'error'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  'not-requested': 'Sin factura electrónica',
  pending: 'Factura electrónica pendiente',
  issued: 'Factura electrónica emitida',
  error: 'Error en factura electrónica',
};

/** customer = con los datos del cliente · final-consumer = a nombre de "consumidor final". */
export const INVOICE_RECIPIENTS = ['customer', 'final-consumer'] as const;
export type InvoiceRecipient = (typeof INVOICE_RECIPIENTS)[number];

export interface SaleInvoice {
  status: InvoiceStatus;
  recipient: InvoiceRecipient | null;
  /** Datos que llenará la integración con Siigo al emitir. */
  number: string | null;
  cufe: string | null;
  pdfUrl: string | null;
  error: string | null;
}

/** Documento de la colección `sales` (ID = número de orden, ej. "LC-1049"). */
export interface Sale {
  id: string;
  /** Consecutivo de la orden; null en datos antiguos o de prueba. */
  number: number | null;
  date: Date;
  vehicleType: VehicleType;
  plate: string;
  /** Texto libre: línea, color, etc. Ej. "Mazda 3 gris". */
  vehicleLine: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  /** Porcentaje de comisión aplicado (0.4 = 40%), repartido entre los vendedores. */
  commissionRate: number;
  commission: number;
  sellers: SaleSeller[];
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  /** Fecha límite de pago (ventas a crédito). */
  dueDate: Date | null;
  customer: SaleCustomer | null;
  invoice: SaleInvoice;
  notes: string;
  createdBy: { email: string; name: string };
  void: { at: Date; by: string; reason: string } | null;
}
