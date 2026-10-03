/** Documento de la colección `services`: el catálogo que se ofrece al registrar una venta. */
export interface Service {
  id: string;
  name: string;
  /** Aparece como acceso rápido en la venta. */
  quick: boolean;
  /** Orden de aparición (menor primero). */
  order: number;
}
