import { useCallback, useDeferredValue, useState } from 'react';
import { ArrowUpRight, Banknote, Download, Plus, Search, UserRound, X } from 'lucide-react';
import { displayDay, downloadCsv, formatMoney } from '../../lib/business';
import { paymentName, type Shop } from '../../services/checkoutService';
import {
  getCustomerActivity, getCustomers, recordCollection, saveCustomer, type Customer,
} from '../../services/relationsService';
import { Dialog, DialogForm, Empty, LoadError, Pagination, useData } from './WorkspaceUI';

export function CustomerPicker({ customer, onPick, disabled }: {
  customer: Customer | null; onPick: (customer: Customer | null) => void; disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const query = useDeferredValue(search);
  const load = useCallback(() => getCustomers(query, 'active', 0, 10), [query]);
  const data = useData(load, open && query.trim().length >= 2);
  return <div className="pos-customer-picker">
    {customer ? <div className="pos-selected-customer"><UserRound size={16} /><span>{customer.name}</span>
      <button type="button" className="pos-icon-button" aria-label="Remove customer" disabled={disabled}
        onClick={() => { onPick(null); setOpen(false); setSearch(''); }}><X size={15} /></button></div> : <>
      <label className="pos-field">Customer
        <div className="pos-search"><Search size={16} /><input aria-label="Find a customer" placeholder="Walk-in or search customers"
          value={search} disabled={disabled} onChange={event => { setSearch(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onKeyDown={event => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter') event.preventDefault();
          }} /></div>
      </label>
      {open && query.trim().length >= 2 && <div className="pos-customer-results" aria-label="Matching customers">
        <LoadError message={data.error} retry={data.reload} />
        {data.loading ? <p className="pos-muted" role="status">Searching customers…</p> :
          data.data?.rows.length ? data.data.rows.map(item =>
            <button type="button" key={item.id} onClick={() => { onPick(item); setOpen(false); setSearch(''); }}>
              <strong>{item.name}</strong><small>{item.phone || item.email}</small>
            </button>) : <p className="pos-muted">No matching customer.</p>}
      </div>}
    </>}
  </div>;
}

export default function Customers({ shop, userId, canManage, onReceipt, balanceOnly }: {
  shop: Shop; userId: string; canManage: boolean; balanceOnly?: boolean; onReceipt: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(balanceOnly ? 'balance' : '');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Customer | 'new'>();
  const [selected, setSelected] = useState<Customer>();
  const [collection, setCollection] = useState<Customer>();
  const query = useDeferredValue(search);
  const load = useCallback(() => getCustomers(query, status, page), [query, status, page]);
  const list = useData(load);
  const money = formatMoney(shop.currency);

  function updated(customer: Customer) {
    list.reload();
    setEditing(undefined);
    setSelected(customer);
  }

  return <>
    <div className="pos-heading">
      <div><h1>Customers</h1><p>Contact records, purchase history and on-account balances.</p></div>
      <button className="pos-primary" onClick={() => setEditing('new')}><Plus size={18} /> Add customer</button>
    </div>
    <section className="pos-panel">
      <div className="pos-toolbar">
        <label className="pos-search"><Search size={17} /><input aria-label="Search customer records" placeholder="Search name, email or phone"
          value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label>
        <select className="pos-select" aria-label="Customer status" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}>
          <option value="">All customers</option><option value="active">Active</option><option value="inactive">Inactive</option>
          <option value="balance">Outstanding balance</option>
        </select>
        {canManage && <button className="pos-secondary" disabled={!list.data?.rows.length || list.loading}
          onClick={() => downloadCsv('customers-page-' + (page + 1) + '.csv',
            ['Name', 'Email', 'Phone', 'Address', 'Credit limit', 'Balance', 'Active'],
            list.data?.rows.map(item => [item.name, item.email, item.phone, item.address, item.credit_limit, item.credit_used, item.is_active ? 'Yes' : 'No']) ?? [])}>
          <Download size={16} /> Export page</button>}
      </div>
      <LoadError message={list.error} retry={list.reload} />
      {!list.data?.rows.length ? <Empty action={list.data?.count === 0 && !query && !status
        ? <button className="pos-secondary" onClick={() => setEditing('new')}>Create your first customer</button> : undefined}>
        {list.loading ? 'Loading customers…' : 'No customers match these filters.'}</Empty> :
        <div className="pos-table-wrap"><table className="pos-table">
          <thead><tr><th>Customer</th><th>Contact</th><th>Credit limit</th><th>Outstanding</th><th>Status</th><th></th></tr></thead>
          <tbody>{list.data.rows.map(item => <tr key={item.id}>
            <th scope="row"><div className="pos-person"><span>{item.name.trim()[0]?.toUpperCase() || 'C'}</span><div>{item.name}<small>{item.address}</small></div></div></th>
            <td>{item.phone || '—'}<small>{item.email}</small></td><td>{money(item.credit_limit)}</td>
            <td className="pos-number">{money(item.credit_used)}</td>
            <td><span className={`pos-badge ${item.is_active ? 'pos-tone-good' : 'pos-tone-neutral'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td>
            <td><button className="pos-secondary" onClick={() => setSelected(item)}>Open profile <ArrowUpRight size={15} /></button></td>
          </tr>)}</tbody>
        </table></div>}
      <Pagination page={page} count={list.data?.count ?? 0} size={25} onPage={setPage} loading={list.loading} />
    </section>
    {editing && <CustomerForm customer={editing === 'new' ? undefined : editing} userId={userId} canManage={canManage}
      close={() => setEditing(undefined)} saved={updated} />}
    {selected && !editing && !collection && <CustomerDetail key={selected.id} customer={selected} shop={shop} canManage={canManage}
      close={() => setSelected(undefined)} onEdit={() => setEditing(selected)} onCollection={() => setCollection(selected)}
      onReceipt={id => { onReceipt(id); setSelected(undefined); }} />}
    {collection && <CollectionForm customer={collection} shop={shop} close={() => setCollection(undefined)}
      saved={amount => {
        setSelected(previous => previous && { ...previous, credit_used: Math.max(0, previous.credit_used - amount) });
        setCollection(undefined); list.reload();
      }} />}
  </>;
}

function CustomerForm({ customer, userId, canManage, close, saved }: {
  customer?: Customer; userId: string; canManage: boolean; close: () => void; saved: (customer: Customer) => void;
}) {
  const [id] = useState(() => customer?.id ?? crypto.randomUUID());
  return <Dialog title={customer ? 'Edit customer' : 'Add customer'} close={close} wide>
    <DialogForm onSave={form => saveCustomer(id, userId, !!customer, canManage, form)}
      onSaved={saved}
      submit="Save customer">
      <div className="pos-form-grid">
        <label className="pos-field pos-span-2">Full or business name<input name="name" maxLength={120} required defaultValue={customer?.name} /></label>
        <label className="pos-field">Email<input name="email" type="email" maxLength={254} defaultValue={customer?.email ?? ''} /></label>
        <label className="pos-field">Phone<input name="phone" type="tel" maxLength={50} defaultValue={customer?.phone ?? ''} /></label>
        <label className="pos-field pos-span-2">Address<input name="address" maxLength={300} defaultValue={customer?.address ?? ''} /></label>
        {canManage && <>
          <label className="pos-field">Credit limit<input name="limit" type="number" min="0" max="9999999999.99" step=".01" defaultValue={customer?.credit_limit ?? 0} /></label>
          <label className="pos-field">Payment terms in days<input name="terms" type="number" min="0" max="365" step="1" defaultValue={customer?.payment_terms_days ?? 0} /></label>
        </>}
        <label className="pos-field pos-span-2">Notes<textarea name="notes" rows={3} maxLength={1500} defaultValue={customer?.notes ?? ''} /></label>
        {canManage && <label className="pos-check"><input type="checkbox" name="active" defaultChecked={customer?.is_active ?? true} /> Active customer</label>}
      </div>
    </DialogForm>
  </Dialog>;
}

function CustomerDetail({ customer, shop, canManage, close, onEdit, onCollection, onReceipt }: {
  customer: Customer; shop: Shop; canManage: boolean; close: () => void; onEdit: () => void; onCollection: () => void;
  onReceipt: (id: string) => void;
}) {
  const [tab, setTab] = useState('Purchases');
  const load = useCallback(() => getCustomerActivity(customer.id), [customer.id]);
  const detail = useData(load);
  const money = formatMoney(shop.currency);
  const date = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeZone: shop.timezone });
  return <Dialog title={customer.name} close={close} wide>
    <div className="pos-detail">
      <div className="pos-detail-top">
        <div><p>{[customer.phone, customer.email].filter(Boolean).join(' · ') || 'No contact information'}</p>
          {customer.address && <p>{customer.address}</p>}{customer.notes && <p className="pos-detail-note">{customer.notes}</p>}</div>
        <div className="pos-row-actions">
          {canManage && <button className="pos-secondary" onClick={onEdit}>Edit profile</button>}
          {canManage && !!detail.data?.outstanding.length && <button className="pos-primary" onClick={onCollection}><Banknote size={16} /> Record collection</button>}
        </div>
      </div>
      <div className="pos-detail-metrics">
        <div><span>Completed purchases</span><strong>{detail.data?.orders ?? '—'}</strong></div>
        <div><span>Purchase value</span><strong>{detail.data ? money(detail.data.spend) : '—'}</strong></div>
        <div><span>Outstanding balance</span><strong>{money(customer.credit_used)}</strong></div>
      </div>
      <LoadError message={detail.error} retry={detail.reload} />
      {detail.data && <>
        <div className="pos-section-tabs">
          {['Purchases', 'Open balances', 'Collections'].filter(item => item !== 'Collections' || canManage)
            .map(item => <button key={item} onClick={() => setTab(item)} aria-pressed={tab === item}>{item}</button>)}
        </div>
        <div className="pos-table-wrap">
          {tab === 'Collections' ? (detail.data.collections.length ? <table className="pos-table">
            <thead><tr><th>Received</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead>
            <tbody>{detail.data.collections.map(item => <tr key={item.id}><td>{date.format(new Date(item.created_at))}</td>
              <td>{paymentName(item.payment_method)}</td><td>{item.reference || '—'}</td><td>{money(item.amount)}</td></tr>)}</tbody>
          </table> : <Empty>No recorded collections.</Empty>) : (() => {
            const sales = tab === 'Open balances' ? detail.data.outstanding : detail.data.recent;
            if (!sales.length) return <Empty>{tab === 'Open balances' ? 'No open on-account sales.' : 'No purchase history yet.'}</Empty>;
            return <table className="pos-table"><thead><tr><th>Sale</th><th>Date</th><th>Total</th><th>{tab === 'Open balances' ? 'Outstanding' : 'Status'}</th><th /></tr></thead>
              <tbody>{sales.map(item => <tr key={item.id}><th scope="row">{item.sale_number}</th>
                <td>{date.format(new Date(item.created_at))}</td><td>{money(item.total_amount)}</td>
                <td>{tab === 'Open balances' ? <>{money(item.total_amount - item.amount_paid)}<small>
                  {item.credit_due_date ? 'Due ' + displayDay(item.credit_due_date) : ''}</small></> : item.status}</td>
                <td><button className="pos-secondary" onClick={() => onReceipt(item.id)}>Receipt</button></td>
              </tr>)}</tbody>
            </table>;
          })()}
        </div>
      </>}
      {detail.loading && !detail.data && <p className="pos-muted" role="status">Loading customer history…</p>}
    </div>
  </Dialog>;
}

function CollectionForm({ customer, shop, close, saved }: { customer: Customer; shop: Shop; close: () => void; saved: (amount: number) => void }) {
  const [id] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState('');
  const [sale, setSale] = useState('');
  const [method, setMethod] = useState('cash');
  const load = useCallback(() => getCustomerActivity(customer.id), [customer.id]);
  const data = useData(load);
  const outstanding = data.data?.outstanding.find(item => item.id === sale);
  const money = formatMoney(shop.currency);
  return <Dialog title={`Record collection · ${customer.name}`} close={close}>
    <LoadError message={data.error} retry={data.reload} />
    <DialogForm onSave={form => recordCollection(id, customer.id, form)} onSaved={() => saved(Number(amount))} submit="Record collection">
      <label className="pos-field">On-account sale<select name="sale" required value={sale}
        onChange={event => { setSale(event.target.value); setAmount(''); }}>
        <option value="">{data.loading ? 'Loading sales…' : 'Select a sale'}</option>
        {data.data?.outstanding.map(item => <option key={item.id} value={item.id}>{item.sale_number} · {money(item.total_amount - item.amount_paid)}</option>)}
      </select></label>
      <label className="pos-field">Amount received<input name="amount" type="number" step=".01" min=".01"
        max={outstanding ? (outstanding.total_amount - outstanding.amount_paid).toFixed(2) : undefined}
        value={amount} onChange={event => setAmount(event.target.value)} required /></label>
      <label className="pos-field">Payment method<select name="method" value={method} onChange={event => setMethod(event.target.value)}>
        <option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Card</option>
      </select></label>
      {method !== 'cash' && <label className="pos-field">Payment reference<input name="reference" required maxLength={120} /></label>}
    </DialogForm>
  </Dialog>;
}
