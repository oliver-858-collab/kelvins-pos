import { supabase } from '../lib/supabase';
import { formText, nullableNumber, nullableText, shiftDay, shopDay } from '../lib/business';

export const paymentLabels = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', credit: 'On account' } as const;
export type PaymentMethod = keyof typeof paymentLabels;
export type TenderMethod = Exclude<PaymentMethod, 'credit'>;
export type TaxClass = 'standard' | 'zero' | 'exempt';

export type ProductImage = {
  id: string;
  url: string;
  storage_path: string | null;
  is_primary: boolean;
  sort_order: number;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  location_shelf: string | null;
  description: string | null;
  selling_price: number;
  buying_price: number;
  min_price: number | null;
  track_stock: boolean;
  is_active: boolean;
  is_service: boolean;
  reorder_level: number;
  reorder_qty: number;
  tax_class: TaxClass;
  category_id: string | null;
  supplier_id: string | null;
  category: { name: string } | null;
  product_images: ProductImage[];
};
export type Product = ProductRow & { stock: number; image: string | null };
export type Branch = { id: string; name: string };

export type Shop = {
  id: string;
  shop_name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  currency: string;
  timezone: string;
  tax_name: string;
  tax_pin: string | null;
  kra_pin: string | null;
  receipt_header: string | null;
  receipt_footer: string | null;
  receipt_show_tax: boolean;
  allow_negative_stock: boolean;
  allow_credit_sales: boolean;
};

export type CheckoutReceipt = {
  id: string;
  sale_number: string;
  created_at: string;
  status: string;
  customer_name: string | null;
  cashier_name: string | null;
  void_reason: string | null;
  credit_due_date: string | null;
  is_credit: boolean;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  change_amount: number;
  branch: { name: string; address: string | null; phone: string | null } | null;
  receipts: { receipt_number: string }[];
  sale_items: { id: string; name: string; quantity: number; unit_price: number; total_price: number }[];
  sale_payments: { payment_method: string; reference: string | null; amount: number; tendered_amount: number | null }[];
};

export type SaleRow = {
  id: string;
  sale_number: string;
  created_at: string;
  status: string;
  total_amount: number;
  customer_name: string | null;
  cashier_name: string | null;
  receipt_number: string | null;
  methods: string[];
  void_reason: string | null;
  total_rows: number;
};

export type Report = {
  summary: {
    orders: number; revenue: number; average: number; tax: number; discount: number; customers: number;
    credit_outstanding: number; voided: number; units: number; cost_coverage: number; lines: number; tracked_margin: number;
  };
  prior: { orders: number; revenue: number };
  daily: { day: string; revenue: number; orders: number }[];
  payments: { method: string; amount: number; transactions: number }[];
  products: { product_id: string | null; name: string; quantity: number; revenue: number }[];
  staff: { cashier_id: string; name: string; orders: number; revenue: number }[];
  stock: { type: string; received: number; issued: number; movements: number }[];
};

export function paymentName(method: string) {
  return paymentLabels[method as PaymentMethod] || method;
}

export async function rpc<Result>(name: string, input: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, input);
  if (error) throw error;
  return data as Result;
}

export async function getCheckoutSettings() {
  const [branches, shop] = await Promise.all([
    supabase.from('branches').select('id,name').eq('is_active', true).order('is_main', { ascending: false }).order('name'),
    supabase.from('shop_settings').select(
      'id,shop_name,address,city,phone,currency,timezone,tax_name,tax_pin,kra_pin,receipt_header,receipt_footer,receipt_show_tax,allow_negative_stock,allow_credit_sales',
    ).order('created_at').order('id').limit(1).single<Shop>(),
  ]);
  if (branches.error) throw branches.error;
  if (shop.error) throw shop.error;
  return { branches: branches.data, shop: shop.data };
}

export async function getPersonalWorkspaceSettings() {
  const context = await rpc<{ shop: Pick<Shop, 'id' | 'shop_name' | 'currency' | 'timezone' | 'tax_name'> | null; branches: Branch[] }>(
    'personal_workspace_context', {},
  );
  return {
    branches: context.branches,
    shop: {
      id: '', shop_name: 'Kelvin POS', currency: 'KES', timezone: 'Africa/Nairobi', tax_name: 'VAT',
      address: null, city: null, phone: null, tax_pin: null, kra_pin: null, receipt_header: null,
      receipt_footer: null, receipt_show_tax: false, allow_negative_stock: false, allow_credit_sales: false,
      ...context.shop,
    } satisfies Shop,
  };
}

