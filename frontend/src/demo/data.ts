export const money = (amount: number) => 'KSh ' + new Intl.NumberFormat('en-KE').format(amount);

export const products: { id: string; name: string; category: string; price: number; stock: number }[] = [];

export interface Receipt {
  id: string;
  customer: string;
  method: string;
  total: number;
  time: string;
}

export const initialSales: Receipt[] = [];

export const records: Record<string, { columns: string[]; rows: string[][] }> = {};
