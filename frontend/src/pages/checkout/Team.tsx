import { useCallback, useState } from 'react';
import { CalendarDays, Check, Clock3, Download, FileText, Plus, Search, UserCog, Users, Wallet, X } from 'lucide-react';
import { displayDay, downloadCsv, errorMessage, formatMoney, shiftDay, shopDay, timeOfDay } from '../../lib/business';
import type { Branch, Shop } from '../../services/checkoutService';
import {
  cycleNames, getAttendance, getEmployment, getLeave, getOwnPay, getStaffDirectory, wageNames,
  requestLeave, reviewAttendance, reviewLeave, saveAttendance, saveEmployment,
  type Attendance, type LeaveRow, type StaffRow,
} from '../../services/relationsService';
import StaffAccess from '../admin/staff/StaffAccess';
import { Payslip } from './Wages';
import TimeClock from './TimeClock';
import { DateRange, Dialog, DialogForm, Empty, LoadError, useData } from './WorkspaceUI';

const attendanceStatuses = { present: 'Present', late: 'Late', half_day: 'Half day', absent: 'Absent', leave: 'Leave', holiday: 'Holiday' };
const contracts = { full_time: 'Full time', part_time: 'Part time', contract: 'Contract', casual: 'Casual' };

type TeamTab = 'Directory' | 'Attendance' | 'Leave' | 'Access requests';

