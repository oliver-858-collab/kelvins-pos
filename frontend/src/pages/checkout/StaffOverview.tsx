import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Activity, ArrowUpRight, BarChart3, CalendarDays, Clock3, Package, ReceiptText, RefreshCw,
  ShoppingBag, Truck, Users, Wallet, type LucideIcon } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { displayDay, formatMoney, shiftDay, shopDay, timeOfDay } from '../../lib/business';
import { getBranchStockActivity, getSalesPage, getSalesReport, getStockLedger, paymentName,
  type Branch, type Product, type Shop } from '../../services/checkoutService';
import { getAttendance, getEmployment, getLeave, getOpenClock, getOwnPay } from '../../services/relationsService';
import { Empty, LoadError, useData } from './WorkspaceUI';
import CatalogCard from './CatalogCard';
import './staff-overview.css';

type Destination = 'checkout' | 'sales' | 'inventory' | 'reports' | 'staff' | 'wages' | 'my-work';
type Section = 'attendance' | 'leave' | 'payslips' | 'ledger';
const periods = [7, 30, 90] as const;
const dateLabel = (day: string) => displayDay(day, { day: 'numeric', month: 'short' });
const amount = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 }).format;
const movementNames: Record<string, string> = { purchase: 'Stock receipt', sale: 'Sale', adjustment: 'Adjustment', transfer: 'Transfer', return: 'Return' };

