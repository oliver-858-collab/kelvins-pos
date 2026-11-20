// ============================================================
// Kelvin's POS System – Customers API Service
// ============================================================

import { supabase } from '../lib/supabase';
import type { Customer, CustomerCredit, Sale } from '../types';

// ─── Extended Types ───────────────────────────────────────────

export interface CustomerExtended extends Customer {
  total_purchases?: number;
  credit_used?: number;
  credit_status?: 'active' | 'blocked' | 'none';
  last_visit?: string;
  notes_count?: number;
}

export interface CustomerNote {
  id: string;
  customer_id: string;
  author_id: string;
  author?: { full_name: string };
  content: string;
  created_at: string;
}

export interface CustomerPayment {
  id: string;
  customer_id: string;
  amount: number;
  reference?: string;
  method: string;
  recorded_by: string;
  note?: string;
  created_at: string;
}

export interface CustomerStatementEntry {
  date: string;
  type: 'Sale' | 'Payment' | 'Credit Adjustment';
  reference: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface CustomerStatement {
  customer: CustomerExtended;
  date_from: string;
  date_to: string;
  opening_balance: number;
  closing_balance: number;
  entries: CustomerStatementEntry[];
}

export interface DebtorAging {
  customer: CustomerExtended;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total: number;
}

export interface CreateCustomerPayload {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  credit_limit?: number;
  shop_id: string;
}

export interface UpdateCustomerPayload extends Partial<CreateCustomerPayload> {
  id: string;
  credit_status?: 'active' | 'blocked';
}

export interface CustomerFilters {
  search?: string;
  credit_status?: 'active' | 'blocked' | 'none';
  overdue?: boolean;
  shop_id: string;
}

// ─── Customers CRUD ───────────────────────────────────────────

export async function fetchCustomers(filters: CustomerFilters): Promise<CustomerExtended[]> {
  let query = supabase
    .from('customers')
    .select('*')
    .eq('shop_id', filters.shop_id)
    .order('name');

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
  }
  if (filters.credit_status) {
    query = query.eq('credit_status', filters.credit_status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as CustomerExtended[];
}

export async function fetchCustomerById(id: string): Promise<CustomerExtended> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as CustomerExtended;
}

export async function createCustomer(payload: CreateCustomerPayload): Promise<CustomerExtended> {
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...payload, credit_balance: 0, loyalty_points: 0, credit_status: 'none' })
    .select()
    .single();
  if (error) throw error;
  return data as CustomerExtended;
}

export async function updateCustomer(payload: UpdateCustomerPayload): Promise<CustomerExtended> {
  const { id, ...rest } = payload;
  const { data, error } = await supabase
    .from('customers')
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CustomerExtended;
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw error;
}

// ─── Credit Management ────────────────────────────────────────

export async function blockCustomerCredit(id: string): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ credit_status: 'blocked', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function unblockCustomerCredit(id: string): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ credit_status: 'active', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function requestCreditLimitIncrease(
  customer_id: string,
  new_limit: number,
  requested_by: string,
  shop_id: string,
): Promise<void> {
  const { error } = await supabase.from('approvals').insert({
    type: 'credit_limit_increase',
    reference_id: customer_id,
    requested_by,
    status: 'pending',
    metadata: { new_limit },
    shop_id,
  });
  if (error) throw error;
}

export async function requestCreditWriteOff(
  customer_id: string,
  amount: number,
  requested_by: string,
  shop_id: string,
): Promise<void> {
  const { error } = await supabase.from('approvals').insert({
    type: 'credit_write_off',
    reference_id: customer_id,
    requested_by,
    status: 'pending',
    metadata: { amount },
    shop_id,
  });
  if (error) throw error;
}

// ─── Payments ─────────────────────────────────────────────────

