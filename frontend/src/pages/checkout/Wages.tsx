import { useCallback, useState } from 'react';
import { CalendarDays, Check, Download, FileText, Plus, Printer, Wallet } from 'lucide-react';
import { displayDay, downloadCsv, formatMoney, shiftDay, shopDay } from '../../lib/business';
import { paymentName, type Shop } from '../../services/checkoutService';
import {
  adjustPayroll, changePayrollState, cycleNames, draftPayroll, getPayrollItems, getPayrollRuns, getStaffDirectory, wageNames,
  type PayCycle, type PayItem, type PayRun, type PayRunInfo,
} from '../../services/relationsService';
import { Dialog, DialogForm, Empty, LoadError, useData } from './WorkspaceUI';

export default function Wages({ shop, branch, canAdmin, initialStatus }: { shop: Shop; branch: string; canAdmin: boolean; initialStatus?: string | null }) {
  const [newRun, setNewRun] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [filter, setFilter] = useState(initialStatus === 'draft' || initialStatus === 'approved' ? initialStatus : '');
  const [notice, setNotice] = useState('');
  const [statusAction, setStatusAction] = useState<'approve' | 'pay' | 'discard'>();
  const runs = useData(useCallback(() => getPayrollRuns(branch), [branch]));
  const team = useData(getStaffDirectory);
  const branchRuns = runs.data ?? [];
  const active = branchRuns.find(item => item.id === selected);
  const displayed = branchRuns.filter(item => !filter || item.status === filter);
  const money = formatMoney(shop.currency);
  const today = shopDay(shop.timezone);
  const thisMonth = today.slice(0, 7);
  const paidThisMonth = branchRuns.filter(run => run.status === 'paid' && run.paid_at
    && shopDay(shop.timezone, new Date(run.paid_at)).startsWith(thisMonth)).reduce((total, item) => total + item.total_net, 0);

  function changed(message: string) {
    setNotice(message);
    setStatusAction(undefined);
    runs.reload();
  }
  return <>
    <div className="pos-heading">
      <div><h1>Wages and payroll</h1><p>Prepare wage runs from reviewed attendance and completed sales, then approve and record payouts.</p></div>
      {canAdmin && <button className="pos-primary" onClick={() => setNewRun(crypto.randomUUID())}><Plus size={18} /> Create wage run</button>}
    </div>
    <div className="pos-metrics pos-metrics-three">
      <div className="pos-panel pos-metric"><div>Draft runs <FileText size={18} /></div><strong>{runs.data ? branchRuns.filter(item => item.status === 'draft').length : '—'}</strong></div>
      <div className="pos-panel pos-metric"><div>Approved, awaiting payment <CalendarDays size={18} /></div>
        <strong>{runs.data ? money(branchRuns.filter(item => item.status === 'approved').reduce((total, item) => total + item.total_net, 0)) : '—'}</strong></div>
      <div className="pos-panel pos-metric"><div>Paid this month <Wallet size={18} /></div><strong>{runs.data ? money(paidThisMonth) : '—'}</strong></div>
    </div>
    <LoadError message={runs.error || team.error} retry={runs.reload} />
    {notice && <div className="pos-success" role="status"><Check size={16} />{notice}</div>}
    <section className="pos-panel">
      <div className="pos-panel-bar"><h2>Wage runs</h2>
        <select className="pos-select" aria-label="Wage run status" value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="">All statuses</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="paid">Paid</option>
        </select>
      </div>
      {displayed.length ? <div className="pos-table-wrap"><table className="pos-table">
        <thead><tr><th>Pay period</th><th>Cycle</th><th>Gross wages</th><th>Deductions</th><th>Net wages</th><th>Status</th><th /></tr></thead>
        <tbody>{displayed.map(item => <tr key={item.id}>
          <th scope="row">{displayDay(item.period_start)} – {displayDay(item.period_end)}</th><td>{cycleNames[item.pay_period_type]}</td>
          <td>{money(item.total_gross)}</td><td>{money(item.total_deductions)}</td><td className="pos-number">{money(item.total_net)}</td>
          <td><PayStatus status={item.status} /></td><td><button className="pos-secondary" onClick={() => setSelected(item.id)}>Open wage run</button></td>
        </tr>)}</tbody>
      </table></div> : <Empty>{runs.loading ? 'Loading wage runs…' : 'No wage runs match this view.'}</Empty>}
    </section>
    {newRun && <PayrollForm id={newRun} branch={branch} today={today} close={() => setNewRun(undefined)}
      saved={id => { setNewRun(undefined); setSelected(id); changed('Draft wage run created.'); }} />}
    {active && !statusAction && <PayRunDetail run={active} shop={shop} canAdmin={canAdmin}
      employees={team.data?.map(item => ({ id: item.id, name: item.full_name, number: item.employment?.employee_number })) ?? []}
      close={() => setSelected(undefined)} changed={changed} onAction={setStatusAction} />}
    {active && statusAction && <PayRunAction run={active} action={statusAction} shop={shop} close={() => setStatusAction(undefined)}
      saved={() => {
        if (statusAction === 'discard') setSelected(undefined);
        changed(statusAction === 'approve' ? 'Wage run approved.' : statusAction === 'pay' ? 'Payout recorded.' : 'Draft discarded.');
      }} />}
  </>;
}

