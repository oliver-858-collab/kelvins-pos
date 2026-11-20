// ============================================================
// Kelvin's POS System – Central Type Definitions
// ============================================================

import { Session } from '@supabase/supabase-js';

export type { Session };

// ------------------------------------------------------------------
// Auth & Users
// ------------------------------------------------------------------

export type UserStatus = 'active' | 'pending' | 'suspended' | 'rejected';
export type RoleName = 'admin' | 'cashier' | 'storekeeper' | 'super_admin' | 'manager' | 'custom';

export interface Permission {
  id: string;
  module: string;
  action: string; // 'read' | 'write' | 'delete' | 'approve'
}

export interface Role {
  id: string;
  name: RoleName;
  display_name: string;
  permissions: Permission[];
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  role_id: string;
  role?: Role;
  status: UserStatus;
  pin_hash?: string;
  shop_id?: string;
  created_at: string;
  updated_at: string;
}

export interface LoginHistory {
  id: string;
  user_id: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

// ------------------------------------------------------------------
// Product & Inventory
// ------------------------------------------------------------------

export interface Category {
  id: string;
  name: string;
  description?: string;
  parent_id?: string;
  shop_id: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  description?: string;
  category_id?: string;
  category?: Category;
  image_url?: string;
  price: number;
  cost_price?: number;
  tax_rate?: number;
  track_stock: boolean;
  shop_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  variants?: ProductVariant[];
  stock?: StockItem;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  sku?: string;
  price_modifier: number;
  stock_quantity: number;
  attributes: Record<string, string>;
}

export interface StockItem {
  id: string;
  product_id: string;
  quantity: number;
  min_quantity: number;
  max_quantity?: number;
  location?: string;
  last_updated: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  reference_id?: string;
  note?: string;
  user_id: string;
  created_at: string;
}

// ------------------------------------------------------------------
// Sales & POS
// ------------------------------------------------------------------

export type PaymentMethod = 'cash' | 'mpesa' | 'card' | 'credit' | 'mixed' | 'bank_transfer';
export type SaleStatus = 'pending' | 'completed' | 'voided' | 'refunded' | 'held';

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product?: Product;
  variant_id?: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  total_price: number;
}

export interface Payment {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  amount: number;
  reference?: string; // M-Pesa code, card last 4
  created_at: string;
}

export interface Sale {
  id: string;
  receipt_number: string;
  customer_id?: string;
  customer?: Customer;
  cashier_id: string;
  cashier?: User;
  items: SaleItem[];
  payments: Payment[];
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  change_given: number;
  status: SaleStatus;
  note?: string;
  shop_id: string;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------------
// Cart (POS client-side)
// ------------------------------------------------------------------

export interface CartItem {
  id: string;
  product_id: string;
  variant_id?: string;
  discount_percent: number;
  notes?: string;
  product: Product;
  variant?: ProductVariant;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  total_price: number;
}

export interface HeldSale {
  id: string;
  items: CartItem[];
  customer?: Customer;
  note?: string;
  label: string;
  customer_id?: string;
  discount_amount: number;
  created_at: string;
}

export type CartPaymentEntry = Pick<Payment, 'method' | 'amount' | 'reference'>;

export type OfflineSalePayload = Omit<Sale, 'id' | 'receipt_number' | 'created_at' | 'updated_at'>;

export interface OfflineSale {
  offline_id: string;
  sale_data: OfflineSalePayload;
  queued_at: string;
  sync_attempts: number;
  status: 'queued' | 'syncing' | 'synced' | 'failed';
  last_sync_attempt?: string;
  sync_error?: string;
}

// ------------------------------------------------------------------
// Customers
// ------------------------------------------------------------------

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  loyalty_points: number;
  credit_limit: number;
  credit_balance: number;
  shop_id: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerCredit {
  id: string;
  customer_id: string;
  amount: number;
  type: 'credit' | 'payment';
  reference_id?: string;
  note?: string;
  created_at: string;
}

// ------------------------------------------------------------------
// Employees / HR
// ------------------------------------------------------------------

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half-day' | 'leave';
export type PayrollStatus = 'pending' | 'approved' | 'paid';

export interface Employee {
  id: string;
  user_id: string;
  user?: User;
  employee_number: string;
  department?: string;
  position: string;
  basic_salary: number;
  hire_date: string;
  shop_id: string;
  created_at: string;
}

export interface Attendance {
  id: string;
  employee_id: string;
  employee?: Employee;
  date: string;
  clock_in?: string;
  clock_out?: string;
  status: AttendanceStatus;
  note?: string;
  created_at: string;
}

export interface Wage {
  id: string;
  employee_id: string;
  employee?: Employee;
  period_start: string;
  period_end: string;
  basic_salary: number;
  allowances: number;
  deductions: number;
  net_salary: number;
  status: PayrollStatus;
  paid_at?: string;
  created_at: string;
}

export interface Payroll {
  id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  status: PayrollStatus;
  approved_by?: string;
  shop_id: string;
  entries: Wage[];
  created_at: string;
}

// ------------------------------------------------------------------
// Expenses
// ------------------------------------------------------------------

export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string;
  shop_id: string;
}

