/** Datos del negocio que aparecen en el recibo y en la factura electrónica. */
export const BUSINESS = {
  name: 'LAB CAR',
  tagline: 'Estética Automotriz',
  ownerName: 'Juan Miguel López González',
  nit: '1039474010',
  city: 'Medellín, Antioquia',
} as const;

/** Prefijo de las órdenes de venta: LC-1, LC-2, … (también es el ID del documento en Firestore). */
export const ORDER_PREFIX = 'LC-';

/** Comisión por defecto mientras el administrador no la configure (settings/commissions). */
export const DEFAULT_COMMISSION_RATE = 0.4;

/** Días desde la venta a partir de los cuales un crédito está en mora, mientras el administrador no lo cambie (settings/receivables). */
export const DEFAULT_OVERDUE_DAYS = 30;
export const MIN_OVERDUE_DAYS = 1;
export const MAX_OVERDUE_DAYS = 365;

/**
 * WhatsApp de LAB CAR para cobrar. El enlace de WhatsApp no puede elegir el número que envía:
 * sale desde la cuenta abierta en el equipo, por eso se le recuerda a quien cobra cuál debe ser.
 */
export const BUSINESS_WHATSAPP = '3114179913';

/**
 * Cuenta para que los clientes paguen por transferencia (aparece en el recordatorio de cobro).
 * PENDIENTE: es una cuenta de ejemplo. Al poner la cuenta real de LAB CAR cambia `isPlaceholder`
 * a false y desaparece el aviso de "cuenta de ejemplo" en el mensaje de cobro.
 */
export const PAYMENT_ACCOUNT = {
  bank: 'Bancolombia',
  type: 'Cuenta de ahorros',
  number: '000-000000-00',
  holder: 'LAB CAR',
  isPlaceholder: true,
} as const;
