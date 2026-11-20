import { useCallback, useDeferredValue, useState } from 'react';
import {
  ArrowDownRight, ArrowUpRight, Banknote, ChartNoAxesCombined, Download, Grid2X2, List, Package, Plus, ReceiptText, Search, ShoppingBag,
  TriangleAlert, Users, Wallet, XCircle,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { displayDay, downloadCsv, errorMessage, formatMoney, shiftDay, shopDay } from '../../lib/business';
import {
  getSalesItemPreviews, getSalesPage, getSalesReport, paymentLabels, paymentName, voidSale, type Product, type Report, type SaleFilters, type SalePreviewItem, type SaleRow, type Shop,
} from '../../services/checkoutService';
import { getStaffDirectory } from '../../services/relationsService';
import { DateRange, Dialog, DialogForm, Empty, LoadError, Pagination, ProductPhoto, useData } from './WorkspaceUI';

export function Overview({ shop, branch, branchName, catalog, userName, onNewSale, onHistory, onReport, onInventory, onReceipt, onProduct, revision, isManager }: {
  shop: Shop; branch: string; branchName: string; catalog?: Product[]; userName: string; onNewSale: () => void;
  onHistory: () => void; onReport: () => void; onInventory: () => void; onReceipt: (sale: string) => void; revision: number;
  isManager: boolean; onProduct: (id: string) => void;
}) {
  const [windowDays, setWindowDays] = useState(7);
  const today = shopDay(shop.timezone);
  const start = shiftDay(today, -(windowDays - 1));
  const useReport = useCallback(() => getSalesReport(branch, start, today), [branch, start, today, revision]);
  const loadRecent = useCallback(() => getSalesPage(branch, {
    start: shiftDay(today, -365), end: today, status: '', method: '', search: '', employee: '',
  }, 0), [today, branch, revision]);
  const report = useData(useReport);
  const recent = useData(loadRecent);
  const totals = report.data?.summary;
  const day = report.data?.daily.at(-1);
  const low = catalog?.filter(product => product.is_active && product.track_stock && product.stock <= product.reorder_level)
    .sort((a, b) => a.stock - b.stock);
  const money = formatMoney(shop.currency);
  const firstName = userName.trim().split(/\s+/)[0];
  return <>
    <div className="pos-heading pos-overview-heading">
      <div><span className="pos-overview-date">{displayDay(today, { weekday: 'long', month: 'long', day: 'numeric' })} · {branchName}</span>
        <h1>Store overview</h1><p>{firstName}, here’s how the store is doing today.</p>
        <div className="pos-hero-actions">
          <button type="button" className="pos-primary" onClick={onNewSale}><Plus size={17} /> New sale</button>
          <button type="button" className="pos-secondary" onClick={onHistory}>View sales <ArrowUpRight size={15} /></button>
        </div>
      </div>
      <div className="pos-hero-number">
        <span>Sales today</span>
        <strong>{day ? money(day.revenue) : '—'}</strong>
        <small>{day ? `${day.orders} completed ${day.orders === 1 ? 'sale' : 'sales'}` : 'Awaiting sales data'}</small>
      </div>
    </div>
    <LoadError message={report.error} retry={report.reload} />
    <div className="pos-metrics">
      <Metric label="Units sold" value={totals?.units ?? '—'} icon={Package} tone="green" detail={`Last ${windowDays} days`} />
      <Metric label="Transactions" value={totals?.orders ?? '—'} icon={ReceiptText} tone="blue" detail={`Last ${windowDays} days`} />
      <Metric label="Average sale" value={totals ? money(totals.average) : '—'} icon={ShoppingBag} tone="peach" detail={`Last ${windowDays} days`} />
      <Metric label="Stock alerts" value={low?.length ?? '—'} icon={TriangleAlert} tone="amber" detail="At or below reorder level" />
    </div>
    <div className="pos-dashboard-grid">
      <section className="pos-panel pos-dashboard-chart">
        <div className="pos-panel-bar"><div><h2>Sales trend</h2><p>Completed sales over time</p></div>
          <div className="pos-segment" aria-label="Sales period">
            {[7, 30, 90].map(days => <button type="button" key={days} aria-pressed={windowDays === days} onClick={() => setWindowDays(days)}>{days}d</button>)}
          </div>
        </div>
        <div className="pos-trend-total">
          <strong>{totals ? money(totals.revenue) : '—'}</strong>
          {report.data && <Comparison current={report.data.summary.revenue} previous={report.data.prior.revenue} />}
        </div>
        <SalesTrend data={report.data?.daily} currency={shop.currency} />
      </section>
      <PaymentMix report={report.data} currency={shop.currency} />
    </div>
    <div className="pos-dashboard-grid pos-dashboard-bottom">
      <section className="pos-panel">
        <div className="pos-panel-bar"><div><h2>Recent sales</h2><p>Receipts and payment details</p></div>
          <button type="button" className="pos-secondary" onClick={onHistory}>View sales <ArrowUpRight size={15} /></button></div>
        <LoadError message={recent.error} retry={recent.reload} />
        <SalesTable sales={recent.data?.slice(0, 5)} shop={shop} onReceipt={onReceipt} compact />
      </section>
      <section className="pos-panel">
        <div className="pos-panel-bar"><div><h2>Stock alerts</h2><p>Low and out-of-stock items</p></div>
          <button type="button" className="pos-secondary" onClick={onInventory}><Package size={15} /> Review stock</button></div>
        {!low?.length ? <Empty>{low ? 'No products are below their reorder level.' : 'Loading stock levels…'}</Empty> :
          <ul className="pos-simple-list">{low.slice(0, 6).map(product => <li key={product.id}>
            <button type="button" className="pos-table-product pos-product-link" onClick={() => onProduct(product.id)}>
              <ProductPhoto image={product.image} /><span><strong>{product.name}</strong>
              <small>Reorder at {product.reorder_level}</small></span></button>
            <span className={`pos-badge ${product.stock <= 0 ? 'pos-tone-bad' : 'pos-tone-warn'}`}>{product.stock} left</span>
          </li>)}</ul>}
      </section>
    </div>
    {isManager && <div className="pos-report-link"><button className="pos-secondary" onClick={onReport}><ChartNoAxesCombined size={17} /> Open reports</button></div>}
  </>;
}

const salesPeriods = ['Today', 'This week', 'This month', 'Last 30 days', 'Last 90 days', 'Custom'] as const;
type SalesPeriod = typeof salesPeriods[number];

const saleStatuses = [
  { key: '', label: 'All sales' },
  { key: 'completed', label: 'Completed' },
  { key: 'voided', label: 'Voided' },
  { key: 'refunded', label: 'Refunded' },
];

function periodStart(period: Exclude<SalesPeriod, 'Custom'>, today: string) {
  switch (period) {
    case 'Today': return today;
    case 'This week': {
      const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
      return shiftDay(today, -((weekday + 6) % 7));
    }
    case 'This month': return today.slice(0, 7) + '-01';
    case 'Last 30 days': return shiftDay(today, -29);
    case 'Last 90 days': return shiftDay(today, -89);
  }
}

export function SalesHistory({ shop, branch, isManager, onReceipt, revision, onChange, todayOnly }: {
  shop: Shop; branch: string; isManager: boolean; onReceipt: (id: string) => void; revision: number; onChange: () => void; todayOnly?: boolean;
}) {
  const today = shopDay(shop.timezone);
  const [filters, setFilters] = useState<SaleFilters>({
    start: todayOnly ? today : shiftDay(today, -29), end: today, status: '', method: '', employee: '', search: '',
  });
  const [page, setPage] = useState(0);
  const [period, setPeriod] = useState<SalesPeriod>(todayOnly ? 'Today' : 'Last 30 days');
  const [layout, setLayout] = useState<'board' | 'table'>('board');
  const [voiding, setVoiding] = useState<SaleRow>();
  const [downloadError, setDownloadError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const query = useDeferredValue(filters.search);
  const load = useCallback(() => getSalesPage(branch, { ...filters, search: query }, page),
    [branch, filters.start, filters.end, filters.status, filters.method, filters.employee, query, page, revision]);
  const sales = useData(load);
  const staff = useData(getStaffDirectory, isManager);
  const displayedSales = sales.loading || sales.error ? undefined : sales.data;
  const loadPreviews = useCallback(
    () => getSalesItemPreviews(branch, (displayedSales ?? []).map(sale => sale.id)),
    [branch, displayedSales],
  );
  const previews = useData(loadPreviews, layout === 'board' && !!displayedSales?.length);

  function selectPeriod(next: SalesPeriod) {
    setPeriod(next);
    if (next !== 'Custom') filter({ start: periodStart(next, today), end: today });
  }

  function filter(values: Partial<SaleFilters>) {
    setPage(0);
    setFilters(previous => ({ ...previous, ...values }));
  }

  async function exportSales() {
    if (exporting) return;
    setExporting(true);
    setDownloadError('');
    try {
      const rows: SaleRow[] = [];
      for (let index = 0; ; index++) {
        const result = await getSalesPage(branch, { ...filters, search: query }, index);
        rows.push(...result);
        if (result.length < 30 || rows.length >= (result[0]?.total_rows ?? 0)) break;
      }
      downloadCsv(`sales-${filters.start}-${filters.end}.csv`,
        ['Sale', 'Receipt', 'Date', 'Status', 'Customer', 'Staff', 'Payment methods', 'Total', 'Void reason'],
        rows.map(row => [row.sale_number, row.receipt_number, row.created_at, row.status, row.customer_name,
          row.cashier_name, row.methods.map(paymentName).join(' + '), row.total_amount, row.void_reason]));
    } catch (cause) {
      setDownloadError(errorMessage(cause));
    } finally { setExporting(false); }
  }

  return <>
    <div className="pos-heading">
      <div><h1>Sales history</h1><p>Find transactions by receipt, customer, staff or payment reference.</p></div>
      <button className="pos-secondary" onClick={() => void exportSales()} disabled={exporting || sales.loading || !displayedSales?.length}>
        <Download size={17} /> {exporting ? 'Exporting…' : 'Export sales'}
      </button>
    </div>
    <section className="pos-panel pos-sales-history">
      <div className="pos-sales-board-bar">
        <nav className="pos-segment" aria-label="Sale status">
          {saleStatuses.map(status => <button type="button" key={status.key}
            aria-pressed={filters.status === status.key} onClick={() => filter({ status: status.key })}>{status.label}</button>)}
        </nav>
        <div className="pos-segment" aria-label="Sales layout">
          <button type="button" aria-pressed={layout === 'board'} onClick={() => setLayout('board')}><Grid2X2 size={15} /> Cards</button>
          <button type="button" aria-pressed={layout === 'table'} onClick={() => setLayout('table')}><List size={16} /> Table</button>
        </div>
      </div>
      <div className="pos-toolbar pos-sales-filters">
        <label className="pos-search"><Search size={17} /><input aria-label="Search sales"
          placeholder="Search sales, receipts or references" maxLength={120}
          value={filters.search} onChange={event => filter({ search: event.target.value })} /></label>
        <label className="pos-field">Period
          <select className="pos-select" value={period} onChange={event => selectPeriod(event.target.value as SalesPeriod)}>
            {salesPeriods.map(option => <option key={option}>{option}</option>)}
          </select>
        </label>
        <DateRange start={filters.start} end={filters.end} today={today}
          onChange={(start, end) => { setPeriod('Custom'); filter({ start, end }); }} />
        <select className="pos-select" aria-label="Payment filter" value={filters.method} onChange={event => filter({ method: event.target.value })}>
          <option value="">All payments</option>{Object.entries(paymentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        {isManager && <select className="pos-select" aria-label="Staff filter" value={filters.employee} onChange={event => filter({ employee: event.target.value })}>
          <option value="">All staff</option>{staff.data?.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}
        </select>}
      </div>
      <LoadError message={sales.error} retry={sales.reload} /><LoadError message={downloadError} />
      {notice && <p role="status" className="pos-success">{notice}</p>}
      <div className="pos-sales-range" aria-live="polite">
        <span>{displayDay(filters.start)} – {displayDay(filters.end)}</span>
        {displayedSales && <span>{saleCount(displayedSales)} {saleCount(displayedSales) === 1 ? 'sale' : 'sales'}</span>}
      </div>
      {sales.loading ? <Empty>Loading sales…</Empty> : displayedSales && (layout === 'board'
        ? <SalesBoard sales={displayedSales} previews={previews.loading || previews.error ? {} : previews.data ?? {}}
          shop={shop} onReceipt={onReceipt} onVoid={isManager ? setVoiding : undefined} />
        : <SalesTable sales={displayedSales} shop={shop} onReceipt={onReceipt} onVoid={isManager ? setVoiding : undefined} />)}
      {layout === 'board' && !!displayedSales?.length && <LoadError message={previews.error && 'Item previews could not be loaded.'} retry={previews.reload} />}
      <Pagination page={page} count={saleCount(sales.data)} size={30} onPage={setPage} loading={sales.loading} />
    </section>
    {voiding && <Dialog title={`Void ${voiding.sale_number}`} close={() => setVoiding(undefined)}>
      <DialogForm onSave={form => voidSale(voiding.id, String(form.get('reason')).trim())}
        destructive submit="Void sale" onSaved={() => { setVoiding(undefined); setNotice('Sale voided and tracked stock restored.'); onChange(); }}>
        <p className="pos-muted">Voiding reverses this sale in the ledger and restores its tracked stock. Refund money through the original payment channel.</p>
        <label className="pos-field">Reason<textarea name="reason" required minLength={3} maxLength={300} rows={3} /></label>
      </DialogForm>
    </Dialog>}
  </>;
}

function saleCount(sales: SaleRow[] | undefined) { return sales?.[0]?.total_rows ?? 0; }

function SalesBoard({ sales, previews, shop, onReceipt, onVoid }: {
  sales: SaleRow[]; previews: Record<string, SalePreviewItem[]>; shop: Shop;
  onReceipt: (id: string) => void; onVoid?: (sale: SaleRow) => void;
}) {
  const money = formatMoney(shop.currency);
  const date = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeZone: shop.timezone });
  const time = new Intl.DateTimeFormat('en-KE', { timeStyle: 'short', timeZone: shop.timezone });
  if (!sales.length) return <Empty>No sales match this period and filters.</Empty>;

  return <ul className="pos-sales-board" aria-label="Sale records">{sales.map(sale => {
    const customer = sale.customer_name || 'Walk-in customer';
    const initials = sale.customer_name?.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
    const items = previews[sale.id] ?? [];
    const stamp = new Date(sale.created_at);
    const status = saleStatuses.find(entry => entry.key === sale.status)?.label ?? sale.status;
    const tone = sale.status === 'completed' ? 'good' : sale.status === 'voided' ? 'bad' : 'neutral';
    return <li key={sale.id} className="pos-sale-card">
      <div className="pos-sale-card-header">
        <span className="pos-sale-card-avatar" aria-hidden="true">{initials || <ReceiptText size={19} />}</span>
        <div><h3>{customer}</h3><p>{sale.sale_number}</p></div>
        <span className={`pos-badge pos-tone-${tone}`} title={sale.void_reason ?? undefined}>{status}</span>
      </div>
      <div className="pos-sale-card-date"><time dateTime={sale.created_at}>{date.format(stamp)} · {time.format(stamp)}</time>
        {sale.cashier_name && <span>{sale.cashier_name}</span>}</div>
      <div className="pos-sale-card-body">
        {items.length > 0 && <table className="pos-sale-item-preview">
          <thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Amount</th></tr></thead>
          <tbody>{items.slice(0, 3).map(item => <tr key={item.id}>
            <td>{item.name}</td><td>{item.quantity}</td><td>{money(item.total_price)}</td>
          </tr>)}</tbody>
        </table>}
        {items.length > 3 && <p className="pos-sale-card-more">More items on the receipt</p>}
      </div>
      <div className="pos-sale-card-total"><span>Total</span><strong>{money(sale.total_amount)}</strong></div>
      <div className="pos-sale-card-actions">
        <span>{sale.methods.map(paymentName).join(' + ') || '—'}</span>
        {sale.receipt_number && <button type="button" className="pos-secondary" aria-label={`View receipt for ${sale.sale_number}`}
          onClick={() => onReceipt(sale.id)}><ReceiptText size={15} /> View receipt</button>}
        {onVoid && sale.status === 'completed' && <button type="button" className="pos-icon-button" aria-label={`Void ${sale.sale_number}`}
          title="Void sale" onClick={() => onVoid(sale)}><XCircle size={16} /></button>}
      </div>
    </li>;
  })}</ul>;
}

function SalesTable({ sales, shop, onReceipt, onVoid, compact = false }: {
  sales?: SaleRow[]; shop: Shop; onReceipt: (id: string) => void; onVoid?: (sale: SaleRow) => void; compact?: boolean;
}) {
  const money = formatMoney(shop.currency);
  const date = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: shop.timezone });
  if (!sales?.length) return <Empty>{sales ? 'No sales in this view yet.' : 'Loading sales…'}</Empty>;
  return <div className="pos-table-wrap"><table className="pos-table">
    <thead><tr><th>Sale</th><th>Customer</th>{!compact && <th>Staff</th>}<th>Payment</th><th>Status</th><th>Total</th><th>Receipt</th>{onVoid && <th />}</tr></thead>
    <tbody>{sales.map(sale => <tr key={sale.id}>
      <th scope="row">{sale.sale_number}<small>{date.format(new Date(sale.created_at))}</small></th>
      <td>{sale.customer_name || 'Walk-in'}</td>{!compact && <td>{sale.cashier_name || '—'}</td>}
      <td>{sale.methods.map(paymentName).join(' + ') || '—'}</td>
      <td><span title={sale.void_reason ?? undefined} className={`pos-badge pos-tone-${sale.status === 'completed' ? 'good' : 'neutral'}`}>{sale.status}</span></td>
      <td className="pos-number">{money(sale.total_amount)}</td>
      <td>{sale.receipt_number ? <button type="button" className="pos-secondary" onClick={() => onReceipt(sale.id)}><ReceiptText size={15} />{sale.receipt_number}</button> : '—'}</td>
      {onVoid && <td>{sale.status === 'completed' && <button className="pos-icon-button" aria-label={`Void ${sale.sale_number}`}
        title="Void sale" onClick={() => onVoid(sale)}><XCircle size={16} /></button>}</td>}
    </tr>)}</tbody>
  </table></div>;
}

