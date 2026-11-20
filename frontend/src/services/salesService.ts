import { supabase } from '@/lib/supabase';
import type { Customer as CustomerRecord, PaymentMethod, SaleStatus } from '@/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Customer = Pick<CustomerRecord, 'id' | 'name' | 'phone' | 'email'>;

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  originalPrice?: number;
  discountAmount?: number;
  discountPct?: number;
  discountType?: string;
  lineTotal: number;
  isService?: boolean;
}

interface Payment {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  transactionCode?: string;
  dueDate?: string;
}

interface HeldSale {
  id: string;
  note?: string;
  items: CartItem[];
  customer: Customer | null;
  discountAmount: number;
  discountPct: number;
  taxRate: number;
  taxEnabled: boolean;
  notes: string;
  total: number;
  createdAt: string;
  itemsCount: number;
}

interface Sale {
  id: string;
  receiptNumber: string;
  items: CartItem[];
  customer: Customer | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  payments: Payment[];
  change: number;
  notes: string;
  status: SaleStatus;
  cashierId: string;
  branchId: string;
  createdAt: string;
}

export interface SaleInput {
  customer: Customer | null;
  subtotal: number;
  discountAmount: number;
  discountPct: number;
  taxAmount: number;
  taxRate: number;
  taxEnabled: boolean;
  total: number;
  notes: string;
  status: 'completed' | 'held' | 'voided';
}

