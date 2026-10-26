import { isValidEmail } from '../../lib/dian';
import { formatShortDateTime } from '../../lib/format';
import type { Sale } from '../../models/sale';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';
import {
  deleteSaleInvoiceDraft,
  emailSaleInvoice,
  invoiceErrorMessage,
  issueSaleInvoice,
  previewSaleInvoice,
  refreshSaleInvoice,
  saleInvoicePdf,
} from '../invoicing/service';

export interface InvoiceActionsOptions {
  /** Emitir, ver, enviar y consultar: quien registra ventas. */
  canOperate: boolean;
  /** Anular (nota crédito) y eliminar borradores: admin y manager. */
  canVoid: boolean;
  /** Se llama con la venta actualizada para repintar el detalle y la lista. */
  onChange: (sale: Sale) => void;
  /** Abre el formulario de anulación en modo "solo la factura". */
  onRequestVoid: () => void;
}

/** Texto bajo el total: número, CUFE, nota crédito o el error de la última emisión. */
function detailText(sale: Sale): string {
  const { invoice } = sale;
  switch (invoice.status) {
    case 'issued':
      return [`Factura ${invoice.number ?? '(sin número)'} aceptada por la DIAN.`, invoice.cufe && `CUFE: ${invoice.cufe}`].filter(Boolean).join('\n');
    case 'voided': {
      const note = invoice.creditNote;
      return note
        ? `Factura ${invoice.number ?? ''} anulada con la nota crédito ${note.number ?? note.id} el ${formatShortDateTime(note.at)}. Motivo: ${note.reason}`
        : `Factura ${invoice.number ?? ''} anulada.`;
    }
    case 'error':
      return `No se pudo emitir: ${invoice.error ?? 'error desconocido'}.${invoice.providerId ? ' Hay un borrador en Alegra.' : ''}`;
    case 'pending':
      return 'Falta emitir la factura electrónica.';
    default:
      return '';
  }
}

/**
 * Acciones de la factura electrónica en el detalle de una venta. Devuelve la función que las pinta
 * para la venta abierta.
 */
export function setupInvoiceActions(options: InvoiceActionsOptions): (sale: Sale) => void {
  const section = byId('invoice-actions');
  const message = byId('invoice-message');
  const emailForm = byId<HTMLFormElement>('invoice-email-form');
  const emailInput = byId<HTMLInputElement>('invoice-email');
  const buttons = {
    issue: byId<HTMLButtonElement>('btn-invoice-issue'),
    preview: byId<HTMLButtonElement>('btn-invoice-preview'),
    pdf: byId<HTMLButtonElement>('btn-invoice-pdf'),
    email: byId<HTMLButtonElement>('btn-invoice-email'),
    refresh: byId<HTMLButtonElement>('btn-invoice-refresh'),
    void: byId<HTMLButtonElement>('btn-invoice-void'),
    delete: byId<HTMLButtonElement>('btn-invoice-delete'),
  };
  const emailSend = byId<HTMLButtonElement>('btn-invoice-email-send');
  let current: Sale | null = null;

  const showMessage = (text: string, isError = false) => {
    message.textContent = text;
    message.hidden = !text;
    message.classList.toggle('text-error', isError);
    message.classList.toggle('text-on-surface-variant', !isError);
  };

  /** Bloquea los botones mientras corre una acción y avisa el resultado. */
  async function run(label: string, action: (sale: Sale) => Promise<void>): Promise<void> {
    if (!current) return;
    const sale = current;
    Object.values(buttons).forEach((button) => (button.disabled = true));
    showMessage(label);
    try {
      await action(sale);
    } catch (error) {
      console.error(error);
      showMessage(invoiceErrorMessage(error), true);
    } finally {
      Object.values(buttons).forEach((button) => (button.disabled = false));
    }
  }

  /** Abre la pestaña al hacer clic (si no, el navegador la bloquea) y luego le pone el PDF. */
  async function openPdf(getUrl: () => Promise<string>): Promise<void> {
    const tab = window.open('about:blank', '_blank');
    try {
      const url = await getUrl();
      if (tab) tab.location.href = url;
      else window.open(url, '_blank');
      showMessage('');
    } catch (error) {
      tab?.close();
      throw error;
    }
  }

  buttons.issue.addEventListener('click', () =>
    void run('Emitiendo la factura electrónica…', async (sale) => {
      const invoice = await issueSaleInvoice(sale);
      options.onChange(sale);
      if (invoice.status === 'issued') {
        showMessage('');
        showToast(`Factura ${invoice.number ?? ''} emitida.`, 'check_circle');
      } else {
        showMessage(`No se pudo emitir: ${invoice.error ?? 'error desconocido'}`, true);
      }
    }),
  );
  buttons.preview.addEventListener('click', () =>
    void run('Generando la vista previa…', (sale) => openPdf(() => previewSaleInvoice(sale))),
  );
  buttons.pdf.addEventListener('click', () => void run('Abriendo el PDF…', (sale) => openPdf(() => saleInvoicePdf(sale))));
  buttons.refresh.addEventListener('click', () =>
    void run('Consultando en Alegra…', async (sale) => {
      await refreshSaleInvoice(sale);
      options.onChange(sale);
      showMessage('Factura consultada en Alegra.');
    }),
  );
  buttons.delete.addEventListener('click', () => {
    if (!window.confirm('¿Eliminar el borrador de la factura en Alegra? Nunca llegó a la DIAN; la venta queda con la factura pendiente.')) return;
    void run('Eliminando el borrador…', async (sale) => {
      await deleteSaleInvoiceDraft(sale);
      options.onChange(sale);
      showToast('Borrador eliminado. La factura quedó pendiente.', 'delete');
    });
  });
  buttons.void.addEventListener('click', () => options.onRequestVoid());
  buttons.email.addEventListener('click', () => {
    emailForm.hidden = !emailForm.hidden;
    if (!emailForm.hidden) {
      emailInput.value = current?.customer?.email ?? '';
      emailInput.focus();
    }
  });
  emailForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    if (!isValidEmail(email)) {
      showMessage('Escribe un correo válido.', true);
      emailInput.focus();
      return;
    }
    emailSend.disabled = true;
    void run(`Enviando la factura a ${email}…`, async (sale) => {
      await emailSaleInvoice(sale, email);
      emailForm.hidden = true;
      showMessage('');
      showToast(`Factura enviada a ${email}.`, 'mail');
    }).finally(() => (emailSend.disabled = false));
  });

  return (sale: Sale) => {
    current = sale;
    const { status, providerId } = sale.invoice;
    const active = status !== 'not-requested';
    section.hidden = !active || (!options.canOperate && status !== 'issued' && status !== 'voided');
    byId('invoice-detail').textContent = detailText(sale);
    showMessage('');
    emailForm.hidden = true;

    const canIssue = options.canOperate && sale.status !== 'void' && (status === 'pending' || status === 'error');
    buttons.issue.hidden = !canIssue;
    byId('btn-invoice-issue-label').textContent = status === 'error' ? 'Reintentar emisión' : 'Emitir factura';
    buttons.preview.hidden = !canIssue;
    buttons.pdf.hidden = !options.canOperate || !providerId || (status !== 'issued' && status !== 'voided');
    buttons.email.hidden = !options.canOperate || status !== 'issued';
    buttons.refresh.hidden = !options.canOperate || !providerId;
    buttons.void.hidden = !options.canVoid || status !== 'issued';
    buttons.delete.hidden = !options.canVoid || !providerId || (status !== 'error' && status !== 'pending');
  };
}
