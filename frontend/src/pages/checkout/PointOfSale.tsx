import { useDeferredValue, useEffect, useRef, useState, type FormEvent } from 'react';
import { Banknote, Check, CreditCard, Grid2X2, List, Minus, Pause, Play, Plus, ScanBarcode, ReceiptText, RefreshCw, Search, ShoppingBag, Smartphone, Wallet, Wrench, X } from 'lucide-react';
import { errorMessage, formatMoney } from '../../lib/business';
import {
  createCheckoutService, paymentLabels, recordCheckout, type CheckoutInput, type PaymentMethod, type Product, type Shop,
} from '../../services/checkoutService';
import type { Customer } from '../../services/relationsService';
import { CustomerPicker } from './Customers';
import { Dialog, DialogForm, Empty, LoadError, ProductPhoto } from './WorkspaceUI';

type CartLine = { product: Product; quantity: number };
type HeldCart = { id: string; time: Date; lines: CartLine[]; customer: Customer | null; discount: string; notes: string };
type Tender = { id: string; method: PaymentMethod; amount: string; received: string; reference: string };
const methods = ['cash', 'mpesa', 'card', 'credit'] as const;
const paymentIcons = { cash: Banknote, mpesa: Smartphone, card: CreditCard, credit: Wallet };
const newTender = (method: PaymentMethod = 'cash'): Tender => ({
  id: crypto.randomUUID(), method, amount: '', received: '', reference: '',
});
const minor = (amount: number) => Math.round(amount * 100);