export interface SalesFilters {
  branchId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  cashierId?: string;
  customerId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface RefundItem {
  saleItemId: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PriceApprovalRequest {
  productId: string;
  productName: string;
  originalPrice: number;
  floorPrice: number;
  proposedPrice: number;
  discountPct: number;
  reason: string;
  cashierId: string;
  branchId: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function generateReceiptNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `RCP-${dateStr}-${rand}`;
}

// ─── Service ───────────────────────────────────────────────────────────────────

export const salesService = {
  async createSale(saleInput: SaleInput, items: CartItem[], payments: Payment[]): Promise<Sale> {
    const receiptNumber = generateReceiptNumber();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get user profile for branch
    const { data: profile } = await supabase
      .from('profiles')
      .select('branch_id')
      .eq('id', user.id)
      .single();

    // Insert sale
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert({
        receipt_number: receiptNumber,
        customer_id: saleInput.customer?.id ?? null,
        cashier_id: user.id,
        branch_id: profile?.branch_id ?? null,
        subtotal: saleInput.subtotal,
        discount_amount: saleInput.discountAmount,
        discount_pct: saleInput.discountPct,
        tax_amount: saleInput.taxAmount,
        tax_rate: saleInput.taxRate,
        tax_enabled: saleInput.taxEnabled,
        total: saleInput.total,
        notes: saleInput.notes,
        status: saleInput.status,
      })
      .select()
      .single();

    if (saleErr) throw saleErr;

    // Insert sale items
    const itemRows = items.map(item => ({
      sale_id: sale.id,
      product_id: item.productId,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      original_price: item.originalPrice,
      discount_amount: item.discountAmount,
      discount_pct: item.discountPct,
      discount_type: item.discountType,
      line_total: item.lineTotal,
      is_service: item.isService,
    }));

    const { error: itemsErr } = await supabase.from('sale_items').insert(itemRows);
    if (itemsErr) throw itemsErr;

    // Insert payments
    const paymentRows = payments.map(p => ({
      sale_id: sale.id,
      method: p.method,
      amount: p.amount,
      reference: p.reference ?? null,
      transaction_code: p.transactionCode ?? null,
      due_date: p.dueDate ?? null,
    }));

    const { error: paymentsErr } = await supabase.from('payments').insert(paymentRows);
    if (paymentsErr) throw paymentsErr;

    // Update stock levels for non-service items
    for (const item of items.filter(i => !i.isService)) {
      await supabase.rpc('decrement_stock', {
        p_product_id: item.productId,
        p_branch_id: profile?.branch_id,
        p_quantity: item.quantity,
      });
    }

    // Log audit trail
    await supabase.from('audit_logs').insert({
      action: 'sale_completed',
      table_name: 'sales',
      record_id: sale.id,
      user_id: user.id,
      metadata: { receipt_number: receiptNumber, total: saleInput.total },
    }).then(() => {}); // non-critical, ignore errors

    return {
      id: sale.id,
      receiptNumber: sale.receipt_number,
      items,
      customer: saleInput.customer,
      subtotal: sale.subtotal,
      discountAmount: sale.discount_amount,
      taxAmount: sale.tax_amount,
      total: sale.total,
      payments,
      change: payments
        .filter(p => p.method === 'cash')
        .reduce((sum, p) => sum + p.amount, 0) - sale.total,
      notes: sale.notes,
      status: sale.status,
      cashierId: user.id,
      branchId: profile?.branch_id ?? '',
      createdAt: sale.created_at,
    };
  },

  async voidSale(saleId: string, reason: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('sales')
      .update({ status: 'voided', void_reason: reason, voided_by: user.id, voided_at: new Date().toISOString() })
      .eq('id', saleId);

    if (error) throw error;

    // Restore stock
    const { data: saleItems } = await supabase
      .from('sale_items')
      .select('product_id, quantity')
      .eq('sale_id', saleId)
      .eq('is_service', false);

    const { data: sale } = await supabase.from('sales').select('branch_id').eq('id', saleId).single();

    if (saleItems && sale) {
      for (const item of saleItems) {
        await supabase.rpc('increment_stock', {
          p_product_id: item.product_id,
          p_branch_id: sale.branch_id,
          p_quantity: item.quantity,
        });
      }
    }

    await supabase.from('audit_logs').insert({
      action: 'sale_voided',
      table_name: 'sales',
      record_id: saleId,
      user_id: user.id,
      metadata: { reason },
    });
  },

  async holdSale(cartData: Omit<HeldSale, 'id' | 'createdAt' | 'itemsCount'>, note: string): Promise<HeldSale> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: profile } = await supabase
      .from('profiles')
      .select('branch_id')
      .eq('id', user.id)
      .single();

    // Check max held sales
    const { count } = await supabase
      .from('held_sales')
      .select('id', { count: 'exact', head: true })
      .eq('cashier_id', user.id)
      .eq('status', 'held');

    if ((count ?? 0) >= 10) {
      throw new Error('Maximum of 10 held sales reached. Please resume or delete a held sale first.');
    }

    const { data, error } = await supabase
      .from('held_sales')
      .insert({
        cashier_id: user.id,
        branch_id: profile?.branch_id,
        customer_id: cartData.customer?.id ?? null,
        items: cartData.items,
        discount_amount: cartData.discountAmount,
        discount_pct: cartData.discountPct,
        tax_rate: cartData.taxRate,
        tax_enabled: cartData.taxEnabled,
        notes: cartData.notes,
        hold_note: note,
        total: cartData.total,
        status: 'held',
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      note: data.hold_note,
      items: data.items,
      customer: cartData.customer,
      discountAmount: data.discount_amount,
      discountPct: data.discount_pct,
      taxRate: data.tax_rate,
      taxEnabled: data.tax_enabled,
      notes: data.notes,
      createdAt: data.created_at,
      total: data.total,
      itemsCount: data.items?.length ?? 0,
    };
  },

  async getHeldSales(branchId?: string): Promise<HeldSale[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let query = supabase
      .from('held_sales')
      .select(`
        *,
        customer:customers(id, name, phone)
      `)
      .eq('cashier_id', user.id)
      .eq('status', 'held')
      .order('created_at', { ascending: false });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map(d => ({
      id: d.id,
      note: d.hold_note,
      items: d.items ?? [],
      customer: d.customer ?? null,
      discountAmount: d.discount_amount,
      discountPct: d.discount_pct,
      taxRate: d.tax_rate,
      taxEnabled: d.tax_enabled,
      notes: d.notes,
      createdAt: d.created_at,
      total: d.total,
      itemsCount: (d.items ?? []).length,
    }));
  },

  async resumeHeldSale(id: string): Promise<HeldSale> {
    const { data, error } = await supabase
      .from('held_sales')
      .select(`*, customer:customers(id, name, phone, email)`)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Mark as resumed
    await supabase
      .from('held_sales')
      .update({ status: 'resumed', resumed_at: new Date().toISOString() })
      .eq('id', id);

    return {
      id: data.id,
      note: data.hold_note,
      items: data.items ?? [],
      customer: data.customer ?? null,
      discountAmount: data.discount_amount,
      discountPct: data.discount_pct,
      taxRate: data.tax_rate,
      taxEnabled: data.tax_enabled,
      notes: data.notes,
      createdAt: data.created_at,
      total: data.total,
      itemsCount: (data.items ?? []).length,
    };
  },

  async deleteHeldSale(id: string): Promise<void> {
    const { error } = await supabase.from('held_sales').delete().eq('id', id);
    if (error) throw error;
  },

  async createRefund(
    originalSaleId: string,
    items: RefundItem[],
    reason: string,
    refundMethod: string
  ): Promise<Sale> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: originalSale } = await supabase
      .from('sales')
      .select('*, branch_id')
      .eq('id', originalSaleId)
      .single();

