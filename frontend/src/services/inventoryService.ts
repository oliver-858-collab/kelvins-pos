// ============================================================
// Kelvin's POS System – Inventory Service
// All inventory-related API calls via Supabase
// ============================================================

import { supabase } from '../lib/supabase';
import type {
  Product,
  ProductVariant,
  Category,
  StockItem,
  StockMovement,
} from '../types';

// ─────────────────────────────────────────────
// Extended types for inventory
// ─────────────────────────────────────────────

export interface ProductFilter {
  search?: string;
  category_id?: string;
  supplier_id?: string;
  branch_id?: string;
  stock_status?: 'all' | 'good' | 'low' | 'out';
  is_active?: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type StockAdjustmentReason =
  | 'damage'
  | 'loss'
  | 'expiry'
  | 'theft'
  | 'correction'
  | 'return'
  | 'transfer';

export interface StockAdjustmentPayload {
  product_id: string;
  quantity: number; // positive = add, negative = remove
  reason: StockAdjustmentReason;
  notes: string;
  image_url?: string;
  branch_id?: string;
}

export interface PurchaseOrderItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  batch_no?: string;
  expiry_date?: string;
}

export interface PurchaseOrderPayload {
  supplier_id: string;
  expected_date: string;
  notes?: string;
  items: PurchaseOrderItem[];
}

export interface StockTakeItem {
  product_id: string;
  counted_quantity: number;
  expected_quantity: number;
}

export interface ProductImageUpload {
  productId: string;
  file: File;
  isPrimary?: boolean;
}

export interface ImportRow {
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  buying_price: number;
  selling_price: number;
  stock_quantity?: number;
  reorder_level?: number;
  unit?: string;
  supplier?: string;
  description?: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

// ─────────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────────

export async function getProducts(
  filters: ProductFilter = {},
  pagination: PaginationParams = { page: 1, pageSize: 25 }
): Promise<PaginatedResult<Product>> {
  const { page, pageSize } = pagination;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('products')
    .select(
      `
      *,
      category:categories(*),
      stock:stock_items(*),
      supplier:suppliers(id, name)
    `,
      { count: 'exact' }
    )
    .eq('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%,barcode.ilike.%${filters.search}%`
    );
  }
  if (filters.category_id) query = query.eq('category_id', filters.category_id);
  if (filters.supplier_id) query = query.eq('supplier_id', filters.supplier_id);
  if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);

  const { data, count, error } = await query;
  if (error) throw error;

  let products = (data ?? []) as Product[];

  // Client-side stock status filter
  if (filters.stock_status && filters.stock_status !== 'all') {
    products = products.filter((p) => {
      const qty = (p.stock as StockItem | undefined)?.quantity ?? 0;
      const reorder = (p.stock as StockItem | undefined)?.min_quantity ?? 0;
      if (filters.stock_status === 'out') return qty === 0;
      if (filters.stock_status === 'low') return qty > 0 && qty <= reorder;
      if (filters.stock_status === 'good') return qty > reorder;
      return true;
    });
  }

  return {
    data: products,
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  };
}

export async function getProduct(id: string): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .select(
      `
      *,
      category:categories(*),
      stock:stock_items(*),
      variants:product_variants(*),
      images:product_images(*),
      supplier:suppliers(id, name)
    `
    )
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Product;
}

export async function createProduct(
  productData: Omit<Product, 'id' | 'created_at' | 'updated_at'>
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert(productData)
    .select()
    .single();

  if (error) throw error;
  return data as Product;
}