function PayStatus({ status }: { status: PayRunInfo['status'] }) {
  return <span className={`pos-badge pos-tone-${status === 'paid' ? 'good' : status === 'approved' ? 'neutral' : 'warn'}`}>{status}</span>;
}

function defaultRange(today: string, cycle: PayCycle) {
  const previous = shiftDay(today, -1);
  if (cycle === 'weekly' || cycle === 'biweekly') return { start: shiftDay(previous, cycle === 'weekly' ? -6 : -13), end: previous };
  const lastMonth = shiftDay(today.slice(0, 7) + '-01', -1);
  return { start: lastMonth.slice(0, 7) + '-01', end: lastMonth };
}

function PayrollForm({ id, branch, today, close, saved }: {
  id: string; branch: string; today: string; close: () => void; saved: (id: string) => void;
}) {
  const [cycle, setCycle] = useState<PayCycle>('weekly');
  const [range, setRange] = useState(() => defaultRange(today, 'weekly'));
  return <Dialog title="Create wage run" close={close}>
    <DialogForm onSave={form => draftPayroll(id, branch, form)} onSaved={saved} submit="Create draft">
      <label className="pos-field">Pay cycle<select name="cycle" value={cycle} onChange={event => {
        const next = event.target.value as PayCycle;
        setCycle(next); setRange(defaultRange(today, next));
      }}>
        {Object.entries(cycleNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <div className="pos-form-grid">
        <label className="pos-field">Period start<input name="start" type="date" value={range.start} max={range.end} required
          onChange={event => setRange(previous => ({ ...previous, start: event.target.value }))} /></label>
        <label className="pos-field">Period end<input name="end" type="date" value={range.end} min={range.start} max={today} required
          onChange={event => setRange(previous => ({ ...previous, end: event.target.value }))} /></label>
      </div>
      <p className="pos-muted">Select a complete pay period. Drafts use the employee’s home branch, configured rate, reviewed work, and eligible sales. You can enter overtime, allowances and deductions before approval.</p>
    </DialogForm>
  </Dialog>;
}

type StaffLabel = { id: string; name: string; number?: string };
function PayRunDetail({ run, shop, employees, canAdmin, close, changed, onAction }: {
  run: PayRun; shop: Shop; employees: StaffLabel[]; canAdmin: boolean; close: () => void; changed: (message: string) => void;
  onAction: (action: 'approve' | 'pay' | 'discard') => void;
}) {
  const [editing, setEditing] = useState<PayItem>();
  const [printing, setPrinting] = useState<PayItem>();
  const items = useData(useCallback(() => getPayrollItems(run.id), [run.id]));
  const money = formatMoney(shop.currency);
  const name = (item: PayItem) => employees.find(staff => staff.id === item.employee_id)?.name ?? 'Employee';
  const number = (item: PayItem) => employees.find(staff => staff.id === item.employee_id)?.number;

  if (printing) return <Payslip item={printing} run={run} shop={shop} employee={name(printing)} number={number(printing)} close={() => setPrinting(undefined)} />;
  if (editing) return <PayAdjustForm item={editing} name={name(editing)} close={() => setEditing(undefined)}
    saved={() => { setEditing(undefined); items.reload(); changed('Wage adjustments saved.'); }} />;
  return <Dialog title="Wage run details" close={close} wide>
    <div className="pos-detail">
      <div className="pos-detail-top"><div><strong>{displayDay(run.period_start)} – {displayDay(run.period_end)}</strong>
        <p>{cycleNames[run.pay_period_type]} pay cycle</p></div><PayStatus status={run.status} /></div>
      <div className="pos-detail-metrics"><div><span>Gross wages</span><strong>{money(run.total_gross)}</strong></div>
        <div><span>Deductions</span><strong>{money(run.total_deductions)}</strong></div><div><span>Net wages</span><strong>{money(run.total_net)}</strong></div></div>
      <LoadError message={items.error} retry={items.reload} />
      {!items.data?.length ? <Empty>{items.loading ? 'Loading pay statements…' : 'No employee statements found.'}</Empty> :
        <div className="pos-table-wrap"><table className="pos-table">
          <thead><tr><th>Employee</th><th>Days / hours</th><th>Basic</th><th>Commission</th><th>Net pay</th><th /></tr></thead>
          <tbody>{items.data.map(item => <tr key={item.id}><th scope="row">{name(item)}<small>{number(item)}</small></th>
            <td>{item.days_worked} / {item.hours_worked}</td><td>{money(item.basic_pay)}</td><td>{money(item.commission_earned)}</td>
            <td className="pos-number">{money(item.net_pay)}</td><td><div className="pos-row-actions">
              {canAdmin && run.status === 'draft' && <button className="pos-secondary" onClick={() => setEditing(item)}>Adjust pay</button>}
              <button className="pos-secondary" onClick={() => setPrinting(item)}><FileText size={15} /> Statement</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>}
      <div className="pos-detail-footer">
        <button className="pos-secondary" disabled={!items.data?.length} onClick={() => downloadCsv(
          'wages-' + run.period_start + '-' + run.period_end + '.csv',
          ['Employee', 'Staff no.', 'Worked days', 'Hours', 'Basic', 'Overtime', 'Commission', 'Gross', 'Deductions', 'Net'],
          items.data?.map(item => [name(item), number(item), item.days_worked, item.hours_worked, item.basic_pay, item.overtime_pay,
            item.commission_earned, item.gross_pay, item.gross_pay - item.net_pay, item.net_pay]) ?? [],
        )}><Download size={16} /> Export statements</button>
        {canAdmin && run.status === 'draft' && <>
          <button className="pos-secondary" onClick={() => onAction('discard')}>Discard draft</button>
          <button className="pos-primary" onClick={() => onAction('approve')} disabled={!items.data?.length}><Check size={16} /> Approve wage run</button>
        </>}
        {canAdmin && run.status === 'approved' && <button className="pos-primary" onClick={() => onAction('pay')}><Wallet size={17} /> Record payout</button>}
        {run.status === 'paid' && <span className="pos-muted">Payment reference {run.payment_reference || '—'}</span>}
      </div>
    </div>
  </Dialog>;
}

function PayAdjustForm({ item, name, close, saved }: { item: PayItem; name: string; close: () => void; saved: () => void }) {
  return <Dialog title={`Adjust wages · ${name}`} close={close}>
    <DialogForm onSave={form => adjustPayroll(item.id, form)} onSaved={saved} submit="Save adjustments">
      <div className="pos-form-grid">
        <label className="pos-field">Overtime amount<input type="number" name="overtime" min="0" step=".01" defaultValue={item.overtime_pay} /></label>
        <label className="pos-field">Bonus<input type="number" name="bonus" min="0" step=".01" defaultValue={sumAmounts(item.bonuses)} /></label>
        <label className="pos-field">Allowances<input type="number" name="allowance" min="0" step=".01" defaultValue={sumAmounts(item.allowances)} /></label>
        <label className="pos-field">Deductions<input type="number" name="deduction" min="0" step=".01" defaultValue={sumAmounts(item.deductions)} /></label>
      </div>
      <label className="pos-field">Adjustment note<textarea name="notes" maxLength={500} defaultValue={item.notes ?? ''} /></label>
    </DialogForm>
  </Dialog>;
}

function PayRunAction({ run, action, shop, close, saved }: {
  run: PayRun; action: 'approve' | 'pay' | 'discard'; shop: Shop; close: () => void; saved: () => void;
}) {
  const title = action === 'approve' ? 'Approve wage run' : action === 'pay' ? 'Record payroll payout' : 'Discard draft';
  const money = formatMoney(shop.currency);
  return <Dialog title={title} close={close}>
    <DialogForm onSave={form => changePayrollState(run.id, action, form)} onSaved={saved} submit={title} destructive={action === 'discard'}>
      <p className="pos-muted">{action === 'approve' ? 'Approval publishes employee payslips for this period and closes wage adjustments.'
        : action === 'discard' ? 'This removes the draft and its wage calculations.'
          : `Record the completed payout of ${money(run.total_net)}.`}</p>
      {action === 'pay' && <>
        <label className="pos-field">Payout method<select name="method">
          <option value="bank">Bank transfer</option><option value="mpesa">M-Pesa</option><option value="cash">Cash</option><option value="other">Other</option>
        </select></label>
        <label className="pos-field">Payout reference<input name="reference" required maxLength={120} /></label>
      </>}
    </DialogForm>
  </Dialog>;
}

function sumAmounts(input: Record<string, number> | null) {
  return Object.values(input ?? {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

export function Payslip({ shop, item, run, employee, number, close }: {
  shop: Shop; item: PayItem; run: PayRunInfo; employee: string; number?: string; close: () => void;
}) {
  const money = formatMoney(shop.currency);
  return <Dialog title="Wage statement" wide close={close} className="pos-payslip-dialog">
    <article className="pos-payslip">
      <div className="pos-payslip-heading"><div><h2>{shop.shop_name}</h2><p>{shop.address || shop.city}</p></div><PayStatus status={run.status} /></div>
      <h3>{employee}</h3>
      {number && <p>Employee {number}</p>}
      <p>{displayDay(run.period_start)} – {displayDay(run.period_end)} · {cycleNames[run.pay_period_type]}</p>
      {item.compensation_snapshot && <p>{wageNames[item.compensation_snapshot.wage_type]}{item.compensation_snapshot.wage_type !== 'commission'
        ? ' · ' + money(item.compensation_snapshot.wage_rate) : ''}</p>}
      <table className="pos-table">
        <caption>Wage details</caption>
        <tbody>
          <tr><th scope="row">Worked days / hours</th><td>{item.days_worked} / {item.hours_worked}</td></tr>
          <tr><th scope="row">Basic pay</th><td>{money(item.basic_pay)}</td></tr>
          <tr><th scope="row">Overtime</th><td>{money(item.overtime_pay)}</td></tr>
          <tr><th scope="row">Commission</th><td>{money(item.commission_earned)}</td></tr>
          <tr><th scope="row">Bonuses and allowances</th><td>{money(sumAmounts(item.bonuses) + sumAmounts(item.allowances))}</td></tr>
          <tr><th scope="row">Gross pay</th><td>{money(item.gross_pay)}</td></tr>
          <tr><th scope="row">Deductions</th><td>{money(item.gross_pay - item.net_pay)}</td></tr>
          <tr><th scope="row">Net pay</th><td><strong>{money(item.net_pay)}</strong></td></tr>
        </tbody>
      </table>
      {item.notes && <p>{item.notes}</p>}
      {item.payment_reference && <p>Paid by {paymentName(item.payment_method || '')} · {item.payment_reference}</p>}
    </article>
    <div className="pos-receipt-actions"><button className="pos-primary" type="button" onClick={() => window.print()}><Printer size={17} /> Print statement</button></div>
  </Dialog>;
}
