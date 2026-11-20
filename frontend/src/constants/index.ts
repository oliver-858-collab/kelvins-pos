// ============================================================
// Kelvin's POS System – Application Constants
// ============================================================

import type { RoleName, PaymentMethod, SaleStatus, ExpenseStatus, ServiceStatus } from '../types';
import type { ServiceJobStatus } from '../services/servicesService';

type DisplayRole = RoleName | 'staff';

// ─── Roles ───────────────────────────────────────────────────

export const ROLES: Record<DisplayRole, { label: string; color: string }> = {
  super_admin: { label: 'Super Admin', color: 'rose' },
  admin:       { label: 'Admin',       color: 'purple' },
  manager:     { label: 'Manager',     color: 'blue' },
  cashier:     { label: 'Cashier',     color: 'green' },
  storekeeper: { label: 'Storekeeper', color: 'teal' },
  custom:     { label: 'Custom',      color: 'gray' },
  staff:       { label: 'Staff',       color: 'gray' },
};

// ─── Permissions ─────────────────────────────────────────────

export const PERMISSIONS = {
  // Dashboard
  VIEW_DASHBOARD:        'view_dashboard',
  VIEW_ADMIN_DASHBOARD:  'view_admin_dashboard',

  // POS
  VIEW_POS:              'view_pos',
  CREATE_SALE:           'create_sale',
  VOID_SALE:             'void_sale',
  APPLY_DISCOUNT:        'apply_discount',
  APPLY_LARGE_DISCOUNT:  'apply_large_discount',
  PROCESS_REFUND:        'process_refund',

  // Inventory
  VIEW_INVENTORY:        'view_inventory',
  CREATE_PRODUCT:        'create_product',
  EDIT_PRODUCT:          'edit_product',
  DELETE_PRODUCT:        'delete_product',
  ADJUST_STOCK:          'adjust_stock',

  // Customers
  VIEW_CUSTOMERS:        'view_customers',
  CREATE_CUSTOMER:       'create_customer',
  EDIT_CUSTOMER:         'edit_customer',
  DELETE_CUSTOMER:       'delete_customer',
  MANAGE_CREDIT:         'manage_credit',

  // Employees
  VIEW_EMPLOYEES:        'view_employees',
  CREATE_EMPLOYEE:       'create_employee',
  EDIT_EMPLOYEE:         'edit_employee',
  DELETE_EMPLOYEE:       'delete_employee',

  // Attendance
  VIEW_ATTENDANCE:       'view_attendance',
  MANAGE_ATTENDANCE:     'manage_attendance',
  VIEW_OWN_ATTENDANCE:   'view_own_attendance',

  // Wages & Payroll
  VIEW_PAYROLL:          'view_payroll',
  GENERATE_PAYROLL:      'generate_payroll',
  APPROVE_PAYROLL:       'approve_payroll',
  VIEW_OWN_WAGES:        'view_own_wages',

  // Expenses
  VIEW_EXPENSES:         'view_expenses',
  CREATE_EXPENSE:        'create_expense',
  EDIT_EXPENSE:          'edit_expense',
  APPROVE_EXPENSE:       'approve_expense',

  // Services
  VIEW_SERVICES:         'view_services',
  MANAGE_SERVICES:       'manage_services',
  MANAGE_SERVICE_JOBS:   'manage_service_jobs',

  // Approvals
  VIEW_APPROVALS:        'view_approvals',
  APPROVE_REQUESTS:      'approve_requests',

  // Reports
  VIEW_REPORTS:          'view_reports',
  EXPORT_REPORTS:        'export_reports',

  // Settings
  VIEW_SETTINGS:         'view_settings',
  EDIT_SETTINGS:         'edit_settings',
  MANAGE_USERS:          'manage_users',
  MANAGE_ROLES:          'manage_roles',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export type PermissionValue = typeof PERMISSIONS[PermissionKey];

// Admin has all permissions, manager has most, cashier has POS-specific
export const ROLE_PERMISSIONS: Record<DisplayRole, PermissionValue[]> = {
  super_admin: Object.values(PERMISSIONS),
  admin:       Object.values(PERMISSIONS),
  manager: [
    PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.VIEW_ADMIN_DASHBOARD,
    PERMISSIONS.VIEW_POS, PERMISSIONS.CREATE_SALE, PERMISSIONS.VOID_SALE,
    PERMISSIONS.APPLY_DISCOUNT, PERMISSIONS.APPLY_LARGE_DISCOUNT, PERMISSIONS.PROCESS_REFUND,
    PERMISSIONS.VIEW_INVENTORY, PERMISSIONS.CREATE_PRODUCT, PERMISSIONS.EDIT_PRODUCT, PERMISSIONS.ADJUST_STOCK,
    PERMISSIONS.VIEW_CUSTOMERS, PERMISSIONS.CREATE_CUSTOMER, PERMISSIONS.EDIT_CUSTOMER, PERMISSIONS.MANAGE_CREDIT,
    PERMISSIONS.VIEW_EMPLOYEES, PERMISSIONS.VIEW_ATTENDANCE, PERMISSIONS.MANAGE_ATTENDANCE,
    PERMISSIONS.VIEW_PAYROLL, PERMISSIONS.GENERATE_PAYROLL,
    PERMISSIONS.VIEW_EXPENSES, PERMISSIONS.CREATE_EXPENSE, PERMISSIONS.EDIT_EXPENSE,
    PERMISSIONS.VIEW_SERVICES, PERMISSIONS.MANAGE_SERVICES, PERMISSIONS.MANAGE_SERVICE_JOBS,
    PERMISSIONS.VIEW_APPROVALS,
    PERMISSIONS.VIEW_REPORTS, PERMISSIONS.EXPORT_REPORTS,
  ],
  cashier: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_POS, PERMISSIONS.CREATE_SALE, PERMISSIONS.APPLY_DISCOUNT,
    PERMISSIONS.VIEW_CUSTOMERS, PERMISSIONS.CREATE_CUSTOMER,
    PERMISSIONS.VIEW_INVENTORY,
    PERMISSIONS.VIEW_OWN_ATTENDANCE,
    PERMISSIONS.VIEW_OWN_WAGES,
  ],
  storekeeper: [PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.VIEW_INVENTORY],
  custom: [],
  staff: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_POS, PERMISSIONS.CREATE_SALE,
    PERMISSIONS.VIEW_INVENTORY,
    PERMISSIONS.VIEW_OWN_ATTENDANCE,
    PERMISSIONS.VIEW_OWN_WAGES,
  ],
};

