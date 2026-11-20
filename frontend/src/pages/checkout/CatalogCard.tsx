import { ArrowUpRight, Eye } from 'lucide-react';
import { formatMoney } from '../../lib/business';
import type { Product } from '../../services/checkoutService';
import { ProductPhoto } from './WorkspaceUI';

export function stockLabel(product: Product) {
  if (!product.is_active) return { label: 'Archived', tone: 'neutral' };
  if (product.is_service) return { label: 'Service', tone: 'neutral' };
  if (!product.track_stock) return { label: 'Untracked', tone: 'neutral' };
  if (product.stock <= 0) return { label: 'Out of stock', tone: 'bad' };
  if (product.stock <= product.reorder_level) return { label: 'Low stock', tone: 'bad' };
  return { label: 'In stock', tone: 'good' };
}

export default function CatalogCard({ product, currency, open, selectPreview, selected, metric }: {
  product: Product; currency: string; open: () => void; selectPreview?: () => void; selected?: boolean; metric?: string;
}) {
  const status = stockLabel(product);
  const meta = [product.category?.name, product.sku].filter(Boolean).join(' · ');
  return <article className="pos-catalog-card" data-selected={selected || undefined}>
    <button type="button" className="pos-catalog-card-open" onClick={open} aria-label={`Open product details for ${product.name}`}>
      <div className="pos-catalog-card-media">
        <ProductPhoto image={product.image} />
        <span className={`pos-badge pos-tone-${status.tone}`}>{status.label}</span>
      </div>
      <div className="pos-catalog-card-content">
        <h3>{product.name}</h3>
        <p>{meta || (product.is_service ? 'Service' : 'Uncategorized')}</p>
        <div className="pos-catalog-card-price">
          <strong>{formatMoney(currency)(product.selling_price)}</strong>
          <small>{metric ?? (product.track_stock ? `${product.stock} on hand` : '')}</small>
          {!selectPreview && <ArrowUpRight size={15} aria-hidden="true" />}
        </div>
      </div>
    </button>
    {selectPreview && <div className="pos-catalog-card-footer">
      {product.location_shelf && <span title={product.location_shelf}>{product.location_shelf}</span>}
      <button type="button" className="pos-text-button" aria-label={`Preview ${product.name}`} aria-pressed={Boolean(selected)} onClick={selectPreview}>
        <Eye size={15} aria-hidden="true" /> Preview
      </button>
    </div>}
  </article>;
}