export function Reports({ shop, branch, revision }: { shop: Shop; branch: string; revision: number }) {
  const today = shopDay(shop.timezone);
  const [range, setRange] = useState({ start: shiftDay(today, -29), end: today });
  const [chart, setChart] = useState<'sales' | 'orders'>('sales');
  const load = useCallback(() => getSalesReport(branch, range.start, range.end), [range.start, range.end, branch, revision]);
  const report = useData(load);
  const summary = report.data?.summary;
  const money = formatMoney(shop.currency);
  return <>
    <div className="pos-heading">
      <div><h1>Reports</h1><p>Revenue, payment mix, product performance and staff activity.</p></div>
      <button className="pos-secondary" disabled={!report.data || report.loading} onClick={() => {
        if (!report.data) return;
        const data = report.data;
        downloadCsv(`daily-sales-${range.start}-${range.end}.csv`, ['Day', 'Sales revenue', 'Completed sales'],
          data.daily.map(day => [day.day, day.revenue, day.orders]));
      }}><Download size={17} /> Export daily report</button>
    </div>
    <div className="pos-panel pos-toolbar pos-report-toolbar">
      <DateRange start={range.start} end={range.end} today={today} onChange={(start, end) => setRange({ start, end })} />
      <div className="pos-segment" aria-label="Report period">
        {[7, 30, 90, 365].map(days => <button key={days} aria-pressed={range.start === shiftDay(today, -(days - 1)) && range.end === today}
          onClick={() => setRange({ start: shiftDay(today, -(days - 1)), end: today })}>{days}d</button>)}
      </div>
    </div>
    <LoadError message={report.error} retry={report.reload} />
    <div className="pos-metrics">
      <Metric icon={Wallet} tone="green" label="Completed sales" value={summary ? money(summary.revenue) : '—'} />
      <Metric icon={ReceiptText} tone="blue" label="Transactions" value={summary?.orders ?? '—'} detail={summary ? `${summary.voided} voided` : undefined} />
      <Metric icon={Users} tone="peach" label="Named customers" value={summary?.customers ?? '—'} detail={summary ? `${summary.units} units sold` : undefined} />
      <Metric icon={Banknote} tone="amber" label="On-account balance" value={summary ? money(summary.credit_outstanding) : '—'} detail="Sales recorded in this period" />
    </div>
    <div className="pos-dashboard-grid">
      <section className="pos-panel pos-dashboard-chart">
        <div className="pos-panel-bar"><div><h2>{chart === 'sales' ? 'Revenue by day' : 'Transactions by day'}</h2>
          <p>{displayDay(range.start)} – {displayDay(range.end)}</p></div>
          <div className="pos-segment"><button aria-pressed={chart === 'sales'} onClick={() => setChart('sales')}>Revenue</button>
            <button aria-pressed={chart === 'orders'} onClick={() => setChart('orders')}>Orders</button></div></div>
        <div className="pos-trend-total"><strong>{summary ? (chart === 'sales' ? money(summary.revenue) : summary.orders) : '—'}</strong>
          {report.data && <Comparison current={chart === 'sales' ? report.data.summary.revenue : report.data.summary.orders}
            previous={chart === 'sales' ? report.data.prior.revenue : report.data.prior.orders} />}</div>
        <SalesTrend data={report.data?.daily} currency={shop.currency} orders={chart === 'orders'} />
      </section>
      <PaymentMix report={report.data} currency={shop.currency} />
    </div>
    <div className="pos-dashboard-grid">
      <Rankings title="Top products" rows={report.data?.products.map(item => ({
        id: item.product_id ?? item.name, name: item.name, count: item.quantity, total: item.revenue,
      }))} currency={shop.currency} noun="units" />
      <Rankings title="Staff sales" rows={report.data?.staff.map(item => ({
        id: item.cashier_id, name: item.name, count: item.orders, total: item.revenue,
      }))} currency={shop.currency} noun="sales" />
    </div>
    <div className="pos-dashboard-grid">
      <section className="pos-panel"><div className="pos-panel-bar"><h2>Stock movements</h2></div>
        {report.data?.stock.length ? <div className="pos-table-wrap"><table className="pos-table">
          <thead><tr><th>Type</th><th>Movements</th><th>In</th><th>Out</th></tr></thead>
          <tbody>{report.data.stock.map(item => <tr key={item.type}><th scope="row" className="capitalize">{item.type}</th>
            <td>{item.movements}</td><td>{item.received}</td><td>{item.issued}</td></tr>)}</tbody></table></div> : <Empty>No stock movements in this period.</Empty>}
      </section>
      <section className="pos-panel"><div className="pos-panel-bar"><h2>Sale totals</h2></div>
        <ul className="pos-simple-list">
          <li>{shop.tax_name}<strong>{summary ? money(summary.tax) : '—'}</strong></li>
          <li>Discounts<strong>{summary ? money(summary.discount) : '—'}</strong></li>
          <li>Estimated margin on costed lines<strong>{summary ? money(summary.tracked_margin) : '—'}</strong></li>
          <li>Sale lines with historical cost<strong>{summary ? `${summary.cost_coverage} of ${summary.lines}` : '—'}</strong></li>
        </ul>
      </section>
    </div>
  </>;
}

