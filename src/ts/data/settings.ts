import { doc, getDoc } from 'firebase/firestore';
import { DEFAULT_COMMISSION_RATE } from '../config/business';
import { getDb } from '../lib/firebase';

/** % de comisión vigente (settings/commissions.rate, 0–1). Si no está configurado, 40%. */
export async function fetchCommissionRate(): Promise<number> {
  const snapshot = await getDoc(doc(getDb(), 'settings', 'commissions'));
  const rate = snapshot.data()?.rate;
  return typeof rate === 'number' && rate >= 0 && rate <= 1 ? rate : DEFAULT_COMMISSION_RATE;
}
