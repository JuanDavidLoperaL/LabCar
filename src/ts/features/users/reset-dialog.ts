import { authErrorMessage, displayIdentifier, isInternalAccount, resetPassword } from '../../lib/auth';
import type { ManagedUser } from '../../models/user';
import { byId } from '../../ui/dom';
import { showToast } from '../../ui/toast';

type ResetKind = 'email' | 'username' | 'google';

/** Solo las cuentas con contraseña y correo real reciben el enlace de Firebase para crear una nueva. */
function resetKind(user: Pick<ManagedUser, 'email' | 'access'>): ResetKind {
  if (user.access === 'google') return 'google';
  return isInternalAccount(user.email) ? 'username' : 'email';
}

/**
 * Reestablecer contraseña desde Usuarios y Roles. Con correo: confirma y envía el enlace de Firebase
 * (la contraseña actual sirve hasta que la cambie). Sin correo o con Google: explica por qué no aplica.
 */
export function setupResetDialog(): (user: Pick<ManagedUser, 'email' | 'name' | 'access'>) => void {
  const dialog = byId<HTMLDialogElement>('reset-dialog');
  const form = byId<HTMLFormElement>('reset-form');
  const error = byId('reset-error');
  const sendBtn = byId<HTMLButtonElement>('btn-reset-send');
  const sendText = byId('btn-reset-send-text');
  const cancelBtn = byId('btn-reset-cancel');
  let target: Pick<ManagedUser, 'email' | 'name'> | null = null;

  const setSending = (sending: boolean) => {
    sendBtn.disabled = sending;
    sendText.textContent = sending ? 'Enviando...' : 'Enviar correo';
  };

  dialog.querySelectorAll('[data-close-dialog]').forEach((button) =>
    button.addEventListener('click', () => {
      if (!sendBtn.disabled) dialog.close();
    }),
  );
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !sendBtn.disabled) dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (sendBtn.disabled) event.preventDefault();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!target || dialog.dataset.kind !== 'email') return;
    error.hidden = true;
    setSending(true);
    try {
      await resetPassword(target.email);
      dialog.close();
      showToast(`Se envió a ${target.email} el enlace para reestablecer la contraseña.`, 'mark_email_read');
    } catch (cause) {
      console.error(cause);
      error.textContent = authErrorMessage(cause);
      error.hidden = false;
    } finally {
      setSending(false);
    }
  });

  return (user) => {
    target = user;
    const kind = resetKind(user);
    dialog.dataset.kind = kind;
    error.hidden = true;
    setSending(false);
    cancelBtn.textContent = kind === 'email' ? 'Cancelar' : 'Entendido';

    if (kind === 'email') {
      byId('reset-icon').textContent = 'lock_reset';
      byId('reset-title').textContent = 'Reestablecer contraseña';
      byId('reset-text').textContent =
        `Se enviará un correo a ${user.email} con un enlace para que ${user.name} cree una nueva contraseña.`;
      byId('reset-hint').textContent =
        'Su contraseña actual sigue funcionando hasta que la cambie. Si no le llega, que revise la carpeta de spam.';
    } else if (kind === 'username') {
      byId('reset-icon').textContent = 'block';
      byId('reset-title').textContent = 'No se puede reestablecer';
      byId('reset-text').textContent =
        `${user.name} entra con el usuario "${displayIdentifier(user.email)}", que no tiene correo. ` +
        'El enlace para reestablecer la contraseña solo se puede enviar a un correo, por eso esta acción no está disponible para este usuario.';
      byId('reset-hint').textContent =
        'Si olvidó su contraseña, agrégalo de nuevo con otro usuario (o con su correo) y una contraseña nueva, y elimina el usuario anterior.';
    } else {
      byId('reset-icon').textContent = 'block';
      byId('reset-title').textContent = 'No se puede reestablecer';
      byId('reset-text').textContent =
        `${user.name} entra con su cuenta de Google (${user.email}). Esa contraseña la maneja Google, no LAB CAR, ` +
        'por eso esta acción no está disponible para este usuario.';
      byId('reset-hint').textContent =
        'Si olvidó su contraseña, debe recuperarla en la pantalla de inicio de Google con "¿Olvidaste tu contraseña?".';
    }
    dialog.showModal();
  };
}
