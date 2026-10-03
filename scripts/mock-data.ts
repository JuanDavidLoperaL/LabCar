/**
 * Datos de prueba (mock) para el panel: ventas y gastos de las últimas semanas, de lunes a sábado.
 * Todos los documentos llevan `mock: true` para poder borrarlos sin tocar datos reales.
 *
 *   npm run mock:seed    → borra los mock anteriores y crea nuevos
 *   npm run mock:clear   → borra solo los mock
 *   npm run mock:preview → muestra un resumen de lo que se crearía, sin escribir nada
 *
 * Requiere una clave de cuenta de servicio (Firebase → Configuración del proyecto →
 * Cuentas de servicio → Generar nueva clave privada) guardada como ./service-account.json
 * o indicada en la variable GOOGLE_APPLICATION_CREDENTIALS. Nunca subas esa clave al repositorio.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'labcar-f04e5';
const WEEKS_BACK = 6;
const BATCH_LIMIT = 450;
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- Catálogos ficticios ----------

const SELLERS = [
  { id: 'mock-carlos', name: 'Carlos Mendoza', rate: 0.35 },
  { id: 'mock-andres', name: 'Andrés Parra', rate: 0.3 },
  { id: 'mock-camilo', name: 'Camilo Rodríguez', rate: 0.35 },
  { id: 'mock-david', name: 'David Granados', rate: 0.3 },
] as const;

type VehicleType = 'car' | 'motorcycle';

const SERVICES: readonly { name: string; type: VehicleType; min: number; max: number; weight: number }[] = [
  { name: 'Lavado Premium', type: 'car', min: 60_000, max: 90_000, weight: 10 },
  { name: 'Lavado Motor + Chasis', type: 'car', min: 180_000, max: 240_000, weight: 5 },
  { name: 'Descontaminado + Cera', type: 'car', min: 250_000, max: 350_000, weight: 4 },
  { name: 'Polichado', type: 'car', min: 350_000, max: 500_000, weight: 3 },
  { name: 'Cerámico Interior Cuero', type: 'car', min: 600_000, max: 900_000, weight: 2 },
  { name: 'Protección Undercoating', type: 'car', min: 700_000, max: 950_000, weight: 1 },
  { name: 'Corrección de Pintura', type: 'car', min: 900_000, max: 1_600_000, weight: 1 },
  { name: 'PPF Parcial', type: 'car', min: 1_500_000, max: 2_500_000, weight: 1 },
  { name: 'Lavado Moto', type: 'motorcycle', min: 35_000, max: 50_000, weight: 6 },
  { name: 'Descontaminado + Cera Moto', type: 'motorcycle', min: 140_000, max: 180_000, weight: 2 },
  { name: 'Cerámico Moto', type: 'motorcycle', min: 350_000, max: 500_000, weight: 1 },
];

const VEHICLE_LINES: Record<VehicleType, readonly string[]> = {
  car: [
    'Mazda 3 Touring',
    'Chevrolet Onix',
    'Renault Duster',
    'Toyota Hilux',
    'Kia Picanto',
    'Audi Q5',
    'BMW X3',
    'Mercedes CLA 200',
    'Volkswagen Tiguan',
    'Porsche Macan',
    'Nissan Kicks',
    'Ford Ranger',
  ],
  motorcycle: ['Yamaha MT-09', 'KTM 790 Adventure', 'BMW R 1250 GS', 'Honda CB 500X', 'Suzuki V-Strom 650'],
};

const CUSTOMERS = [
  'Cliente Prueba Uno',
  'Cliente Prueba Dos',
  'Cliente Prueba Tres',
  'Cliente Prueba Cuatro',
  'Cliente Prueba Cinco',
  'Cliente Prueba Seis',
  'Cliente Prueba Siete',
  'Cliente Prueba Ocho',
  'Flota Prueba S.A.S.',
  'Concesionario Prueba',
];

const PAYMENT_METHODS = [
  { value: 'transfer', weight: 55 },
  { value: 'cash', weight: 35 },
  { value: 'credit', weight: 10 },
] as const;

const EXPENSES = [
  { category: 'Insumos', descriptions: ['Cerámicos', 'Pads de pulido', 'Shampoo y desengrasante', 'Microfibras'], min: 80_000, max: 450_000 },
  { category: 'Mantenimiento', descriptions: ['Hidrolavadora', 'Pulidora', 'Aspiradora'], min: 60_000, max: 300_000 },
  { category: 'Publicidad', descriptions: ['Pauta redes sociales', 'Volantes'], min: 50_000, max: 250_000 },
] as const;

// ---------- Utilidades ----------

/** Generador pseudoaleatorio con semilla: los mismos datos en cada ejecución del mismo día. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const random = createRandom(Math.floor(Date.now() / DAY_MS));

function between(min: number, max: number): number {
  return Math.floor(min + random() * (max - min + 1));
}

/** Precio redondeado a miles, como se cobra en el negocio. */
function price(min: number, max: number): number {
  return Math.round(between(min, max) / 1000) * 1000;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function pickWeighted<T extends { weight: number }>(items: readonly T[]): T {
  let roll = random() * items.reduce((total, item) => total + item.weight, 0);
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

function plate(type: VehicleType): string {
  const letters = () => String.fromCharCode(65 + between(0, 25));
  const prefix = letters() + letters() + letters();
  // Carros: ABC123 · Motos: ABC12D
  return type === 'car' ? `${prefix}${between(100, 999)}` : `${prefix}${between(10, 99)}${letters()}`;
}

/** Medianoche (hora Colombia) del día que contiene `date`. */
function bogotaMidnight(date: Date): Date {
  const shifted = date.getTime() - BOGOTA_OFFSET_MS;
  return new Date(shifted - (shifted % DAY_MS) + BOGOTA_OFFSET_MS);
}

function bogotaWeekday(date: Date): number {
  return new Date(date.getTime() - BOGOTA_OFFSET_MS).getUTCDay();
}

/** Días hábiles (lunes a sábado) desde hace WEEKS_BACK semanas hasta hoy. */
function businessDays(now: Date): Date[] {
  const days: Date[] = [];
  const today = bogotaMidnight(now);
  for (let offset = WEEKS_BACK * 7; offset >= 0; offset--) {
    const day = new Date(today.getTime() - offset * DAY_MS);
    if (bogotaWeekday(day) !== 0) days.push(day);
  }
  return days;
}

/** Hora aleatoria entre las 8:00 a. m. y las 6:00 p. m. de ese día. */
function timeDuring(day: Date): Date {
  return new Date(day.getTime() + between(8 * 60, 18 * 60) * 60_000);
}

// ---------- Generación ----------

type Doc = Record<string, unknown>;

function buildSales(now: Date): Doc[] {
  const sales: Doc[] = [];
  for (const day of businessDays(now)) {
    const isSaturday = bogotaWeekday(day) === 6;
    const count = between(isSaturday ? 10 : 6, isSaturday ? 16 : 12);
    for (let i = 0; i < count; i++) {
      const date = timeDuring(day);
      if (date > now) continue;
      const service = pickWeighted(SERVICES);
      const seller = pick(SELLERS);
      const total = price(service.min, service.max);
      const paymentMethod = pickWeighted(PAYMENT_METHODS).value;
      const isCredit = paymentMethod === 'credit';
      const dueDate = isCredit ? new Date(date.getTime() + 15 * DAY_MS) : null;
      // Los créditos viejos en su mayoría ya se pagaron; los recientes siguen en cartera.
      const status = isCredit && !(dueDate! < now && random() < 0.6) ? 'pending' : 'paid';

      sales.push({
        date: Timestamp.fromDate(date),
        plate: plate(service.type),
        vehicleLine: pick(VEHICLE_LINES[service.type]),
        vehicleType: service.type,
        customerName: pick(CUSTOMERS),
        serviceName: service.name,
        sellerId: seller.id,
        sellerName: seller.name,
        paymentMethod,
        total,
        status,
        dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
        commission: Math.round(total * seller.rate),
        mock: true,
      });
    }
  }
  return sales;
}

function buildExpenses(now: Date): Doc[] {
  const expenses: Doc[] = [];
  const expense = (date: Date, category: string, description: string, amount: number): Doc => ({
    date: Timestamp.fromDate(date),
    category,
    description,
    amount,
    mock: true,
  });

  for (const day of businessDays(now)) {
    const dayOfMonth = new Date(day.getTime() - BOGOTA_OFFSET_MS).getUTCDate();
    const date = timeDuring(day);
    if (date > now) continue;

    if (dayOfMonth <= 6 && bogotaWeekday(day) === 1) {
      expenses.push(expense(date, 'Arriendo', 'Arriendo del local', 4_500_000));
    }
    if (bogotaWeekday(day) === 5) {
      expenses.push(expense(date, 'Servicios públicos', 'Agua y energía', price(250_000, 420_000)));
    }
    for (let i = between(0, 2); i > 0; i--) {
      const kind = pick(EXPENSES);
      expenses.push(expense(timeDuring(day), kind.category, pick(kind.descriptions), price(kind.min, kind.max)));
    }
  }
  return expenses.filter((doc) => (doc.date as Timestamp).toDate() <= now);
}

function printSummary(sales: readonly Doc[], expenses: readonly Doc[]): void {
  const total = (docs: readonly Doc[], key: string) => docs.reduce((sum, doc) => sum + (doc[key] as number), 0);
  const pending = sales.filter((sale) => sale.status === 'pending');
  const cop = (value: number) => `$ ${value.toLocaleString('es-CO')}`;
  console.log(`Ventas: ${sales.length} · total ${cop(total(sales, 'total'))} · por cobrar ${pending.length} (${cop(total(pending, 'total'))})`);
  console.log(`Comisiones: ${cop(total(sales, 'commission'))}`);
  console.log(`Gastos: ${expenses.length} · total ${cop(total(expenses, 'amount'))}`);
  const sundays = [...sales, ...expenses].filter((doc) => bogotaWeekday((doc.date as Timestamp).toDate()) === 0);
  console.log(`Documentos en domingo: ${sundays.length}`);
  console.log('Ejemplo:', JSON.stringify({ ...sales[sales.length - 1], date: (sales[sales.length - 1].date as Timestamp).toDate() }));
}

// ---------- Firestore ----------

function connect(): Firestore {
  const keyPath = resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? 'service-account.json');
  if (!existsSync(keyPath)) {
    console.error(`No encontré la clave de cuenta de servicio en ${keyPath}.`);
    console.error('Descárgala en Firebase → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8')) as ServiceAccount;
  initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
  return getFirestore();
}

async function clearMock(db: Firestore, collection: string): Promise<number> {
  const snapshot = await db.collection(collection).where('mock', '==', true).get();
  for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + BATCH_LIMIT).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  return snapshot.size;
}

async function insert(db: Firestore, collection: string, docs: readonly Doc[]): Promise<void> {
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    docs.slice(i, i + BATCH_LIMIT).forEach((doc) => batch.set(db.collection(collection).doc(), doc));
    await batch.commit();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'seed' && command !== 'clear' && command !== 'preview') {
    console.error('Uso: node scripts/mock-data.ts <seed|clear|preview>');
    process.exit(1);
  }

  if (command === 'preview') {
    const now = new Date();
    printSummary(buildSales(now), buildExpenses(now));
    return;
  }

  const db = connect();
  const removedSales = await clearMock(db, 'sales');
  const removedExpenses = await clearMock(db, 'expenses');
  console.log(`Borrados: ${removedSales} ventas y ${removedExpenses} gastos de prueba.`);
  if (command === 'clear') return;

  const now = new Date();
  const sales = buildSales(now);
  const expenses = buildExpenses(now);
  await insert(db, 'sales', sales);
  await insert(db, 'expenses', expenses);
  console.log(`Creados: ${sales.length} ventas y ${expenses.length} gastos de prueba (${WEEKS_BACK} semanas, lunes a sábado).`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
