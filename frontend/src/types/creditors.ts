export type CreditorStatus = 'current' | 'due_soon' | 'overdue' | 'paid';

export interface Creditor {
  id: string;
  supplier_id: string;
  supplier_name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: CreditorStatus;
  notes?: string;
  items_summary?: string;
  created_at: string;
}

export interface CreditorPayment {
  id: string;
  creditor_id: string;
  supplier_name: string;
  amount: number;
  payment_date: string;
  payment_method: 'cash' | 'mpesa' | 'bank_transfer' | 'cheque';
  reference: string;
  notes?: string;
  recorded_by?: string;
  created_at: string;
}

export interface SupplierStatementEntry {
  id: string;
  date: string;
  reference: string;
  type: 'invoice' | 'payment' | 'credit_note' | 'debit_note';
  description: string;
  debit: number; // Invoices increases what we owe
  credit: number; // Payments reduce what we owe
  balance: number; // Cumulative running balance
}

export interface SupplierStatementData {
  supplier: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    kra_pin?: string;
  };
  statement_period: {
    start: string;
    end: string;
  };
  opening_balance: number;
  total_purchases: number;
  total_payments: number;
  closing_balance: number;
  entries: SupplierStatementEntry[];
}

export interface CreditorAgingSummary {
  current: number;       // 0-30 days
  days31to60: number;    // 31-60 days
  days61to90: number;    // 61-90 days
  over90days: number;    // >90 days
  total: number;
}