    if (!originalSale) throw new Error('Original sale not found');

    const refundTotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    const receiptNumber = generateReceiptNumber().replace('RCP', 'REF');

    const { data: refundSale, error } = await supabase
      .from('sales')
      .insert({
        receipt_number: receiptNumber,
        original_sale_id: originalSaleId,
        cashier_id: user.id,
        branch_id: originalSale.branch_id,
        subtotal: -refundTotal,
        discount_amount: 0,
        tax_amount: 0,
        total: -refundTotal,
        notes: reason,
        status: 'refunded',
        refund_method: refundMethod,
      })
      .select()
      .single();

    if (error) throw error;

    // Insert refund items (negative quantities)
    const refundItemRows = items.map(item => ({
      sale_id: refundSale.id,
      product_id: item.productId,
      name: item.name,
      quantity: -item.quantity,
      unit_price: item.unitPrice,
      line_total: -item.lineTotal,
    }));

    await supabase.from('sale_items').insert(refundItemRows);

    // Restore stock
    for (const item of items) {
      await supabase.rpc('increment_stock', {
        p_product_id: item.productId,
        p_branch_id: originalSale.branch_id,
        p_quantity: item.quantity,
      });
    }

    await supabase.from('audit_logs').insert({
      action: 'sale_refunded',
      table_name: 'sales',
      record_id: refundSale.id,
      user_id: user.id,
      metadata: { original_sale_id: originalSaleId, refund_total: refundTotal, reason },
    });

    return {
      id: refundSale.id,
      receiptNumber,
      items,
      customer: null,
      subtotal: -refundTotal,
      discountAmount: 0,
      taxAmount: 0,
      total: -refundTotal,
      payments: [{ method: refundMethod as Payment['method'], amount: refundTotal }],
      change: 0,
      notes: reason,
      status: 'refunded',
      cashierId: user.id,
      branchId: originalSale.branch_id,
      createdAt: refundSale.created_at,
    };
  },

  async getSale(id: string): Promise<Sale | null> {
    const { data, error } = await supabase
      .from('sales')
      .select(`
        *,
        customer:customers(id, name, phone, email),
        items:sale_items(*),
        payments(*)
      `)
      .eq('id', id)
      .single();

    if (error) return null;
    return data as unknown as Sale;
  },

  async getSales(filters: SalesFilters = {}): Promise<{ data: Sale[]; count: number }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('sales')
      .select(`
        *,
        customer:customers(id, name, phone),
        payments(method, amount)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);
    if (filters.cashierId) query = query.eq('cashier_id', filters.cashierId);
    if (filters.customerId) query = query.eq('customer_id', filters.customerId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.startDate) query = query.gte('created_at', filters.startDate);
    if (filters.endDate) query = query.lte('created_at', filters.endDate);
    if (filters.search) {
      query = query.or(`receipt_number.ilike.%${filters.search}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return { data: (data ?? []) as unknown as Sale[], count: count ?? 0 };
  },

  async requestPriceApproval(req: PriceApprovalRequest): Promise<{ id: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('approvals')
      .insert({
        type: 'price_negotiation',
        status: 'pending',
        requested_by: user.id,
        branch_id: req.branchId,
        metadata: {
          product_id: req.productId,
          product_name: req.productName,
          original_price: req.originalPrice,
          floor_price: req.floorPrice,
          proposed_price: req.proposedPrice,
          discount_pct: req.discountPct,
          reason: req.reason,
        },
      })
      .select('id')
      .single();

    if (error) throw error;

    // Send notification to admins
    await supabase.from('notifications').insert({
      type: 'price_approval_request',
      title: 'Price Negotiation Request',
      message: `${req.productName}: KES ${req.originalPrice} → KES ${req.proposedPrice} (${req.discountPct.toFixed(1)}% off)`,
      metadata: { approval_id: data.id, ...req },
      target_role: 'admin',
    }).then(() => {});

    return { id: data.id };
  },

  async getSaleByReceiptNumber(receiptNumber: string): Promise<Sale | null> {
    const { data, error } = await supabase
      .from('sales')
      .select(`
        *,
        customer:customers(id, name, phone, email),
        items:sale_items(*),
        payments(*)
      `)
      .eq('receipt_number', receiptNumber)
      .maybeSingle();

    if (error || !data) return null;
    return data as unknown as Sale;
  },
};
