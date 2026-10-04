/**
 * Datos de prueba (mock): empleados, ventas y gastos de las últimas semanas, de lunes a sábado.
 * Todo lleva `mock: true` (las ventas además el prefijo PRUEBA-) para poder borrarlo sin tocar datos reales.
 *
 *   npm run mock:seed    → borra los mock anteriores y crea nuevos
 *   npm run mock:clear   → borra solo los mock
 *   npm run mock:preview → muestra un resumen de lo que se crearía, sin escribir nada
 */
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { connect } from './admin.ts';

const WEEKS_BACK = 6;
const BATCH_LIMIT = 450;
const COMMISSION_RATE = 0.4;
/** Los créditos con más de estos días tienen probabilidad de ya estar pagados (el resto queda en cartera, algunos en mora). */
const CREDIT_SETTLE_AFTER_DAYS = 7;
/** Celular de todos los clientes de prueba: los recordatorios de cobro por WhatsApp llegan aquí. */
const TEST_CUSTOMER_PHONE = '3016529257';
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- Catálogos ficticios ----------

/** Empleados de prueba: aparecen como vendedores y en el filtro del historial. */
const SELLERS = [
  { email: 'carlos.mendoza@mock.labcar.local', name: 'Carlos Mendoza (prueba)' },
  { email: 'andres.parra@mock.labcar.local', name: 'Andrés Parra (prueba)' },
  { email: 'camilo.rodriguez@mock.labcar.local', name: 'Camilo Rodríguez (prueba)' },
  { email: 'david.granados@mock.labcar.local', name: 'David Granados (prueba)' },
] as const;

type VehicleType = 'car' | 'motorcycle';

const SERVICES: readonly { id: string | null; name: string; types: VehicleType[]; min: number; max: number; weight: number }[] = [
  { id: 'lavado-detallado', name: 'Lavado Detallado', types: ['car', 'motorcycle'], min: 60_000, max: 150_000, weight: 10 },
  { id: 'correccion-pintura', name: 'Corrección de Pintura', types: ['car', 'motorcycle'], min: 350_000, max: 900_000, weight: 3 },
  { id: 'proteccion-ppf', name: 'Protección PPF', types: ['car', 'motorcycle'], min: 900_000, max: 2_500_000, weight: 1 },
  { id: 'ceramico', name: 'Cerámico', types: ['car', 'motorcycle'], min: 400_000, max: 1_200_000, weight: 2 },
  { id: 'vidrios-rines', name: 'Vidrios y Rines', types: ['car'], min: 120_000, max: 220_000, weight: 4 },
  { id: null, name: 'Lavado de Motor', types: ['car'], min: 80_000, max: 160_000, weight: 3 },
];

const VEHICLE_LINES: Record<VehicleType, readonly string[]> = {
  car: ['Mazda 3 Touring gris', 'Chevrolet Onix blanco', 'Renault Duster rojo', 'Toyota Hilux negra', 'Kia Picanto azul', 'Audi Q5 blanca', 'BMW X3 negra', 'Volkswagen Tiguan gris'],
  motorcycle: ['Yamaha MT-09 azul', 'KTM 790 Adventure naranja', 'BMW R 1250 GS blanca', 'Honda CB 500X roja'],
};

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
  const letter = () => String.fromCharCode(65 + between(0, 25));
  const prefix = letter() + letter() + letter();
  // Carros: ABC123 · Motos: ABC12D
  return type === 'car' ? `${prefix}${between(100, 999)}` : `${prefix}${between(10, 99)}${letter()}`;
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

/** Reparte la comisión en partes enteras que suman exactamente el total. */
function splitEvenly(amount: number, parts: number): number[] {
  const base = Math.floor(amount / parts);
  return Array.from({ length: parts }, (_, index) => base + (index < amount - base * parts ? 1 : 0));
}

// ---------- Generación ----------

type Doc = Record<string, unknown>;
interface MockDoc {
  id: string;
  data: Doc;
}

