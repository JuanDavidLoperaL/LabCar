import { isValidDocumentNumber, isValidEmail, isValidPhone, normalizeDocumentNumber, normalizePhone } from '../../lib/dian';
import { customerId, type Customer, type CustomerInput } from '../../models/customer';
import type { DocumentType, PersonType, TaxRegime } from '../../models/sale';

export interface CustomerDraft {
  documentType: DocumentType;
  documentNumber: string;
  personType: PersonType;
  name: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  taxRegime: TaxRegime;
}

export type CustomerField = 'documentNumber' | 'name' | 'phone' | 'email' | 'city' | 'address';

export type CustomerResult = { ok: true; customer: CustomerInput } | { ok: false; errors: Partial<Record<CustomerField, string>> };

/**
 * Cédula, nombre y celular son obligatorios (los pide una venta a crédito). Correo, ciudad y
 * dirección son opcionales: solo hacen falta si se le factura a su nombre, y se pueden completar en la venta.
 */
export function validateCustomer(draft: CustomerDraft, customers: readonly Customer[], editingId: string | null): CustomerResult {
  const errors: Partial<Record<CustomerField, string>> = {};
  const documentNumber = normalizeDocumentNumber(draft.documentNumber, draft.documentType);
  const phone = normalizePhone(draft.phone);
  const email = draft.email.trim().toLowerCase();
  const name = draft.name.trim().replace(/\s+/g, ' ');

  if (!isValidDocumentNumber(documentNumber, draft.documentType)) errors.documentNumber = 'Escribe un número de documento válido.';
  else {
    const id = customerId(draft.documentType, documentNumber);
    if (id !== editingId && customers.some((customer) => customer.id === id)) errors.documentNumber = 'Ya hay un cliente con ese documento.';
  }
  if (name.length < 3) errors.name = 'Escribe el nombre del cliente.';
  if (!isValidPhone(phone)) errors.phone = 'Escribe un celular válido (10 dígitos, empieza por 3).';
  if (email && !isValidEmail(email)) errors.email = 'Escribe un correo válido o déjalo vacío.';
  if (draft.city.trim() && draft.city.trim().length < 3) errors.city = 'Escribe la ciudad o déjala vacía.';
  if (draft.address.trim() && draft.address.trim().length < 5) errors.address = 'Escribe la dirección o déjala vacía.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    customer: {
      documentType: draft.documentType,
      documentNumber,
      personType: draft.personType,
      name,
      phone,
      email,
      city: draft.city.trim(),
      address: draft.address.trim(),
      taxRegime: draft.taxRegime,
    },
  };
}
