import { formatCOP } from '../../lib/format';
import { PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS, type PaymentMethod, type VehicleType } from '../../models/sale';
import { byId } from '../../ui/dom';
import { cloneTemplate, field, setField } from '../../ui/template';
import { formatPlate } from './plate';
import type { SaleTotals } from './pricing';

export interface TicketData {
  totals: SaleTotals;
  plate: string;
  vehicleType: VehicleType;
  vehicleLine: string;
  paymentMethod: PaymentMethod | null;
  commissionRate: number;
}

function setText(id: string, text: string): void {
  byId(id).textContent = text;
}

/** Resumen en vivo de la venta (columna derecha). */
export function renderTicket({ totals, plate, vehicleType, vehicleLine, paymentMethod, commissionRate }: TicketData): void {
  setText('ticket-plate', plate ? formatPlate(plate) : '———');
  setText('ticket-type', VEHICLE_TYPE_LABELS[vehicleType]);
  setText('ticket-line', vehicleLine.trim());

  const rows = totals.items.map((item) => {
    const row = cloneTemplate<HTMLLIElement>('tpl-ticket-item');
    setField(row, 'name', item.name || 'Servicio sin nombre');
    setField(row, 'total', formatCOP(item.total));
    const discount = field(row, 'discount');
    discount.hidden = item.discount === 0;
    discount.textContent = `Desc. ${item.discountPercent}% (−${formatCOP(item.discount)})`;
    return row;
  });
  byId('ticket-items').replaceChildren(...rows);
  byId('ticket-items-empty').hidden = rows.length > 0;

  setText('ticket-subtotal', formatCOP(totals.subtotal));
  setText('ticket-discount', totals.discount > 0 ? `−${formatCOP(totals.discount)}` : formatCOP(0));
  setText('ticket-payment', paymentMethod ? PAYMENT_METHOD_LABELS[paymentMethod] : 'Sin seleccionar');
  setText('ticket-sellers', totals.sellers.map((seller) => seller.name).join(', ') || 'Sin seleccionar');
  setText('ticket-total', formatCOP(totals.total));
  setText('btn-submit-text', totals.total > 0 ? `Registrar venta (${formatCOP(totals.total)})` : 'Registrar venta');

  const percent = Math.round(commissionRate * 100);
  const sellers = totals.sellers.length;
  setText(
    'commission-hint',
    sellers === 0
      ? ''
      : sellers === 1
        ? `Comisión ${percent}%: ${formatCOP(totals.commission)} para ${totals.sellers[0].name}`
        : `Comisión ${percent}% (${formatCOP(totals.commission)}) repartida entre ${sellers}: ≈ ${formatCOP(totals.sellers[0].commission)} c/u`,
  );
}