function Metric({ icon: Icon, label, value, tone, detail }: {
  icon: typeof Wallet; label: string; value: string | number; tone: string; detail?: string;
}) {
  return <section className="pos-panel pos-metric">
    <div><span>{label}</span><span className={`pos-metric-icon pos-metric-${tone}`}><Icon size={18} aria-hidden="true" /></span></div>
    <strong>{value}</strong>
    {detail && <small>{detail}</small>}
  </section>;
}

function Comparison({ current, previous }: { current: number; previous: number }) {
  if (!previous) return null;
  const change = (current - previous) / previous * 100;
  const Icon = change < 0 ? ArrowDownRight : ArrowUpRight;
  return <span className="pos-comparison">
    <span className={`pos-badge ${change < 0 ? 'pos-tone-bad' : 'pos-tone-good'}`}>
      <Icon size={14} />{change > 0 ? '+' : ''}{change.toFixed(1)}%
    </span><small>vs. previous period</small>
  </span>;
}

function SalesTrend({ data, currency, orders = false }: { data?: Report['daily']; currency: string; orders?: boolean }) {
  const money = formatMoney(currency);
  return <div className="pos-chart-wrap" aria-label={orders ? 'Daily completed transactions' : 'Daily completed sales revenue'}>
    {data ? <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ left: 8, right: 14, top: 10, bottom: 4 }}>
        <defs><linearGradient id="pos-sales-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9683ea" stopOpacity=".5" /><stop offset="98%" stopColor="#eee9ff" stopOpacity=".05" />
        </linearGradient></defs>
        <CartesianGrid stroke="#e6e3f0" vertical={false} strokeDasharray="4 5" />
        <XAxis dataKey="day" tickFormatter={day => displayDay(day, { month: 'short', day: 'numeric' })}
          tick={{ fontSize: 11, fill: '#577065' }} axisLine={false} tickLine={false} minTickGap={24} tickMargin={9} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#577065' }} width={38}
          allowDecimals={false} domain={[0, 'auto']} tickFormatter={(value: number) =>
            Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} />
        <Tooltip labelFormatter={day => displayDay(String(day))} formatter={(value: number) => [orders ? value : money(value), orders ? 'Orders' : 'Sales']}
          contentStyle={{ borderColor: '#dbe5db', borderRadius: 12, fontSize: 12 }} />
        <Area type="monotone" dataKey={orders ? 'orders' : 'revenue'} stroke="#6750cb" strokeWidth={2.5}
          activeDot={{ r: 5 }} fill="url(#pos-sales-fill)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer> : <p role="status" className="pos-muted">Loading sales trend…</p>}
  </div>;
}