export const pageSize = 500;

export async function readPages<Row>(read: (offset: number) => PromiseLike<{ data: Row[] | null; error: unknown }>) {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await read(offset);
    if (error) throw error;
    if (!data) return rows;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

const bucket = () => supabase.storage.from('pos-product-images');
const allowedImageTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function imagePath(product: string, file: File) {
  const ext = allowedImageTypes[file.type];
  if (!ext || !file.size || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG or WebP image up to 5 MB.');
  }
  return product + '/' + crypto.randomUUID() + '.' + ext;
}

export async function signedImages(images: ProductImage[]) {
  const paths = [...new Set(images.flatMap(image => image.storage_path ? [image.storage_path] : []))];
  const chunks = [];
  for (let index = 0; index < paths.length; index += 100) chunks.push(paths.slice(index, index + 100));
  const results = await Promise.all(chunks.map(chunk => bucket().createSignedUrls(chunk, 3600)));
  const urls = new Map<string, string>();
  const error = results.find(result => result.error)?.error?.message;
  for (const result of results) {
    for (const file of result.data ?? []) {
      if (file.path && file.signedUrl) urls.set(file.path, file.signedUrl);
    }
  }
  return { urls, error };
}

export function displayImage(image: ProductImage | undefined, urls: Map<string, string>) {
  return image?.storage_path ? urls.get(image.storage_path) ?? null
    : image?.url.startsWith('https://') ? image.url : null;
}

export async function attachImage(product: string, path: string, file: File) {
  const { error } = await bucket().upload(path, file, { upsert: false, contentType: file.type, cacheControl: '300' });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
  await rpc('manage_product_image', { p_product: product, p_path: path, p_action: 'attach' });
}

export async function makePrimaryImage(product: string, path: string) {
  await rpc('manage_product_image', { p_product: product, p_path: path, p_action: 'primary' });
}

export async function removeImage(product: string, path: string) {
  await rpc('manage_product_image', { p_product: product, p_path: path, p_action: 'remove' });
  const { error } = await bucket().remove([path]);
  if (error) throw new Error('The image was detached. File cleanup failed: ' + error.message);
}

const catalogFields =
  'id,name,sku,barcode,brand,location_shelf,description,selling_price,buying_price,min_price,track_stock,is_active,is_service,' +
  'reorder_level,reorder_qty,tax_class,category_id,supplier_id,category:categories(name),product_images(id,url,storage_path,is_primary,sort_order)';

export async function createCheckoutService(id: string, branch: string, userId: string, form: FormData): Promise<Product> {
  const name = formText(form, 'name');
  const price = nullableNumber(form, 'price');
  const cost = nullableNumber(form, 'cost') ?? 0;
  const tax = formText(form, 'tax');
  const description = nullableText(form, 'description');
  const validMoney = (value: number) => Number.isFinite(value) && value >= 0 && value <= 9999999999.99
    && Number(value.toFixed(2)) === value;
  if (!name || name.length > 120 || price === null || !validMoney(price) || !validMoney(cost)
      || !['standard', 'zero', 'exempt'].includes(tax) || (description?.length ?? 0) > 1500) {
    throw new Error('Enter a service name, a valid price and cost, and a tax class.');
  }
  // The same ID can be retried if the connection drops after creating the service.
  const { error } = await supabase.from('products').upsert({
    id, branch_id: branch, created_by: userId, name, description, selling_price: price, buying_price: cost, tax_class: tax,
    is_service: true, track_stock: false, is_active: true, reorder_level: 0, reorder_qty: 0,
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
  const saved = await supabase.from('products').select(catalogFields)
    .eq('id', id).eq('branch_id', branch).eq('is_service', true).eq('is_deleted', false).single<ProductRow>();
  if (saved.error) throw saved.error;
  if (saved.data.name !== name || Number(saved.data.selling_price) !== price || Number(saved.data.buying_price) !== cost
      || saved.data.tax_class !== tax || saved.data.description !== description || !saved.data.is_active || saved.data.track_stock) {
    throw new Error('A service was already saved with different details. Close this form and refresh the catalog before adding it.');
  }
  return { ...saved.data, stock: 0, image: null };
}

export async function getCheckoutCatalog(branch: string, sign = true): Promise<Product[]> {
  const [products, stock] = await Promise.all([
    readPages<ProductRow>(offset => supabase.from('products').select(catalogFields).eq('is_deleted', false).or(`branch_id.is.null,branch_id.eq.${branch}`)
      .order('name').order('id').range(offset, offset + pageSize - 1).returns<ProductRow[]>()),
    readPages<{ product_id: string; qty_on_hand: number }>(offset => supabase.from('v_stock_levels')
      .select('product_id,qty_on_hand').eq('branch_id', branch)
      .order('product_id').range(offset, offset + pageSize - 1)),
  ]);
  const balances = new Map(stock.map(({ product_id, qty_on_hand }) => [product_id, qty_on_hand]));
  const primary = products.map(product => product.product_images.find(image => image.is_primary)
    ?? [...product.product_images].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))[0]);
  const urls = sign ? (await signedImages(primary.filter((image): image is ProductImage => !!image))).urls : new Map<string, string>();
  return products.map((product, index) => ({
    ...product, stock: balances.get(product.id) ?? 0, image: displayImage(primary[index], urls),
  }));
}

export type CatalogOptions = {
  categories: { id: string; name: string; description: string | null }[];
  suppliers: { id: string; name: string; contact_person: string | null; phone: string | null; email: string | null;
    address: string | null; payment_terms: string | null; notes: string | null; is_active: boolean }[];
};

export async function getCatalogOptions(): Promise<CatalogOptions> {
  const [categories, suppliers] = await Promise.all([
    readPages<CatalogOptions['categories'][number]>(offset => supabase.from('categories').select('id,name,description')
      .eq('type', 'product').eq('is_active', true).order('name').order('id').range(offset, offset + pageSize - 1)),
    readPages<CatalogOptions['suppliers'][number]>(offset => supabase.from('suppliers')
      .select('id,name,contact_person,phone,email,address,payment_terms,notes,is_active').order('name').order('id')
      .range(offset, offset + pageSize - 1)),
  ]);
  return { categories, suppliers };
}

export async function getProductSupplier(id: string) {
  const { data, error } = await supabase.from('suppliers')
    .select('id,name,contact_person,phone,email,address,payment_terms,notes,is_active').eq('id', id)
    .maybeSingle<CatalogOptions['suppliers'][number]>();
  if (error) throw error;
  return data;
}

export async function saveSupplier(id: string, form: FormData) {
  const result = await supabase.from('suppliers').upsert({
    id, name: formText(form, 'name'), contact_person: nullableText(form, 'contact'), email: nullableText(form, 'email'),
    phone: nullableText(form, 'phone'), address: nullableText(form, 'address'), notes: nullableText(form, 'notes'),
    payment_terms: nullableText(form, 'terms'), is_active: form.get('active') === 'on',
  }).select('id').single();
  if (result.error) throw result.error;
}

export async function addCategory(id: string, form: FormData) {
  const name = formText(form, 'name');
  const slug = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) || 'category';
  const { error } = await supabase.from('categories').upsert({
    id, name, slug: slug + '-' + id.slice(0, 8), type: 'product', description: nullableText(form, 'description'),
  }).select('id').single();
  if (error) throw error;
}