export default function Team({ shop, branch, branches, userId, canAdmin, initialSection }: {
  shop: Shop; branch: string; branches: Branch[]; userId: string; canAdmin: boolean; initialSection?: string | null;
}) {
  const [tab, setTab] = useState<TeamTab>(() => {
    if (initialSection === 'access' && canAdmin) return 'Access requests';
    if (initialSection === 'attendance') return 'Attendance';
    if (initialSection === 'leave') return 'Leave';
    return 'Directory';
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<StaffRow>();
  const team = useData(getStaffDirectory);
  const roster = team.data?.filter(member => member.account_status !== 'pending') ?? [];
  const employees = roster.filter(member => member.employment);
  const q = search.trim().toLowerCase();
  const visible = roster.filter(member => (!status || member.account_status === status)
    && (!q || [member.full_name, member.email, member.employment?.department, member.employment?.position,
      member.employment?.employee_number].some(value => value?.toLowerCase().includes(q))));
  const money = formatMoney(shop.currency);
  return <>
    <div className="pos-heading"><div><h1>Staff and attendance</h1><p>Employee records, clocked hours, leave and staff access.</p></div></div>
    <div className="pos-metrics pos-metrics-three">
      <TeamMetric label="Active staff accounts" value={team.data ? roster.filter(member => member.account_status === 'active').length : '—'} icon={Users} />
      <TeamMetric label="Employee records" value={team.data ? employees.length : '—'} icon={UserCog} />
      <TeamMetric label="Awaiting access" value={team.data ? team.data.filter(member => member.account_status === 'pending').length : '—'} icon={Clock3} />
    </div>
    <div className="pos-section-tabs">
      {(['Directory', 'Attendance', 'Leave', 'Access requests'] as TeamTab[]).filter(item => item !== 'Access requests' || canAdmin)
        .map(item => <button key={item} aria-pressed={tab === item} onClick={() => {
          setTab(item);
          if (item === 'Directory') team.reload();
        }}>{item}</button>)}
    </div>
    <LoadError message={team.error} retry={team.reload} />
    {tab === 'Directory' && <section className="pos-panel">
      <div className="pos-toolbar">
        <label className="pos-search"><Search size={17} /><input aria-label="Search staff" value={search} onChange={event => setSearch(event.target.value)}
          placeholder="Search name, department or staff number" /></label>
        <select className="pos-select" aria-label="Staff account status" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">All staff statuses</option><option value="active">Active</option><option value="suspended">Suspended</option>
        </select>
      </div>
      {!visible.length ? <Empty>{team.loading ? 'Loading staff…' : 'No staff match these filters.'}</Empty> :
        <div className="pos-table-wrap"><table className="pos-table">
          <thead><tr><th>Employee</th><th>Role</th><th>Position and department</th><th>Home branch</th><th>Compensation</th><th>Access</th>{canAdmin && <th />}</tr></thead>
          <tbody>{visible.map(member => <tr key={member.id}>
            <th scope="row"><div className="pos-person"><span>{member.full_name.slice(0, 1).toUpperCase()}</span><div>{member.full_name}
              <small>{member.employment?.employee_number || member.email}</small></div></div></th>
            <td>{member.role?.name ?? '—'}</td>
            <td>{member.employment?.position ?? '—'}<small>{member.employment?.department}</small></td>
            <td>{branches.find(location => location.id === member.employment?.home_branch_id)?.name ?? '—'}</td>
            <td>{member.wage_type ? <>{wageNames[member.wage_type]}{member.wage_type !== 'commission' && ' · ' + money(member.wage_rate ?? 0)}
              {(member.wage_type === 'commission' || member.wage_type === 'hybrid') && <small>{member.commission_rate ?? 0}% of sales before tax</small>}</>
              : <span className="pos-muted">Setup needed</span>}</td>
            <td><span className={`pos-badge ${member.account_status === 'active' ? 'pos-tone-good' : 'pos-tone-neutral'}`}>{member.account_status}</span></td>
            {canAdmin && <td><button className="pos-secondary" onClick={() => setEditing(member)}>{member.employment ? 'Edit employment' : 'Set up employment'}</button></td>}
          </tr>)}</tbody>
        </table></div>}
    </section>}
    {tab === 'Attendance' && <AttendancePanel shop={shop} branch={branch} employees={employees} awaitingReview={initialSection === 'attendance'} />}
    {tab === 'Leave' && <LeavePanel employees={employees} userId={userId} />}
    {tab === 'Access requests' && canAdmin && <StaffAccess adminId={userId} />}
    {editing && <EmploymentForm member={editing} branch={branch} branches={branches} today={shopDay(shop.timezone)}
      close={() => setEditing(undefined)} saved={() => { setEditing(undefined); team.reload(); }} />}
  </>;
}

function TeamMetric({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof Users }) {
  return <div className="pos-panel pos-metric"><div><span>{label}</span><span className="pos-metric-icon pos-metric-green"><Icon size={18} /></span></div><strong>{value}</strong></div>;
}

function EmploymentForm({ member, branch, branches, today, close, saved }: {
  member: StaffRow; branch: string; branches: Branch[]; today: string; close: () => void; saved: () => void;
}) {
  const [wage, setWage] = useState(member.wage_type ?? 'hourly');
  const [cycle, setCycle] = useState(member.pay_period ?? 'weekly');
  return <Dialog title={`Employment · ${member.full_name}`} close={close} wide>
    <DialogForm onSave={form => saveEmployment(member.id, form)} onSaved={saved} submit="Save employment">
      <div className="pos-form-grid">
        <label className="pos-field">Employee number<input name="number" required maxLength={60}
          defaultValue={member.employment?.employee_number ?? `EMP-${member.id.slice(0, 7).toUpperCase()}`} /></label>
        <label className="pos-field">Home branch<select name="branch" defaultValue={member.employment?.home_branch_id ?? branch} required>
          {branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="pos-field">Department<input name="department" maxLength={100} defaultValue={member.employment?.department ?? ''} /></label>
        <label className="pos-field">Position<input name="position" maxLength={100} defaultValue={member.employment?.position ?? ''} /></label>
        <label className="pos-field">Contract type<select name="contract" defaultValue={member.employment?.contract_type ?? 'full_time'}>
          {Object.entries(contracts).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="pos-field">Phone<input name="phone" type="tel" maxLength={50} defaultValue={member.phone ?? ''} /></label>
        <label className="pos-field">Start date<input name="start" type="date" defaultValue={member.start_date ?? today} required /></label>
        <label className="pos-field">Employment end date<input name="end" type="date" defaultValue={member.employment?.employment_end ?? ''} /></label>
        <label className="pos-field">Wage type<select name="wageType" value={wage} onChange={event => {
          const next = event.target.value as keyof typeof wageNames;
          setWage(next);
          if (next === 'monthly') setCycle('monthly');
          if (next === 'weekly' && cycle === 'monthly') setCycle('weekly');
        }}>{Object.entries(wageNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="pos-field">Pay cycle<select name="cycle" value={cycle} onChange={event => setCycle(event.target.value as keyof typeof cycleNames)}>
          {Object.entries(cycleNames).filter(([key]) => wage === 'monthly' ? key === 'monthly' : wage === 'weekly' ? key !== 'monthly' : true)
            .map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="pos-field">{wage === 'hybrid' ? 'Base amount per pay cycle' : 'Wage rate'}
          <input name="rate" type="number" min="0" step=".01" defaultValue={member.wage_rate ?? 0} required /></label>
        <label className="pos-field">Commission percent<input name="commission" type="number" min="0" max="100" step=".01"
          defaultValue={member.commission_rate ?? 0} /></label>
      </div>
      <p className="pos-muted">Hourly and daily wages use reviewed attendance. Commission uses completed sales before tax.</p>
    </DialogForm>
  </Dialog>;
}

type DayRange = { start: string; end: string };

function AttendancePanel({ shop, branch, employees, awaitingReview }: { shop: Shop; branch: string; employees: StaffRow[]; awaitingReview: boolean }) {
  const today = shopDay(shop.timezone);
  const [range, setRange] = useState<DayRange>({ start: shiftDay(today, awaitingReview ? -29 : -13), end: today });
  const [reviewOnly, setReviewOnly] = useState(awaitingReview);
  const [staff, setStaff] = useState('');
  const [editing, setEditing] = useState<Attendance | 'new'>();
  const [reviewing, setReviewing] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => getAttendance(range.start, range.end, branch, staff || undefined), [range.start, range.end, branch, staff]);
  const attendance = useData(load);
  const rows = attendance.data?.filter(item => !reviewOnly || (item.clock_out && !item.reviewed_at)) ?? [];
  async function approve(entry: Attendance) {
    setReviewing(entry.id); setError('');
    try { await reviewAttendance(entry.id); attendance.reload(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setReviewing(''); }
  }

  return <section className="pos-panel">
    <div className="pos-panel-bar"><div><h2>Attendance register</h2>
      <p>{rows.reduce((hours, item) => hours + item.hours_worked, 0).toFixed(2)} hours · {rows.filter(item => !item.reviewed_at).length} awaiting review</p></div>
      <button className="pos-primary" disabled={!employees.length} onClick={() => setEditing('new')}><Plus size={16} /> Record attendance</button>
    </div>
    <div className="pos-toolbar">
      <DateRange start={range.start} end={range.end} today={today} onChange={(start, end) => setRange({ start, end })} />
      <select className="pos-select" aria-label="Attendance employee" value={staff} onChange={event => setStaff(event.target.value)}>
        <option value="">All employees</option>{employees.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}
      </select>
      <label className="pos-muted"><input type="checkbox" checked={reviewOnly}
        onChange={event => setReviewOnly(event.target.checked)} /> Closed shifts awaiting review</label>
      <button className="pos-secondary" disabled={!rows.length || attendance.loading} onClick={() =>
        downloadCsv('attendance-' + range.start + '-' + range.end + '.csv', ['Employee', 'Date', 'Status', 'Clock in', 'Clock out', 'Hours', 'Reviewed'],
          rows.map(item => [employees.find(member => member.id === item.employee_id)?.full_name, item.date, item.status,
            item.clock_in, item.clock_out, item.hours_worked, item.reviewed_at ? 'Yes' : 'No']))}><Download size={16} /> Export</button>
    </div>
    <LoadError message={error || attendance.error} retry={attendance.reload} />
    <AttendanceTable rows={attendance.data ? rows : undefined} shop={shop} employees={employees} onEdit={setEditing}
      onReview={entry => void approve(entry)} reviewing={reviewing} />
    {editing && <AttendanceForm entry={editing === 'new' ? undefined : editing} employees={employees} employee={staff}
      today={today} branch={branch} shop={shop} close={() => setEditing(undefined)}
      saved={() => { setEditing(undefined); attendance.reload(); }} />}
  </section>;
}

function AttendanceTable({ rows, shop, employees, onEdit, onReview, reviewing }: {
  rows?: Attendance[]; shop: Shop; employees?: StaffRow[]; onEdit?: (entry: Attendance) => void;
  onReview?: (entry: Attendance) => void; reviewing?: string;
}) {
  if (!rows?.length) return <Empty>{rows ? 'No attendance in this period.' : 'Loading attendance…'}</Empty>;
  const showTime = (value: string | null) => value ? timeOfDay(value, shop.timezone) : '—';
  return <div className="pos-table-wrap"><table className="pos-table">
    <thead><tr>{employees && <th>Employee</th>}<th>Date</th><th>Status</th><th>Clock in</th><th>Clock out</th><th>Break</th><th>Hours</th><th>Review</th>{onEdit && <th />}</tr></thead>
    <tbody>{rows.map(item => <tr key={item.id}>
      {employees && <th scope="row">{employees.find(member => member.id === item.employee_id)?.full_name ?? 'Former employee'}</th>}
      <td>{displayDay(item.date)}</td><td>{attendanceStatuses[item.status as keyof typeof attendanceStatuses] ?? item.status}</td>
      <td>{showTime(item.clock_in)}</td><td>{showTime(item.clock_out)}</td><td>{item.break_start ? `${showTime(item.break_start)} – ${showTime(item.break_end)}` : '—'}</td><td className="pos-number">{item.hours_worked.toFixed(2)}</td>
      <td><span className={`pos-badge ${item.reviewed_at ? 'pos-tone-good' : 'pos-tone-warn'}`}>{item.reviewed_at ? 'Reviewed' : item.clock_in && !item.clock_out ? 'On shift' : 'Pending'}</span></td>
      {onEdit && <td><div className="pos-row-actions">
        <button className="pos-secondary" disabled={!!item.shift_id && !item.clock_out} onClick={() => onEdit(item)}>Edit</button>
        {!item.reviewed_at && item.clock_out && <button className="pos-secondary" disabled={!!reviewing}
          onClick={() => onReview?.(item)}><Check size={15} /> Approve</button>}
      </div></td>}
    </tr>)}</tbody>
  </table></div>;
}

function AttendanceForm({ entry, employees, employee, today, branch, shop, close, saved }: {
  entry?: Attendance; employees: StaffRow[]; employee: string; today: string; branch: string; shop: Shop; close: () => void; saved: () => void;
}) {
  const [status, setStatus] = useState(entry?.status ?? 'present');
  const works = ['present', 'late', 'half_day'].includes(status);
  const minutes = entry?.break_start && entry.break_end ? Math.round((Date.parse(entry.break_end) - Date.parse(entry.break_start)) / 60000) : 0;
  return <Dialog title={entry ? 'Edit attendance' : 'Record attendance'} close={close}>
    <DialogForm onSave={form => saveAttendance(entry?.branch_id ?? branch, form)} onSaved={saved} submit="Save reviewed attendance">
      <label className="pos-field">Employee<select name="employee" required defaultValue={entry?.employee_id ?? employee}>
        <option value="">Select employee</option>{employees.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
      <label className="pos-field">Date<input name="day" type="date" defaultValue={entry?.date ?? today} max={today} required /></label>
      <label className="pos-field">Status<select name="status" value={status} onChange={event => setStatus(event.target.value)}>
        {Object.entries(attendanceStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {works && <div className="pos-form-grid">
        <label className="pos-field">Clock in<input name="in" type="time" required defaultValue={entry?.clock_in ? timeOfDay(entry.clock_in, shop.timezone) : ''} /></label>
        <label className="pos-field">Clock out<input name="out" type="time" required defaultValue={entry?.clock_out ? timeOfDay(entry.clock_out, shop.timezone) : ''} /></label>
        <label className="pos-field">Break minutes<input name="break" type="number" min="0" max="360" step="1" defaultValue={minutes} /></label>
      </div>}
      <label className="pos-field">Notes<textarea name="notes" defaultValue={entry?.notes ?? ''} maxLength={500} /></label>
    </DialogForm>
  </Dialog>;
}

function LeavePanel({ employees, userId }: { employees: StaffRow[]; userId: string }) {
  const [filter, setFilter] = useState('pending');
  const [editing, setEditing] = useState<{ id: string; name: string; status: 'approved' | 'rejected' }>();
  const leave = useData(getLeave);
  const rows = leave.data?.filter(entry => !filter || entry.status === filter);
  return <section className="pos-panel">
    <div className="pos-panel-bar"><h2><CalendarDays size={17} /> Leave requests</h2>
      <select className="pos-select" aria-label="Leave status" value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="">All requests</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
      </select>
    </div>
    <LoadError message={leave.error} retry={leave.reload} />
    <LeaveTable rows={rows} employees={employees} onReview={(entry, status) => setEditing({
      id: entry.id, name: employees.find(item => item.id === entry.employee_id)?.full_name ?? 'employee', status,
    })} />
    {editing && <Dialog title={editing.status === 'approved' ? 'Approve leave' : 'Reject leave'} close={() => setEditing(undefined)}>
      <DialogForm onSave={() => reviewLeave(editing.id, userId, editing.status)} onSaved={() => { setEditing(undefined); leave.reload(); }}
        submit={editing.status === 'approved' ? 'Approve request' : 'Reject request'} destructive={editing.status === 'rejected'}>
        <p>{editing.status === 'approved' ? 'Approve' : 'Reject'} the leave request for {editing.name}?</p>
      </DialogForm>
    </Dialog>}
  </section>;
}

function LeaveTable({ rows, employees, onReview }: {
  rows?: LeaveRow[]; employees?: StaffRow[]; onReview?: (row: LeaveRow, status: 'approved' | 'rejected') => void;
}) {
  if (!rows?.length) return <Empty>{rows ? 'No leave requests in this view.' : 'Loading leave…'}</Empty>;
  return <div className="pos-table-wrap"><table className="pos-table">
    <thead><tr>{employees && <th>Employee</th>}<th>Type</th><th>Dates</th><th>Days</th><th>Status</th>{onReview && <th />}</tr></thead>
    <tbody>{rows.map(entry => <tr key={entry.id}>{employees && <th scope="row">{employees.find(item => item.id === entry.employee_id)?.full_name || 'Former employee'}</th>}
      <td>{entry.leave_type}{entry.reason && <small className="pos-wrap-text">{entry.reason}</small>}</td>
      <td>{displayDay(entry.start_date)} – {displayDay(entry.end_date)}</td><td>{entry.days}</td>
      <td><span className={`pos-badge pos-tone-${entry.status === 'approved' ? 'good' : entry.status === 'pending' ? 'warn' : 'bad'}`}>{entry.status}</span></td>
      {onReview && <td>{entry.status === 'pending' && <div className="pos-row-actions">
        <button className="pos-icon-button" aria-label="Approve leave" onClick={() => onReview(entry, 'approved')}><Check size={16} /></button>
        <button className="pos-icon-button" aria-label="Reject leave" onClick={() => onReview(entry, 'rejected')}><X size={16} /></button>
      </div>}</td>}
    </tr>)}</tbody>
  </table></div>;
}

export function MyWork({ shop, branch, userId, userName, initialSection }: { shop: Shop; branch?: string; userId: string; userName: string; initialSection?: string | null }) {
  const [tab, setTab] = useState(initialSection === 'leave' ? 'Leave' : initialSection === 'payslips' ? 'Payslips' : 'Attendance');
  const [leaveDialog, setLeaveDialog] = useState<string>();
  const [slip, setSlip] = useState<Awaited<ReturnType<typeof getOwnPay>>[number]>();
  const today = shopDay(shop.timezone);
  const [range, setRange] = useState({ start: shiftDay(today, -29), end: today });
  const profile = useData(useCallback(() => getEmployment(userId), [userId]));
  const attendance = useData(useCallback(() => getAttendance(range.start, range.end, undefined, userId), [range.start, range.end, userId]), tab === 'Attendance');
  const leave = useData(useCallback(() => getLeave(userId), [userId]), tab === 'Leave');
  const pay = useData(getOwnPay, tab === 'Payslips');
  const money = formatMoney(shop.currency);

  return <>
    <div className="pos-heading"><div><h1>My work</h1><p>Clock in and out, request leave and view your wage statements.</p></div></div>
    <LoadError message={profile.error} retry={profile.reload} />
    <TimeClock branch={branch} userId={userId} timezone={shop.timezone} profile={profile.data}
      profileLoading={profile.loading} onRecorded={attendance.reload} />
    <div className="pos-section-tabs">{['Attendance', 'Leave', 'Payslips'].map(item =>
      <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
    {tab === 'Attendance' && <section className="pos-panel"><div className="pos-panel-bar"><h2>My timesheet</h2></div>
      <div className="pos-toolbar">
        <DateRange start={range.start} end={range.end} today={today} onChange={(start, end) => setRange({ start, end })} />
        <div className="pos-segment" aria-label="Attendance period">{[7, 30, 90].map(days =>
          <button type="button" key={days} aria-pressed={range.start === shiftDay(today, 1 - days) && range.end === today}
            onClick={() => setRange({ start: shiftDay(today, 1 - days), end: today })}>{days}d</button>)}</div>
        <button type="button" className="pos-secondary" disabled={attendance.loading || !!attendance.error || !attendance.data?.length}
          onClick={() => downloadCsv(`my-attendance-${range.start}-${range.end}.csv`, ['Date', 'Status', 'Clock in', 'Clock out', 'Break start', 'Break end', 'Hours', 'Reviewed'],
            (attendance.data ?? []).map(row => [row.date, row.status, row.clock_in, row.clock_out, row.break_start, row.break_end, row.hours_worked, row.reviewed_at ? 'Yes' : 'No']))}>
          <Download size={16} /> Export timesheet</button>
      </div>
      <LoadError message={attendance.error} retry={attendance.reload} /><AttendanceTable rows={attendance.data} shop={shop} /></section>}
    {tab === 'Leave' && <section className="pos-panel"><div className="pos-panel-bar"><h2>My leave requests</h2>
      <button className="pos-secondary" disabled={!profile.data} onClick={() => setLeaveDialog(crypto.randomUUID())}><Plus size={16} /> Request leave</button></div>
      <LoadError message={leave.error} retry={leave.reload} /><LeaveTable rows={leave.data} /></section>}
    {tab === 'Payslips' && <section className="pos-panel">
      <div className="pos-panel-bar"><h2><Wallet size={18} /> My payslips</h2></div>
      <LoadError message={pay.error} retry={pay.reload} />
      {pay.data?.length ? <div className="pos-table-wrap"><table className="pos-table">
        <thead><tr><th>Period</th><th>Status</th><th>Hours</th><th>Net pay</th><th /></tr></thead>
        <tbody>{pay.data.map(item => <tr key={item.id}><th scope="row">{displayDay(item.run.period_start)} – {displayDay(item.run.period_end)}</th>
          <td><span className="pos-badge">{item.run.status}</span></td><td>{item.hours_worked}</td><td>{money(item.net_pay)}</td>
          <td><button className="pos-secondary" onClick={() => setSlip(item)}><FileText size={16} /> Payslip</button></td></tr>)}</tbody>
      </table></div> : <Empty>{pay.loading ? 'Loading payslips…' : 'No approved payslips yet.'}</Empty>}
    </section>}
    {leaveDialog && <Dialog title="Request leave" close={() => setLeaveDialog(undefined)}>
      <DialogForm onSave={form => requestLeave(leaveDialog, userId, form)} onSaved={() => { setLeaveDialog(undefined); leave.reload(); }} submit="Submit request">
        <label className="pos-field">Leave type<select name="type">
          {['Annual', 'Sick', 'Family', 'Unpaid', 'Other'].map(item => <option key={item}>{item}</option>)}
        </select></label>
        <div className="pos-form-grid">
          <label className="pos-field">Start date<input type="date" name="start" required /></label>
          <label className="pos-field">End date<input type="date" name="end" required /></label>
        </div>
        <label className="pos-field">Reason<textarea name="reason" maxLength={500} rows={2} /></label>
      </DialogForm>
    </Dialog>}
    {slip && <Payslip shop={shop} item={slip} run={slip.run} employee={userName} number={profile.data?.employee_number}
      close={() => setSlip(undefined)} />}
  </>;
}
