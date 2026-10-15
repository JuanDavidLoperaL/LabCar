import type { Sale } from '../../models/sale';
import { buildReceiptTicket } from './thermal-ticket';

/**
 * Impresión directa en la impresora térmica (Epson TM-m30II por USB) a través de QZ Tray,
 * el programa que se instala en el computador del taller y deja que la página le hable a la
 * impresora sin el diálogo de impresión del navegador.
 *
 * Se conecta sin certificado: la primera vez que la página se conecta en cada sesión, QZ Tray
 * pregunta si se permite este sitio ("Allow").
 */

/** Error con un mensaje listo para mostrarle a la persona. */
export class ThermalPrintError extends Error {}

/** Mensaje para la persona a partir de cualquier error de la impresión. */
export function thermalErrorMessage(error: unknown): string {
  if (error instanceof ThermalPrintError) return error.message;
  const detail = error instanceof Error ? error.message : String(error);
  if (/blocked|denied|rejected/i.test(detail)) {
    return 'QZ Tray no le dio permiso a esta página. Recarga e imprime de nuevo, y en la ventana de QZ Tray elige "Allow".';
  }
  return `No se pudo imprimir la tirilla (${detail}).`;
}

const PREFERRED_PRINTER = /tm-?m30|epson|receipt|thermal|pos/i;
const VIRTUAL_PRINTER = /pdf|xps|onenote|fax|microsoft|save as|file|anydesk/i;

/** Se carga solo al imprimir: el resto de páginas no necesitan QZ Tray. */
async function connect() {
  const { default: qz } = await import('qz-tray');
  qz.security.setCertificatePromise((resolve) => resolve(''));
  qz.security.setSignaturePromise(() => (resolve) => resolve(''));
  if (!qz.websocket.isActive()) {
    try {
      await qz.websocket.connect({ retries: 1, delay: 1 });
    } catch (error) {
      console.error(error);
      throw new ThermalPrintError(
        'No se pudo conectar con QZ Tray. Verifica que esté abierto en este computador (ícono junto al reloj) y vuelve a intentar.',
      );
    }
  }
  return qz;
}

/** La Epson si está; si no, la primera impresora física (las de PDF y similares no sirven). */
export function pickPrinter(printers: readonly string[]): string | null {
  return (
    printers.find((name) => PREFERRED_PRINTER.test(name) && !VIRTUAL_PRINTER.test(name)) ??
    printers.find((name) => !VIRTUAL_PRINTER.test(name)) ??
    null
  );
}

let inFlight: Promise<void> | null = null;

/** Imprime la tirilla de la venta. Si ya hay una impresión en curso, devuelve esa (no imprime dos veces). */
export function printThermalReceipt(sale: Sale): Promise<void> {
  inFlight ??= (async () => {
    const qz = await connect();
    const found = await qz.printers.find();
    const printers = (Array.isArray(found) ? found : [found]).filter(Boolean);
    const printer = pickPrinter(printers);
    if (!printer) {
      // QZ Tray lee las impresoras de Windows al abrir: si la Epson se instaló con QZ Tray abierto, no la ve.
      throw new ThermalPrintError(
        printers.length === 0
          ? 'QZ Tray no ve ninguna impresora. Cierra QZ Tray (clic derecho en su ícono → Exit), ábrelo de nuevo y vuelve a imprimir.'
          : `QZ Tray no encontró la Epson. Impresoras que ve: ${printers.join(', ')}. Si la Epson se instaló hace poco, cierra QZ Tray (clic derecho → Exit) y ábrelo de nuevo.`,
      );
    }
    console.info(`Imprimiendo en "${printer}" (impresoras disponibles: ${printers.join(', ')})`);
    const ticket = await buildReceiptTicket(sale);
    try {
      await qz.print(qz.configs.create(printer), [{ type: 'raw', format: 'base64', data: ticket }]);
    } catch (error) {
      console.error(error);
      throw new ThermalPrintError(`La impresora "${printer}" no recibió la tirilla. Revisa que tenga papel y esté encendida.`);
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
