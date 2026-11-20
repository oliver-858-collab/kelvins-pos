import { useState } from 'react';
import { Plus, Store } from 'lucide-react';
import { formText, nullableText } from '../../lib/business';
import { supabase } from '../../lib/supabase';
import type { Shop } from '../../services/checkoutService';
import { Dialog, DialogForm, Empty, LoadError, useData } from './WorkspaceUI';

type Location = { id: string; name: string; address: string | null; phone: string | null; is_active: boolean; is_main: boolean };
async function getLocations() {
  const { data, error } = await supabase.from('branches').select('id,name,address,phone,is_active,is_main').order('name').returns<Location[]>();
  if (error) throw error;
  return data;
}

export default function Settings({ shop, onChange }: { shop: Shop; onChange: () => void }) {
  const locations = useData(getLocations);
  const [location, setLocation] = useState<Location | 'new'>();
  const [locationId, setLocationId] = useState('');
  const [receipt, setReceipt] = useState(false);
  const [notice, setNotice] = useState('');
  const active = locations.data?.filter(item => item.is_active).length ?? 0;

  function open(value: Location | 'new') {
    setLocation(value);
    setLocationId(typeof value === 'string' ? crypto.randomUUID() : value.id);
  }

  return <>
    <div className="pos-heading"><div><h1>Workspace settings</h1><p>Manage locations and the business details printed on receipts.</p></div></div>
    <LoadError message={locations.error} retry={locations.reload} />
    {notice && <p className="pos-success" role="status">{notice}</p>}
    <div className="pos-split-panels">
      <section className="pos-panel"><div className="pos-panel-bar"><h2><Store size={19} /> Branches</h2>
        <button className="pos-primary" onClick={() => open('new')}><Plus size={17} /> Add branch</button></div>
        {locations.data?.length ? <ul className="pos-simple-list">{locations.data.map(item => <li key={item.id}>
          <div><strong>{item.name}</strong><small>{item.address || item.phone || (item.is_main ? 'Main branch' : '')}</small></div>
          <div className="pos-row-actions"><span className={`pos-badge ${item.is_active ? 'pos-tone-good' : 'pos-tone-neutral'}`}>{item.is_active ? 'Active' : 'Inactive'}</span>
            <button className="pos-secondary" onClick={() => open(item)}>Edit</button></div>
        </li>)}</ul> : <Empty>{locations.loading ? 'Loading locations…' : 'No branches yet.'}</Empty>}
      </section>
      <section className="pos-panel"><div className="pos-panel-bar"><h2>Receipt information</h2>
        <button className="pos-secondary" onClick={() => setReceipt(true)}>Edit details</button></div>
        <ul className="pos-simple-list">
          <li>Business name<strong>{shop.shop_name}</strong></li>
          <li>Address<strong>{[shop.address, shop.city].filter(Boolean).join(', ') || '—'}</strong></li>
          <li>Telephone<strong>{shop.phone || '—'}</strong></li>
          <li>Tax PIN<strong>{shop.kra_pin || shop.tax_pin || '—'}</strong></li>
        </ul>
      </section>
    </div>
    {location && <Dialog title={location === 'new' ? 'Add branch' : 'Edit branch'} close={() => setLocation(undefined)}>
      <DialogForm onSave={async form => {
        const enabled = form.get('active') === 'on';
        if (!enabled && location !== 'new' && location.is_active && active <= 1) throw new Error('Keep at least one branch active.');
        const { error } = await supabase.from('branches').upsert({
          id: locationId, name: formText(form, 'name'), address: nullableText(form, 'address'), phone: nullableText(form, 'phone'), is_active: enabled,
        }).select('id').single();
        if (error) throw error;
      }} onSaved={() => { setLocation(undefined); setNotice('Branch saved.'); locations.reload(); onChange(); }}>
        <label className="pos-field">Branch name<input name="name" maxLength={120} required defaultValue={location === 'new' ? '' : location.name} /></label>
        <label className="pos-field">Address<input name="address" maxLength={300} defaultValue={location === 'new' ? '' : location.address ?? ''} /></label>
        <label className="pos-field">Phone<input type="tel" name="phone" maxLength={50} defaultValue={location === 'new' ? '' : location.phone ?? ''} /></label>
        <label className="pos-check"><input type="checkbox" name="active" defaultChecked={location === 'new' || location.is_active} /> Active branch</label>
      </DialogForm>
    </Dialog>}
    {receipt && <Dialog title="Edit receipt information" close={() => setReceipt(false)} wide>
      <DialogForm onSave={async form => {
        const { error } = await supabase.from('shop_settings').update({
          shop_name: formText(form, 'name'), address: nullableText(form, 'address'), city: nullableText(form, 'city'),
          phone: nullableText(form, 'phone'), kra_pin: nullableText(form, 'pin'), receipt_header: nullableText(form, 'header'),
          receipt_footer: nullableText(form, 'footer'), receipt_show_tax: form.get('tax') === 'on',
        }).eq('id', shop.id).select('id').single();
        if (error) throw error;
      }} onSaved={() => { setReceipt(false); setNotice('Receipt information saved.'); onChange(); }}>
        <div className="pos-form-grid">
          <label className="pos-field pos-span-2">Business name<input name="name" required maxLength={120} defaultValue={shop.shop_name} /></label>
          <label className="pos-field pos-span-2">Address<input name="address" maxLength={300} defaultValue={shop.address ?? ''} /></label>
          <label className="pos-field">City<input name="city" maxLength={100} defaultValue={shop.city ?? ''} /></label>
          <label className="pos-field">Phone<input name="phone" type="tel" maxLength={50} defaultValue={shop.phone ?? ''} /></label>
          <label className="pos-field">Tax PIN<input name="pin" maxLength={40} defaultValue={shop.kra_pin || shop.tax_pin || ''} /></label>
          <label className="pos-field pos-span-2">Receipt header<textarea name="header" rows={2} maxLength={250} defaultValue={shop.receipt_header ?? ''} /></label>
          <label className="pos-field pos-span-2">Receipt footer<textarea name="footer" rows={2} maxLength={250} defaultValue={shop.receipt_footer ?? ''} /></label>
          <label className="pos-check"><input name="tax" type="checkbox" defaultChecked={shop.receipt_show_tax} /> Include tax breakdown</label>
        </div>
      </DialogForm>
    </Dialog>}
  </>;
}