const colors = ['#2b6c4e', '#95ad72', '#dcaa73', '#668893', '#bcc2b3'];

function PaymentMix({ report, currency }: { report?: Report; currency: string }) {
  const methods = report?.payments ?? [];
  const tenderTotal = methods.reduce((sum, method) => sum + method.amount, 0);
  const money = formatMoney(currency);
  let previous = 0;
  const segments = methods.filter(item => item.amount > 0).map((item, index) => {
    const start = previous;
    previous += item.amount / tenderTotal * 100;
    return colors[index % colors.length] + ' ' + start + '% ' + previous + '%';
  });
  return <section className="pos-panel pos-payment-mix">
    <div className="pos-panel-bar"><div><h2>Payment mix</h2><p>Amounts recorded at checkout</p></div><Banknote size={18} aria-hidden="true" /></div>
    <div className="pos-donut" style={{ background: segments.length ? `conic-gradient(${segments.join(',')})` : '#eaf0e6' }}>
      <div><strong>{report ? money(tenderTotal) : '—'}</strong><span>Total</span></div>
    </div>
    {methods.length ? <ul className="pos-payment-legend">{methods.map((item, index) => <li key={item.method}>
      <span><i style={{ background: colors[index % colors.length] }} />{paymentName(item.method)}</span>
      <strong>{money(item.amount)}</strong></li>)}</ul>
      : <p className="pos-center-note">{report ? 'No payments recorded for this period.' : 'Loading payment totals…'}</p>}
  </section>;
}

function Rankings({ title, rows, currency, noun }: {
  title: string; rows?: { id: string; name: string; count: number; total: number }[]; currency: string; noun: string;
}) {
  const money = formatMoney(currency);
  return <section className="pos-panel"><div className="pos-panel-bar"><h2>{title}</h2></div>
    {rows?.length ? <ul className="pos-simple-list">{rows.map(item => <li key={item.id}><div><strong>{item.name}</strong>
      <small>{item.count} {noun}</small></div><strong>{money(item.total)}</strong></li>)}</ul>
      : <Empty>{rows ? 'No activity in this period.' : 'Loading activity…'}</Empty>}
  </section>;
}
