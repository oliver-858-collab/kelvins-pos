import { supabase } from '../lib/supabase';

export type AdminAuditEvent = {
  id: string; action: string; table_name: string; created_at: string;
  actor: { full_name: string } | null;
};

export async function getAdminAuditEvents() {
  const { data, error } = await supabase.from('audit_log')
    .select('id,action,table_name,created_at,actor:users(full_name)')
    .order('created_at', { ascending: false }).order('id').limit(12).returns<AdminAuditEvent[]>();
  if (error) throw error;
  return data;
}

export async function getPendingLeaveCount() {
  const { count, error } = await supabase.from('leave_requests')
    .select('id', { count: 'exact', head: true }).eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}
