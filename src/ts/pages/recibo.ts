import '../../css/receipt.css';
import { fetchSale } from '../data/sales';
import { RECEIPT_MESSAGES } from '../features/receipt/print';
import { renderReceipt } from '../features/receipt/render';
import { currentSession, requireSession } from '../lib/auth';
import { byId } from '../ui/dom';

const params = new URLSearchParams(window.location.search);
const saleId = params.get('id') ?? '';
/** Abierto dentro del iframe de impresión automática (ver features/receipt/print.ts). */
const autoPrint = params.get('print') === '1';

function notifyParent(message: string): void {
  if (autoPrint && window.parent !== window) window.parent.postMessage(message, window.location.origin);
}

async function main(): Promise<void> {
  // Dentro del iframe de impresión no se redirige al login: se avisa a la página que imprime.
  if (autoPrint) {
    if (!(await currentSession())) {
      notifyParent(RECEIPT_MESSAGES.failed);
      return;
    }
  } else {
    await requireSession();
  }
  const sale = saleId ? await fetchSale(saleId) : null;
  if (!sale) {
    byId('receipt-status').textContent = 'No se encontró la venta.';
    notifyParent(RECEIPT_MESSAGES.failed);
    return;
  }
  renderReceipt(sale);

  if (autoPrint) {
    window.addEventListener('afterprint', () => notifyParent(RECEIPT_MESSAGES.printed), { once: true });
    // Espera a que cargue la fuente para que la tirilla salga con el tamaño correcto.
    await document.fonts.load('12px "Inter Variable"').catch(() => undefined);
    await document.fonts.ready;
    window.print();
  } else {
    byId('toolbar').hidden = false;
    byId('btn-print').addEventListener('click', () => window.print());
  }
}

main().catch((error: unknown) => {
  console.error(error);
  byId('receipt-status').textContent = 'No se pudo cargar el recibo. Revisa tu conexión e intenta de nuevo.';
  notifyParent(RECEIPT_MESSAGES.failed);
});
