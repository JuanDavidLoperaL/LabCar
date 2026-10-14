import type { DocumentType, PersonType, TaxRegime } from './sale';

/**
 * Cliente registrado por el administrador en Servicios y Clientes (colección customers/,
 * ID = "{tipo}-{número}", ej. "CC-1020456789", así no se repite). En Nueva Venta se usa para
 * llenar los datos del cliente de una venta a crédito o con factura a su nombre; lo que se edite
 * en la venta no cambia el cliente guardado.
 */
export interface Customer {
  id: string;
  documentType: DocumentType;
  documentNumber: string;
  personType: PersonType;
  name: string;
  phone: string;
  /** Opcionales: solo se necesitan para facturar a nombre del cliente. */
  email: string;
  city: string;
  address: string;
  taxRegime: TaxRegime;
}

export type CustomerInput = Omit<Customer, 'id'>;

export function customerId(documentType: DocumentType, documentNumber: string): string {
  return `${documentType}-${documentNumber}`;
}
