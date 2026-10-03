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

/** Días de plazo para pagar una venta a crédito (fecha límite en cartera). */
export const CREDIT_TERM_DAYS = 15;
