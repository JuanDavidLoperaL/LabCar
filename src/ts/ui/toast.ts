const VISIBLE_MS = 3200;
let hideTimer: number | undefined;

export function showToast(message: string, icon = 'info'): void {
  const toast = document.getElementById('status-toast');
  const text = document.getElementById('toast-message');
  const iconEl = document.getElementById('toast-icon');
  if (!toast || !text) return;

  text.textContent = message;
  if (iconEl) iconEl.textContent = icon;

  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-20', 'opacity-0');
  }, VISIBLE_MS);
}
