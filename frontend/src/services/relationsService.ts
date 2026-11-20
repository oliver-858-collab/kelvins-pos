import { supabase } from '../lib/supabase';
import { formText, nullableNumber, nullableText } from '../lib/business';
import { pageSize, readPages, rpc } from './checkoutService';

export type Customer = {
  id: string; name: string; email: string | null; phone: string | null; address: string | null; notes: string | null;
  credit_limit: number; credit_used: number; payment_terms_days: number; is_active: boolean; created_at: string;
};

type CustomerSale = {
  id: string; sale_number: string; created_at: string; status: string; total_amount: number;
  amount_paid: number; is_credit: boolean; credit_due_date: string | null;
};

export type CustomerActivity = {
  orders: number; spend: number; last_visit: string | null; recent: CustomerSale[]; outstanding: CustomerSale[];
  collections: { id: string; sale_id: string; amount: number; payment_method: string; reference: string | null; created_at: string }[];
};

export async function getCustomers(search: string, status: string, page: number, limit = 25) {
  let query = supabase.from('customers').select(
    'id,name,email,phone,address,notes,credit_limit,credit_used,payment_terms_days,is_active,created_at', { count: 'exact' },
  );
  if (status === 'active' || status === 'inactive') query = query.eq('is_active', status === 'active');
  if (status === 'balance') query = query.gt('credit_used', 0);
  if (search.trim()) {
    const text = search.trim().slice(0, 120).replace(/[\\%_]/g, '\\$&').replace(/"/g, '\\"');
    const pattern = JSON.stringify('%' + text + '%');
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`);
  }
  const { data, count, error } = await query.order('name').order('id').range(page * limit, (page + 1) * limit - 1).returns<Customer[]>();
  if (error) throw error;
  return { rows: data, count: count ?? 0 };
}

export async function saveCustomer(id: string, userId: string, editing: boolean, manage: boolean, form: FormData) {
  const details = {
    name: formText(form, 'name'), email: nullableText(form, 'email'), phone: nullableText(form, 'phone'),
    address: nullableText(form, 'address'), notes: nullableText(form, 'notes'),
    credit_limit: manage ? nullableNumber(form, 'limit') ?? 0 : 0,
    payment_terms_days: manage ? nullableNumber(form, 'terms') ?? 0 : 0,
    is_active: manage ? form.get('active') === 'on' : true,
  };
  const table = supabase.from('customers');
  const { data, error } = await (editing ? table.update(details).eq('id', id)
    : table.insert({ id, created_by: userId, ...details }))
    .select('id,name,email,phone,address,notes,credit_limit,credit_used,payment_terms_days,is_active,created_at').single<Customer>();
  if (error) throw error;
  return data;
}

export function getCustomerActivity(id: string) {
  return rpc<CustomerActivity>('pos_customer_detail', { p_customer: id });
}

export function recordCollection(id: string, customer: string, form: FormData) {
  return rpc<string>('record_customer_collection', {
    p_id: id, p_customer: customer, p_sale: formText(form, 'sale'), p_amount: nullableNumber(form, 'amount'),
    p_method: formText(form, 'method'), p_reference: nullableText(form, 'reference'),
  });
}

export type WageType = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'commission' | 'hybrid';
export type PayCycle = 'weekly' | 'biweekly' | 'monthly';
export const wageNames: Record<WageType, string> = { hourly: 'Hourly', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', commission: 'Commission', hybrid: 'Base + commission' };
export const cycleNames: Record<PayCycle, string> = { weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly' };
export type Employment = {
  id: string; employee_number: string; department: string | null; position: string | null;
  contract_type: string; home_branch_id: string | null; employment_end: string | null;
};
export type StaffRow = {
  id: string; full_name: string; email: string; phone: string | null; account_status: string;
  wage_type: WageType | null; wage_rate: number | null; commission_rate: number | null;
  pay_period: PayCycle | null; start_date: string | null;
  role: { name: string } | null; employment: Employment | null;
};
export type Attendance = {
  id: string; employee_id: string; branch_id: string | null; date: string; status: string;
  clock_in: string | null; clock_out: string | null; break_start: string | null; break_end: string | null;
  hours_worked: number; reviewed_at: string | null; notes: string | null; shift_id: string | null;
};
export type LeaveRow = {
  id: string; employee_id: string; leave_type: string; start_date: string; end_date: string;
  days: number; reason: string | null; status: string;
};
export type PayRun = {
  id: string; branch_id: string | null; period_start: string; period_end: string; pay_period_type: PayCycle;
  status: 'draft' | 'approved' | 'paid'; total_gross: number; total_deductions: number; total_net: number;
  paid_at: string | null; payment_reference: string | null; created_at: string;
};
export type PayItem = {
  id: string; employee_id: string; days_worked: number; hours_worked: number; basic_pay: number;
  overtime_pay: number; commission_earned: number; bonuses: Record<string, number> | null; allowances: Record<string, number> | null;
  deductions: Record<string, number> | null; gross_pay: number; net_pay: number; notes: string | null;
  payment_method: string | null; payment_reference: string | null;
  compensation_snapshot: { wage_type: WageType; wage_rate: number; commission_rate: number; net_sales: number } | null;
};
export type PayRunInfo = Pick<PayRun, 'id' | 'period_start' | 'period_end' | 'status' | 'paid_at' | 'pay_period_type'>;
const employmentFields = 'id,employee_number,department,position,contract_type,home_branch_id,employment_end';
const payRunFields = 'id,branch_id,period_start,period_end,pay_period_type,status,total_gross,total_deductions,total_net,paid_at,payment_reference,created_at';
const payItemFields = 'id,employee_id,days_worked,hours_worked,basic_pay,overtime_pay,commission_earned,bonuses,allowances,deductions,gross_pay,net_pay,notes,payment_method,payment_reference,compensation_snapshot';

export function getStaffDirectory() {
  return readPages<StaffRow>(offset => supabase.from('users').select(
    'id,full_name,email,phone,account_status,wage_type,wage_rate,commission_rate,pay_period,start_date,role:roles(name),' +
    `employment:employees(${employmentFields})`,
  ).eq('is_deleted', false).order('full_name').order('id').range(offset, offset + pageSize - 1).returns<StaffRow[]>());
}

export async function getEmployment(userId: string) {
  const { data, error } = await supabase.from('employees').select(employmentFields).eq('id', userId).maybeSingle<Employment>();
  if (error) throw error;
  return data;
}

export async function getAttendance(start: string, end: string, branch?: string, employee?: string) {
  return readPages<Attendance>(offset => {
    let query = supabase.from('attendance')
      .select('id,employee_id,branch_id,date,status,clock_in,clock_out,break_start,break_end,hours_worked,reviewed_at,notes,shift_id')
      .gte('date', start).lte('date', end);
    if (branch) query = query.or(`branch_id.eq.${branch},branch_id.is.null`);
    if (employee) query = query.eq('employee_id', employee);
    return query.order('date', { ascending: false }).order('id').range(offset, offset + pageSize - 1);
  });
}

export async function getOpenClock(employee: string) {
  const { data, error } = await supabase.from('attendance')
    .select('id,clock_in,branch_id,break_start,break_end').eq('employee_id', employee).not('shift_id', 'is', null)
    .is('clock_out', null).order('date', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as Pick<Attendance, 'id' | 'clock_in' | 'branch_id' | 'break_start' | 'break_end'> | null;
}

export function saveEmployment(employee: string, form: FormData) {
  return rpc<string>('save_staff_record', {
    p_employee: employee, p_branch: formText(form, 'branch'),
    p_details: {
      employee_number: formText(form, 'number'), department: nullableText(form, 'department'), position: nullableText(form, 'position'),
      contract_type: formText(form, 'contract'), phone: nullableText(form, 'phone'), start_date: formText(form, 'start'),
      employment_end: nullableText(form, 'end'), wage_type: formText(form, 'wageType'), wage_rate: nullableNumber(form, 'rate'),
      commission_rate: nullableNumber(form, 'commission') ?? 0, pay_period: formText(form, 'cycle'),
    },
  });
}

export type TimeClockEvent = 'in' | 'out' | 'break_start' | 'break_end';

export function clockStaff(branch: string | null, entry: string | null, event: TimeClockEvent) {
  return rpc<string>('staff_clock_event', { p_branch: branch, p_attendance: entry, p_event: event });
}

export function saveAttendance(branch: string, form: FormData) {
  return rpc<string>('save_staff_attendance', {
    p_employee: formText(form, 'employee'), p_branch: branch, p_day: formText(form, 'day'), p_status: formText(form, 'status'),
    p_clock_in: nullableText(form, 'in'), p_clock_out: nullableText(form, 'out'),
    p_break_minutes: nullableNumber(form, 'break') ?? 0, p_notes: nullableText(form, 'notes'),
  });
}

export function reviewAttendance(id: string) {
  return rpc<void>('review_staff_attendance', { p_entry: id });
}

export async function getLeave(employee?: string) {
  let query = supabase.from('leave_requests').select('id,employee_id,leave_type,start_date,end_date,days,reason,status');
  if (employee) query = query.eq('employee_id', employee);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(100).returns<LeaveRow[]>();
  if (error) throw error;
  return data;
}

export async function requestLeave(id: string, employee: string, form: FormData) {
  const start = formText(form, 'start');
  const end = formText(form, 'end');
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (!Number.isFinite(days) || days < 1 || days > 366) throw new Error('Choose a leave period from 1 to 366 days.');
  const { error } = await supabase.from('leave_requests').insert({
    id, employee_id: employee, leave_type: formText(form, 'type'), start_date: start, end_date: end,
    reason: nullableText(form, 'reason'), days, status: 'pending',
  });
  if (error) throw error;
}

export async function reviewLeave(id: string, user: string, status: 'approved' | 'rejected') {
  const { error } = await supabase.from('leave_requests').update({
    status, approved_by: user, approved_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'pending').select('id').single();
  if (error) throw error;
}

export function getPayrollRuns(branch: string) {
  return readPages<PayRun>(offset => supabase.from('payroll_runs').select(payRunFields)
    .or(`branch_id.eq.${branch},branch_id.is.null`).order('period_end', { ascending: false }).order('id')
    .range(offset, offset + pageSize - 1));
}

export function getPayrollItems(run: string) {
  return readPages<PayItem>(offset => supabase.from('payroll_items').select(payItemFields).eq('payroll_run_id', run).order('id')
    .range(offset, offset + pageSize - 1));
}

export function getOwnPay() {
  return rpc<(PayItem & { run: PayRunInfo })[]>('my_wage_statements', {});
}

export function draftPayroll(id: string, branch: string, form: FormData) {
  return rpc<string>('draft_staff_payroll', {
    p_run: id, p_branch: branch, p_start: formText(form, 'start'), p_end: formText(form, 'end'), p_cycle: formText(form, 'cycle'),
  });
}

export function adjustPayroll(id: string, form: FormData) {
  return rpc<void>('adjust_staff_payroll', {
    p_item: id, p_overtime: nullableNumber(form, 'overtime') ?? 0, p_bonus: nullableNumber(form, 'bonus') ?? 0,
    p_allowance: nullableNumber(form, 'allowance') ?? 0, p_deduction: nullableNumber(form, 'deduction') ?? 0,
    p_notes: nullableText(form, 'notes'),
  });
}

export function changePayrollState(id: string, action: 'approve' | 'pay' | 'discard', form: FormData) {
  return rpc<void>('set_staff_payroll_state', {
    p_run: id, p_action: action, p_method: nullableText(form, 'method'), p_reference: nullableText(form, 'reference'),
  });
}
