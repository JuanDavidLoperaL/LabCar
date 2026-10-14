import { FirebaseError } from 'firebase/app';
import { authErrorMessage } from '../../lib/auth';
import { firestoreErrorMessage } from '../../lib/errors';
import { byId } from '../../ui/dom';
import { cloneTemplate, setField } from '../../ui/template';
import type { ChangeKind, ChangeLine } from './changes';

const ICONS: Record<ChangeKind, string> = { add: 'person_add', role: 'swap_horiz', remove: 'person_remove' };

/**
 * Doble confirmación: describe cada cambio pendiente y solo guarda si el administrador acepta.
 * Mientras guarda no se puede cerrar.
 */
export function setupConfirmDialog(save: () => Promise<void>): (lines: readonly ChangeLine[]) => void {
  const dialog = byId<HTMLDialogElement>('confirm-dialog');
  const form = byId<HTMLFormElement>('confirm-form');
  const error = byId('confirm-error');
  const confirmBtn = byId<HTMLButtonElement>('btn-confirm');
  const confirmText = byId('btn-confirm-text');

  const setSaving = (saving: boolean) => {
    confirmBtn.disabled = saving;
    confirmText.textContent = saving ? 'Guardando...' : 'Aceptar y guardar';
  };

  dialog.querySelectorAll('[data-close-dialog]').forEach((button) =>
    button.addEventListener('click', () => {
      if (!confirmBtn.disabled) dialog.close();
    }),
  );
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !confirmBtn.disabled) dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (confirmBtn.disabled) event.preventDefault();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    setSaving(true);
    try {
      await save();
      dialog.close();
    } catch (cause) {
      console.error(cause);
      // Errores de Firestore (al guardar los perfiles) o de Auth (al crear las cuentas).
      const message = cause instanceof FirebaseError && !cause.code.startsWith('auth/')
        ? firestoreErrorMessage(cause, 'guardar los cambios')
        : authErrorMessage(cause);
      error.textContent = message;
      error.hidden = false;
    } finally {
      setSaving(false);
    }
  });

  return (lines) => {
    error.hidden = true;
    byId('confirm-list').replaceChildren(
      ...lines.map((line) => {
        const item = cloneTemplate<HTMLLIElement>('tpl-change');
        item.dataset.kind = line.kind;
        setField(item, 'icon', ICONS[line.kind]);
        setField(item, 'title', line.title);
        setField(item, 'detail', line.detail);
        return item;
      }),
    );
    dialog.showModal();
  };
}
