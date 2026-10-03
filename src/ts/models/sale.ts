export const VEHICLE_TYPES = ['car', 'motorcycle'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const PAYMENT_METHODS = ['cash', 'transfer', 'credit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SALE_STATUSES = ['paid', 'pending'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  credit: 'Crédito',
};

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  paid: 'Pagado',
  pending: 'Por cobrar',
};

/** Documento de la colección `sales`. Valores en pesos colombianos. */
export interface Sale {
  id: string;
  date: Date;
  plate: string;
  /** Línea del vehículo, ej. "Mazda 3 Touring". */
  vehicleLine: string;
  vehicleType: VehicleType;
  customerName: string;
  serviceName: string;
  sellerId: string;
  sellerName: string;
  paymentMethod: PaymentMethod;
  total: number;
  status: SaleStatus;
  /** Fecha límite de pago para ventas a crédito. */
  dueDate: Date | null;
  /** Comisión del vendedor/detallador por esta venta. */
  commission: number;
}
