import { supabase } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  price: number;
  costPrice?: number;
  floorPrice?: number;
  category?: Category;
  categoryId?: string;
  image?: string;
  unit?: string;
  taxable: boolean;
  isService: boolean;
  isActive: boolean;
  stockLevel?: number;
  reorderLevel?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  isService: boolean;
}

export interface StockLevel {
  productId: string;
  branchId: string;
  quantity: number;
  reorderLevel: number;
  lastUpdated: string;
}

export interface ProductFilters {
  categoryId?: string;
  branchId?: string;
  isService?: boolean;
  isActive?: boolean;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  page?: number;
  pageSize?: number;
}

// ─── Service ───────────────────────────────────────────────────────────────────

export const productsService = {
  async searchProducts(query: string, categoryId?: string, branchId?: string): Promise<Product[]> {
    let dbQuery = supabase
      .from('products')
      .select(`
        *,
        category:categories(id, name, color, icon, is_service),
        stock:stock_levels(quantity, reorder_level)
      `)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(50);

    if (query) {
      dbQuery = dbQuery.or(
        `name.ilike.%${query}%,sku.ilike.%${query}%,barcode.ilike.%${query}%,description.ilike.%${query}%`
      );
    }

    if (categoryId) {
      dbQuery = dbQuery.eq('category_id', categoryId);
    }

    if (branchId) {
      // Filter stock by branch
      dbQuery = dbQuery.eq('stock.branch_id', branchId);
    }

    const { data, error } = await dbQuery;
    if (error) throw error;

    return (data ?? []).map(d => mapProduct(d, branchId));
  },

  async getProduct(id: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:categories(id, name, color, icon, is_service),
        stock:stock_levels(*)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return mapProduct(data);
  },

  async getProducts(filters: ProductFilters = {}): Promise<{ data: Product[]; count: number }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 48;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('products')
      .select(`
        *,
        category:categories(id, name, color, icon, is_service),
        stock:stock_levels(quantity, reorder_level, branch_id)
      `, { count: 'exact' })
      .order('name', { ascending: true })
      .range(from, to);

    if (filters.isActive !== undefined) query = query.eq('is_active', filters.isActive);
    else query = query.eq('is_active', true);

    if (filters.isService !== undefined) query = query.eq('is_service', filters.isService);
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%,barcode.ilike.%${filters.search}%`);
    }
    if (filters.minPrice !== undefined) query = query.gte('price', filters.minPrice);
    if (filters.maxPrice !== undefined) query = query.lte('price', filters.maxPrice);

    const { data, error, count } = await query;
    if (error) throw error;

    let products = (data ?? []).map(d => mapProduct(d, filters.branchId));

    if (filters.inStock) {
      products = products.filter(p => (p.stockLevel ?? 0) > 0 || p.isService);
    }

    return { data: products, count: count ?? 0 };
  },

  async getProductByBarcode(barcode: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:categories(id, name, color, icon, is_service),
        stock:stock_levels(quantity, reorder_level)
      `)
      .eq('barcode', barcode)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;
    return mapProduct(data);
  },

  async getStockLevel(productId: string, branchId: string): Promise<StockLevel | null> {
    const { data, error } = await supabase
      .from('stock_levels')
      .select('*')
      .eq('product_id', productId)
      .eq('branch_id', branchId)
      .maybeSingle();

    if (error || !data) return null;
    return {
      productId: data.product_id,
      branchId: data.branch_id,
      quantity: data.quantity,
      reorderLevel: data.reorder_level,
      lastUpdated: data.updated_at,
    };
  },

  async getCategories(isService?: boolean): Promise<Category[]> {
    let query = supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (isService !== undefined) {
      query = query.eq('is_service', isService);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map(d => ({
      id: d.id,
      name: d.name,
      color: d.color,
      icon: d.icon,
      isService: d.is_service,
    }));
  },

  subscribeToStockLevels(
    branchId: string,
    onUpdate: (stockLevel: StockLevel) => void
  ) {
    return supabase
      .channel(`stock_levels:branch:${branchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_levels',
          filter: `branch_id=eq.${branchId}`,
        },
        (payload) => {
          const d = payload.new as Record<string, unknown>;
          onUpdate({
            productId: d.product_id as string,
            branchId: d.branch_id as string,
            quantity: d.quantity as number,
            reorderLevel: d.reorder_level as number,
            lastUpdated: d.updated_at as string,
          });
        }
      )
      .subscribe();
  },
};

// ─── Mapper ─────────────────────────────────────────────────────────────────────

function mapProduct(d: Record<string, unknown>, branchId?: string): Product {
  const stock = Array.isArray(d.stock) ? d.stock : [d.stock];
  const branchStock = branchId
    ? stock.find((s: Record<string, unknown>) => s?.branch_id === branchId)
    : stock[0];

  const cat = d.category as Record<string, unknown> | null;

  return {
    id: d.id as string,
    name: d.name as string,
    description: d.description as string | undefined,
    sku: d.sku as string | undefined,
    barcode: d.barcode as string | undefined,
    price: d.price as number,
    costPrice: d.cost_price as number | undefined,
    floorPrice: d.floor_price as number | undefined,
    category: cat ? {
      id: cat.id as string,
      name: cat.name as string,
      color: cat.color as string | undefined,
      icon: cat.icon as string | undefined,
      isService: cat.is_service as boolean,
    } : undefined,
    categoryId: d.category_id as string | undefined,
    image: d.image as string | undefined,
    unit: d.unit as string | undefined,
    taxable: (d.taxable as boolean) ?? true,
    isService: (d.is_service as boolean) ?? false,
    isActive: (d.is_active as boolean) ?? true,
    stockLevel: branchStock?.quantity as number | undefined,
    reorderLevel: branchStock?.reorder_level as number | undefined,
    createdAt: d.created_at as string,
    updatedAt: d.updated_at as string,
  };
}