export default function StaffOverview({ shop, branch, userId, userName, roleName, canSell, canMove, isManager,
  catalog, catalogLoading, catalogError, revision, reloadCatalog, openPage, onReceipt, onProduct }: {
  shop: Shop; branch?: Branch; userId: string; userName: string; roleName: string;
  canSell: boolean; canMove: boolean; isManager: boolean; catalog?: Product[]; catalogLoading?: boolean; catalogError?: string;
  revision: number; reloadCatalog?: () => void;
  openPage: (view: Destination, section?: Section, stockAlerts?: boolean) => void;
  onReceipt?: (id: string) => void; onProduct?: (id: string) => void;
}) {
  const [period, setPeriod] = useState<typeof periods[number]>(30);
  const [refreshKey, setRefreshKey] = useState(0);
  const today = shopDay(shop.timezone);
  const start = shiftDay(today, 1 - period);
  const branchId = branch?.id ?? '';
  const useSales = !!branchId && canSell;
  const useStock = !!branchId && canMove && !isManager;
  const money = formatMoney(shop.currency);
  const attendance = useData(useCallback(() => getAttendance(start, today, undefined, userId), [start, today, userId, refreshKey]));
  const employment = useData(useCallback(() => getEmployment(userId), [userId, refreshKey]));
  const clock = useData(useCallback(() => getOpenClock(userId), [userId, refreshKey]));
  const leave = useData(useCallback(() => getLeave(userId), [userId, refreshKey]));
  const pay = useData(useCallback(() => getOwnPay(), [refreshKey]));
  const report = useData(useCallback(() => getSalesReport(branchId, start, today), [branchId, start, today, revision, refreshKey]), useSales);
  const sales = useData(useCallback(() => getSalesPage(branchId, {
    start, end: today, status: '', method: '', search: '', employee: '',
  }, 0), [branchId, start, today, revision, refreshKey]), useSales);
  const stock = useData(useCallback(() => getBranchStockActivity(branchId, start, today, shop.timezone),
    [branchId, start, today, shop.timezone, refreshKey]), useStock);
  const ledger = useData(useCallback(() => getStockLedger(branchId, 0, '', ''), [branchId, refreshKey]), useStock);
  const feeds = [attendance, employment, clock, leave, pay, ...(useSales ? [report, sales] : []), ...(useStock ? [stock, ledger] : [])];
  const busy = feeds.some(feed => feed.loading) || ((useStock || isManager) && catalogLoading);
  const refresh = useCallback(() => {
    setRefreshKey(value => value + 1);
    if (useStock || isManager) reloadCatalog?.();
  }, [isManager, reloadCatalog, useStock]);
  useEffect(() => {
    if (busy) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [busy, refresh]);

  const hours = attendance.data?.reduce((sum, row) => sum + Number(row.hours_worked), 0);
  const openLeave = leave.data?.filter(row => row.status === 'pending').length;
  const latestPay = pay.data?.[0];
  const low = catalog?.filter(item => item.is_active && item.track_stock && !item.is_service && item.stock <= item.reorder_level).sort((a, b) => a.stock - b.stock);
  const stockIn = stock.data?.reduce((sum, row) => sum + row.received, 0);
  const stockOut = stock.data?.reduce((sum, row) => sum + row.issued, 0);
  const staffDays = attendance.data?.length;
  const heading = isManager ? 'Manager dashboard' : useSales ? 'Cashier dashboard' : useStock ? 'Stockkeeper dashboard' : 'Employee dashboard';
  const firstName = userName.trim().split(/\s+/)[0];
  const saleSummary = report.loading ? undefined : report.data?.summary;
  const metricLabel = useSales ? (isManager ? 'Branch sales' : 'My sales') : useStock ? 'Stock movement' : 'Attendance hours';
  const attendanceBuckets = new Map<string, number>();
  for (const row of attendance.data ?? []) attendanceBuckets.set(row.date, Number(row.hours_worked) + (attendanceBuckets.get(row.date) ?? 0));
  const attendanceSeries = attendance.data && Array.from({ length: period }, (_, offset) => {
    const day = shiftDay(start, offset);
    return { day, hours: attendanceBuckets.get(day) ?? 0 };
  });
  const data = useSales ? report.data?.daily : useStock ? stock.data : attendanceSeries;
  const chartLoading = useSales ? report.loading : useStock ? stock.loading : attendance.loading;
  const chartError = useSales ? report.error : useStock ? stock.error : attendance.error;
  const hasActivity = useSales ? report.data?.summary.orders : useStock ? stockIn || stockOut : hours;
  const series = useSales ? [{ key: 'revenue', name: 'Sales', color: '#3985c6' }]
    : useStock ? [{ key: 'received', name: 'Stock in', color: '#07886f' }, { key: 'issued', name: 'Stock out', color: '#ca7745' }]
      : [{ key: 'hours', name: 'Recorded hours', color: '#7160c1' }];
  const lead = useSales ? [
    { label: isManager ? 'Branch sales' : 'My sales', value: saleSummary && money(saleSummary.revenue), icon: Wallet, detail: 'Completed transactions', go: () => openPage('sales') },
    { label: 'Transactions', value: saleSummary?.orders, icon: ReceiptText, detail: 'Completed in this period', go: () => openPage('sales') },
  ] : useStock ? [
    { label: 'Stock received', value: stockIn === undefined ? undefined : amount(stockIn), icon: Truck, detail: 'Units moved in', go: () => openPage('inventory', 'ledger') },
    { label: 'Stock issued', value: stockOut === undefined ? undefined : amount(stockOut), icon: Package, detail: 'Units moved out', go: () => openPage('inventory', 'ledger') },
  ] : [
    { label: 'Attendance records', value: staffDays, icon: CalendarDays, detail: 'In the selected period', go: () => openPage('my-work', 'attendance') },
    { label: 'Latest net pay', value: latestPay ? money(latestPay.net_pay) : undefined, icon: Wallet, detail: latestPay ? displayDay(latestPay.run.period_end) : 'Published payslips', go: () => openPage('my-work', 'payslips') },
  ];
  const dateTime = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: shop.timezone });
  return <div className="pos-staff-overview">
    <header className="pos-panel pos-staff-hero">
      <div><p>{roleName}{branch && ` · ${branch.name}`}</p><h1>{heading}</h1>
        <span>Welcome back, {firstName}. {displayDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
      <div className="pos-row-actions">
        <button type="button" className="pos-secondary" disabled={busy} onClick={refresh}><RefreshCw size={16} /> Refresh</button>
        <button type="button" className="pos-primary" onClick={() => openPage(useSales ? 'checkout' : useStock ? 'inventory' : 'my-work', useSales || useStock ? undefined : 'attendance')}>
          {useSales ? <ShoppingBag size={17} /> : useStock ? <Package size={17} /> : <Clock3 size={17} />}
          {useSales ? 'New sale' : useStock ? 'Open inventory' : 'My attendance'}</button>
      </div>
    </header>
    <div className="pos-staff-kpis">{[...lead,
      { label: 'My recorded hours', value: hours === undefined ? undefined : amount(hours), icon: Clock3, detail: `Last ${period} days`, go: () => openPage('my-work', 'attendance') },
      { label: 'Pending leave', value: openLeave, icon: CalendarDays, detail: 'My requests', go: () => openPage('my-work', 'leave') },
    ].map(({ label, value, icon: Icon, detail, go }, index) =>
      <button key={label} type="button" className={`pos-staff-kpi pos-staff-color-${index}`} onClick={go}>
        <span><Icon size={20} aria-hidden="true" /></span>
        <div><small>{label}</small><strong>{value ?? '—'}</strong><small>{detail}</small></div><ArrowUpRight size={16} aria-hidden="true" />
      </button>)}</div>

    <div className="pos-staff-columns">
      <Panel title={metricLabel} detail={`${displayDay(start)} – ${displayDay(today)}`} icon={BarChart3} action={
        <div className="pos-segment" aria-label="Dashboard period">{periods.map(days => <button type="button" key={days}
          aria-pressed={period === days} onClick={() => setPeriod(days)}>{days}d</button>)}</div>}>
        <LoadError message={chartError} />
        {chartLoading ? <Empty>Loading activity…</Empty> : data?.length && !!hasActivity
          ? <div className="pos-staff-chart"><ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e5e6ee" />
              <XAxis dataKey="day" tickFormatter={dateLabel} tick={{ fontSize: 11 }} minTickGap={19} />
              <YAxis tick={{ fontSize: 11 }} width={52} />
              <Tooltip labelFormatter={day => displayDay(String(day))}
                formatter={value => useSales ? money(Number(value)) : amount(Number(value))} />
              {series.length > 1 && <Legend />}
              {series.map(line => <Line key={line.key} dataKey={line.key} name={line.name}
                stroke={line.color} strokeWidth={2.5} type="monotone" dot={false} isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer></div> : !chartError && <Empty>No recorded activity in this period.</Empty>}
      </Panel>
      <Panel title="My shift and pay" icon={Activity}>
        <LoadError message={clock.error || employment.error || pay.error} />
        <div className="pos-staff-shift">
          <span className={`pos-badge ${clock.data ? 'pos-tone-good' : 'pos-tone-neutral'}`}>{clock.loading ? 'Checking shift…' : clock.error ? 'Shift unavailable' : clock.data ? 'On shift' : 'Off shift'}</span>
          <strong>{clock.data?.clock_in ? `Clocked in at ${timeOfDay(clock.data.clock_in, shop.timezone)}` : employment.data?.position || 'Employee record'}</strong>
          <small>{employment.data?.employee_number || (employment.loading ? 'Loading employee details…' : 'Ask a manager if your employee details are missing.')}</small>
        </div>
        <div className="pos-staff-shift">
          <small>Latest published payslip</small><strong>{latestPay ? money(latestPay.net_pay) : '—'}</strong>
          <small>{latestPay ? `${displayDay(latestPay.run.period_start)} – ${displayDay(latestPay.run.period_end)} · ${latestPay.run.status}` : 'No published statement available.'}</small>
        </div>
        <div className="pos-staff-links">
          <Link onClick={() => openPage('my-work', 'attendance')}>Open time clock</Link>
          <Link onClick={() => openPage('my-work', 'payslips')}>Payslips</Link>
        </div>
      </Panel>
    </div>

    <div className="pos-staff-columns">
      <Panel title={useSales ? 'Recent sales' : useStock ? 'Recent stock movements' : 'Attendance history'}
        detail={useSales ? (isManager ? 'Selected branch' : 'Your transactions in this branch') : useStock ? 'Latest recorded branch activity' : 'Your most recent records in this period'}
        icon={useSales ? ReceiptText : useStock ? Package : Clock3}
        action={<Link onClick={() => openPage(useSales ? 'sales' : useStock ? 'inventory' : 'my-work', useStock ? 'ledger' : useSales ? undefined : 'attendance')}>View history</Link>}>
        <LoadError message={useSales ? sales.error : useStock ? ledger.error : attendance.error} />
        {useSales ? sales.data?.length ? <div className="pos-table-wrap"><table className="pos-table"><thead><tr>
          <th>Sale</th><th>Payment</th><th>Status</th><th>Total</th><th>Receipt</th></tr></thead><tbody>
          {sales.data.slice(0, 8).map(row => <tr key={row.id}><th scope="row">{row.sale_number}<small>{dateTime.format(new Date(row.created_at))}</small></th>
            <td>{row.methods.map(paymentName).join(' + ') || '—'}</td><td><span className="pos-badge">{row.status}</span></td>
            <td className="pos-number">{money(row.total_amount)}</td><td>{row.receipt_number && onReceipt
              ? <button className="pos-secondary" type="button" onClick={() => onReceipt(row.id)}>View</button> : '—'}</td></tr>)}
        </tbody></table></div> : <Empty>{sales.loading ? 'Loading sales…' : 'No recorded sales in this period.'}</Empty>
          : useStock ? ledger.data?.rows.length ? <div className="pos-table-wrap"><table className="pos-table"><thead><tr>
            <th>Product</th><th>Movement</th><th>In</th><th>Out</th><th>On hand</th></tr></thead><tbody>
            {ledger.data.rows.slice(0, 8).map(row => <tr key={row.id}><th scope="row">{row.product?.name || 'Product'}
              <small>{dateTime.format(new Date(row.created_at))}</small></th><td>{movementNames[row.type] || row.type}</td>
              <td>{amount(row.qty_in)}</td><td>{amount(row.qty_out)}</td><td>{amount(row.qty_on_hand)}</td></tr>)}
          </tbody></table></div> : <Empty>{ledger.loading ? 'Loading stock ledger…' : 'No stock movements recorded.'}</Empty>
            : <AttendanceList rows={attendance.data} shop={shop} />}
      </Panel>
      <Panel title="My leave requests" icon={CalendarDays} action={<Link onClick={() => openPage('my-work', 'leave')}>Manage leave</Link>}>
        <LoadError message={leave.error} />
        {leave.data?.length ? <ul className="pos-simple-list pos-staff-leave">{leave.data.slice(0, 6).map(row => <li key={row.id}>
          <div><strong>{row.leave_type}</strong><small>{dateLabel(row.start_date)} – {dateLabel(row.end_date)} · {row.days} days</small></div>
          <span className={`pos-badge ${row.status === 'approved' ? 'pos-tone-good' : row.status === 'pending' ? 'pos-tone-warn' : 'pos-tone-neutral'}`}>{row.status}</span>
        </li>)}</ul> : <Empty>{leave.loading ? 'Loading leave records…' : 'No leave requests yet.'}</Empty>}
      </Panel>
    </div>

    {(useSales || useStock) && <div className="pos-staff-columns">
      <Panel title="My attendance" detail="Recorded time and review status" icon={Clock3}
        action={<Link onClick={() => openPage('my-work', 'attendance')}>Full timesheet</Link>}>
        <LoadError message={attendance.error} /><AttendanceList rows={attendance.data} shop={shop} />
      </Panel>
      {canMove ? <Panel title="Stock watchlist" icon={Package} action={<Link onClick={() => openPage('inventory', undefined, true)}>Review stock</Link>}>
        <LoadError message={catalogError} />
        {low?.length ? <div className="pos-dashboard-catalog">{low.slice(0, 4).map(product =>
          <CatalogCard key={product.id} product={product} currency={shop.currency} open={() => onProduct?.(product.id)} />)}</div> : <Empty>{catalogLoading ? 'Loading catalog…' : catalogError ? 'Stock data unavailable.' : 'No items at reorder level.'}</Empty>}
      </Panel> : <Panel title="Payment breakdown" detail="Your completed sales in this period" icon={Wallet}>
        <LoadError message={report.error} />
        {report.data?.payments.length ? <ul className="pos-simple-list">{report.data.payments.map(row => <li key={row.method}>
          <span><strong>{paymentName(row.method)}</strong><small>{row.transactions} payments</small></span><strong>{money(row.amount)}</strong>
        </li>)}</ul> : <Empty>{report.loading ? 'Loading payments…' : 'No payments in this period.'}</Empty>}
      </Panel>}
    </div>}
    {isManager && <Panel title="Manage the branch" icon={Users}><div className="pos-staff-links">
      <Link onClick={() => openPage('staff', 'attendance')}>Review team attendance</Link>
      <Link onClick={() => openPage('wages')}>Wage runs</Link>
      <Link onClick={() => openPage('reports')}>Branch reports</Link>
    </div></Panel>}
  </div>;
}

function AttendanceList({ rows, shop }: { rows?: Awaited<ReturnType<typeof getAttendance>>; shop: Shop }) {
  if (!rows?.length) return <Empty>{rows ? 'No attendance in this period.' : 'Loading attendance…'}</Empty>;
  return <div className="pos-table-wrap"><table className="pos-table"><thead><tr>
    <th>Date</th><th>Clock in</th><th>Clock out</th><th>Hours</th><th>Review</th>
  </tr></thead><tbody>{rows.slice(0, 8).map(row => <tr key={row.id}>
    <th scope="row">{displayDay(row.date)}<small>{row.status.replaceAll('_', ' ')}</small></th>
    <td>{row.clock_in ? timeOfDay(row.clock_in, shop.timezone) : '—'}</td><td>{row.clock_out ? timeOfDay(row.clock_out, shop.timezone) : '—'}</td>
    <td>{amount(Number(row.hours_worked))}</td><td><span className="pos-badge">{row.reviewed_at ? 'Reviewed' : row.clock_in && !row.clock_out ? 'On shift' : 'Pending'}</span></td>
  </tr>)}</tbody></table></div>;
}

function Panel({ title, detail, icon: Icon, action, children }: { title: string; detail?: string; icon: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return <section className="pos-panel pos-staff-panel"><div className="pos-panel-bar">
    <div><h2><Icon size={18} aria-hidden="true" />{title}</h2>{detail && <p>{detail}</p>}</div>{action}
  </div>{children}</section>;
}

function Link({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button type="button" className="pos-text-button" onClick={onClick}>{children}<ArrowUpRight size={14} aria-hidden="true" /></button>;
}
