import { byId } from '../../ui/dom';

export type StepId = 'save' | 'invoice' | 'print';
export type StepState = 'waiting' | 'active' | 'done' | 'skipped' | 'error';

const ICONS: Record<StepState, string> = {
  waiting: 'radio_button_unchecked',
  active: 'progress_activity',
  done: 'check_circle',
  skipped: 'remove_circle_outline',
  error: 'error',
};

const COLORS: Record<StepState, string> = {
  waiting: 'text-outline',
  active: 'text-primary animate-spin motion-reduce:animate-none',
  done: 'text-green-400',
  skipped: 'text-outline',
  error: 'text-error',
};

/** Lista de pasos que se muestra mientras se registra la venta (guardar → factura → imprimir). */
export function setStep(step: StepId, state: StepState, label: string): void {
  const item = byId('submit-progress').querySelector<HTMLElement>(`[data-step="${step}"]`);
  if (!item) return;
  item.dataset.state = state;
  const icon = item.querySelector<HTMLElement>('[data-icon]');
  if (icon) {
    icon.textContent = ICONS[state];
    icon.className = `material-symbols-outlined text-[20px] ${COLORS[state]}`;
  }
  const text = item.querySelector<HTMLElement>('[data-label]');
  if (text) text.textContent = label;
}

export function showProgress(visible: boolean): void {
  byId('submit-progress').hidden = !visible;
}
