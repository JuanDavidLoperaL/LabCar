import '../../css/main.css';
import {
  authErrorMessage,
  currentSession,
  isUsername,
  loginWithGoogle,
  loginWithPassword,
  resetPassword,
  ROUTES,
  setRememberSession,
  type SessionUser,
} from '../lib/auth';
import { isFirebaseConfigured } from '../lib/firebase';
import { byId } from '../ui/dom';
import { setupPasswordToggle } from '../ui/password-toggle';
import { showToast } from '../ui/toast';

const form = byId<HTMLFormElement>('login-form');
const userInput = byId<HTMLInputElement>('login-user');
const passwordInput = byId<HTMLInputElement>('login-password');
const rememberInput = byId<HTMLInputElement>('remember-me');
const submitBtn = byId<HTMLButtonElement>('btn-submit');
const submitText = byId<HTMLSpanElement>('btn-text');
const googleBtn = byId<HTMLButtonElement>('btn-google');
const forgotBtn = byId<HTMLButtonElement>('btn-forgot');

setupPasswordToggle(passwordInput, byId('toggle-pwd-btn'), byId('pwd-icon'));

function setLoading(loading: boolean): void {
  submitBtn.disabled = loading;
  googleBtn.disabled = loading;
  submitText.textContent = loading ? 'Verificando...' : 'Ingresar al Sistema';
}

async function signIn(attempt: () => Promise<SessionUser>): Promise<void> {
  setLoading(true);
  try {
    await attempt();
    window.location.replace(ROUTES.home);
  } catch (error) {
    showToast(authErrorMessage(error), 'error');
    setLoading(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!userInput.value.trim() || !passwordInput.value) {
    showToast('Escribe tu usuario y contraseña.', 'warning');
    return;
  }
  signIn(() => loginWithPassword(userInput.value, passwordInput.value));
});

googleBtn.addEventListener('click', () => {
  signIn(() => loginWithGoogle());
});

forgotBtn.addEventListener('click', async () => {
  const identifier = userInput.value.trim();
  if (!identifier) {
    showToast('Escribe tu usuario o correo arriba.', 'warning');
    userInput.focus();
    return;
  }
  if (isUsername(identifier)) {
    showToast('Pide al administrador que restablezca tu contraseña.', 'support_agent');
    return;
  }
  try {
    await resetPassword(identifier);
    showToast(`Si el correo existe, enviamos un enlace a ${identifier}`, 'mark_email_read');
  } catch (error) {
    showToast(authErrorMessage(error), 'error');
  }
});

// Si ya hay sesión guardada y autorizada, entra directo.
if (isFirebaseConfigured) {
  void setRememberSession(rememberInput.checked);
  rememberInput.addEventListener('change', () => void setRememberSession(rememberInput.checked));

  currentSession()
    .then((session) => {
      if (session) window.location.replace(ROUTES.home);
    })
    .catch((error: unknown) => showToast(authErrorMessage(error), 'error'));
} else {
  showToast('Falta configurar Firebase en el archivo .env', 'warning');
}