export async function saveProduct(id: string, branch: string, form: FormData) {
  return rpc<string>('save_inventory_product', {
    p_id: id, p_branch: branch,
    p_product: {
      name: formText(form, 'name'), sku: nullableText(form, 'sku'), barcode: nullableText(form, 'barcode'),
      brand: nullableText(form, 'brand'), category_id: nullableText(form, 'category'), supplier_id: nullableText(form, 'supplier'),
      location_shelf: nullableText(form, 'shelf'), description: nullableText(form, 'description'),
      selling_price: nullableNumber(form, 'price'), buying_price: nullableNumber(form, 'cost'), min_price: nullableNumber(form, 'minimum'),
      tax_class: formText(form, 'tax'), track_stock: form.get('track') === 'on', is_active: form.get('active') === 'on',
      reorder_level: nullableNumber(form, 'reorder'), reorder_qty: nullableNumber(form, 'reorderQty'),
      opening_stock: nullableNumber(form, 'opening'),
    },
  });
}

export async function postStockMovement(id: string, branch: string, product: string, mode: string, form: FormData) {
  return rpc<number>('post_inventory_movement', {
    p_id: id, p_branch: branch, p_product: product,
    p_movement: {
      mode, quantity: nullableNumber(form, 'quantity'), reason: nullableText(form, 'reason'),
      notes: nullableText(form, 'notes'), reference: nullableText(form, 'reference'),
      unit_cost: nullableNumber(form, 'cost'), supplier_id: nullableText(form, 'supplier'),
      batch: nullableText(form, 'batch'), expires_on: nullableText(form, 'expiry'),
    },
  });
}

