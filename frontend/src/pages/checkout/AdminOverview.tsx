import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, Boxes, CalendarDays, Clock3, CreditCard,
  FileClock, Package, ReceiptText, RefreshCw, Settings2, ShoppingBag, TriangleAlert, UserCheck, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { displayDay, formatMoney, shiftDay, shopDay } from '../../lib/business';
import { getAdminAuditEvents, getPendingLeaveCount } from '../../services/adminOverviewService';
import { getSalesPage, getSalesReport, paymentName, type Product, type Shop } from '../../services/checkoutService';
import { getAttendance, getCustomers, getPayrollRuns, getStaffDirectory } from '../../services/relationsService';
import { Empty, LoadError, ProductPhoto, useData } from './WorkspaceUI';
import './admin-overview.css';

export type AdminDestination = 'checkout' | 'sales' | 'inventory' | 'customers' | 'reports' | 'staff' | 'wages' | 'settings';
export type StaffSection = 'access' | 'attendance' | 'leave';
type OpenPage = (view: AdminDestination, options?: { stockAlerts?: boolean; staffSection?: StaffSection; payrollStatus?: 'draft' | 'approved'; section?: 'today' | 'balance' }) => void;

const colors = ['#7660d9', '#23877e', '#cc8053', '#5574be', '#a060a2', '#8790ab'];
const periods = [7, 30, 90] as const;
const auditNames: Record<string, string> = {
  sales: 'Sales', users: 'Staff accounts', products: 'Products',
  stock_adjustments: 'Stock adjustments', expenses: 'Expenses', payroll_runs: 'Payroll', approvals: 'Approvals',
};

