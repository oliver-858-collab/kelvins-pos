import { useState, type ReactNode } from 'react';
import {
  ArrowRight, Banknote, BarChart3, ChevronRight, CircleHelp, Clock3, CreditCard,
  Headphones, LayoutDashboard, Menu, Minus, Package, Plus, ReceiptText, Search,
  Settings, ShoppingBag, ShoppingCart, Smartphone, Store, Users, Wallet, Wrench, X,
} from 'lucide-react';
import { initialSales, money, products, records, type Receipt } from './data';

const groups = [
  { label: 'Workspace', links: [
    { name: 'Dashboard', icon: LayoutDashboard }, { name: 'Point of sale', icon: ShoppingCart },
    { name: 'Sales history', icon: ReceiptText }, { name: 'Inventory', icon: Package },
    { name: 'Customers', icon: Users }, { name: 'Services', icon: Wrench },
  ] },
  { label: 'Back office', links: [
    { name: 'Creditors', icon: CreditCard }, { name: 'Expenses', icon: Wallet },
    { name: 'Cash book', icon: Banknote }, { name: 'Payroll', icon: Users },
    { name: 'Advances', icon: Clock3 }, { name: 'Reports', icon: BarChart3 },
    { name: 'Settings', icon: Settings },
  ] },
];

function Table({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return <div className="overflow-x-auto"><table className="demo-table">
    <thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={String(row[0])}>{row.map((cell, index) => <td key={columns[index]}>{cell}</td>)}</tr>)}</tbody>
  </table>{rows.length === 0 && <p className="p-5 text-sm text-slate-500">No matching records.</p>}</div>;
}

function SalesTable({ sales }: { sales: Receipt[] }) {
  return <Table columns={['Receipt', 'Customer', 'Payment', 'Time', 'Total']}
    rows={sales.map((sale) => [sale.id, sale.customer, sale.method, sale.time, money(sale.total)])} />;
}

function RevenueChart({ total }: { total: number }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const amounts = [0, 0, 0, 0, 0, 0, total];
  const max = Math.max(30000, ...amounts);
  return <section className="demo-card p-5">
    <h2 className="demo-subtitle">Sales this week</h2>
    <p className="mt-1 text-sm text-slate-500">Revenue in Kenyan shillings</p>
    <div className="mt-6 flex h-48 items-end gap-3 sm:gap-5" aria-label="Weekly sample revenue">
      {amounts.map((amount, index) => <div key={days[index]} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center">
        <div className={index === 6 ? 'rounded-t-lg bg-teal-600' : 'rounded-t-lg bg-teal-100'}
          style={{ height: `${amount / max * 82}%` }} title={money(amount)} aria-label={`${days[index]} ${money(amount)}`} />
        <span className="text-xs text-slate-500">{days[index]}</span>
      </div>)}
    </div>
  </section>;
}

