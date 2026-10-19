/**
 * Borra TODAS las ventas (reales y mock) y lo que depende de ellas, para empezar de cero.
 * Conserva usuarios, empleados, clientes, servicios, gastos y configuración (tope de factura, comisiones, cartera).
 *
 * Se borra:
 *   sales/              ventas (la cartera son las ventas a crédito: se va con ellas)
 *   saleRequests/       registros de idempotencia de cada venta
 *   commissionPayouts/  pagos de comisiones (cubren ventas que ya no existen)
 *   payoutDeferrals/    semanas acumuladas para el próximo pago
 *   counters/sales      el consecutivo: se borra (no se pone en 0) porque las reglas exigen que la
 *                       primera venta lo cree con value == 1. Así la próxima venta vuelve a ser LC-1.
 *
 *   node scripts/reset-sales.ts            → solo cuenta lo que se borraría
 *   node scripts/reset-sales.ts --confirm  → guarda un respaldo JSON en backups/ y luego borra
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Timestamp, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { connect } from './admin.ts';

const COLLECTIONS = ['sales', 'saleRequests', 'commissionPayouts', 'payoutDeferrals'] as const;
const COUNTER = { collection: 'counters', id: 'sales' } as const;
const BATCH_LIMIT = 450;

/** Timestamps a texto ISO para que el respaldo sea legible. */
function toJson(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, toJson(inner)]));
  }
  return value;
}

async function deleteAll(db: Firestore, docs: readonly DocumentSnapshot[]): Promise<void> {
  for (let start = 0; start < docs.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    docs.slice(start, start + BATCH_LIMIT).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function main(): Promise<void> {
  const confirm = process.argv.includes('--confirm');
  const db = connect();

  const snapshots = Object.fromEntries(
    await Promise.all(COLLECTIONS.map(async (name) => [name, (await db.collection(name).get()).docs] as const)),
  ) as Record<(typeof COLLECTIONS)[number], DocumentSnapshot[]>;
  const counter = await db.collection(COUNTER.collection).doc(COUNTER.id).get();

  const sales = snapshots.sales;
  const mockSales = sales.filter((doc) => doc.get('mock') === true).length;
  const creditPending = sales.filter((doc) => doc.get('status') === 'pending').length;
  console.log('Proyecto: labcar-f04e5');
  console.log(`  sales:             ${sales.length} (mock: ${mockSales}, reales: ${sales.length - mockSales}, en cartera por cobrar: ${creditPending})`);
  for (const name of COLLECTIONS.slice(1)) console.log(`  ${`${name}:`.padEnd(19)}${snapshots[name].length}`);
  console.log(`  counters/sales:    ${counter.exists ? `value = ${counter.get('value')}` : 'no existe'}`);

  if (!confirm) {
    console.log('\nNo se borró nada. Para borrar: node scripts/reset-sales.ts --confirm');
    return;
  }

  const backupDir = resolve('backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = resolve(backupDir, `ventas-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const backup = {
    ...Object.fromEntries(
      COLLECTIONS.map((name) => [name, Object.fromEntries(snapshots[name].map((doc) => [doc.id, toJson(doc.data())]))]),
    ),
    counters: counter.exists ? { sales: toJson(counter.data()) } : {},
  };
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\nRespaldo guardado en ${backupPath}`);

  for (const name of COLLECTIONS) {
    await deleteAll(db, snapshots[name]);
    console.log(`Borrados ${snapshots[name].length} documentos de ${name}`);
  }
  if (counter.exists) {
    await counter.ref.delete();
    console.log('Borrado counters/sales: la próxima venta será la número 1');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