export type StockEntry = {
  id: string; created_at: string; type: string; qty_in: number; qty_out: number; qty_on_hand: number;
  reference: string | null; batch_number: string | null; expiry_date: string | null; notes: string | null; buying_price: number;
  product: { name: string } | null; supplier: { name: string } | null; actor: { full_name: string } | null;
};

export async function getStockLedger(branch: string, page: number, product: string, type: string) {
  let query = supabase.from('stock_entries').select(
    'id,created_at,type,qty_in,qty_out,qty_on_hand,reference,batch_number,expiry_date,notes,buying_price,' +
    'product:products(name),supplier:suppliers(name),actor:users(full_name)',
    { count: 'exact' },
  ).eq('branch_id', branch);
  if (product) query = query.eq('product_id', product);
  if (type) query = query.eq('type', type);
  const { data, count, error } = await query.order('created_at', { ascending: false }).order('id')
    .range(page * 25, page * 25 + 24).returns<StockEntry[]>();
  if (error) throw error;
  return { rows: data, count: count ?? 0 };
}

export async function getBranchStockActivity(branch: string, start: string, end: string, timezone: string) {
  const movements = await readPages<{ created_at: string; qty_in: number; qty_out: number }>(offset =>
    supabase.from('stock_entries').select('created_at,qty_in,qty_out').eq('branch_id', branch)
      .gte('created_at', shiftDay(start, -1) + 'T00:00:00Z')
      .lt('created_at', shiftDay(end, 2) + 'T00:00:00Z')
      .order('created_at').order('id').range(offset, offset + pageSize - 1));
  const days = new Map<string, { day: string; received: number; issued: number }>();
  for (let day = start; day <= end; day = shiftDay(day, 1)) days.set(day, { day, received: 0, issued: 0 });
  for (const row of movements) {
    const bucket = days.get(shopDay(timezone, new Date(row.created_at)));
    if (!bucket) continue;
    bucket.received += Number(row.qty_in);
    bucket.issued += Number(row.qty_out);
  }
  return [...days.values()];
}

type ProductSaleLine = {
  sale_id: string; quantity: number; total_price: number;
  sale: { created_at: string };
};
type ProductMovement = {
  id: string; created_at: string; type: string; qty_in: number; qty_out: number;
  qty_on_hand: number; reference: string | null;
};

