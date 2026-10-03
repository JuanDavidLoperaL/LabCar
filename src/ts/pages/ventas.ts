import '../../css/main.css';
import { fetchServices } from '../data/services';
import { fetchCommissionRate } from '../data/settings';
import { fetchActiveUsers } from '../data/users';
import { mountSalePage } from '../features/sales/page';
import { requireSession } from '../lib/auth';
import { byId } from '../ui/dom';
import { mountShell } from '../ui/shell';

function showLoadError(): void {
  document.body.classList.remove('invisible');
  byId('sale-form').hidden = true;
  byId('load-error').hidden = false;
  byId('btn-retry').addEventListener('click', () => window.location.reload(), { once: true });
}

async function main(): Promise<void> {
  const session = await requireSession();
  mountShell(session, 'ventas');
  document.body.classList.remove('invisible');
  const [users, services, commissionRate] = await Promise.all([fetchActiveUsers(), fetchServices(), fetchCommissionRate()]);
  mountSalePage(session, { users, services, commissionRate });
}

main().catch((error: unknown) => {
  console.error(error);
  showLoadError();
});
