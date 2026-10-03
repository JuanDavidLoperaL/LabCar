/**
 * Datos iniciales del sistema (no son de prueba):
 * - services/: catálogo de servicios con sus accesos rápidos.
 * - settings/commissions: % de comisión (40%).
 * Solo crea lo que no existe: si el catálogo o la comisión ya se ajustaron, no los sobrescribe.
 *
 *   npm run seed:catalog
 */
import { connect } from './admin.ts';

const SERVICES = [
  { id: 'lavado-detallado', name: 'Lavado Detallado' },
  { id: 'correccion-pintura', name: 'Corrección de Pintura' },
  { id: 'proteccion-ppf', name: 'Protección PPF' },
  { id: 'ceramico', name: 'Cerámico' },
  { id: 'vidrios-rines', name: 'Vidrios y Rines' },
];

async function main(): Promise<void> {
  const db = connect();
  let created = 0;

  for (const [index, service] of SERVICES.entries()) {
    const ref = db.collection('services').doc(service.id);
    if ((await ref.get()).exists) continue;
    await ref.set({ name: service.name, quick: true, order: (index + 1) * 10, active: true });
    created++;
  }

  const commission = db.collection('settings').doc('commissions');
  const hasCommission = (await commission.get()).exists;
  if (!hasCommission) await commission.set({ rate: 0.4 });

  console.log(`Servicios creados: ${created} (ya existían ${SERVICES.length - created}).`);
  console.log(hasCommission ? 'La comisión ya estaba configurada.' : 'Comisión configurada en 40%.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
