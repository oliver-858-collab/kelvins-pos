import { Employee, User } from './index';

export type WageType = 'monthly' | 'daily' | 'hourly' | 'commission' | 'base_plus_commission';
export type PayPeriodType = 'monthly' | 'bi-weekly' | 'weekly';
export type PayrollStatus = 'draft' | 'pending' | 'approved' | 'paid';
export type AdvanceStatus = 'pending' | 'approved' | 'rejected' | 'repaid';
export type PayrollPaymentMethod = 'cash' | 'mpesa' | 'bank';

export interface Advance {
  id: string;
  employee_id: string;
  employee?: Employee;
  amount: number;
  reason: string;
  date: string;
  remaining_balance: number;
  status: AdvanceStatus;
  approved_by?: string;
  monthly_deduction?: number;
  repayment_months?: number;
  repaid_amount?: number;
  created_at: string;
  updated_at?: string;
}

export interface PayrollRun {
  id: string;
  period_start: string;
  period_end: string;
  pay_period_type: PayPeriodType;
  branch_id?: string;
  employee_count: number;
  total_gross: number;
  total_net: number;
  total_deductions: number;
  total_nssf: number;
  total_nhif: number;
  total_paye: number;
  status: PayrollStatus;
  approved_by?: string;
  approver?: User;
  approved_at?: string;
  paid_at?: string;
  payment_method?: PayrollPaymentMethod;
  notes?: string;
  items?: PayrollItem[];
  created_at: string;
  updated_at?: string;
}

export interface PayrollItem {
  id: string;
  payroll_id: string;
  employee_id: string;
  employee_name: string;
  employee_number: string;
  position: string;
  department?: string;
  wage_type: WageType;
  rate: number;
  days_worked: number;
  hours_worked: number;
  basic_pay: number;
  commission: number;
  sales_total?: number;
  commission_rate?: number;
  overtime_hours: number;
  overtime_pay: number;
  bonuses: number;
  allowances: number;
  gross_pay: number;
  nssf: number;
  nhif: number;
  paye: number;
  fines: number;
  advances_deduction: number;
  total_deductions: number;
  net_pay: number;
  payment_method: PayrollPaymentMethod;
  payment_reference?: string;
  status: PayrollStatus;
  payslip_number: string;
  has_warning?: boolean;
  warning_reason?: string;
  notes?: string;
  created_at?: string;
}

export interface PayslipData {
  payslip_number: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  shop: {
    name: string;
    logo_url?: string;
    address: string;
    phone: string;
    email: string;
    pin_number?: string;
  };
  employee: {
    id: string;
    name: string;
    employee_number: string;
    department?: string;
    position: string;
    id_number?: string;
    nssf_number?: string;
    nhif_number?: string;
    kra_pin?: string;
    payment_method: PayrollPaymentMethod;
    payment_reference?: string;
    bank_name?: string;
    account_number?: string;
  };
  earnings: {
    basic_pay: number;
    overtime_hours: number;
    overtime_pay: number;
    commission: number;
    bonuses: number;
    allowances: number;
    gross_pay: number;
  };
  deductions: {
    nssf: number;
    nhif: number;
    paye: number;
    fines: number;
    advances: number;
    other?: number;
    total_deductions: number;
  };
  net_pay: number;
  status: PayrollStatus;
}