export default function PointOfSale({ shop, branch, userId, catalog, catalogError, isManager, loading, onRefresh, onSale, onInventory, onDraft, onProduct }: {
  shop: Shop; branch: string; userId: string; catalog?: Product[]; catalogError?: string; isManager: boolean;
  loading: boolean; onRefresh: () => void; onSale: (id: string) => void; onInventory: () => void; onDraft: (active: boolean) => void; onProduct: (id: string) => void;
}) {
  const storageKey = `kelvins-pos:pending-sale:${userId}:${branch}`;
  const [pending, setPending] = useState<CheckoutInput | undefined>(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      if (stored?.p_sale && stored.p_branch === branch) return stored;
      // Recover requests started by the previous checkout version.
      if (stored?.p_sale_id && stored.p_branch_id === branch) return {
        p_sale: stored.p_sale_id, p_branch: branch, p_items: stored.p_items,
        p_payments: [{ method: stored.p_method, amount: null, tendered: stored.p_cash_received, reference: stored.p_reference }],
        p_details: { customer_id: null, discount: 0, notes: null },
      };
    } catch { /* The current cart can still be used if browser storage is unavailable. */ }
    return undefined;
  });
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | 'product' | 'service'>('all');
  const [creatingService, setCreatingService] = useState<string>();
  const [category, setCategory] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [held, setHeld] = useState<HeldCart[]>([]);
  const [notice, setNotice] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [visibleCount, setVisibleCount] = useState(48);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [tenders, setTenders] = useState<Tender[]>(() => [newTender()]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);

  const money = formatMoney(shop.currency);
  const activeProducts = catalog?.filter(product => product.is_active) ?? [];
  const visibleProducts = activeProducts.filter(item => kind === 'all' || Boolean(item.is_service) === (kind === 'service'));
  const categories = [...new Set(visibleProducts.flatMap(item => item.category?.name ? [item.category.name] : []))].sort();
  const query = useDeferredValue(search.trim().toLowerCase());
  const filtered = visibleProducts.filter(item => (!category || item.category?.name === category)
    && (!query || [item.name, item.sku, item.barcode].some(value => value?.toLowerCase().includes(query))));
  const lines = Object.values(cart);
  const hasDraft = lines.length > 0 || held.length > 0 || Boolean(pending);
  useEffect(() => { onDraft(hasDraft); }, [hasDraft, onDraft]);
  const gross = lines.reduce((total, line) => total + minor(line.product.selling_price * line.quantity), 0);
  const discountMinor = minor(Math.max(0, Number(discount) || 0));
  const total = Math.max(0, gross - discountMinor);
  const split = tenders.length > 1;
  const allocated = tenders.reduce((sum, tender) => sum + minor(Number(tender.amount) || 0), 0);
  const cash = tenders.find(tender => tender.method === 'cash');
  const change = cash ? Math.max(0, minor(Number(cash.received)) - (split ? minor(Number(cash.amount)) : total)) : 0;
  const locked = busy || !!pending;
  const creditAvailable = !!customer && shop.allow_credit_sales && customer.credit_limit > 0
    && minor(customer.credit_limit) - minor(customer.credit_used) >= total && total > 0;

  function stockLimit(product: Product) {
    if (!product.track_stock || shop.allow_negative_stock) return 99999;
    return Math.min(99999, Math.max(0, product.stock));
  }
  function setQuantity(product: Product, value: number) {
    if (locked || saving.current || !Number.isFinite(value)) return;
    const quantity = Math.min(stockLimit(product), Math.max(0, Math.round(value * 10000) / 10000));
    setError('');
    setSaved(false);
    setCart(previous => {
      if (quantity) return { ...previous, [product.id]: { product, quantity } };
      const next = { ...previous };
      delete next[product.id];
      return next;
    });
  }
  function add(product: Product) {
    setQuantity(product, (cart[product.id]?.quantity ?? 0) + 1);
  }
  function selectKind(next: typeof kind) {
    setKind(next);
    setCategory('');
    setSearch('');
    setVisibleCount(48);
  }

  function serviceSaved(product: Product) {
    setCreatingService(undefined);
    selectKind('service');
    add(product);
    setNotice(`${product.name} saved and added to this sale.`);
    onRefresh();
  }

  function updateTender(id: string, values: Partial<Tender>) {
    setTenders(previous => previous.map(item => item.id === id ? { ...item, ...values } : item));
    setError('');
  }
  function pickCustomer(value: Customer | null) {
    setCustomer(value);
    if (tenders[0]?.method === 'credit') setTenders([newTender()]);
  }
  function holdCart() {
    if (locked || !lines.length || held.length >= 10) return;
    setHeld(previous => [...previous, {
      id: crypto.randomUUID(), time: new Date(), lines, customer, discount, notes,
    }]);
    setCart({});
    setCustomer(null);
    setDiscount('');
    setNotes('');
    setTenders([newTender()]);
    setError('');
    setSaved(false);
    setNotice('Cart held. Select it below to resume.');
    searchRef.current?.focus();
  }

  function resumeCart(entry: HeldCart) {
    if (locked || lines.length || !catalog) return;
    const next: Record<string, CartLine> = {};
    let changed = false;
    for (const line of entry.lines) {
      const product = catalog.find(item => item.id === line.product.id && item.is_active);
      const quantity = product ? Math.min(line.quantity, stockLimit(product)) : 0;
      if (product && quantity > 0) next[product.id] = { product, quantity };
      if (quantity !== line.quantity || product?.selling_price !== line.product.selling_price) changed = true;
    }
    if (Object.keys(next).length === 0) {
      setNotice('None of the held items are currently available. Refresh the catalog or discard this cart.');
      return;
    }
    setCart(next);
    setCustomer(entry.customer);
    setDiscount(entry.discount);
    setNotes(entry.notes);
    setTenders([newTender()]);
    setError('');
    setHeld(previous => previous.filter(item => item.id !== entry.id));
    setSaved(false);
    setNotice(changed ? 'Stock or prices changed while this cart was held. Review the updated cart before taking payment.' : 'Cart resumed.');
  }

  function refresh() {
    if (locked) return;
    if (lines.length && !window.confirm('Refresh products and clear the current cart?')) return;
    setCart({});
    onRefresh();
  }
  function discardPending() {
    setPending(undefined);
    try { sessionStorage.removeItem(storageKey); } catch { /* In-memory state is sufficient here. */ }
  }
  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || (!pending && !lines.length)) return;
    if (!pending && (discountMinor > gross || (split && allocated !== total))) {
      setError(discountMinor > gross ? 'The discount cannot exceed the cart total.' : 'Split payments must add up to the total.');
      return;
    }
    if (!pending && tenders[0]?.method === 'credit' && !creditAvailable) {
      setError('The customer no longer has enough available credit for this sale. Select another payment method.');
      return;
    }
    const input = pending ?? {
      p_sale: crypto.randomUUID(), p_branch: branch,
      p_items: lines.map(line => ({ product_id: line.product.id, quantity: line.quantity, unit_price: line.product.selling_price })),
      p_payments: tenders.map(item => ({
        method: item.method, amount: split ? minor(Number(item.amount)) / 100 : null,
        tendered: item.method === 'cash' ? Number(item.received) : null, reference: item.reference.trim() || null,
      })),
      p_details: { customer_id: customer?.id ?? null, discount: discountMinor / 100, notes: notes.trim() || null },
    };
    saving.current = true;
    setBusy(true);
    setError('');
    setPending(input);
    try { sessionStorage.setItem(storageKey, JSON.stringify(input)); } catch { /* Retry remains available in this tab. */ }
    try {
      const id = await recordCheckout(input);
      discardPending();
      setCart({});
      setCustomer(null);
      setNotes('');
      setDiscount('');
      setTenders([newTender()]);
      setNotice('');
      setSaved(true);
      onSale(id);
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : '';
      if (typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code)) {
        discardPending();
        setError(errorMessage(cause));
      } else {
        setError('The sale status could not be confirmed. Retry the same checkout to avoid a duplicate.');
      }
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <>
    <div className="pos-heading pos-register-heading"><div><h1>Point of sale</h1><p>Scan items, take payment, and issue a receipt.</p></div>
      <div className="pos-register-actions">
        <button type="button" className="pos-secondary" onClick={() => searchRef.current?.focus()}><ScanBarcode size={17} /> Scan item</button>
        <button type="button" className="pos-secondary" onClick={refresh} disabled={locked || loading}><RefreshCw size={16} /> Refresh catalog</button>
      </div>
    </div>
    <LoadError message={catalogError} retry={refresh} />
    <div className="pos-checkout-grid">
      <section className="pos-panel pos-catalog">
        <div className="pos-panel-bar"><div><h2>Checkout catalog</h2><p>{filtered.length} of {visibleProducts.length} items</p></div>
          <div className="pos-segment" aria-label="Catalog layout">
            <button type="button" aria-label="Grid view" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Grid2X2 size={17} /></button>
            <button type="button" aria-label="List view" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={17} /></button>
          </div>
        </div>
        <div className="pos-register-catalog-tools">
          <div className="pos-segment" aria-label="Catalog type">
            {([['all', 'All'], ['product', 'Products'], ['service', 'Services']] as const).map(([value, label]) =>
              <button type="button" key={value} aria-pressed={kind === value} onClick={() => selectKind(value)}>{label}</button>)}
          </div>
          {isManager && <button type="button" className="pos-secondary" disabled={locked} onClick={() => setCreatingService(crypto.randomUUID())}>
            <Plus size={16} /> New service</button>}
        </div>
        <label className="pos-search"><Search size={18} /><input ref={searchRef} aria-label="Search products, services, SKUs or barcodes" placeholder="Search products or services, or scan a barcode"
          value={search} onChange={event => { setSearch(event.target.value); setVisibleCount(48); }}
          onKeyDown={event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const code = search.trim().toLowerCase();
            const exact = code && activeProducts.find(item => item.barcode?.toLowerCase() === code || item.sku?.toLowerCase() === code);
            if (exact && !locked) {
              if ((cart[exact.id]?.quantity ?? 0) < stockLimit(exact)) {
                add(exact);
                setSearch('');
                setNotice(`Added ${exact.name} to the sale.`);
              }
              else setError('This product has no remaining stock to add.');
            } else if (code && !locked) {
              setError('No exact barcode or SKU matched. Choose a product from the results.');
            }
          }} /></label>
        {categories.length > 0 && <div className="pos-tabs" aria-label="Product categories">
          {['', ...categories].map(item => <button type="button" key={item} aria-pressed={category === item}
            onClick={() => { setCategory(item); setVisibleCount(48); }}>{item || 'All items'}</button>)}
        </div>}
        {filtered.length ? <div className={layout === 'grid' ? 'pos-product-grid' : 'pos-product-grid pos-product-list'}>{filtered.slice(0, visibleCount).map(product =>
          <article className="pos-product" key={product.id}>
            <button type="button" className="pos-card-photo pos-catalog-preview" aria-label={`View details for ${product.name}`}
              onClick={() => onProduct(product.id)}>{product.is_service && !product.image
                ? <span className="pos-product-photo pos-service-photo"><Wrench size={26} aria-hidden="true" /></span>
                : <ProductPhoto image={product.image} />}
              <span className={`pos-badge ${product.track_stock && product.stock <= product.reorder_level ? 'pos-tone-warn' : 'pos-tone-neutral'}`}>
                {product.is_service ? 'Service' : product.track_stock ? `${product.stock} in stock` : 'Untracked'}
              </span></button>
            <div className="pos-card-product-info"><h3><button type="button" className="pos-product-link" onClick={() => onProduct(product.id)}>{product.name}</button></h3><small>{[product.category?.name, product.sku].filter(Boolean).join(' · ') || (product.is_service ? 'Service' : 'Product')}</small>
              <div className="pos-product-bottom"><strong>{money(product.selling_price)}</strong><button type="button" className="pos-add"
                aria-label={`Add ${product.name}`} disabled={locked || (cart[product.id]?.quantity ?? 0) >= stockLimit(product)}
                onClick={() => add(product)}><Plus size={18} /></button></div>
            </div>
          </article>)}</div> : <Empty action={isManager && !activeProducts.length ? <button className="pos-secondary" onClick={onInventory}>Open inventory</button> : undefined}>
          {loading ? 'Loading catalog…' : visibleProducts.length ? 'No items match your search.'
            : kind === 'service' ? 'There are no active services at this branch.' : 'There are no active items in this branch.'}
        </Empty>}
        {filtered.length > visibleCount && <div className="pos-more"><button className="pos-secondary" onClick={() => setVisibleCount(count => count + 48)}>Show more products</button></div>}
      </section>
      <form className="pos-panel pos-cart" onSubmit={checkout}>
        <div className="pos-panel-bar"><h2><ShoppingBag size={19} /> Current sale</h2><span className="pos-badge">{lines.length} {lines.length === 1 ? 'line' : 'lines'}</span></div>
        <div className="pos-register-actions">
          <button className="pos-secondary" type="button" onClick={holdCart} disabled={locked || !lines.length || held.length >= 10}><Pause size={15} /> Hold cart</button>
          {held.length > 0 && <span className="pos-muted">{held.length} held in this session</span>}
        </div>
        {held.length > 0 && <ul className="pos-held-carts" aria-label="Held carts">{held.map((entry, index) =>
          <li key={entry.id}><div><strong>{entry.customer?.name || `Cart ${index + 1}`}</strong>
            <small>{entry.lines.length} line items · {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: shop.timezone }).format(entry.time)}</small></div>
            <button type="button" className="pos-secondary" disabled={locked || !!lines.length || !catalog} onClick={() => resumeCart(entry)}><Play size={13} /> Resume</button>
            <button type="button" className="pos-icon-button" aria-label={`Discard held cart ${index + 1}`} disabled={locked}
              onClick={() => { if (window.confirm('Discard this held cart?')) setHeld(previous => previous.filter(item => item.id !== entry.id)); }}><X size={15} /></button>
          </li>)}</ul>}
        {notice && <p className="pos-muted" role="status">{notice}</p>}
        {saved && <p className="pos-success" role="status"><Check size={16} /> Sale recorded.</p>}
        {pending && !busy && <p role="status" className="pos-muted">An earlier sale is awaiting confirmation. Retry it to recover the receipt.</p>}
        <CustomerPicker customer={customer} onPick={pickCustomer} disabled={locked} />
        {!lines.length && !pending && <Empty>Add products to start a sale.</Empty>}
        {!!lines.length && <ul className="pos-cart-lines">{lines.map(({ product, quantity }) =>
          <li key={product.id}><div className="pos-table-product"><ProductPhoto image={product.image} />
            <div><strong>{product.name}</strong><small>{money(product.selling_price)} each</small></div></div>
            <div className="pos-line-actions">
              <div className="pos-stepper"><button type="button" aria-label={`Remove one ${product.name}`}
                disabled={locked} onClick={() => setQuantity(product, quantity - 1)}><Minus size={15} /></button>
                <QuantityField product={product} value={quantity} disabled={locked} max={stockLimit(product)} onChange={value => setQuantity(product, value)} />
                <button type="button" aria-label={`Add one ${product.name}`}
                  disabled={locked || quantity >= stockLimit(product)} onClick={() => setQuantity(product, quantity + 1)}><Plus size={15} /></button>
              </div><strong>{money(minor(product.selling_price * quantity) / 100)}</strong>
            </div>
          </li>)}</ul>}
        <fieldset disabled={locked || !lines.length}>
          <details className="pos-sale-details">
            <summary>Sale details</summary>
            {isManager && <label className="pos-field">Sale discount<input type="number" min="0" max={(gross / 100).toFixed(2)} step=".01"
              value={discount} onChange={event => setDiscount(event.target.value)} placeholder="0.00" /></label>}
            <label className="pos-field">Sale note<textarea rows={2} maxLength={500} value={notes} onChange={event => setNotes(event.target.value)} /></label>
          </details>
        </fieldset>
        <div className="pos-sale-totals">
          {discountMinor > 0 && <div><span>Discount</span><strong>−{money(discountMinor / 100)}</strong></div>}
          <div className="pos-total"><span>Total due</span><strong>{money(total / 100)}</strong></div>
        </div>
        <fieldset disabled={locked || !lines.length}>
          <legend>Payment</legend>
          {!split && <div className="pos-payments">
            {methods.filter(method => method !== 'credit' || creditAvailable).map(method => {
              const Icon = paymentIcons[method];
              return <label key={method}><input type="radio" name="payment" checked={tenders[0].method === method}
                onChange={() => setTenders([newTender(method)])} /><Icon size={17} />{paymentLabels[method]}</label>;
            })}
          </div>}
          <div className="pos-tenders">
            {tenders.map(tender => <div key={tender.id} className="pos-tender-card">
              {split && <div className="pos-row-actions">
                <select aria-label="Split payment method" value={tender.method} className="pos-select"
                  onChange={event => updateTender(tender.id, { method: event.target.value as PaymentMethod, received: '', reference: '' })}>
                  {methods.filter(method => method !== 'credit').map(method =>
                    <option key={method} value={method} disabled={tenders.some(other => other.id !== tender.id && other.method === method)}>{paymentLabels[method]}</option>)}
                </select>
                <button type="button" className="pos-icon-button" aria-label="Remove split payment"
                  onClick={() => setTenders(previous => previous.filter(item => item.id !== tender.id))}><X size={15} /></button>
              </div>}
              {split && <label className="pos-field">Payment amount <input type="number" min=".01" step=".01" required
                value={tender.amount} onChange={event => updateTender(tender.id, { amount: event.target.value })} /></label>}
              {tender.method === 'cash'
                ? <><label className="pos-field">Cash received<input type="number" min={split ? tender.amount || '0' : (total / 100).toFixed(2)} step=".01"
                  value={tender.received} onChange={event => updateTender(tender.id, { received: event.target.value })} placeholder="0.00" required /></label>
                  {!split && <div className="pos-cash-quick" aria-label="Quick cash amounts">
                    <button type="button" className="pos-secondary" onClick={() => updateTender(tender.id, { received: (total / 100).toFixed(2) })}>Exact cash</button>
                    {[100, 500, 1000, 5000].map(step => Math.ceil(total / (step * 100)) * step)
                      .filter((amount, index, values) => amount * 100 > total && values.indexOf(amount) === index).slice(0, 3)
                      .map(amount => <button key={amount} type="button" className="pos-secondary" onClick={() => updateTender(tender.id, { received: amount.toFixed(2) })}>{money(amount)}</button>)}
                  </div>}
                </>
                : tender.method === 'credit' ? <p className="pos-muted">This sale will be added to the customer’s account balance.</p>
                  : <label className="pos-field">{paymentLabels[tender.method]} reference<input value={tender.reference} maxLength={120}
                    placeholder="Confirmed transaction reference" onChange={event => updateTender(tender.id, { reference: event.target.value })} required /></label>}
            </div>)}
          </div>
          {tenders.length < 3 && tenders[0].method !== 'credit' && total >= 2 && <button type="button" className="pos-text-button"
            onClick={() => setTenders(previous => [...previous, newTender(methods.find(item => item !== 'credit' && !previous.some(row => row.method === item)))])}>
            <Plus size={15} /> {split ? 'Add payment' : 'Split payment'}</button>}
          {split && <div className="pos-change"><span>{allocated <= total ? 'Remaining to allocate' : 'Overallocated'}</span><strong>{money(Math.abs(total - allocated) / 100)}</strong></div>}
          {change > 0 && <div className="pos-change"><span>Change</span><strong>{money(change / 100)}</strong></div>}
        </fieldset>
        <LoadError message={error} />
        <button className="pos-primary pos-complete" disabled={busy || (!lines.length && !pending)}>
          <ReceiptText size={18} /> {busy ? 'Recording…' : pending ? 'Retry sale' : 'Record sale'}
        </button>
      </form>
    </div>
    {creatingService && <Dialog title="New service" close={() => setCreatingService(undefined)}>
      <DialogForm onSave={form => createCheckoutService(creatingService, branch, userId, form)}
        onSaved={serviceSaved} submit="Save and add to sale">
        <p className="pos-muted">Save a service for this branch and add it to your current sale.</p>
        <label className="pos-field">Service name<input name="name" required maxLength={120} placeholder="e.g. Screen installation" /></label>
        <div className="pos-form-grid">
          <label className="pos-field">Price ({shop.currency})<input name="price" type="number" min="0" max="9999999999.99" step=".01" required /></label>
          <label className="pos-field">Cost ({shop.currency})<input name="cost" type="number" min="0" max="9999999999.99" step=".01" placeholder="0.00" /></label>
        </div>
        <label className="pos-field">Tax class<select name="tax" defaultValue="standard">
          <option value="standard">Standard</option><option value="zero">Zero-rated</option><option value="exempt">Exempt</option>
        </select></label>
        <label className="pos-field">Description<textarea name="description" rows={2} maxLength={1500} /></label>
      </DialogForm>
    </Dialog>}
  </>;
}

function QuantityField({ product, value, disabled, max, onChange }: {
  product: Product; value: number; disabled: boolean; max: number; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string>();
  return <input type="text" inputMode="decimal" aria-label={`Quantity for ${product.name}`}
    disabled={disabled} value={draft ?? value} onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      if (draft !== undefined && draft.trim() !== '' && Number.isFinite(Number(draft))) onChange(Math.min(Number(draft), max));
      setDraft(undefined);
    }}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />;
}
