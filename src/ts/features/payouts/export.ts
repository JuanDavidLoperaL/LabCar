import { formatShortDateTime } from '../../lib/format';
import { formatPlate } from '../sales/plate';
import { itemsSummary } from '../sales/summary';
import { ENTRY_STATE_LABELS, type PayoutEntry, type Settlement } from './calculation';

/**
 * Exporta la liquidación a CSV para abrirla en Excel. Usa ";" como separador (Excel en español lo
 * espera así porque la coma es el separador decimal) y BOM para que respete las tildes.
 */

const SEPARATOR = ';';

function cell(value: string | number): string {
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function settlementCsv(settlement: Settlement, includeCompanyShare: boolean): string {
  const header = ['Fecha', 'Orden', 'Cliente', 'Placa', 'Vehículo', 'Servicios', 'Vendedores'];
  if (includeCompanyShare) header.push('Valor venta (su parte)');
  header.push('Comisión');
  if (includeCompanyShare) header.push('LAB CAR');
  header.push('Estado', 'Semana');

  const row = (entry: PayoutEntry, week: string) => {
    const { sale } = entry;
    const values: (string | number)[] = [
      formatShortDateTime(sale.date),
      sale.id,
      sale.customer?.name || 'Consumidor final',
      formatPlate(sale.plate),
      sale.vehicleLine,
      itemsSummary(sale),
      entry.sellerCount,
    ];
    if (includeCompanyShare) values.push(entry.sold);
    values.push(entry.commission);
    if (includeCompanyShare) values.push(entry.company);
    values.push(ENTRY_STATE_LABELS[entry.state], week);
    return values.map(cell).join(SEPARATOR);
  };

  return [
    header.map(cell).join(SEPARATOR),
    ...settlement.carryover.map((entry) => row(entry, 'Anterior sin pagar')),
    ...settlement.week.map((entry) => row(entry, 'Esta semana')),
  ].join('\r\n');
}

/** "Carlos Mendoza" → "carlos-mendoza" (para el nombre del archivo). */
function slug(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function downloadCsv(csv: string, employeeName: string, weekId: string): void {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `liquidacion-${slug(employeeName) || 'empleado'}-${weekId}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
