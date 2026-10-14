import '../../css/main.css';
import { fetchCustomers } from '../data/customers';
import { fetchServices } from '../data/services';
import { fetchCommissionRate } from '../data/settings';
import { fetchActiveUsers } from '../data/users';
import { mountSalePage } from '../features/sales/page';
import { requireSession } from '../lib/auth';
import { canRegisterSales } from '../lib/roles';
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
  if (!canRegisterSales(session.profile.role)) {
    byId('sale-form').hidden = true;
    byId('no-access').hidden = false;
    return;
  }
  const [users, services, commissionRate, customers] = await Promise.all([
    fetchActiveUsers(),
    fetchServices(),
    fetchCommissionRate(),
    // Sin la lista de clientes la venta se puede registrar igual: solo no aparece "Preseleccionar cliente".
    fetchCustomers().catch((error: unknown) => {
      console.error(error);
      return [];
    }),
  ]);
  mountSalePage(session, { users, services, commissionRate, customers });
}

main().catch((error: unknown) => {
  console.error(error);
  showLoadError();
});
