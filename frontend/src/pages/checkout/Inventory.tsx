import { lazy, Suspense, useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { Archive, ArrowLeft, Boxes, Camera, ChevronRight, Download, Grid2X2, ImagePlus, List, Package, Plus, Search, SquareArrowOutUpRight, Star, Trash2, Truck, TriangleAlert } from 'lucide-react';
import { displayDay, downloadCsv, errorMessage, formatMoney } from '../../lib/business';
import {
  addCategory, attachImage, displayImage, getCatalogOptions, getStockLedger, imagePath, makePrimaryImage,
  postStockMovement, removeImage, saveProduct, saveSupplier, signedImages, type CatalogOptions, type Product, type Shop,
} from '../../services/checkoutService';
import { Dialog, DialogForm, Empty, LoadError, Pagination, ProductPhoto, useData } from './WorkspaceUI';
import CatalogCard, { stockLabel } from './CatalogCard';

const ProductProfile = lazy(() => import('./ProductProfile'));

type ProductAction = { kind: 'product'; product?: Product } | { kind: 'movement' | 'images'; product: Product };
type Tab = 'Products' | 'Stock ledger' | 'Suppliers and categories';

const movementNames: Record<string, string> = {
  purchase: 'Receipt', sale: 'Sale', adjustment: 'Adjustment', transfer: 'Transfer', return: 'Return',
};

function suggestedReorder(product: Product) {
  return Math.max(product.reorder_qty, product.reorder_level - product.stock + 1);
}

export default function Inventory({ shop, branch, catalog, loading, error, canManage, canMove, onChange, stockAlerts, canSell, cashierId, initialLedger }: {
  shop: Shop; branch: string; catalog: Product[]; loading: boolean; error?: string;
  canManage: boolean; canMove: boolean; onChange: () => void; stockAlerts: boolean; canSell: boolean; cashierId?: string; initialLedger?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialLedger ? 'Stock ledger' : 'Products');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(stockAlerts ? 'attention' : 'active');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const [ledgerProduct, setLedgerProduct] = useState('');
  const [layout, setLayout] = useState<'cards' | 'table'>('cards');
  const [previewId, setPreviewId] = useState<string>();
  const previewPanel = useRef<HTMLElement>(null);
  const [profileId, setProfileId] = useState<string>();
  const profile = catalog.find(product => product.id === profileId);
  const [dialog, setDialog] = useState<ProductAction>();
  const [notice, setNotice] = useState('');
  const options = useData(getCatalogOptions, canMove || canManage);
  const money = formatMoney(shop.currency);

  const summary = useMemo(() => {
    const live = catalog.filter(product => product.is_active);
    const tracked = live.filter(product => product.track_stock);
    return {
      products: live.length,
      stock: tracked.reduce((total, product) => total + product.stock, 0),
      low: tracked.filter(product => product.stock <= product.reorder_level).length,
      value: tracked.reduce((total, product) => total + product.stock * product.buying_price, 0),
    };
  }, [catalog]);

  const matches = catalog.filter(product => {
    const query = search.trim().toLowerCase();
    const label = stockLabel(product);
    return (status === 'all' || (status === 'active' && product.is_active)
      || (status === 'archived' && !product.is_active) || (status === 'low' && label.tone === 'warn')
      || (status === 'out' && label.tone === 'bad')
      || (status === 'attention' && ['warn', 'bad'].includes(label.tone)))
      && (!category || product.category_id === category)
      && (!query || [product.name, product.sku, product.barcode, product.brand, product.location_shelf]
        .some(value => value?.toLowerCase().includes(query)));
  });
  const rows = matches.slice(page * 24, (page + 1) * 24);
  const preview = rows.find(item => item.id === previewId) ?? rows[0];
  const categories = new Map((options.data?.categories ?? []).map(item => [item.id, item.name]));
  for (const product of catalog) {
    if (product.category_id && product.category?.name) categories.set(product.category_id, product.category.name);
  }
  function selectPreview(id: string) {
    setPreviewId(id);
    if (window.matchMedia('(max-width: 650px)').matches) {
      previewPanel.current?.scrollIntoView({ block: 'start' });
    }
  }

  function openProfile(id: string) {
    setProfileId(id);
    setPreviewId(id);
    setNotice('');
    window.scrollTo(0, 0);
  }
  function showLedger(product: string) { setProfileId(undefined); setLedgerProduct(product); setTab('Stock ledger'); }
  function saved(text: string) { setDialog(undefined); setNotice(text); onChange(); }

  return <>
    {profile ? <>
      <div className="pos-heading pos-product-back">
        <div><button type="button" className="pos-secondary" onClick={() => setProfileId(undefined)}><ArrowLeft size={16} /> Back to inventory</button>
          <h1>Product details</h1></div>
      </div>
      <LoadError message={error} retry={onChange} />
      {notice && <p role="status" className="pos-success">{notice}</p>}
      <Suspense fallback={<Empty>Loading product details…</Empty>}>
        <ProductProfile key={profile.id} shop={shop} branch={branch} product={profile} canMove={canMove}
          canSell={canSell} cashierId={cashierId} actions={<>
            {profile.track_stock && <button type="button" className="pos-secondary" onClick={() => showLedger(profile.id)}><List size={16} /> Stock ledger</button>}
            {canMove && profile.track_stock && <button type="button" className="pos-primary" onClick={() => setDialog({ kind: 'movement', product: profile })}>Move stock</button>}
            {canManage && <>
              <button type="button" className="pos-secondary" onClick={() => setDialog({ kind: 'images', product: profile })}><Camera size={16} /> Manage images</button>
              <button type="button" className="pos-secondary" onClick={() => setDialog({ kind: 'product', product: profile })}>Edit product</button>
            </>}
          </>} />
      </Suspense>
    </> : <>
    <div className="pos-heading">
      <div><h1>Inventory</h1><p>Catalog, stock balances and movement history for this branch.</p></div>
      {canManage && <button className="pos-primary" onClick={() => setDialog({ kind: 'product' })}><Plus size={17} /> Add product</button>}
    </div>
    <div className="pos-metrics">
      <div className="pos-panel pos-metric"><div>Active products <Package size={18} /></div><strong>{summary.products}</strong></div>
      <div className="pos-panel pos-metric"><div>Units on hand <Boxes size={18} /></div><strong>{summary.stock.toLocaleString('en-KE')}</strong></div>
      <div className="pos-panel pos-metric"><div>Low or out of stock <TriangleAlert size={18} /></div><strong>{summary.low}</strong></div>
      {canMove && <div className="pos-panel pos-metric"><div>Stock value at current cost <Archive size={18} /></div><strong>{money(summary.value)}</strong></div>}
    </div>
    <div className="pos-section-tabs" aria-label="Inventory views">
      {(['Products', 'Stock ledger', 'Suppliers and categories'] as Tab[])
        .filter(item => item !== 'Suppliers and categories' || canMove).map(item =>
          <button type="button" key={item} aria-pressed={item === tab} onClick={() => setTab(item)}>{item}</button>)}
    </div>
    <LoadError message={error} retry={onChange} />
    {notice && <p className="pos-success" role="status">{notice}</p>}
    {tab === 'Products' && <section className="pos-panel pos-inventory-catalog">
      <div className="pos-panel-bar pos-catalog-heading">
        <div><h2>Product catalog</h2><p>{loading && !catalog.length ? 'Loading stock…' : `${matches.length} matching ${matches.length === 1 ? 'item' : 'items'}`}</p></div>
        <div className="pos-segment" aria-label="Catalog layout">
          <button type="button" aria-pressed={layout === 'cards'} onClick={() => setLayout('cards')}><Grid2X2 size={15} /> Cards</button>
          <button type="button" aria-pressed={layout === 'table'} onClick={() => setLayout('table')}><List size={16} /> Table</button>
        </div>
      </div>
      <div className="pos-toolbar pos-catalog-filters">
        <label className="pos-search"><Search size={17} /><input aria-label="Search inventory" placeholder="Search name, SKU or barcode"
          value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label>
        <select aria-label="Stock status" className="pos-select" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}>
          <option value="active">Active products</option><option value="attention">Low or out of stock</option><option value="low">Low stock</option>
          <option value="out">Out of stock</option><option value="archived">Archived</option><option value="all">All statuses</option>
        </select>
        <select aria-label="Category" className="pos-select" value={category} onChange={event => { setCategory(event.target.value); setPage(0); }}>
          <option value="">All categories</option>
          {[...categories].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        {canMove && status === 'attention' && <button className="pos-secondary" disabled={!matches.length}
          onClick={() => downloadCsv('reorder-list.csv', ['Product', 'SKU', 'On hand', 'Reorder at', 'Suggested quantity'],
            matches.map(product => [product.name, product.sku, product.stock, product.reorder_level, suggestedReorder(product)]))}>
          <Download size={16} /> Export reorder list</button>}
        {canMove && status !== 'attention' && <button className="pos-secondary" disabled={!matches.length} onClick={() => downloadCsv('inventory.csv',
          ['Product', 'SKU', 'Barcode', 'Category', 'On hand', 'Reorder level', 'Cost', 'Selling price', 'Status'],
          matches.map(item => [item.name, item.sku, item.barcode, item.category?.name, item.track_stock ? item.stock : null,
            item.reorder_level, item.buying_price, item.selling_price, stockLabel(item).label]))}><Download size={16} /> Export</button>}
      </div>
      {!rows.length && <Empty action={canManage && !catalog.length
        ? <button className="pos-secondary" onClick={() => setDialog({ kind: 'product' })}>Create your first product</button> : undefined}>
        {loading ? 'Loading stock balances…' : catalog.length ? 'No products match these filters.' : 'This branch has no products yet.'}
      </Empty>}
      {preview && layout === 'cards' && <div className="pos-catalog-browse">
        <div className="pos-catalog-cards">{rows.map(product =>
          <CatalogCard key={product.id} product={product} currency={shop.currency} open={() => openProfile(product.id)}
            selected={preview.id === product.id} selectPreview={() => selectPreview(product.id)} />)}</div>
        <aside ref={previewPanel} className="pos-catalog-preview-panel" aria-label="Quick product preview" aria-live="polite">
          <ProductPhoto image={preview.image} />
          <div className="pos-catalog-preview-details">
            <span className={`pos-badge pos-tone-${stockLabel(preview).tone}`}>{stockLabel(preview).label}</span>
            <h3>{preview.name}</h3>
            <p>{[preview.brand, preview.category?.name].filter(Boolean).join(' · ')}</p>
            <strong>{money(preview.selling_price)}</strong>
            {preview.description && <p className="pos-catalog-description">{preview.description}</p>}
            <dl>
              <div><dt>SKU</dt><dd>{preview.sku || '—'}</dd></div>
              <div><dt>On hand</dt><dd>{preview.track_stock ? preview.stock : 'Untracked'}</dd></div>
              <div><dt>Shelf</dt><dd>{preview.location_shelf || '—'}</dd></div>
              {preview.track_stock && <div><dt>Reorder at</dt><dd>{preview.reorder_level}</dd></div>}
            </dl>
            <div className="pos-row-actions">
              <button type="button" className="pos-primary" onClick={() => openProfile(preview.id)}>Full product profile <SquareArrowOutUpRight size={15} /></button>
              {canManage && <button type="button" className="pos-secondary" onClick={() => setDialog({ kind: 'images', product: preview })}>
                <Camera size={15} /> {preview.image ? 'Photos' : 'Add photos'}</button>}
            </div>
          </div>
        </aside>
      </div>}
      {!!rows.length && layout === 'table' && <div className="pos-table-wrap"><table className="pos-table">
        <thead><tr><th>Product</th><th>Category</th><th>Selling price</th>{canMove && <th>Unit cost</th>}<th>On hand</th><th>Reorder at</th>{canMove && status === 'attention' && <th>Suggested reorder</th>}<th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{rows.map(product => {
          const label = stockLabel(product);
          return <tr key={product.id}>
            <th scope="row"><button type="button" className="pos-table-product pos-product-link" onClick={() => openProfile(product.id)}>
              <ProductPhoto image={product.image} />
              <span>{product.name}<small>{[product.sku, product.location_shelf].filter(Boolean).join(' · ') || product.barcode || '—'}</small></span>
              <ChevronRight size={15} aria-hidden="true" />
            </button></th>
            <td>{product.category?.name ?? '—'}</td><td>{money(product.selling_price)}</td>
            {canMove && <td>{money(product.buying_price)}</td>}
            <td className="pos-number">{product.track_stock ? product.stock : '—'}</td>
            <td>{product.track_stock ? product.reorder_level : '—'}</td>
            {canMove && status === 'attention' && <td className="pos-number">{suggestedReorder(product)}</td>}
            <td><span className={`pos-badge pos-tone-${label.tone}`}>{label.label}</span></td>
            <td><div className="pos-row-actions">
              {product.track_stock && <button className="pos-icon-button" type="button" aria-label={`View stock ledger for ${product.name}`}
                title="View stock ledger" onClick={() => showLedger(product.id)}><List size={16} /></button>}
              {canMove && product.track_stock && <button className="pos-secondary" type="button" onClick={() => setDialog({ kind: 'movement', product })}>Move stock</button>}
              {canManage && <>
                <button className="pos-icon-button" aria-label={`Manage images for ${product.name}`} title="Manage images"
                  onClick={() => setDialog({ kind: 'images', product })}><Camera size={16} /></button>
                <button className="pos-secondary" onClick={() => setDialog({ kind: 'product', product })}>Edit</button>
              </>}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>}
      {matches.length > 24 && <Pagination page={page} count={matches.length} size={24} onPage={setPage} loading={loading} />}
    </section>}
    {tab === 'Stock ledger' && <StockLedger shop={shop} branch={branch} products={catalog} product={ledgerProduct} onProduct={setLedgerProduct} />}
    {tab === 'Suppliers and categories' && <Suppliers options={options.data} error={options.error} canManage={canManage}
      reload={() => { options.reload(); onChange(); }} />}
    </>}
    {dialog?.kind === 'product' && <ProductForm branch={branch} product={dialog.product} options={options.data}
      close={() => setDialog(undefined)} saved={() => saved('Product saved.')} />}
    {dialog?.kind === 'movement' && <MovementForm branch={branch} product={dialog.product} suppliers={options.data?.suppliers ?? []}
      close={() => setDialog(undefined)} saved={() => saved('Stock movement posted.')} />}
    {dialog?.kind === 'images' && <ImageManager product={catalog.find(item => item.id === dialog.product.id) ?? dialog.product}
      close={() => setDialog(undefined)} changed={onChange} />}
  </>;
}

function ProductForm({ branch, product, options, close, saved }: {
  branch: string; product?: Product; options?: CatalogOptions; close: () => void; saved: () => void;
}) {
  const [id] = useState(() => product?.id ?? crypto.randomUUID());
  const [track, setTrack] = useState(!product?.is_service && (product?.track_stock ?? true));
  return <Dialog title={product?.is_service ? 'Edit service' : product ? 'Edit product' : 'Add product'} close={close} wide>
    <DialogForm onSave={form => saveProduct(id, branch, form)} onSaved={saved} submit={product?.is_service ? 'Save service' : 'Save product'}>
      <div className="pos-form-grid">
        <label className="pos-field pos-span-2">{product?.is_service ? 'Service name' : 'Product name'}<input name="name" defaultValue={product?.name} required maxLength={120} /></label>
        <label className="pos-field">SKU<input name="sku" defaultValue={product?.sku ?? ''} maxLength={80} /></label>
        <label className="pos-field">Barcode<input name="barcode" defaultValue={product?.barcode ?? ''} maxLength={100} /></label>
        <label className="pos-field">Category<select name="category" defaultValue={product?.category_id ?? ''}>
          <option value="">Uncategorized</option>
          {product?.category_id && !(options?.categories.some(item => item.id === product.category_id)) &&
            <option value={product.category_id}>{product.category?.name ?? 'Current category'}</option>}
          {options?.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="pos-field">Supplier<select name="supplier" defaultValue={product?.supplier_id ?? ''}>
          <option value="">None</option>
          {product?.supplier_id && !options?.suppliers.some(item => item.id === product.supplier_id) &&
            <option value={product.supplier_id}>Current supplier</option>}
          {options?.suppliers.filter(item => item.is_active || item.id === product?.supplier_id)
            .map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="pos-field">Brand<input name="brand" defaultValue={product?.brand ?? ''} maxLength={120} /></label>
        <label className="pos-field">Shelf location<input name="shelf" defaultValue={product?.location_shelf ?? ''} maxLength={100} /></label>
        <label className="pos-field">Selling price<input name="price" type="number" min="0" step=".01" required defaultValue={product?.selling_price} /></label>
        <label className="pos-field">Unit cost<input name="cost" type="number" min="0" step=".01" required defaultValue={product?.buying_price ?? 0} /></label>
        <label className="pos-field">Minimum price<input name="minimum" type="number" min="0" step=".01" defaultValue={product?.min_price ?? ''} /></label>
        <label className="pos-field">Tax class<select name="tax" defaultValue={product?.tax_class ?? 'standard'}>
          <option value="standard">Standard</option><option value="zero">Zero-rated</option><option value="exempt">Exempt</option>
        </select></label>
        <label className="pos-field">Reorder at<input name="reorder" type="number" min="0" step="1" required defaultValue={product?.reorder_level ?? 5} /></label>
        <label className="pos-field">Suggested reorder quantity<input name="reorderQty" type="number" min="0" step="1" required defaultValue={product?.reorder_qty ?? 10} /></label>
        {!product && track && <label className="pos-field">Opening stock<input name="opening" type="number" min="0" step=".0001" defaultValue={0} /></label>}
        <label className="pos-field pos-span-2">Description<textarea name="description" rows={2} defaultValue={product?.description ?? ''} maxLength={1500} /></label>
        {!product?.is_service && <label className="pos-check"><input name="track" type="checkbox" checked={track} onChange={event => setTrack(event.target.checked)} /> Track inventory</label>}
        <label className="pos-check"><input name="active" type="checkbox" defaultChecked={product?.is_active ?? true} /> Available at checkout</label>
      </div>
    </DialogForm>
  </Dialog>;
}

function MovementForm({ branch, product, suppliers, close, saved }: {
  branch: string; product: Product; suppliers: CatalogOptions['suppliers']; close: () => void; saved: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState('receive');
  return <Dialog title={`Move stock · ${product.name}`} close={close}>
    <DialogForm onSave={form => postStockMovement(id, branch, product.id, mode, form)} onSaved={saved} submit="Post movement">
      <p className="pos-muted">Current balance {product.stock}. A stock count records the physical quantity and reconciles the difference.</p>
      <label className="pos-field">Movement<select value={mode} onChange={event => setMode(event.target.value)}>
        <option value="receive">Receive stock</option><option value="issue">Remove stock</option><option value="count">Reconcile a stock count</option>
      </select></label>
      <label className="pos-field">{mode === 'count' ? 'Counted quantity' : 'Quantity'}
        <input name="quantity" type="number" min={mode === 'count' ? '0' : '.0001'} step=".0001" required /></label>
      {mode === 'issue' && <label className="pos-field">Reason<select name="reason">
        {['Damage', 'Loss', 'Expiry', 'Correction', 'Supplier return'].map(reason => <option key={reason}>{reason}</option>)}
      </select></label>}
      {mode === 'receive' && <>
        <div className="pos-form-grid">
          <label className="pos-field">Unit cost<input name="cost" type="number" min="0" step=".01" defaultValue={product.buying_price} /></label>
          <label className="pos-field">Supplier<select name="supplier" defaultValue={product.supplier_id ?? ''}>
            <option value="">Product default</option>
            {suppliers.filter(supplier => supplier.is_active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label className="pos-field">Batch number<input name="batch" maxLength={120} /></label>
          <label className="pos-field">Expiry date<input name="expiry" type="date" /></label>
        </div>
        <label className="pos-field">Delivery or invoice reference<input name="reference" maxLength={120} /></label>
      </>}
      <label className="pos-field">Notes<textarea name="notes" rows={2} maxLength={1000} /></label>
    </DialogForm>
  </Dialog>;
}

function StockLedger({ shop, branch, products, product, onProduct }: {
  shop: Shop; branch: string; products: Product[]; product: string; onProduct: (id: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [type, setType] = useState('');
  const load = useCallback(() => getStockLedger(branch, page, product, type), [branch, page, product, type]);
  const ledger = useData(load);
  const timestamp = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: shop.timezone });
  return <section className="pos-panel">
    <div className="pos-toolbar">
      <select className="pos-select" aria-label="Ledger product" value={product}
        onChange={event => { onProduct(event.target.value); setPage(0); }}>
        <option value="">All products</option>{products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select className="pos-select" aria-label="Movement type" value={type}
        onChange={event => { setType(event.target.value); setPage(0); }}>
        <option value="">All movement types</option>
        {Object.entries(movementNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
      <button className="pos-secondary" type="button" onClick={ledger.reload} disabled={ledger.loading}>Refresh ledger</button>
    </div>
    <LoadError message={ledger.error} retry={ledger.reload} />
    {!ledger.data?.rows.length ? <Empty>{ledger.loading ? 'Loading stock movements…' : 'No movements match these filters.'}</Empty> :
      <div className="pos-table-wrap"><table className="pos-table">
        <thead><tr><th>Date</th><th>Product</th><th>Movement</th><th>In</th><th>Out</th><th>Balance after</th><th>Details</th><th>Staff</th></tr></thead>
        <tbody>{ledger.data.rows.map(entry => <tr key={entry.id}>
          <td>{timestamp.format(new Date(entry.created_at))}</td><th scope="row">{entry.product?.name ?? 'Former product'}</th>
          <td><span className="pos-badge">{movementNames[entry.type] ?? entry.type}</span></td>
          <td>{entry.qty_in || '—'}</td><td>{entry.qty_out || '—'}</td><td>{entry.qty_on_hand}</td>
          <td><div className="pos-wrap-text">{entry.notes || entry.reference || '—'}
            {[entry.supplier?.name, entry.batch_number && `Batch ${entry.batch_number}`,
              entry.expiry_date && `Expires ${displayDay(entry.expiry_date)}`].filter(Boolean).length > 0 &&
              <small>{[entry.supplier?.name, entry.batch_number && `Batch ${entry.batch_number}`,
                entry.expiry_date && `Expires ${displayDay(entry.expiry_date)}`].filter(Boolean).join(' · ')}</small>}
          </div></td>
          <td>{entry.actor?.full_name || '—'}</td>
        </tr>)}</tbody>
      </table></div>}
    <Pagination page={page} count={ledger.data?.count ?? 0} size={25} onPage={setPage} loading={ledger.loading} />
  </section>;
}

function ImageManager({ product, close, changed }: { product: Product; close: () => void; changed: () => void }) {
  const [file, setFile] = useState<{ file: File; path: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const images = product.product_images;
  const load = useCallback(() => signedImages(images), [images]);
  const signed = useData(load);
  async function mutate(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await action(); } catch (cause) { setError(errorMessage(cause)); }
    finally { changed(); setBusy(false); }
  }
  function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const form = event.currentTarget;
    void mutate(async () => {
      await attachImage(product.id, file.path, file.file);
      form.reset();
      setFile(undefined);
    });
  }
  return <Dialog title={`Product images · ${product.name}`} close={close} wide>
    <div className="pos-dialog-form">
      <LoadError message={error || signed.error || signed.data?.error} />
      {images.length > 0 && <div className="pos-gallery">
        {images.map(item => <article key={item.id}>
          <ProductPhoto image={displayImage(item, signed.data?.urls ?? new Map())} />
          <div className="pos-row-actions">
            {item.is_primary ? <span className="pos-badge">Primary</span> : item.storage_path && <button className="pos-icon-button"
              aria-label="Make this the primary image" disabled={busy}
              onClick={() => { if (item.storage_path) void mutate(() => makePrimaryImage(product.id, item.storage_path!)); }}><Star size={15} /></button>}
            {item.storage_path && <button className="pos-icon-button" disabled={busy} aria-label="Remove image"
              onClick={() => { if (window.confirm('Remove this product image?')) void mutate(() => removeImage(product.id, item.storage_path!)); }}><Trash2 size={15} /></button>}
          </div>
        </article>)}
      </div>}
      {!images.length && <p className="pos-muted">Add the photos you want staff to see in the catalog and at checkout.</p>}
      <form className="pos-upload" onSubmit={attach}>
        <label className="pos-field">Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
          onChange={event => {
            const image = event.currentTarget.files?.[0];
            setError(''); setFile(undefined);
            if (!image) return;
            try { setFile({ file: image, path: imagePath(product.id, image) }); }
            catch (cause) { setError(errorMessage(cause)); }
          }} /></label>
        <button className="pos-primary" disabled={!file || busy}><ImagePlus size={17} /> {busy ? 'Saving…' : 'Upload image'}</button>
      </form>
    </div>
  </Dialog>;
}

function Suppliers({ options, error, canManage, reload }: { options?: CatalogOptions; error?: string; canManage: boolean; reload: () => void }) {
  const [editing, setEditing] = useState<CatalogOptions['suppliers'][number] | 'new' | 'category'>();
  const [id, setId] = useState('');
  function open(value: NonNullable<typeof editing>) {
    setId(typeof value === 'string' ? crypto.randomUUID() : value.id);
    setEditing(value);
  }
  return <>
    <LoadError message={error} retry={reload} />
    <div className="pos-split-panels">
      <section className="pos-panel">
        <div className="pos-panel-bar"><h2><Truck size={18} /> Suppliers</h2>
          {canManage && <button className="pos-secondary" onClick={() => open('new')}><Plus size={16} /> Add supplier</button>}
        </div>
        {!options?.suppliers.length ? <Empty>{options ? 'No suppliers yet.' : 'Loading suppliers…'}</Empty> :
          <div className="pos-table-wrap"><table className="pos-table"><thead><tr><th>Supplier</th><th>Contact</th><th>Status</th><th /></tr></thead>
            <tbody>{options.suppliers.map(item => <tr key={item.id}><th scope="row">{item.name}<small>{item.contact_person}</small></th>
              <td>{item.phone || item.email || '—'}</td><td><span className="pos-badge">{item.is_active ? 'Active' : 'Inactive'}</span></td>
              <td>{canManage && <button className="pos-secondary" onClick={() => open(item)}>Edit</button>}</td></tr>)}</tbody>
          </table></div>}
      </section>
      <section className="pos-panel">
        <div className="pos-panel-bar"><h2><Boxes size={18} /> Categories</h2>
          {canManage && <button className="pos-secondary" onClick={() => open('category')}><Plus size={16} /> Add category</button>}
        </div>
        {options?.categories.length ? <ul className="pos-simple-list">{options.categories.map(item =>
          <li key={item.id}><div><strong>{item.name}</strong><small>{item.description}</small></div></li>)}</ul>
          : <Empty>{options ? 'No categories yet.' : 'Loading categories…'}</Empty>}
      </section>
    </div>
    {editing && <Dialog title={editing === 'category' ? 'Add category' : editing === 'new' ? 'Add supplier' : 'Edit supplier'} close={() => setEditing(undefined)}>
      <DialogForm onSave={form => editing === 'category' ? addCategory(id, form) : saveSupplier(id, form)}
        onSaved={() => { setEditing(undefined); reload(); }}>
        <label className="pos-field">Name<input name="name" maxLength={120} required defaultValue={typeof editing === 'object' ? editing.name : ''} /></label>
        {editing === 'category' ? <label className="pos-field">Description<textarea name="description" maxLength={500} /></label> :
          <SupplierFields supplier={typeof editing === 'object' ? editing : undefined} />}
      </DialogForm>
    </Dialog>}
  </>;
}

function SupplierFields({ supplier }: { supplier?: CatalogOptions['suppliers'][number] }) {
  return <>
    <label className="pos-field">Contact person<input name="contact" maxLength={120} defaultValue={supplier?.contact_person ?? ''} /></label>
    <div className="pos-form-grid">
      <label className="pos-field">Phone<input name="phone" type="tel" maxLength={50} defaultValue={supplier?.phone ?? ''} /></label>
      <label className="pos-field">Email<input name="email" type="email" maxLength={254} defaultValue={supplier?.email ?? ''} /></label>
    </div>
    <label className="pos-field">Address<input name="address" maxLength={240} defaultValue={supplier?.address ?? ''} /></label>
    <label className="pos-field">Payment terms<input name="terms" maxLength={120} defaultValue={supplier?.payment_terms ?? ''} /></label>
    <label className="pos-field">Notes<textarea name="notes" maxLength={500} defaultValue={supplier?.notes ?? ''} /></label>
    <label className="pos-check"><input name="active" type="checkbox" defaultChecked={supplier?.is_active ?? true} /> Active supplier</label>
  </>;
}