function buildSale(date: Date, now: Date, number: number): MockDoc {
  const vehicleType: VehicleType = random() < 0.8 ? 'car' : 'motorcycle';
  const available = SERVICES.filter((service) => service.types.includes(vehicleType));
  // Servicios distintos dentro de la misma venta.
  const chosen: typeof available = [];
  for (let count = between(1, 3); count > 0; count--) {
    const remaining = available.filter((service) => !chosen.includes(service));
    if (remaining.length > 0) chosen.push(pickWeighted(remaining));
  }
  const items = chosen.map((service) => {
    const itemPrice = price(service.min, service.max);
    const discountPercent = random() < 0.2 ? pick([5, 10, 15]) : 0;
    const discount = Math.round((itemPrice * discountPercent) / 100);
    return { serviceId: service.id, name: service.name, price: itemPrice, discountPercent, discount, total: itemPrice - discount };
  });
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const discount = items.reduce((sum, item) => sum + item.discount, 0);
  const total = subtotal - discount;
  const commission = Math.round(total * COMMISSION_RATE);

  const sellerCount = random() < 0.2 ? 2 : 1;
  const sellers = [...SELLERS].sort(() => random() - 0.5).slice(0, sellerCount);
  const shares = splitEvenly(commission, sellerCount);

  const paymentMethod = pickWeighted(PAYMENT_METHODS).value;
  const isCredit = paymentMethod === 'credit';
  // Parte de los créditos viejos ya se pagaron (con fecha de pago posterior); los demás siguen en cartera.
  const ageDays = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  const settled = isCredit && ageDays > CREDIT_SETTLE_AFTER_DAYS && random() < 0.5;
  const status = isCredit && !settled ? 'pending' : 'paid';
  const paidAt = settled ? new Date(Math.min(now.getTime(), date.getTime() + between(1, ageDays) * DAY_MS)) : null;
  const wantsInvoice = random() < 0.25;
  const customerNumber = between(1, 9);
  const customer =
    isCredit || wantsInvoice
      ? {
          documentType: 'CC',
          documentNumber: `10000000${customerNumber}`,
          verificationDigit: null,
          personType: 'natural',
          name: `Cliente Prueba ${customerNumber}`,
          phone: TEST_CUSTOMER_PHONE,
          email: wantsInvoice ? `cliente${customerNumber}@mock.labcar.local` : '',
          address: wantsInvoice ? 'Dirección de prueba' : '',
          city: wantsInvoice ? 'Medellín, Antioquia' : '',
          taxRegime: wantsInvoice ? 'not-vat-responsible' : null,
        }
      : null;

  return {
    id: `PRUEBA-${number}`,
    data: {
      number: null,
      date: Timestamp.fromDate(date),
      vehicleType,
      plate: plate(vehicleType),
      vehicleLine: pick(VEHICLE_LINES[vehicleType]),
      items,
      subtotal,
      discount,
      total,
      commissionRate: COMMISSION_RATE,
      commission,
      sellers: sellers.map((seller, index) => ({ email: seller.email, name: seller.name, commission: shares[index] })),
      sellerEmails: sellers.map((seller) => seller.email),
      paymentMethod,
      status,
      payment: paidAt
        ? { at: Timestamp.fromDate(paidAt), method: pick(['cash', 'transfer']), by: { email: 'admin@mock.labcar.local', name: 'Administrador (prueba)' } }
        : null,
      customer,
      invoice: {
        status: wantsInvoice ? 'pending' : 'not-requested',
        recipient: wantsInvoice ? 'customer' : null,
        number: null,
        cufe: null,
        pdfUrl: null,
        error: null,
      },
      notes: '',
      createdBy: { email: sellers[0].email, name: sellers[0].name },
      void: null,
      mock: true,
    },
  };
}

function buildSales(now: Date): MockDoc[] {
  const sales: MockDoc[] = [];
  for (const day of businessDays(now)) {
    const isSaturday = bogotaWeekday(day) === 6;
    const count = between(isSaturday ? 8 : 5, isSaturday ? 14 : 10);
    for (let i = 0; i < count; i++) {
      const date = timeDuring(day);
      if (date <= now) sales.push(buildSale(date, now, sales.length + 1));
    }
  }
  return sales;
}

