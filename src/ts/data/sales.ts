import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  type FirestoreDataConverter,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import type { DateRange } from '../lib/dates';
import { PAYMENT_METHODS, SALE_STATUSES, VEHICLE_TYPES, type Sale } from '../models/sale';
import { asDate, asNumber, asOneOf, asString } from './parse';

const saleConverter: FirestoreDataConverter<Sale | null> = {
  toFirestore: () => {
    throw new Error('Las ventas se escriben desde el módulo de Ventas.');
  },
  fromFirestore: (snapshot) => {
    const data = snapshot.data();
    const date = asDate(data.date);
    if (!date) return null; // sin fecha no se puede ubicar en ningún periodo
    return {
      id: snapshot.id,
      date,
      plate: asString(data.plate).toUpperCase(),
      vehicleLine: asString(data.vehicleLine),
      vehicleType: asOneOf(data.vehicleType, VEHICLE_TYPES, 'car'),
      customerName: asString(data.customerName),
      serviceName: asString(data.serviceName),
      sellerId: asString(data.sellerId),
      sellerName: asString(data.sellerName, 'Sin asignar'),
      paymentMethod: asOneOf(data.paymentMethod, PAYMENT_METHODS, 'cash'),
      total: asNumber(data.total),
      // Si el estado no es válido se asume pendiente: es mejor revisarla en cartera que darla por pagada.
      status: asOneOf(data.status, SALE_STATUSES, 'pending'),
      dueDate: asDate(data.dueDate),
      commission: asNumber(data.commission),
    };
  },
};

function salesCollection() {
  return collection(getDb(), 'sales').withConverter(saleConverter);
}

/** Ventas del rango, de la más reciente a la más antigua. */
export async function fetchSales(range: DateRange): Promise<Sale[]> {
  const snapshot = await getDocs(
    query(
      salesCollection(),
      where('date', '>=', Timestamp.fromDate(range.start)),
      where('date', '<', Timestamp.fromDate(range.end)),
      orderBy('date', 'desc'),
    ),
  );
  return snapshot.docs.map((doc) => doc.data()).filter((sale): sale is Sale => sale !== null);
}

