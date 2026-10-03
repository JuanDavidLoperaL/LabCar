/** Mensajes que el recibo (dentro de un iframe) le envía a la página que lo imprime. */
export const RECEIPT_MESSAGES = { printed: 'labcar:receipt-printed', failed: 'labcar:receipt-failed' } as const;

/** closed = se cerró el diálogo de impresión · opened = se abrió el recibo en otra pestaña · unknown = sin confirmación. */
export type PrintOutcome = 'closed' | 'opened' | 'unknown';

/** Si el navegador no avisa que se cerró el diálogo, se deja de esperar (no significa que falló). */
const PRINT_WAIT_MS = 60 * 1000;

function receiptUrl(saleId: string, autoPrint: boolean): string {
  return `/html/recibo.html?id=${encodeURIComponent(saleId)}${autoPrint ? '&print=1' : ''}`;
}

/** iPhone/iPad imprimen la página completa en vez del iframe: allá se abre el recibo en otra pestaña. */
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

let inFlight: Promise<PrintOutcome> | null = null;

/**
 * Imprime el recibo de una venta sin salir de la página: lo carga en un iframe oculto que abre
 * el diálogo de impresión. Si ya hay una impresión en curso, devuelve esa misma (no abre dos diálogos).
 */
export function printReceipt(saleId: string): Promise<PrintOutcome> {
  if (isIOS()) {
    const opened = window.open(receiptUrl(saleId, false), '_blank', 'noopener');
    return opened === null ? Promise.reject(new Error('El navegador bloqueó la ventana del recibo.')) : Promise.resolve('opened');
  }
  inFlight ??= new Promise<PrintOutcome>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.title = 'Recibo para imprimir';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';

    const finish = (outcome: PrintOutcome | Error) => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      frame.remove();
      inFlight = null;
      if (outcome instanceof Error) reject(outcome);
      else resolve(outcome);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
      if (event.data === RECEIPT_MESSAGES.printed) finish('closed');
      if (event.data === RECEIPT_MESSAGES.failed) finish(new Error('No se pudo cargar el recibo para imprimir.'));
    };
    const timer = window.setTimeout(() => finish('unknown'), PRINT_WAIT_MS);

    window.addEventListener('message', onMessage);
    frame.src = receiptUrl(saleId, true);
    document.body.append(frame);
  });
  return inFlight;
}
