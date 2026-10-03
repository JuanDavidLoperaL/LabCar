import type { Expense } from '../../models/expense';
import type { Sale } from '../../models/sale';

/** Lo que se le debe pagar a un empleado en el periodo, con el detalle de cada servicio. */
export interface SellerPayout {
  sellerName: string;
  /** Valor total de los servicios que hizo. */
  soldTotal: number;
  commission: number;
  /** Servicios del periodo, del más reciente al más antiguo. */
  sales: Sale[];
}

export interface DashboardMetrics {
  sales: { total: number; collected: number; count: number; cars: number; motorcycles: number };
  expenses: { total: number; topCategories: string[] };
  receivables: { total: number; count: number; overdue: number };
  commissions: { total: number; payouts: SellerPayout[] };
  /** Plata real: lo cobrado − gastos − comisiones. No incluye cartera (ventas por cobrar). */
  netProfit: number;
}

function sum<T>(items: readonly T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

function topExpenseCategories(expenses: readonly Expense[], limit: number): string[] {
  const byCategory = new Map<string, number>();
  for (const expense of expenses) {
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amount);
  }
  return [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category]) => category);
}

function sellerPayouts(sales: readonly Sale[]): SellerPayout[] {
  const bySeller = new Map<string, SellerPayout>();
  for (const sale of sales) {
    const key = sale.sellerId || sale.sellerName;
    const payout = bySeller.get(key) ?? { sellerName: sale.sellerName, soldTotal: 0, commission: 0, sales: [] };
    payout.soldTotal += sale.total;
    payout.commission += sale.commission;
    payout.sales.push(sale);
    bySeller.set(key, payout);
  }
  return [...bySeller.values()].sort((a, b) => b.commission - a.commission);
}

/** Calcula los indicadores del periodo a partir de las ventas (más recientes primero) y gastos ya filtrados por fecha. */
export function computeMetrics(sales: readonly Sale[], expenses: readonly Expense[], now = new Date()): DashboardMetrics {
  const pending = sales.filter((sale) => sale.status === 'pending');
  const salesTotal = sum(sales, (sale) => sale.total);
  const expensesTotal = sum(expenses, (expense) => expense.amount);
  const payouts = sellerPayouts(sales);
  const commissionsTotal = sum(payouts, (payout) => payout.commission);
  const collected = salesTotal - sum(pending, (sale) => sale.total);
  // Las comisiones se restan completas: se le pagan al empleado aunque el cliente aún no haya pagado.
  const netProfit = collected - expensesTotal - commissionsTotal;

  return {
    sales: {
      total: salesTotal,
      collected,
      count: sales.length,
      cars: sales.filter((sale) => sale.vehicleType === 'car').length,
      motorcycles: sales.filter((sale) => sale.vehicleType === 'motorcycle').length,
    },
    expenses: { total: expensesTotal, topCategories: topExpenseCategories(expenses, 3) },
    receivables: {
      total: sum(pending, (sale) => sale.total),
      count: pending.length,
      overdue: pending.filter((sale) => sale.dueDate !== null && sale.dueDate < now).length,
    },
    commissions: { total: commissionsTotal, payouts },
    netProfit,
  };
}