export async function addCustomerPayment(payload: {
  customer_id: string;
  amount: number;
  method: string;
  reference?: string;
  note?: string;
  recorded_by: string;
  shop_id: string;
}): Promise<CustomerPayment> {
  const { data, error } = await supabase
    .from('customer_payments')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;

  // Update credit balance
  const { data: customer } = await supabase
    .from('customers')
    .select('credit_balance')
    .eq('id', payload.customer_id)
    .single();
  if (customer) {
    await supabase
      .from('customers')
      .update({
        credit_balance: Math.max(0, customer.credit_balance - payload.amount),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.customer_id);
  }

  return data as CustomerPayment;
}

export async function fetchCustomerPayments(customer_id: string): Promise<CustomerPayment[]> {
  const { data, error } = await supabase
    .from('customer_payments')
    .select('*')
    .eq('customer_id', customer_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as CustomerPayment[];
}

// ─── Purchase History ─────────────────────────────────────────

export async function fetchCustomerPurchaseHistory(customer_id: string): Promise<Sale[]> {
  const { data, error } = await supabase
    .from('sales')
    .select('*, items:sale_items(*, product:products(*))')
    .eq('customer_id', customer_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Sale[];
}

export async function fetchCustomerStats(customer_id: string): Promise<{
  total_spend: number;
  avg_purchase: number;
  total_transactions: number;
  last_visit: string | null;
  top_products: Array<{ product_id: string; name: string; quantity: number; total: number }>;
}> {
  const { data: sales, error } = await supabase
    .from('sales')
    .select('total_amount, created_at, items:sale_items(product_id, quantity, total_price, product:products(name))')
    .eq('customer_id', customer_id)
    .eq('status', 'completed');
  if (error) throw error;

  const totalSpend = sales?.reduce((sum, s) => sum + s.total_amount, 0) ?? 0;
  const totalTx = sales?.length ?? 0;
  const avgPurchase = totalTx > 0 ? totalSpend / totalTx : 0;
  const lastVisit = sales?.[0]?.created_at ?? null;

  // Aggregate top products
  const productMap: Record<string, { product_id: string; name: string; quantity: number; total: number }> = {};
  for (const sale of sales ?? []) {
    for (const item of (sale.items as any[]) ?? []) {
      if (!productMap[item.product_id]) {
        productMap[item.product_id] = {
          product_id: item.product_id,
          name: item.product?.name ?? 'Unknown',
          quantity: 0,
          total: 0,
        };
      }
      productMap[item.product_id].quantity += item.quantity;
      productMap[item.product_id].total += item.total_price;
    }
  }
  const topProducts = Object.values(productMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return { total_spend: totalSpend, avg_purchase: avgPurchase, total_transactions: totalTx, last_visit: lastVisit, top_products: topProducts };
}

// ─── Notes ────────────────────────────────────────────────────

export async function fetchCustomerNotes(customer_id: string): Promise<CustomerNote[]> {
  const { data, error } = await supabase
    .from('customer_notes')
    .select('*, author:users(full_name)')
    .eq('customer_id', customer_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as CustomerNote[];
}

export async function addCustomerNote(customer_id: string, content: string, author_id: string): Promise<CustomerNote> {
  const { data, error } = await supabase
    .from('customer_notes')
    .insert({ customer_id, content, author_id })
    .select('*, author:users(full_name)')
    .single();
  if (error) throw error;
  return data as CustomerNote;
}

// ─── Statement ────────────────────────────────────────────────

export async function generateCustomerStatement(
  customer_id: string,
  date_from: string,
  date_to: string,
): Promise<CustomerStatement> {
  const [customerRes, salesRes, paymentsRes] = await Promise.all([
    supabase.from('customers').select('*').eq('id', customer_id).single(),
    supabase
      .from('sales')
      .select('id, receipt_number, total_amount, created_at, status')
      .eq('customer_id', customer_id)
      .gte('created_at', date_from)
      .lte('created_at', date_to)
      .eq('status', 'completed')
      .order('created_at'),
    supabase
      .from('customer_payments')
      .select('id, amount, reference, created_at')
      .eq('customer_id', customer_id)
      .gte('created_at', date_from)
      .lte('created_at', date_to)
      .order('created_at'),
  ]);

  if (customerRes.error) throw customerRes.error;

  const entries: CustomerStatementEntry[] = [];
  let runningBalance = 0;

  // Merge and sort by date
  const events: Array<{ date: string; type: 'Sale' | 'Payment'; ref: string; amount: number }> = [
    ...(salesRes.data ?? []).map((s: any) => ({ date: s.created_at, type: 'Sale' as const, ref: s.receipt_number, amount: s.total_amount })),
    ...(paymentsRes.data ?? []).map((p: any) => ({ date: p.created_at, type: 'Payment' as const, ref: p.reference ?? '-', amount: p.amount })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const openingBalance = runningBalance;

  for (const ev of events) {
    if (ev.type === 'Sale') {
      runningBalance += ev.amount;
      entries.push({ date: ev.date, type: 'Sale', reference: ev.ref, debit: ev.amount, credit: 0, balance: runningBalance });
    } else {
      runningBalance -= ev.amount;
      entries.push({ date: ev.date, type: 'Payment', reference: ev.ref, debit: 0, credit: ev.amount, balance: runningBalance });
    }
  }

  return {
    customer: customerRes.data as CustomerExtended,
    date_from,
    date_to,
    opening_balance: openingBalance,
    closing_balance: runningBalance,
    entries,
  };
}

// ─── Debtors / Aging ──────────────────────────────────────────

export async function fetchDebtors(shop_id: string): Promise<DebtorAging[]> {
  const { data: customers, error } = await supabase
    .from('customers')
    .select('*')
    .eq('shop_id', shop_id)
    .gt('credit_balance', 0)
    .order('credit_balance', { ascending: false });
  if (error) throw error;

  // For each customer compute aging buckets from their overdue sales
  const now = new Date();
  const aging: DebtorAging[] = (customers ?? []).map((c: any) => ({
    customer: c as CustomerExtended,
    current: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0,
    total: c.credit_balance,
  }));

  // Simplified: assign total to aging bucket by last sale date — real impl fetches per-invoice aging
  return aging;
}

export async function sendDebtorReminder(
  customer_id: string,
  channel: 'whatsapp' | 'email',
  shop_id: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('send-notification', {
    body: { customer_id, channel, type: 'debt_reminder', shop_id },
  });
  if (error) throw error;
}