// ─── Currency ─────────────────────────────────────────────────

export const CURRENCY = {
  code:   'KES',
  symbol: 'KSh',
  name:   'Kenyan Shilling',
  locale: 'en-KE',
} as const;

// ─── Payment Methods ──────────────────────────────────────────

export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; icon: string; color: string }> = {
  cash:          { label: 'Cash',          icon: 'banknote',       color: 'green' },
  mpesa:         { label: 'M-Pesa',        icon: 'smartphone',     color: 'emerald' },
  card:          { label: 'Card',          icon: 'credit-card',    color: 'blue' },
  bank_transfer: { label: 'Bank Transfer', icon: 'building-2',     color: 'purple' },
  credit:        { label: 'Credit',        icon: 'clock',          color: 'amber' },
  mixed:         { label: 'Mixed',         icon: 'layers',         color: 'gray' },
};

// ─── Tax Rates ────────────────────────────────────────────────

export const TAX_RATES = [
  { label: 'No Tax (0%)',  value: 0 },
  { label: 'VAT (16%)',    value: 16 },
  { label: 'Exempt',       value: 0 },
] as const;

// ─── Sale Statuses ────────────────────────────────────────────

export const SALE_STATUSES: Record<SaleStatus | 'on_hold', { label: string; color: string }> = {
  pending:   { label: 'Pending',   color: 'amber' },
  completed: { label: 'Completed', color: 'green' },
  voided:    { label: 'Voided',    color: 'red' },
  refunded:  { label: 'Refunded',  color: 'blue' },
  held:      { label: 'On Hold',   color: 'gray' },
  on_hold:   { label: 'On Hold',   color: 'gray' },
};

// ─── Expense Statuses ─────────────────────────────────────────

export const EXPENSE_STATUSES: Record<ExpenseStatus, { label: string; color: string }> = {
  pending:   { label: 'Pending',   color: 'amber' },
  approved:  { label: 'Approved',  color: 'blue' },
  rejected:  { label: 'Rejected',  color: 'red' },
  paid:      { label: 'Paid',      color: 'green' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

// ─── Service Job Statuses ─────────────────────────────────────

export const SERVICE_JOB_STATUSES: Record<ServiceJobStatus | ServiceStatus | 'on_hold', { label: string; color: string }> = {
  quoted:      { label: 'Quoted',      color: 'amber' },
  accepted:    { label: 'Accepted',    color: 'blue' },
  paid:        { label: 'Paid',        color: 'green' },
  queued:      { label: 'Queued',      color: 'gray' },
  in_progress: { label: 'In Progress', color: 'blue' },
  completed:   { label: 'Completed',   color: 'green' },
  cancelled:   { label: 'Cancelled',   color: 'red' },
  on_hold:     { label: 'On Hold',     color: 'amber' },
};

// ─── Misc ─────────────────────────────────────────────────────

export const DATE_FORMATS = {
  display: 'dd MMM yyyy',
  full:    'dd MMM yyyy HH:mm',
  time:    'HH:mm',
  api:     'yyyy-MM-dd',
} as const;

export const PAGINATION_SIZES = [10, 25, 50, 100] as const;

export const APP_NAME = import.meta.env.VITE_APP_NAME ?? "Kelvin's POS";
export const APP_VERSION = '1.0.0';

export const LOCAL_STORAGE_KEYS = {
  THEME:          'kpos_theme',
  LANGUAGE:       'kpos_language',
  SIDEBAR_STATE:  'kpos_sidebar',
  CART:           'kpos_cart',
  HELD_SALES:     'kpos_held_sales',
} as const;

export const MPESA_PAYBILL = import.meta.env.VITE_MPESA_PAYBILL ?? '';

export const MAX_DISCOUNT_WITHOUT_APPROVAL = 10; // percent
export const LOW_STOCK_DEFAULT_THRESHOLD    = 10;
export const MAX_HELD_SALES                 = 5;
export const SALE_NUMBER_PREFIX             = 'INV';
export const JOB_NUMBER_PREFIX              = 'JOB';
export const EMPLOYEE_NUMBER_PREFIX         = 'EMP';