function buildExpenses(now: Date): MockDoc[] {
  const expenses: MockDoc[] = [];
  const add = (date: Date, category: string, description: string, amount: number) => {
    if (date <= now) {
      expenses.push({ id: `PRUEBA-G${expenses.length + 1}`, data: { date: Timestamp.fromDate(date), category, description, amount, mock: true } });
    }
  };

  for (const day of businessDays(now)) {
    const dayOfMonth = new Date(day.getTime() - BOGOTA_OFFSET_MS).getUTCDate();
    if (dayOfMonth <= 6 && bogotaWeekday(day) === 1) add(timeDuring(day), 'Arriendo', 'Arriendo del local', 4_500_000);
    if (bogotaWeekday(day) === 5) add(timeDuring(day), 'Servicios públicos', 'Agua y energía', price(250_000, 420_000));
    for (let i = between(0, 2); i > 0; i--) {
      const kind = pick(EXPENSES);
      add(timeDuring(day), kind.category, pick(kind.descriptions), price(kind.min, kind.max));
    }
  }
  return expenses;
}

function buildUsers(): MockDoc[] {
  return SELLERS.map((seller) => ({ id: seller.email, data: { name: seller.name, role: 'basic', active: true, mock: true } }));
}

// ---------- Firestore ----------

async function clearMock(db: Firestore, collection: string): Promise<number> {
  const snapshot = await db.collection(collection).where('mock', '==', true).get();
  for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + BATCH_LIMIT).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  return snapshot.size;
}

async function insert(db: Firestore, collection: string, docs: readonly MockDoc[]): Promise<void> {
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    docs.slice(i, i + BATCH_LIMIT).forEach((doc) => batch.set(db.collection(collection).doc(doc.id), doc.data));
    await batch.commit();
  }
}

function printSummary(sales: readonly MockDoc[], expenses: readonly MockDoc[]): void {
  const total = (docs: readonly MockDoc[], key: string) => docs.reduce((sum, doc) => sum + (doc.data[key] as number), 0);
  const pending = sales.filter((sale) => sale.data.status === 'pending');
  const cop = (value: number) => `$ ${value.toLocaleString('es-CO')}`;
  console.log(`Ventas: ${sales.length} · total ${cop(total(sales, 'total'))} · por cobrar ${pending.length} (${cop(total(pending, 'total'))})`);
  console.log(`Comisiones: ${cop(total(sales, 'commission'))}`);
  console.log(`Gastos: ${expenses.length} · total ${cop(total(expenses, 'amount'))}`);
  const sundays = [...sales, ...expenses].filter((doc) => bogotaWeekday((doc.data.date as Timestamp).toDate()) === 0);
  console.log(`Documentos en domingo: ${sundays.length}`);
  const sample = sales[sales.length - 1];
  console.log('Ejemplo:', JSON.stringify({ id: sample.id, ...sample.data, date: (sample.data.date as Timestamp).toDate() }));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'seed' && command !== 'clear' && command !== 'preview') {
    console.error('Uso: node scripts/mock-data.ts <seed|clear|preview>');
    process.exit(1);
  }

  const now = new Date();
  if (command === 'preview') {
    printSummary(buildSales(now), buildExpenses(now));
    return;
  }

  const db = connect();
  const removed = await Promise.all(['sales', 'expenses', 'users'].map((collection) => clearMock(db, collection)));
  console.log(`Borrados: ${removed[0]} ventas, ${removed[1]} gastos y ${removed[2]} empleados de prueba.`);
  if (command === 'clear') return;

  const sales = buildSales(now);
  const expenses = buildExpenses(now);
  const users = buildUsers();
  await insert(db, 'users', users);
  await insert(db, 'sales', sales);
  await insert(db, 'expenses', expenses);
  console.log(`Creados: ${users.length} empleados, ${sales.length} ventas y ${expenses.length} gastos de prueba (${WEEKS_BACK} semanas, lunes a sábado).`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