export async function getProductPerformance({
  branch, product, start, end, timezone, includeSales, includeStock, cashierId,
}: {
  branch: string; product: string; start: string; end: string; timezone: string;
  includeSales: boolean; includeStock: boolean; cashierId?: string;
}) {
  // Read a UTC window wide enough for the shop's timezone, then bucket by the exact shop dates.
  const after = shiftDay(start, -1) + 'T00:00:00Z';
  const before = shiftDay(end, 2) + 'T00:00:00Z';
  const [sales, movements] = await Promise.all([
    includeSales ? readPages<ProductSaleLine>(offset => {
      let query = supabase.from('sale_items')
        .select('sale_id,quantity,total_price,sale:sales!inner(created_at)')
        .eq('product_id', product).eq('sale.branch_id', branch)
        .eq('sale.status', 'completed').eq('sale.is_deleted', false)
        .gte('sale.created_at', after).lt('sale.created_at', before);
      if (cashierId) query = query.eq('sale.cashier_id', cashierId);
      return query.order('id').range(offset, offset + pageSize - 1).returns<ProductSaleLine[]>();
    }) : [],
    includeStock ? readPages<ProductMovement>(offset => supabase.from('stock_entries')
      .select('id,created_at,type,qty_in,qty_out,qty_on_hand,reference')
      .eq('product_id', product).eq('branch_id', branch)
      .gte('created_at', after).lt('created_at', before)
      .order('created_at', { ascending: false }).order('id')
      .range(offset, offset + pageSize - 1).returns<ProductMovement[]>()) : [],
  ]);
  const days = new Map<string, { day: string; units: number; revenue: number; received: number; issued: number }>();
  for (let day = start; day <= end; day = shiftDay(day, 1)) {
    days.set(day, { day, units: 0, revenue: 0, received: 0, issued: 0 });
  }
  const transactions = new Set<string>();
  const recent: ProductMovement[] = [];
  let chargedCents = 0;
  for (const line of sales) {
    const bucket = days.get(shopDay(timezone, new Date(line.sale.created_at)));
    if (!bucket) continue;
    bucket.units += Number(line.quantity);
    const cents = Math.round(Number(line.total_price) * 100);
    bucket.revenue += cents;
    chargedCents += cents;
    transactions.add(line.sale_id);
  }
  for (const move of movements) {
    const bucket = days.get(shopDay(timezone, new Date(move.created_at)));
    if (!bucket) continue;
    bucket.received += Number(move.qty_in);
    bucket.issued += Number(move.qty_out);
    if (recent.length < 8) recent.push(move);
  }
  const series = [...days.values()].map(day => ({ ...day, revenue: day.revenue / 100 }));
  return {
    series, recent, transactions: transactions.size, revenue: chargedCents / 100,
    units: series.reduce((sum, day) => sum + day.units, 0),
    received: series.reduce((sum, day) => sum + day.received, 0),
    issued: series.reduce((sum, day) => sum + day.issued, 0),
  };
}

export type SaleFilters = { start: string; end: string; status: string; method: string; search: string; employee: string };

export function getSalesPage(branch: string, filters: SaleFilters, page: number) {
  return rpc<SaleRow[]>('pos_sales_page', {
    p_branch: branch, p_start: filters.start, p_end: filters.end, p_status: filters.status || null,
    p_method: filters.method || null, p_search: filters.search || null, p_employee: filters.employee || null, p_offset: page * 30,
  });
}

export type SalePreviewItem = { id: string; name: string; quantity: number; total_price: number };

export async function getSalesItemPreviews(branch: string, ids: string[]) {
  if (!ids.length) return {};
  const { data, error } = await supabase.from('sales')
    .select('id,sale_items(id,name,quantity,total_price)')
    .eq('branch_id', branch).eq('is_deleted', false).in('id', ids)
    .order('id', { referencedTable: 'sale_items' }).limit(4, { referencedTable: 'sale_items' });
  if (error) throw error;
  return Object.fromEntries((data ?? []).map(row => [row.id, row.sale_items])) as Record<string, SalePreviewItem[]>;
}

export function getSalesReport(branch: string, start: string, end: string) {
  return rpc<Report>('pos_sales_report', { p_branch: branch, p_start: start, p_end: end });
}

export async function getCheckoutReceipt(id: string) {
  const { data, error } = await supabase.from('sales').select(
    'id,sale_number,created_at,status,subtotal,discount_amount,tax_amount,total_amount,amount_paid,change_amount,' +
    'customer_name,cashier_name,void_reason,is_credit,credit_due_date,branch:branches(name,address,phone),' +
    'receipts(receipt_number),sale_items(id,name,quantity,unit_price,total_price),' +
    'sale_payments(payment_method,reference,amount,tendered_amount)',
  ).eq('id', id).eq('is_deleted', false).eq('receipts.type', 'sale')
    .order('created_at', { referencedTable: 'receipts' }).order('id', { referencedTable: 'sale_items' })
    .single<CheckoutReceipt>();
  if (error) throw error;
  if (!data.receipts.length) throw new Error('This sale has no saved receipt.');
  return data;
}

export type CheckoutInput = {
  p_sale: string;
  p_branch: string;
  p_items: { product_id: string; quantity: number; unit_price: number }[];
  p_payments: { method: PaymentMethod; amount: number | null; tendered: number | null; reference: string | null }[];
  p_details: { customer_id: string | null; discount: number; notes: string | null };
};

export function recordCheckout(input: CheckoutInput) {
  return rpc<string>('complete_pos_sale', input);
}

export function voidSale(id: string, reason: string) {
  return rpc<void>('void_pos_sale', { p_sale: id, p_reason: reason });
}
