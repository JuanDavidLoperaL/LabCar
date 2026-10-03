/** Documento de la colección `expenses`. Valores en pesos colombianos. */
export interface Expense {
  id: string;
  date: Date;
  category: string;
  description: string;
  amount: number;
}
