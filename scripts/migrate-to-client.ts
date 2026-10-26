/**
 * Copia TODO Firestore del proyecto actual (labcar-f04e5) al del cliente (labcar-f8931).
 * Las cuentas de usuario se copian aparte con `firebase auth:export` / `auth:import`.
 *
 * Origen: la cuenta de servicio de siempre (service-account.json). Destino: la sesión de la
 * Firebase CLI (dueña del proyecto del cliente), por la API REST de Firestore; así no hace falta
 * crear una clave de servidor en el proyecto del cliente. Sobrescribe los documentos que ya existan.
 *
 *   FIREBASE_ACCESS_TOKEN=... node scripts/migrate-to-client.ts            → solo cuenta
 *   FIREBASE_ACCESS_TOKEN=... node scripts/migrate-to-client.ts --confirm  → copia
 */
import { DocumentReference, GeoPoint, Timestamp, type CollectionReference, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { connect } from './admin.ts';

const TARGET_PROJECT = 'labcar-f8931';
const TARGET_DOCS = `projects/${TARGET_PROJECT}/databases/(default)/documents`;
const BATCH_LIMIT = 400;

type RestValue = Record<string, unknown>;

/** Valor de Firestore (admin SDK) → formato de la API REST. */
function toRest(value: unknown): RestValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (value instanceof Timestamp) return { timestampValue: value.toDate().toISOString() };
  if (value instanceof GeoPoint) return { geoPointValue: { latitude: value.latitude, longitude: value.longitude } };
  if (value instanceof DocumentReference) return { referenceValue: `${TARGET_DOCS}/${value.path}` };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toRest) } };
  if (typeof value === 'object') return { mapValue: { fields: toRestFields(value as Record<string, unknown>) } };
  throw new Error(`Tipo de valor no soportado: ${typeof value}`);
}

function toRestFields(data: Record<string, unknown>): Record<string, RestValue> {
  return Object.fromEntries(Object.entries(data).map(([key, inner]) => [key, toRest(inner)]));
}

/** Todos los documentos, incluidas las subcolecciones. */
async function allDocuments(db: Firestore): Promise<DocumentSnapshot[]> {
  const result: DocumentSnapshot[] = [];
  const visit = async (collections: CollectionReference[]) => {
    for (const collection of collections) {
      const snapshot = await collection.get();
      for (const doc of snapshot.docs) {
        result.push(doc);
        await visit(await doc.ref.listCollections());
      }
    }
  };
  await visit(await db.listCollections());
  return result;
}

async function batchWrite(token: string, docs: readonly DocumentSnapshot[]): Promise<void> {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${TARGET_PROJECT}/databases/(default)/documents:batchWrite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: docs.map((doc) => ({ update: { name: `${TARGET_DOCS}/${doc.ref.path}`, fields: toRestFields(doc.data() ?? {}) } })),
    }),
  });
  const body = (await response.json()) as { status?: { code?: number; message?: string }[]; error?: { message: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  const failed = (body.status ?? []).filter((status) => status.code && status.code !== 0);
  if (failed.length) throw new Error(`${failed.length} documentos no se copiaron: ${failed[0].message}`);
}

async function main(): Promise<void> {
  const confirm = process.argv.includes('--confirm');
  const token = process.env.FIREBASE_ACCESS_TOKEN;
  if (confirm && !token) {
    console.error('Falta FIREBASE_ACCESS_TOKEN (token de la Firebase CLI con acceso al proyecto del cliente).');
    process.exit(1);
  }

  const docs = await allDocuments(connect());
  const byCollection = new Map<string, number>();
  for (const doc of docs) {
    const name = doc.ref.parent.path.replace(/\/[^/]+\/(\w+)$/, '/…/$1');
    byCollection.set(name, (byCollection.get(name) ?? 0) + 1);
  }
  console.log(`Origen labcar-f04e5 → destino ${TARGET_PROJECT}`);
  for (const [name, count] of [...byCollection].sort()) console.log(`  ${name.padEnd(22)}${count}`);
  console.log(`  ${'TOTAL'.padEnd(22)}${docs.length}`);

  if (!confirm) {
    console.log('\nNo se copió nada. Para copiar: --confirm');
    return;
  }
  for (let start = 0; start < docs.length; start += BATCH_LIMIT) {
    await batchWrite(token!, docs.slice(start, start + BATCH_LIMIT));
    console.log(`Copiados ${Math.min(start + BATCH_LIMIT, docs.length)} de ${docs.length}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
