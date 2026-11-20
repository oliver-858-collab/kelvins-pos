import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { UserStatus } from '../../../types';

interface StaffProfile {
  id: string;
  full_name: string;
  email: string;
  account_status: UserStatus;
  role_id: string | null;
}

interface StaffRole {
  id: string;
  name: string;
  role_type: string;
}

export default function StaffAccess({ adminId }: { adminId: string }) {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const [staff, availableRoles] = await Promise.all([
          supabase.from('users').select('id,full_name,email,account_status,role_id')
            .eq('is_deleted', false).order('created_at', { ascending: false }),
          supabase.from('roles').select('id,name,role_type').in('role_type', ['manager', 'cashier', 'storekeeper', 'custom']).order('name'),
        ]);
        if (staff.error || availableRoles.error) throw staff.error ?? availableRoles.error;
        if (ignore) return;
        setProfiles(staff.data ?? []);
        setRoles((availableRoles.data ?? []).map(role =>
          role.role_type === 'custom' && role.name === 'Custom Role' ? { ...role, name: 'Employee' } : role));
      } catch {
        if (!ignore) setError('Could not load staff accounts. Reload to try again.');
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => { ignore = true; };
  }, []);

  async function update(profile: StaffProfile, status: 'active' | 'suspended') {
    if (busy || profile.id === adminId) return;
    const roleId = selected[profile.id] ?? profile.role_id;
    if (status === 'active' && !roles.some((role) => role.id === roleId)) return;
    setBusy(profile.id);
    setMessage('');
    setError('');
    try {
      const changes = status === 'active'
        ? { account_status: status, role_id: roleId, approved_by: adminId, approved_at: new Date().toISOString() }
        : { account_status: status };
      const { data, error: updateError } = await supabase.from('users').update(changes)
        .eq('id', profile.id).eq('account_status', profile.account_status)
        .select('id,full_name,email,account_status,role_id').single();
      if (updateError) throw updateError;
      setProfiles((previous) => previous.map((entry) => entry.id === data.id ? data : entry));
      setMessage(`${profile.full_name} is now ${status}.`);
    } catch {
      setError('Could not update staff access. Reload and try again.');
    } finally {
      setBusy(undefined);
    }
  }

  return <section className="demo-card mt-6 p-5">
    <h2 className="demo-subtitle">Staff access</h2>
    <p className="mt-1 text-sm text-slate-600">Staff can request access from the sign-in screen. Confirmed requests appear here.</p>
    {loading && <p role="status" className="mt-4 text-sm text-slate-600">Loading staff…</p>}
    {message && <p role="status" className="mt-4 text-sm text-teal-800">{message}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
    <ul className="mt-3 divide-y divide-slate-200">{profiles.map((profile) => {
      const role = roles.find((entry) => entry.id === profile.role_id);
      const canManage = profile.id !== adminId && (profile.role_id === null || Boolean(role));
      const selectedRole = selected[profile.id] ?? role?.id ?? '';
      return <li key={profile.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div><p className="font-medium">{profile.full_name}</p>
          <p className="text-sm text-slate-600">{profile.email} · {profile.account_status}{role && ` · ${role.name}`}</p></div>
        {canManage && <div className="flex flex-wrap items-center gap-2">
          <select aria-label={`Role for ${profile.full_name}`} value={selectedRole} disabled={Boolean(busy)}
            onChange={(event) => setSelected({ ...selected, [profile.id]: event.target.value })}
            className="rounded-lg border border-slate-300 bg-white p-2 text-sm">
            <option value="">Select role</option>
            {roles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
          <button className="demo-button" disabled={Boolean(busy) || !selectedRole || (profile.account_status === 'active' && selectedRole === profile.role_id)}
            onClick={() => void update(profile, 'active')}>{profile.account_status === 'active' ? 'Save role' : 'Approve access'}</button>
          {profile.account_status === 'active' && <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            disabled={Boolean(busy)} onClick={() => void update(profile, 'suspended')}>Suspend</button>}
        </div>}
      </li>;
    })}</ul>
  </section>;
}
