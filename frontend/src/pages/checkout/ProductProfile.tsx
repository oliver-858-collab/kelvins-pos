import { useCallback, useState, type ReactNode } from 'react';
import { Barcode, Boxes, ChartNoAxesCombined, ImageIcon, Package, Truck } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { displayDay, formatMoney, shiftDay, shopDay } from '../../lib/business';
import { displayImage, getProductPerformance, getProductSupplier, signedImages, type Product, type Shop } from '../../services/checkoutService';
import { Empty, LoadError, useData } from './WorkspaceUI';

const periods = [7, 30, 90] as const;
const movementLabels: Record<string, string> = {
  purchase: 'Stock received', sale: 'Sale', adjustment: 'Adjustment', transfer: 'Transfer', return: 'Return',
};
const quantity = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 4 }).format;

export default function ProductProfile({
  shop, branch, product, canMove, canSell, cashierId, actions,
}: {
  shop: Shop; branch: string; product: Product;
  canMove: boolean; canSell: boolean; cashierId?: string; actions?: ReactNode;
}) {
  const [period, setPeriod] = useState<typeof periods[number]>(30);
  const [chart, setChart] = useState<'units' | 'revenue' | 'stock'>(canSell ? 'units' : 'stock');
  const tracked = product.track_stock;
  const includeStock = canMove && tracked;
  const today = shopDay(shop.timezone);
  const start = shiftDay(today, 1 - period);
  const load = useCallback(() => getProductPerformance({
    branch, product: product.id, start, end: today, timezone: shop.timezone,
    includeSales: canSell, includeStock, cashierId,
  }), [branch, product.id, start, today, shop.timezone, canSell, includeStock, cashierId]);
  const performance = useData(load, canSell || includeStock);
  const supplierId = product.supplier_id;
  const loadSupplier = useCallback(() => supplierId ? getProductSupplier(supplierId) : Promise.resolve(null), [supplierId]);
  const supplierQuery = useData(loadSupplier, canMove && !!supplierId);
  const supplier = supplierQuery.data;
  const data = performance.loading || performance.error ? undefined : performance.data;
  const money = formatMoney(shop.currency);
  const low = tracked && product.stock <= product.reorder_level;
  const date = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: shop.timezone });
  const visibleChart = chart === 'stock' && !includeStock ? 'units' : chart;
  const hasActivity = data?.series.some(day => visibleChart === 'stock' ? day.received || day.issued : day[visibleChart]);

  return <div className="pos-product-profile">
    <div className="pos-profile-top">
      <section className="pos-panel pos-profile-summary">
        <div className="pos-profile-heading">
          <span className="pos-badge">{product.category?.name || 'Uncategorized'}</span>
          <h2>{product.name}</h2>
          <p>{[product.brand, product.sku && `SKU ${product.sku}`].filter(Boolean).join(' · ')}</p>
        </div>
        {product.description && <p className="pos-profile-description">{product.description}</p>}
        <dl className="pos-profile-price">
          <div><dt>Selling price</dt><dd>{money(product.selling_price)}</dd></div>
          {canMove && <div><dt>Unit cost</dt><dd>{money(product.buying_price)}</dd></div>}
          <div><dt>On hand</dt><dd className={low ? 'pos-profile-low' : undefined}>{tracked ? quantity(product.stock) : 'Untracked'}</dd></div>
        </dl>
        <dl className="pos-profile-spec">
          <div><dt><Barcode size={15} /> Barcode</dt><dd>{product.barcode || '—'}</dd></div>
          <div><dt>Location</dt><dd>{product.location_shelf || '—'}</dd></div>
          {tracked && <div><dt>Reorder level</dt><dd>{quantity(product.reorder_level)}</dd></div>}
          {tracked && <div><dt>Reorder quantity</dt><dd>{quantity(product.reorder_qty)}</dd></div>}
        </dl>
        {actions && <div className="pos-row-actions pos-profile-actions">{actions}</div>}
      </section>
      <ProductPreview key={product.image ?? ''} product={product} />
    </div>

    {(canSell || includeStock) && <section className="pos-panel pos-profile-performance">
      <div className="pos-panel-bar">
        <div><h2><ChartNoAxesCombined size={18} /> Product performance</h2>
          <p>{displayDay(start)} – {displayDay(today)}{cashierId && ' · Your sales'}</p></div>
        <div className="pos-segment" aria-label="Performance period">
          {periods.map(days => <button key={days} type="button" aria-pressed={period === days} onClick={() => setPeriod(days)}>{days} days</button>)}
        </div>
      </div>
      <div className="pos-profile-kpis">
        {canSell && <><Summary label="Units sold" value={data && quantity(data.units)} />
          <Summary label="Sales value" value={data && money(data.revenue)} />
          <Summary label="Transactions" value={data && quantity(data.transactions)} /></>}
        {includeStock && <><Summary label="Stock in" value={data && quantity(data.received)} />
          <Summary label="Stock out" value={data && quantity(data.issued)} /></>}
      </div>
      <LoadError message={performance.error} retry={performance.reload} />
      <div className="pos-profile-chart-controls pos-segment" aria-label="Performance metric">
        {canSell && <>
          <button type="button" aria-pressed={visibleChart === 'units'} onClick={() => setChart('units')}>Units sold</button>
          <button type="button" aria-pressed={visibleChart === 'revenue'} onClick={() => setChart('revenue')}>Sales value</button>
        </>}
        {includeStock && <button type="button" aria-pressed={visibleChart === 'stock'} onClick={() => setChart('stock')}>Stock movement</button>}
      </div>
      {performance.loading ? <Empty>Loading product activity…</Empty> : data && (hasActivity
        ? <div className="pos-profile-chart" aria-label="Product activity by day">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.series} margin={{ top: 10, right: 12, bottom: 3, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e6e3f0" strokeDasharray="4 5" />
              <XAxis dataKey="day" minTickGap={22} tick={{ fontSize: 11 }} tickFormatter={day => displayDay(day, { day: 'numeric', month: 'short' })} />
              <YAxis width={visibleChart === 'revenue' ? 62 : 45} tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={value => displayDay(String(value))}
                formatter={value => visibleChart === 'revenue' ? money(Number(value)) : quantity(Number(value))} />
              {visibleChart === 'stock' && <Legend />}
              {visibleChart === 'stock' ? <>
                <Bar dataKey="received" name="Stock in" fill="#6c57cd" radius={[4, 4, 0, 0]} />
                <Bar dataKey="issued" name="Stock out" fill="#d29150" radius={[4, 4, 0, 0]} />
              </> : <Bar dataKey={visibleChart} name={visibleChart === 'revenue' ? 'Sales value' : 'Units sold'}
                fill="#6c57cd" radius={[4, 4, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div> : <Empty>No activity in this period.</Empty>)}
    </section>}

    {canMove && <div className="pos-profile-bottom">
      <section className="pos-panel">
        <div className="pos-panel-bar"><h2><Truck size={18} /> Supplier</h2></div>
        <LoadError message={supplierQuery.error} retry={supplierQuery.reload} />
        {supplier ? <dl className="pos-profile-spec">
          <div><dt>Supplier</dt><dd>{supplier.name}</dd></div>
          <div><dt>Contact</dt><dd>{supplier.contact_person || '—'}</dd></div>
          <div><dt>Phone</dt><dd>{supplier.phone || '—'}</dd></div>
          <div><dt>Email</dt><dd>{supplier.email || '—'}</dd></div>
          <div><dt>Payment terms</dt><dd>{supplier.payment_terms || '—'}</dd></div>
          {supplier.address && <div><dt>Address</dt><dd>{supplier.address}</dd></div>}
        </dl> : <Empty>{supplierQuery.loading ? 'Loading supplier…' : supplierId ? 'Supplier details are unavailable.' : 'No supplier assigned.'}</Empty>}
      </section>
      {includeStock && <section className="pos-panel">
        <div className="pos-panel-bar"><div><h2><Boxes size={18} /> Recent stock activity</h2><p>Last {period} days</p></div></div>
        {performance.loading ? <Empty>Loading movements…</Empty> : data?.recent.length
          ? <ol className="pos-simple-list">{data.recent.map(move => <li key={move.id}>
            <div><strong>{movementLabels[move.type] ?? move.type.replaceAll('_', ' ')}</strong>
              <small>{date.format(new Date(move.created_at))}{move.reference && ` · ${move.reference}`}</small></div>
            <span className="pos-badge">{move.qty_in ? `+${quantity(move.qty_in)}` : `−${quantity(move.qty_out)}`}</span>
          </li>)}</ol> : !performance.error && <Empty>No stock movements in this period.</Empty>}
      </section>}
    </div>}
  </div>;
}

function ProductPreview({ product }: { product: Product }) {
  const [selected, setSelected] = useState<string>();
  const [failedImage, setFailedImage] = useState<string>();
  const loadImages = useCallback(() => signedImages(product.product_images), [product.product_images]);
  const gallery = useData(loadImages, product.product_images.length > 1);
  const thumbnails = product.product_images
    .map(image => ({ id: image.id, url: displayImage(image, gallery.data?.urls ?? new Map()) }))
    .filter(image => image.url);
  const image = thumbnails.find(item => item.id === selected)?.url ?? product.image;

  return <figure className={thumbnails.length > 1 ? "pos-panel pos-product-preview has-gallery" : "pos-panel pos-product-preview"}>
    {image && failedImage !== image ? <img src={image} alt={product.name} decoding="async" onError={() => setFailedImage(image)} />
      : <div className="pos-preview-placeholder"><span><Package size={52} strokeWidth={1.2} aria-hidden="true" /></span><small>No product photo</small></div>}
    {thumbnails.length > 1 && <div className="pos-preview-thumbnails" aria-label="Product photos">
      {thumbnails.map((item, index) => <button key={item.id} type="button" aria-label={`View photo ${index + 1}`}
        aria-pressed={selected ? selected === item.id : image === item.url}
        onClick={() => setSelected(item.id)}><img src={item.url ?? undefined} alt="" loading="lazy" /></button>)}
    </div>}
    <figcaption><ImageIcon size={16} aria-hidden="true" /><span>Product preview</span>{product.sku && <strong>{product.sku}</strong>}</figcaption>
  </figure>;
}

function Summary({ label, value }: { label: string; value?: string }) {
  return <div><span>{label}</span><strong>{value ?? '—'}</strong></div>;
}