export default function AdminOverview({ shop, branch, branchName, revision, catalog, catalogError, catalogLoading,
  reloadCatalog, navigate, onReceipt, onProduct }: {
  shop: Shop; branch: string; branchName: string; revision: number; catalog?: Product[]; catalogError?: string;
  catalogLoading: boolean; reloadCatalog: () => void; navigate: OpenPage;
  onReceipt: (id: string) => void; onProduct: (id: string) => void;
}) {
  const [period, setPeriod] = useState<typeof periods[number]>(7);
  const [snapshot, setSnapshot] = useState(0);
  const today = shopDay(shop.timezone);
  const start = shiftDay(today, 1 - period);
  const money = formatMoney(shop.currency);
  const report = useData(useCallback(() => getSalesReport(branch, start, today), [branch, start, today, revision, snapshot]));
  const sales = useData(useCallback(() => getSalesPage(branch, {
    start, end: today, status: '', method: '', search: '', employee: '',
  }, 0), [branch, start, today, revision, snapshot]));
  const team = useData(useCallback(() => getStaffDirectory(), [snapshot]));
  const attendanceStart = shiftDay(today, -29);
  const attendance = useData(useCallback(() => getAttendance(attendanceStart, today, branch), [branch, attendanceStart, today, snapshot]));
  const payroll = useData(useCallback(() => getPayrollRuns(branch), [branch, snapshot]));
  const audit = useData(useCallback(() => getAdminAuditEvents(), [snapshot, revision]));
  const credit = useData(useCallback(() => getCustomers('', 'balance', 0, 1), [snapshot, revision]));
  const leave = useData(useCallback(() => getPendingLeaveCount(), [snapshot]));
  const sources = [
    { name: 'Sales report', state: report }, { name: 'Recent transactions', state: sales },
    { name: 'Staff accounts', state: team }, { name: 'Attendance', state: attendance },
    { name: 'Payroll', state: payroll }, { name: 'Audit trail', state: audit },
    { name: 'Customer balances', state: credit }, { name: 'Leave requests', state: leave },
    { name: 'Inventory', state: { loading: catalogLoading, error: catalogError } },
  ];
  const busy = sources.some(source => source.state.loading);
  const failures = sources.filter(source => source.state.error);
  const [updatedAt, setUpdatedAt] = useState<Date>();
  useEffect(() => {
    if (busy) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setSnapshot(value => value + 1);
      reloadCatalog();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [busy, reloadCatalog]);

  function refresh() {
    if (busy) return;
    setSnapshot(value => value + 1);
    reloadCatalog();
  }
  useEffect(() => {
    if (!busy && failures.length === 0) setUpdatedAt(new Date());
  }, [busy, failures.length]);

  const day = report.data?.daily.find(entry => entry.day === today);
  const low = catalog?.filter(item => item.is_active && item.track_stock && item.stock <= item.reorder_level)
    .sort((a, b) => a.stock - b.stock);
  const active = team.data?.filter(account => account.account_status === 'active');
  const roleCounts = Object.entries(active?.reduce<Record<string, number>>((counts, account) => {
    const role = account.role?.name || 'Unassigned';
    counts[role] = (counts[role] ?? 0) + 1;
    return counts;
  }, {}) ?? {}).sort((a, b) => b[1] - a[1]);
  const activeStaff = new Map(active?.map(person => [person.id, person]));
  const onShift = attendance.data && active ? new Set(attendance.data.filter(row =>
    row.clock_in && !row.clock_out && row.branch_id === branch && activeStaff.has(row.employee_id)).map(row => row.employee_id)) : undefined;
  const reviewAttendance = attendance.data?.filter(row => row.clock_out && !row.reviewed_at).length;
  const drafts = payroll.data?.filter(run => run.status === 'draft').length;
  const unpaid = payroll.data?.filter(run => run.status === 'approved');
  const pendingAccess = team.data?.filter(person => person.account_status === 'pending').length;
  const reportRead = report.loading ? undefined : report.data;
  const stamp = updatedAt && new Intl.DateTimeFormat('en-KE', { timeStyle: 'short', timeZone: shop.timezone }).format(updatedAt);
  const dateTime = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: shop.timezone });

  const alerts = [
    { label: 'Products at reorder level', note: 'Selected branch', value: low?.length, icon: Package,
      open: () => navigate('inventory', { stockAlerts: true }) },
    { label: 'Staff access requests', note: 'All branches', value: pendingAccess, icon: UserCheck,
      open: () => navigate('staff', { staffSection: 'access' }) },
    { label: 'Attendance to review', note: 'Closed shifts · last 30 days', value: reviewAttendance, icon: Clock3,
      open: () => navigate('staff', { staffSection: 'attendance' }) },
    { label: 'Leave requests', note: 'All branches', value: leave.data, icon: CalendarDays,
      open: () => navigate('staff', { staffSection: 'leave' }) },
    { label: 'Draft wage runs', note: 'Awaiting approval', value: drafts, icon: FileClock,
      open: () => navigate('wages', { payrollStatus: 'draft' }) },
    { label: 'Approved wage runs', note: unpaid ? money(unpaid.reduce((sum, run) => sum + Number(run.total_net), 0)) + ' awaiting payout' : 'Awaiting payout',
      value: unpaid?.length, icon: Wallet, open: () => navigate('wages', { payrollStatus: 'approved' }) },
    { label: 'Customers with a balance', note: 'All branches', value: credit.data?.count, icon: CreditCard, open: () => navigate('customers', { section: 'balance' }) },
  ];

  return <div className="pos-admin">
    <header className="pos-admin-header">
      <div><p><CalendarDays size={15} /> {displayDay(today, { weekday: 'long', month: 'long', day: 'numeric' })} · {branchName}</p>
        <h1>Super admin dashboard</h1></div>
      <div className="pos-admin-header-actions">
        <span className="pos-admin-refresh-note" role="status">{busy ? 'Updating…' : failures.length ? 'Some feeds unavailable' : stamp ? `Updated ${stamp}` : 'Loading data'}</span>
        <button type="button" className="pos-secondary" disabled={busy} onClick={refresh}><RefreshCw size={15} /> Refresh</button>
        <button type="button" className="pos-primary" onClick={() => navigate('checkout')}><ShoppingBag size={16} /> New sale</button>
      </div>
    </header>
    {!!failures.length && <LoadError message={`Could not refresh ${failures.map(source => source.name).join(', ')}. Other feeds are still available.`}
      retry={refresh} />}

    <div className="pos-admin-metrics">
      <Metric icon={Wallet} label="Sales today" value={day && money(day.revenue)} detail="Completed sales · selected branch" open={() => navigate('sales', { section: 'today' })} />
      <Metric icon={ReceiptText} label="Transactions today" value={day?.orders} detail="Completed checkouts" open={() => navigate('sales', { section: 'today' })} />
      <Metric icon={Boxes} label="Stock alerts" value={low?.length} detail={low ? `${low.filter(item => item.stock <= 0).length} out of stock` : 'Selected branch'}
        open={() => navigate('inventory', { stockAlerts: true })} />
      <Metric icon={Users} label="Active staff" value={active?.length} detail={onShift ? `${onShift.size} clocked in at this branch` : 'Accounts across all branches'}
        open={() => navigate('staff')} />
    </div>

    <div className="pos-admin-major">
      <Panel title="Sales performance" subtitle={`${displayDay(start)} – ${displayDay(today)}`} icon={BarChart3} action={
        <div className="pos-segment" aria-label="Dashboard sales period">{periods.map(days => <button key={days} type="button"
          aria-pressed={period === days} onClick={() => setPeriod(days)}>{days}d</button>)}</div>}>
        <div className="pos-admin-trend-top">
          <strong>{reportRead ? money(reportRead.summary.revenue) : '—'}</strong>
          <span>{reportRead ? `${reportRead.summary.orders} sales · ${money(reportRead.summary.average)} average sale` : 'Sales in selected period'}</span>
        </div>
        {report.loading ? <Empty>Loading sales trend…</Empty> : reportRead?.daily.length ? <div className="pos-admin-chart" aria-label="Daily sales revenue">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={reportRead.daily} margin={{ left: 0, right: 14, bottom: 0, top: 8 }}>
              <defs><linearGradient id="admin-sales-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#7961db" stopOpacity={.35} /><stop offset="100%" stopColor="#7961db" stopOpacity={.02} />
              </linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#e8e7f2" strokeDasharray="4 4" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} minTickGap={16} tickFormatter={day => displayDay(day, { month: 'short', day: 'numeric' })} />
              <YAxis tick={{ fontSize: 11 }} width={52} />
              <Tooltip labelFormatter={value => displayDay(String(value))} formatter={value => money(Number(value))} />
              <Area name="Revenue" dataKey="revenue" type="monotone" stroke="#6750cb" strokeWidth={2.4} fill="url(#admin-sales-fill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div> : <Empty>{report.error ? 'Sales trend unavailable.' : 'No sales in this period.'}</Empty>}
      </Panel>

      <Panel title="Quick actions" icon={Activity}>
        <div className="pos-admin-quick">{[
          { title: 'Stock alerts', icon: Package, run: () => navigate('inventory', { stockAlerts: true }) },
          { title: 'Sales history', icon: ReceiptText, run: () => navigate('sales') },
          { title: 'Access requests', icon: UserCheck, run: () => navigate('staff', { staffSection: 'access' }) },
          { title: 'Wage runs', icon: Wallet, run: () => navigate('wages') },
          { title: 'Reports', icon: BarChart3, run: () => navigate('reports') },
          { title: 'Settings', icon: Settings2, run: () => navigate('settings') },
        ].map(({ title, icon: Icon, run }) => <button key={title} type="button" onClick={run}><span><Icon size={19} /></span>{title}</button>)}</div>
        <div className="pos-admin-feed-summary"><span className={failures.length ? 'pos-tone-warn' : 'pos-tone-good'}>
          <Activity size={15} /> {busy ? 'Refreshing feeds' : failures.length ? 'Check unavailable feeds' : 'All dashboard feeds loaded'}</span>
          <small>Refreshes every minute while visible</small></div>
      </Panel>
    </div>

    <Panel title="Needs attention" subtitle="Work queues from inventory, staff, payroll and customers" icon={TriangleAlert}>
      <div className="pos-admin-alerts">{alerts.map(({ label, note, value, icon: Icon, open }) =>
        <button type="button" key={label} onClick={open}>
          <span className="pos-admin-alert-icon"><Icon size={16} /></span>
          <span><strong>{label}</strong><small>{note}</small></span>
          <b className={`pos-badge ${value ? 'pos-tone-warn' : 'pos-tone-neutral'}`}>{value ?? '—'}</b>
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>)}</div>
    </Panel>

    <div className="pos-admin-major">
      <Panel title="Recent transactions" subtitle="Sales recorded in the selected period" icon={ReceiptText}
        action={<LinkButton onClick={() => navigate('sales')}>Sales history</LinkButton>}>
        {sales.data?.length ? <div className="pos-table-wrap"><table className="pos-table">
          <thead><tr><th>Sale</th><th>Customer</th><th>Status</th><th>Total</th><th><span className="sr-only">Receipt</span></th></tr></thead>
          <tbody>{sales.data.slice(0, 6).map(row => <tr key={row.id}><th scope="row">{row.sale_number}
            <small>{dateTime.format(new Date(row.created_at))}</small></th><td>{row.customer_name || 'Walk-in'}</td>
            <td><span className={`pos-badge ${row.status === 'completed' ? 'pos-tone-good' : 'pos-tone-neutral'}`}>{row.status}</span></td>
            <td className="pos-number">{money(row.total_amount)}</td><td>{row.receipt_number && <button className="pos-icon-button"
              aria-label={`Receipt for ${row.sale_number}`} onClick={() => onReceipt(row.id)}><ReceiptText size={15} /></button>}</td></tr>)}</tbody>
        </table></div> : <Empty>{sales.loading ? 'Loading sales…' : sales.error ? 'Recent sales unavailable.' : 'No sales in this period.'}</Empty>}
      </Panel>

      <Panel title="Payment mix" subtitle="Amounts on completed transactions" icon={CreditCard}>
        {reportRead?.payments.length ? <div className="pos-admin-breakdown">
          {reportRead.payments.map((item, index) => {
            const total = reportRead.payments.reduce((sum, entry) => sum + Number(entry.amount), 0);
            return <BarRow key={item.method} label={paymentName(item.method)} value={money(item.amount)}
              proportion={total > 0 ? Number(item.amount) / total : 0} color={colors[index % colors.length]} />;
          })}
        </div> : <Empty>{report.loading ? 'Loading payments…' : report.error ? 'Payments unavailable.' : 'No payments in this period.'}</Empty>}
      </Panel>
    </div>

    <div className="pos-admin-major">
      <Panel title="Top products" subtitle="Sales value and units sold in the selected period" icon={Boxes}
        action={<LinkButton onClick={() => navigate('reports')}>Reports</LinkButton>}>
        {reportRead?.products.length ? <ul className="pos-simple-list">{reportRead.products.slice(0, 5).map(item => {
          const product = catalog?.find(entry => entry.id === item.product_id);
          return <li key={item.product_id ?? item.name}>
            {product ? <button type="button" className="pos-table-product pos-product-link" onClick={() => onProduct(product.id)}>
              <ProductPhoto image={product.image} /><span><strong>{item.name}</strong><small>{item.quantity} sold</small></span>
            </button> : <span><strong>{item.name}</strong><small>{item.quantity} sold</small></span>}
            <strong className="pos-number">{money(item.revenue)}</strong>
          </li>;
        })}</ul> : <Empty>{report.loading ? 'Loading products…' : report.error ? 'Product rankings unavailable.' : 'No products sold in this period.'}</Empty>}
      </Panel>
      <Panel title="Staff sales" subtitle="Completed sales by cashier in the selected period" icon={UserCheck}>
        {reportRead?.staff.length ? <ul className="pos-simple-list">{reportRead.staff.slice(0, 5).map(item =>
          <li key={item.cashier_id}><span><strong>{item.name}</strong><small>{item.orders} sales</small></span>
            <strong className="pos-number">{money(item.revenue)}</strong></li>)}</ul>
          : <Empty>{report.loading ? 'Loading staff sales…' : report.error ? 'Staff sales unavailable.' : 'No recorded cashier activity.'}</Empty>}
      </Panel>
    </div>

    <div className="pos-admin-lower">
      <Panel title="Stock watchlist" subtitle="At or below reorder level" icon={Package}
        action={<LinkButton onClick={() => navigate('inventory', { stockAlerts: true })}>Inventory</LinkButton>}>
        {low?.length ? <ul className="pos-simple-list">{low.slice(0, 6).map(item => <li key={item.id}>
          <button type="button" className="pos-table-product pos-product-link" onClick={() => onProduct(item.id)}>
            <ProductPhoto image={item.image} /><span><strong>{item.name}</strong><small>{item.sku || 'Reorder at ' + item.reorder_level}</small></span>
          </button>
          <span className={`pos-badge ${item.stock <= 0 ? 'pos-tone-bad' : 'pos-tone-warn'}`}>{item.stock} left</span>
        </li>)}</ul> : <Empty>{catalogLoading ? 'Loading stock…' : catalogError ? 'Stock watchlist unavailable.' : 'No products need reordering.'}</Empty>}
      </Panel>

      <Panel title="Staff roles" subtitle="Active accounts across all branches" icon={Users}
        action={<LinkButton onClick={() => navigate('staff')}>Staff</LinkButton>}>
        {active?.length ? <div className="pos-admin-breakdown">{roleCounts.map(([name, count], index) =>
          <BarRow key={name} label={name} value={String(count)} proportion={count / active.length} color={colors[index % colors.length]} />)}</div>
          : <Empty>{team.loading ? 'Loading staff…' : team.error ? 'Staff data unavailable.' : 'No active accounts.'}</Empty>}
      </Panel>

      <Panel title="Recent audit activity" subtitle="Latest events across all branches" icon={FileClock}>
        {audit.data?.length ? <ol className="pos-simple-list pos-admin-audit">{audit.data.map(row => <li key={row.id}>
          <span className="pos-admin-audit-icon"><Activity size={14} aria-hidden="true" /></span>
          <div><strong>{auditNames[row.table_name] || row.table_name.replaceAll('_', ' ')}</strong>
            <small>{row.actor?.full_name || 'System'} · {dateTime.format(new Date(row.created_at))}</small></div>
          <span className="pos-badge pos-tone-neutral">{row.action.toLowerCase().replaceAll('_', ' ')}</span>
        </li>)}</ol> : <Empty>{audit.loading ? 'Loading audit activity…' : audit.error ? 'Audit activity unavailable.' : 'No audit events yet.'}</Empty>}
      </Panel>
    </div>
  </div>;
}

function Metric({ icon: Icon, label, value, detail, open }: {
  icon: LucideIcon; label: string; value?: number | string; detail: string; open: () => void;
}) {
  return <button type="button" className="pos-panel pos-admin-metric" onClick={open}>
    <span><Icon size={18} aria-hidden="true" />{label}<ArrowUpRight size={15} aria-hidden="true" /></span>
    <strong>{value ?? '—'}</strong><small>{detail}</small>
  </button>;
}

function Panel({ title, subtitle, icon: Icon, action, children }: {
  title: string; subtitle?: string; icon: LucideIcon; action?: ReactNode; children: ReactNode;
}) {
  return <section className="pos-panel pos-admin-panel"><div className="pos-panel-bar">
    <div><h2><Icon size={17} aria-hidden="true" /> {title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}
  </div>{children}</section>;
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" className="pos-text-button" onClick={onClick}>{children} <ArrowRight size={14} /></button>;
}

function BarRow({ label, value, proportion, color }: { label: string; value: string; proportion: number; color: string }) {
  return <div className="pos-admin-bar-row"><div><span>{label}</span><strong>{value}</strong></div>
    <span aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, proportion * 100))}%`, backgroundColor: color }} /></span>
  </div>;
}
