import '../../css/main.css';
import { logout, requireSession, ROUTES } from '../lib/auth';
import { byId } from '../ui/dom';

const { profile } = await requireSession();
byId('user-name').textContent = profile.name;
byId('welcome').textContent = `Bienvenido, ${profile.name}`;
document.body.classList.remove('invisible');

byId<HTMLButtonElement>('btn-logout').addEventListener('click', async () => {
  await logout();
  window.location.replace(ROUTES.login);
});
