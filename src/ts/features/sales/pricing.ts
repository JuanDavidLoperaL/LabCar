import type { SaleItem, SaleSeller } from '../../models/sale';

/**
 * Cálculo de totales y comisiones de una venta. Es lógica pura (sin Firebase ni DOM) para poder
 * usarla igual en el navegador y, más adelante, en la Firebase Function que registre las ventas.
 */

export interface ItemInput {
  serviceId: string | null;
  name: string;
  price: number;
  discountPercent: number;
}

export interface SellerInput {
  email: string;
  name: string;
}

export interface SaleTotals {
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  commission: number;
  sellers: SaleSeller[];
}

/** Pesos enteros: en COP no se manejan centavos. */
function toPesos(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function priceItem(input: ItemInput): SaleItem {
  const price = Math.max(0, toPesos(input.price));
  const discountPercent = clampPercent(input.discountPercent);
  const discount = toPesos((price * discountPercent) / 100);
  return { serviceId: input.serviceId, name: input.name.trim(), price, discountPercent, discount, total: price - discount };
}

/**
 * Reparte `amount` en `parts` partes enteras que suman exactamente `amount`
 * (los pesos sobrantes del redondeo van a los primeros).
 */
export function splitEvenly(amount: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(amount / parts);
  const remainder = amount - base * parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

/** La comisión se calcula sobre el valor facturado (con descuento) y se reparte por igual entre los vendedores. */
export function computeSaleTotals(items: readonly ItemInput[], sellers: readonly SellerInput[], commissionRate: number): SaleTotals {
  const priced = items.map(priceItem);
  const subtotal = priced.reduce((sum, item) => sum + item.price, 0);
  const discount = priced.reduce((sum, item) => sum + item.discount, 0);
  const total = subtotal - discount;
  const commission = toPesos(total * commissionRate);
  const shares = splitEvenly(commission, sellers.length);
  return {
    items: priced,
    subtotal,
    discount,
    total,
    commission,
    sellers: sellers.map((seller, index) => ({ email: seller.email, name: seller.name, commission: shares[index] })),
  };
}
