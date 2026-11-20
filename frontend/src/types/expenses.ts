export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';
export type ExpenseFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type CashAccountType = 'cash' | 'mpesa' | 'bank' | 'petty_cash';

export interface ExpenseItem {
  id: string;
  category_id: string;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  amount: number;
  description: string;
  vendor: string;
  payment_method: string;
  reference?: string;
  date: string;
  is_recurring: boolean;
  frequency?: ExpenseFrequency;
  next_due_date?: string;
  receipt_url?: string;
  status: ExpenseStatus;
  paid_by: string;
  paid_by_name?: string;
  approved_by?: string;
  branch_id?: string;
  branch_name?: string;
  requires_approval?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ExpenseCategoryDetail {
  id: string;
  name: string;
  description?: string;
  budget_limit: number;
  spent_amount: number;
  icon: string;
  color: string;
  created_at?: string;
}

export interface CashTransaction {
  id: string;
  account_type: CashAccountType;
  type: 'in' | 'out';
  amount: number;
  description: string;
  reference?: string;
  category?: string;
  date: string;
  balance_after?: number;
  performed_by: string;
  performed_by_name?: string;
  created_at: string;
}

export interface CashBookSummary {
  account_type: CashAccountType;
  opening_balance: number;
  total_in: number;
  total_out: number;
  closing_balance: number;
  declared_balance?: number;
  variance?: number;
}