export async function updateProduct(
  id: string,
  productData: Partial<Product>
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update({ ...productData, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Product;
}

export async function deleteProduct(id: string): Promise<void> {
  // Soft delete
  const { error } = await supabase
    .from('products')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);

  if (error) throw error;
}

// ─────────────────────────────────────────────
// PRODUCT IMAGES
// ─────────────────────────────────────────────

export async function uploadProductImage(
  productId: string,
  file: File,
  isPrimary = false
): Promise<string> {
  const ext = file.name.split('.').pop();
  const fileName = `products/${productId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(fileName, file, { upsert: false });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(fileName);

  const publicUrl = urlData.publicUrl;

  // Save image record
  const { error: dbError } = await supabase.from('product_images').insert({
    product_id: productId,
    url: publicUrl,
    storage_path: fileName,
    is_primary: isPrimary,
  });

  if (dbError) throw dbError;

  if (isPrimary) {
    await supabase.from('products').update({ image_url: publicUrl }).eq('id', productId);
  }

  return publicUrl;
}

export async function deleteProductImage(imageId: string): Promise<void> {
  const { data: img, error: fetchError } = await supabase
    .from('product_images')
    .select('storage_path, is_primary, product_id')
    .eq('id', imageId)
    .single();

  if (fetchError) throw fetchError;

  await supabase.storage.from('product-images').remove([img.storage_path]);

  const { error } = await supabase.from('product_images').delete().eq('id', imageId);
  if (error) throw error;

  if (img.is_primary) {
    // Find next image to be primary
    const { data: nextImg } = await supabase
      .from('product_images')
      .select('id, url')
      .eq('product_id', img.product_id)
      .neq('id', imageId)
      .limit(1)
      .single();

    if (nextImg) {
      await supabase.from('product_images').update({ is_primary: true }).eq('id', nextImg.id);
      await supabase
        .from('products')
        .update({ image_url: nextImg.url })
        .eq('id', img.product_id);
    } else {
      await supabase.from('products').update({ image_url: null }).eq('id', img.product_id);
    }
  }
}

// ─────────────────────────────────────────────
// STOCK ADJUSTMENTS
// ─────────────────────────────────────────────

export async function adjustStock(
  payload: StockAdjustmentPayload
): Promise<StockMovement> {
  const { product_id, quantity, reason, notes, image_url, branch_id } = payload;

  // Get current stock
  const { data: stockItem, error: stockError } = await supabase
    .from('stock_items')
    .select('id, quantity')
    .eq('product_id', product_id)
    .maybeSingle();

  if (stockError) throw stockError;

  const currentQty = stockItem?.quantity ?? 0;
  const newQty = currentQty + quantity;

  if (newQty < 0) throw new Error('Stock cannot go below zero');

  // Determine if approval required (damage/theft/loss above threshold)
  const needsApproval =
    ['damage', 'theft', 'loss'].includes(reason) && Math.abs(quantity) > 10;

  // Insert movement record
  const { data: movement, error: moveError } = await supabase
    .from('stock_movements')
    .insert({
      product_id,
      type: quantity > 0 ? 'in' : 'out',
      quantity: Math.abs(quantity),
      reason,
      note: notes,
      image_url,
      branch_id,
      status: needsApproval ? 'pending_approval' : 'completed',
      new_quantity: newQty,
      old_quantity: currentQty,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (moveError) throw moveError;

  if (!needsApproval) {
    // Update stock directly
    if (stockItem) {
      await supabase
        .from('stock_items')
        .update({ quantity: newQty, last_updated: new Date().toISOString() })
        .eq('id', stockItem.id);
    } else {
      await supabase.from('stock_items').insert({
        product_id,
        quantity: newQty,
        min_quantity: 0,
        last_updated: new Date().toISOString(),
      });
    }
  } else {
    // Create approval request
    await supabase.from('approvals').insert({
      type: 'stock_adjustment',
      reference_id: movement.id,
      metadata: { quantity, reason, notes, product_id },
      status: 'pending',
      created_at: new Date().toISOString(),
    });
  }

  return movement as StockMovement;
}

export async function getStockHistory(
  productId: string,
  dateRange?: { start: string; end: string }
): Promise<StockMovement[]> {
  let query = supabase
    .from('stock_movements')
    .select(`*, user:users(full_name)`)
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  if (dateRange) {
    query = query
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as StockMovement[];
}

export async function getStockLevels(
  branchId?: string
): Promise<StockItem[]> {
  let query = supabase
    .from('stock_items')
    .select(`*, product:products(id, name, sku, image_url)`);

  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as StockItem[];
}

export async function getLowStockProducts(
  branchId?: string
): Promise<Product[]> {
  let query = supabase
    .from('products')
    .select(`*, stock:stock_items(*), category:categories(name)`)
    .eq('track_stock', true)
    .eq('is_active', true)
    .is('deleted_at', null);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as Product[]).filter((p) => {
    const stock = p.stock as StockItem | undefined;
    if (!stock) return false;
    return stock.quantity <= stock.min_quantity;
  });
}

// ─────────────────────────────────────────────
// PURCHASE ORDERS
// ─────────────────────────────────────────────

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  supplier?: { id: string; name: string };
  status: 'draft' | 'sent' | 'partial' | 'received';
  expected_date: string;
  notes?: string;
  invoice_number?: string;
  invoice_amount?: number;
  items: PurchaseOrderItem[];
  total_amount: number;
  created_by: string;
  approved_by?: string;
  shop_id: string;
  created_at: string;
  updated_at: string;
}

export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`*, supplier:suppliers(id, name), items:purchase_order_items(*, product:products(id, name, sku))`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as PurchaseOrder[];
}

export async function createPurchaseOrder(
  payload: PurchaseOrderPayload
): Promise<PurchaseOrder> {
  const { supplier_id, expected_date, notes, items } = payload;

  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .insert({ supplier_id, expected_date, notes, total_amount: totalAmount, status: 'draft' })
    .select()
    .single();

  if (poError) throw poError;

  const orderItems = items.map((item) => ({
    purchase_order_id: po.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    received_quantity: 0,
  }));

  const { error: itemsError } = await supabase
    .from('purchase_order_items')
    .insert(orderItems);

  if (itemsError) throw itemsError;

  return po as PurchaseOrder;
}

export async function approvePurchaseOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'sent', approved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function receivePurchaseOrder(
  poId: string,
  items: Array<{
    item_id: string;
    received_quantity: number;
    batch_no?: string;
    expiry_date?: string;
  }>
): Promise<void> {
  for (const item of items) {
    // Update PO item received qty
    const { data: poItem, error: fetchErr } = await supabase
      .from('purchase_order_items')
      .select('quantity, received_quantity, product_id, unit_price')
      .eq('id', item.item_id)
      .single();

    if (fetchErr) throw fetchErr;

    const newReceived = (poItem.received_quantity ?? 0) + item.received_quantity;

    await supabase
      .from('purchase_order_items')
      .update({
        received_quantity: newReceived,
        batch_no: item.batch_no,
        expiry_date: item.expiry_date,
      })
      .eq('id', item.item_id);

    // Add stock movement
    await supabase.from('stock_movements').insert({
      product_id: poItem.product_id,
      type: 'in',
      quantity: item.received_quantity,
      reason: 'purchase',
      reference_id: poId,
      status: 'completed',
      created_at: new Date().toISOString(),
    });

    // Update stock quantity
    const { data: stockItem } = await supabase
      .from('stock_items')
      .select('id, quantity')
      .eq('product_id', poItem.product_id)
      .maybeSingle();

    if (stockItem) {
      await supabase
        .from('stock_items')
        .update({ quantity: stockItem.quantity + item.received_quantity })
        .eq('id', stockItem.id);
    } else {
      await supabase.from('stock_items').insert({
        product_id: poItem.product_id,
        quantity: item.received_quantity,
        min_quantity: 0,
      });
    }
  }

  // Check if fully received
  const { data: allItems } = await supabase
    .from('purchase_order_items')
    .select('quantity, received_quantity')
    .eq('purchase_order_id', poId);

  const isFullyReceived = (allItems ?? []).every(
    (i) => i.received_quantity >= i.quantity
  );

  await supabase
    .from('purchase_orders')
    .update({ status: isFullyReceived ? 'received' : 'partial' })
    .eq('id', poId);
}

// ─────────────────────────────────────────────
// STOCK TAKE
// ─────────────────────────────────────────────

export interface StockTake {
  id: string;
  branch_id?: string;
  status: 'in_progress' | 'completed';
  started_by: string;
  completed_by?: string;
  shop_id: string;
  created_at: string;
  completed_at?: string;
}

export async function startStockTake(branchId?: string): Promise<StockTake> {
  const { data, error } = await supabase
    .from('stock_takes')
    .insert({ branch_id: branchId, status: 'in_progress' })
    .select()
    .single();

  if (error) throw error;
  return data as StockTake;
}

export async function completeStockTake(
  id: string,
  items: StockTakeItem[]
): Promise<void> {
  // Insert stock take items
  const records = items.map((item) => ({
    stock_take_id: id,
    product_id: item.product_id,
    expected_quantity: item.expected_quantity,
    counted_quantity: item.counted_quantity,
    variance: item.counted_quantity - item.expected_quantity,
  }));

  const { error: insertErr } = await supabase.from('stock_take_items').insert(records);
  if (insertErr) throw insertErr;

  // Apply adjustments for variances
  for (const item of items) {
    const variance = item.counted_quantity - item.expected_quantity;
    if (variance !== 0) {
      await adjustStock({
        product_id: item.product_id,
        quantity: variance,
        reason: 'correction',
        notes: `Stock take adjustment (stock take #${id})`,
      });
    }
  }

  // Mark stock take complete
  await supabase
    .from('stock_takes')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', id);
}