export default function DemoApp() {
  const [page, setPage] = useState('Dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [inventory, setInventory] = useState(products);
  const [sales, setSales] = useState(initialSales);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState('Cash');
  const [receipt, setReceipt] = useState<Receipt>();
  const lowStock = inventory.filter((product) => product.stock <= 5);
  const salesTotal = sales.reduce((sum, sale) => sum + sale.total, 0);
  const cartItems = inventory.filter((product) => cart[product.id] > 0);
  const cartTotal = cartItems.reduce((sum, product) => sum + product.price * cart[product.id], 0);
  const results = inventory.filter((product) =>
    [product.name, product.id, product.category].some((value) => value.toLowerCase().includes(search.trim().toLowerCase())));

  function navigate(next: string) {
    setPage(next);
    setSearch('');
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }

  function updateCart(id: string, delta: number, stock: number) {
    setCart((previous) => ({ ...previous, [id]: Math.max(0, Math.min(stock, (previous[id] ?? 0) + delta)) }));
    setReceipt(undefined);
  }

  function checkout() {
    if (cartItems.length === 0) return;
    const next = {
      id: `POS-${1039 + sales.length}`, customer: 'Walk-in customer', method,
      total: cartTotal, time: new Intl.DateTimeFormat('en-KE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Nairobi' }).format(new Date()),
    };
    setSales([next, ...sales]);
    setInventory(inventory.map((product) => ({ ...product, stock: product.stock - (cart[product.id] ?? 0) })));
    setCart({});
    setReceipt(next);
  }

  return <div className="demo-shell">
    {menuOpen && <button className="fixed inset-0 z-20 bg-slate-950/50 lg:hidden" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`demo-sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Workspace navigation">
      <button className="flex items-center gap-3 px-3 text-left" onClick={() => navigate('Dashboard')}>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500 text-slate-950"><Store size={21} /></span>
        <span><span className="block text-base font-bold text-white">Kelvin’s POS</span><span className="block text-xs text-slate-400">Demo branch</span></span>
      </button>
      <nav className="mt-8 space-y-6">{groups.map(({ label, links }) => <div key={label}>
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.17em] text-slate-400">{label}</p>
        {links.map(({ name, icon: Icon }) => <button key={name} onClick={() => navigate(name)}
          aria-current={page === name ? 'page' : undefined} className="demo-nav"><Icon size={17} aria-hidden="true" />{name}</button>)}
      </div>)}</nav>
      <div className="mt-auto flex items-center gap-2 px-3 pt-8 text-xs text-slate-400"><CircleHelp size={15} /> Demo data resets on refresh</div>
    </aside>
    <div className="min-w-0 lg:col-start-2">
      <header className="flex h-[70px] items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <button className="demo-icon lg:hidden" aria-expanded={menuOpen} aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <span className="hidden text-slate-500 sm:inline">Workspace</span><ChevronRight size={14} className="hidden text-slate-400 sm:block" />
          <span className="truncate font-semibold">{page}</span>
        </div>
        <div className="flex items-center gap-3"><span className="demo-pill">Demo workspace</span>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-bold" aria-label="Kelvin">K</span></div>
      </header>
      <main className="mx-auto max-w-[1520px] p-4 sm:p-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-3xl font-bold tracking-tight">{page}</h1>
            <p className="mt-1 text-sm text-slate-500">{page === 'Dashboard' ? 'Sales and stock at Demo branch' : page === 'Point of sale' ? 'Add products to the cart and record a sample sale.' : 'Demo branch · Sample data'}</p></div>
          {page !== 'Point of sale' && <button className="demo-button" onClick={() => navigate('Point of sale')}><Plus size={17} /> New sale</button>}
        </div>

        {page === 'Dashboard' && <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Sales today', value: money(salesTotal), icon: Banknote },
              { label: 'Transactions', value: sales.length, icon: ReceiptText },
              { label: 'Products in stock', value: inventory.filter((product) => product.stock > 0).length, icon: Package },
              { label: 'Low stock', value: lowStock.length, icon: ShoppingBag },
            ].map(({ label, value, icon: Icon }) => <section className="demo-card p-4" key={label}>
              <div className="flex items-center justify-between gap-2 text-sm text-slate-600">{label}<Icon size={17} className="text-teal-700" /></div>
              <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
            </section>)}
          </div>
          <div className="my-4 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
            <RevenueChart total={salesTotal} />
            <section className="demo-card p-5">
              <h2 className="demo-subtitle">Low stock</h2>
              <ul className="my-2 divide-y divide-slate-100">{lowStock.map((product) => <li className="flex items-center justify-between gap-3 py-3 text-sm" key={product.id}>
                <span>{product.name}<span className="block text-xs text-slate-500">{product.id}</span></span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">{product.stock} left</span>
              </li>)}</ul>
              <button className="demo-link mt-1" onClick={() => navigate('Inventory')}>View inventory <ArrowRight size={15} /></button>
            </section>
          </div>
          <section className="demo-card"><div className="flex items-center justify-between gap-4 p-5"><h2 className="demo-subtitle">Recent transactions</h2>
            <button className="demo-link" onClick={() => navigate('Sales history')}>View all <ArrowRight size={15} /></button></div>
            <SalesTable sales={sales.slice(0, 4)} /></section>
        </>}

        {(page === 'Point of sale' || page === 'Inventory') && <label className="demo-search mb-4">
          <Search size={17} aria-hidden="true" /><input aria-label="Search products" placeholder="Search products or SKU" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>}
        {page === 'Point of sale' && <div className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
          <section aria-label="Products" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {results.map((product) => {
              const Icon = product.category === 'Phones' ? Smartphone : product.category === 'Electronics' ? Headphones : Package;
              const quantity = cart[product.id] ?? 0;
              return <article className="demo-card p-4" key={product.id}>
                <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-teal-800"><Icon size={22} aria-hidden="true" /></span>
                <h2 className="font-semibold">{product.name}</h2><p className="mt-1 text-xs text-slate-500">{product.id} · {product.stock} in stock</p>
                <div className="mt-4 flex items-center justify-between gap-2"><strong>{money(product.price)}</strong>
                  <button className="demo-button" disabled={quantity >= product.stock} aria-label={`Add ${product.name}`} onClick={() => updateCart(product.id, 1, product.stock)}><Plus size={16} /> Add</button>
                </div>
              </article>;
            })}
            {results.length === 0 && <p className="text-sm text-slate-500">No products match your search.</p>}
          </section>
          <section className="demo-card p-5">
            <h2 className="demo-subtitle">Current cart</h2>
            {receipt && <div role="status" className="my-3 flex items-start justify-between gap-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
              <span>Sale {receipt.id} recorded · {money(receipt.total)}</span>
              <button aria-label="Dismiss receipt" onClick={() => setReceipt(undefined)}><X size={16} /></button>
            </div>}
            {cartItems.length === 0 && <p className="py-6 text-sm text-slate-500">Add a product to start a sale.</p>}
            <ul className="divide-y divide-slate-100">{cartItems.map((product) => <li className="py-3" key={product.id}>
              <div className="flex justify-between gap-2 text-sm font-medium"><span>{product.name}</span><span>{money(product.price * cart[product.id])}</span></div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <button className="demo-icon" aria-label={`Remove one ${product.name}`} onClick={() => updateCart(product.id, -1, product.stock)}><Minus size={14} /></button>
                <span>{cart[product.id]}</span>
                <button className="demo-icon" aria-label={`Add one ${product.name}`} disabled={cart[product.id] >= product.stock} onClick={() => updateCart(product.id, 1, product.stock)}><Plus size={14} /></button>
              </div>
            </li>)}</ul>
            <div className="flex justify-between border-t border-slate-200 py-4 font-bold"><span>Total</span><span>{money(cartTotal)}</span></div>
            <label className="block text-sm font-medium">Payment method
              <select className="my-2 w-full rounded-lg border border-slate-300 bg-white p-2" value={method} onChange={(event) => setMethod(event.target.value)}>
                <option>Cash</option><option>M-Pesa</option><option>Card</option>
              </select>
            </label>
            <button className="demo-button mt-2 w-full justify-center" disabled={cartItems.length === 0} onClick={checkout}>Complete demo sale</button>
          </section>
        </div>}
        {page === 'Inventory' && <section className="demo-card"><Table columns={['SKU', 'Product', 'Category', 'Unit price', 'In stock']}
          rows={results.map((product) => [product.id, product.name, product.category, money(product.price), product.stock])} /></section>}
        {page === 'Sales history' && <section className="demo-card"><SalesTable sales={sales} /></section>}
        {page === 'Reports' && <div className="grid gap-4 xl:grid-cols-2">
          <RevenueChart total={salesTotal} />
          <section className="demo-card"><h2 className="demo-subtitle p-5">Payments today</h2>
            <Table columns={['Method', 'Transactions', 'Total']} rows={['Cash', 'M-Pesa', 'Card'].map((payment) => {
              const transactions = sales.filter((sale) => sale.method === payment);
              return [payment, transactions.length, money(transactions.reduce((sum, sale) => sum + sale.total, 0))];
            })} /></section>
        </div>}
        {records[page] && <section className="demo-card"><Table {...records[page]} /></section>}
      </main>
    </div>
  </div>;
}