export interface Expense {
  id: string;
  category_id: string;
  category?: ExpenseCategory;
  amount: number;
  description: string;
  receipt_url?: string;
  paid_by: string;
  paid_by_user?: User;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by?: string;
  shop_id: string;
  created_at: string;
}

// ------------------------------------------------------------------
// Services
// ------------------------------------------------------------------

export type ServiceStatus = 'queued' | 'in_progress' | 'completed' | 'cancelled';

export interface Service {
  id: string;
  name: string;
  description?: string;
  price: number;
  estimated_duration?: number; // minutes
  shop_id: string;
  is_active: boolean;
  created_at: string;
}

export interface ServiceJob {
  id: string;
  service_id: string;
  service?: Service;
  customer_id?: string;
  customer?: Customer;
  technician_id?: string;
  technician?: Employee;
  description: string;
  status: ServiceStatus;
  price: number;
  started_at?: string;
  completed_at?: string;
  note?: string;
  shop_id: string;
  created_at: string;
}

// ------------------------------------------------------------------
// Notifications
// ------------------------------------------------------------------

export type NotificationCategory =
  | 'approval'
  | 'stock'
  | 'payment'
  | 'attendance'
  | 'system'
  | 'sale';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  is_read: boolean;
  link?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ------------------------------------------------------------------
// Approvals
// ------------------------------------------------------------------

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalType =
  | 'expense'
  | 'stock_adjustment'
  | 'discount'
  | 'void_sale'
  | 'payroll'
  | 'user_registration';

export interface Approval {
  id: string;
  type: ApprovalType;
  reference_id: string;
  requested_by: string;
  requester?: User;
  reviewed_by?: string;
  reviewer?: User;
  status: ApprovalStatus;
  note?: string;
  metadata?: Record<string, unknown>;
  shop_id: string;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------------
// Audit Log
// ------------------------------------------------------------------

export interface AuditLog {
  id: string;
  user_id: string;
  user?: User;
  action: string;
  entity: string;
  entity_id: string;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  ip_address?: string;
  shop_id: string;
  created_at: string;
}

// ------------------------------------------------------------------
// Settings & Shop
// ------------------------------------------------------------------

export interface ShopProfile {
  id: string;
  name: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  tax_id?: string;
  currency: string;
  timezone: string;
  receipt_footer?: string;
  invitation_code?: string;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  shop: ShopProfile;
  tax_rate: number;
  receipt_print_auto: boolean;
  low_stock_alert_threshold: number;
  mpesa_enabled: boolean;
  mpesa_paybill?: string;
  mpesa_account?: string;
  loyalty_points_per_kes: number;
}

// ------------------------------------------------------------------
// Reports
// ------------------------------------------------------------------

export interface DateRangeFilter {
  start: string;
  end: string;
}

export interface SalesReportFilter extends DateRangeFilter {
  cashier_id?: string;
  payment_method?: PaymentMethod;
  category_id?: string;
}

export interface InventoryReportFilter {
  category_id?: string;
  low_stock_only?: boolean;
}

export interface ReportSummary {
  total_sales: number;
  total_revenue: number;
  total_profit: number;
  total_expenses: number;
  net_profit: number;
  top_products: Array<{ product: Product; quantity: number; revenue: number }>;
  sales_by_day: Array<{ date: string; revenue: number; count: number }>;
  sales_by_payment: Array<{ method: PaymentMethod; amount: number; count: number }>;
}

// Re-export extended types for Wages, Payroll, Expenses, and Creditors
export * from './payroll';
export * from './expenses';
export * from './creditors';