// ─────────────────────────────────────────────
// BULK IMPORT
// ─────────────────────────────────────────────

export async function importProducts(csvData: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, errors: [] };

  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    try {
      if (!row.name) {
        result.errors.push({ row: i + 1, field: 'name', message: 'Name is required' });
        continue;
      }
      if (!row.selling_price || isNaN(row.selling_price)) {
        result.errors.push({ row: i + 1, field: 'selling_price', message: 'Invalid price' });
        continue;
      }

      // Check if product with SKU already exists
      let existingId: string | null = null;
      if (row.sku) {
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('sku', row.sku)
          .maybeSingle();
        existingId = existing?.id ?? null;
      }

      const productData = {
        name: row.name,
        sku: row.sku,
        barcode: row.barcode,
        description: row.description,
        cost_price: row.buying_price,
        price: row.selling_price,
        is_active: true,
        track_stock: true,
        updated_at: new Date().toISOString(),
      };

      if (existingId) {
        await supabase.from('products').update(productData).eq('id', existingId);
        result.updated++;
      } else {
        const { data: newProduct, error } = await supabase
          .from('products')
          .insert({ ...productData, created_at: new Date().toISOString() })
          .select('id')
          .single();

        if (error) throw error;

        if (row.stock_quantity && row.stock_quantity > 0) {
          await supabase.from('stock_items').insert({
            product_id: newProduct.id,
            quantity: row.stock_quantity,
            min_quantity: row.reorder_level ?? 0,
          });
        }
        result.created++;
      }
    } catch (err) {
      result.errors.push({
        row: i + 1,
        field: 'general',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Category[];
}

// ─────────────────────────────────────────────
// SUPPLIERS
// ─────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export async function getSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

// ─────────────────────────────────────────────
// REAL-TIME SUBSCRIPTIONS
// ─────────────────────────────────────────────

export function subscribeToStockUpdates(
  callback: (payload: { product_id: string; quantity: number }) => void
) {
  return supabase
    .channel('stock_items_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stock_items' },
      (payload) => {
        const record = payload.new as { product_id: string; quantity: number };
        callback({ product_id: record.product_id, quantity: record.quantity });
      }
    )
    .subscribe();
}
