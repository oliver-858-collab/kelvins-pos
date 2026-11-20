// ============================================================
// Kelvin's POS System – Services API Service
// ============================================================

import { supabase } from '../lib/supabase';
import type { Service, ServiceJob } from '../types';

// ─── Extended types ───────────────────────────────────────────

export type PricingType = 'fixed' | 'hourly' | 'per_unit' | 'quote_based';
export type ServiceJobStatus = 'quoted' | 'accepted' | 'in_progress' | 'completed' | 'paid';

export interface ServiceCategory {
  id: string;
  name: string;
  description?: string;
  shop_id: string;
  created_at: string;
}

export interface ServiceExtended extends Service {
  category_id?: string;
  category?: ServiceCategory;
  pricing_type: PricingType;
  minimum_price?: number;
  duration_estimate?: number; // minutes
  image_urls?: string[];
  assigned_staff?: string[]; // employee ids
}

export interface NegotiationEntry {
  id: string;
  job_id: string;
  offered_by: 'staff' | 'customer';
  amount: number;
  note?: string;
  created_at: string;
}

export interface ServiceJobExtended extends Omit<ServiceJob, 'status'> {
  job_number: string;
  status: ServiceJobStatus;
  initial_quote: number;
  agreed_price?: number;
  minimum_price?: number;
  below_minimum_approval_id?: string;
  deposit_paid?: number;
  balance_due?: number;
  negotiation_history?: NegotiationEntry[];
  attachments?: string[];
  notes?: string;
  time_started?: string;
  time_completed?: string;
}

export interface CreateServicePayload {
  name: string;
  description?: string;
  category_id?: string;
  pricing_type: PricingType;
  price: number;
  minimum_price?: number;
  estimated_duration?: number;
  image_urls?: string[];
  assigned_staff?: string[];
  is_active?: boolean;
  shop_id: string;
}

export interface UpdateServicePayload extends Partial<CreateServicePayload> {
  id: string;
}

export interface CreateServiceJobPayload {
  service_id: string;
  customer_id?: string;
  technician_id?: string;
  description: string;
  initial_quote: number;
  notes?: string;
  shop_id: string;
}

export interface UpdateServiceJobPayload {
  id: string;
  status?: ServiceJobStatus;
  agreed_price?: number;
  deposit_paid?: number;
  notes?: string;
  technician_id?: string;
  time_started?: string;
  time_completed?: string;
  attachments?: string[];
}

export interface ServiceJobFilters {
  status?: ServiceJobStatus;
  technician_id?: string;
  date_from?: string;
  date_to?: string;
  shop_id: string;
}

// ─── Service Categories ───────────────────────────────────────

export async function fetchServiceCategories(shop_id: string): Promise<ServiceCategory[]> {
  const { data, error } = await supabase
    .from('service_categories')
    .select('*')
    .eq('shop_id', shop_id)
    .order('name');
  if (error) throw error;
  return data as ServiceCategory[];
}

export async function createServiceCategory(payload: Omit<ServiceCategory, 'id' | 'created_at'>): Promise<ServiceCategory> {
  const { data, error } = await supabase
    .from('service_categories')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as ServiceCategory;
}

// ─── Services ─────────────────────────────────────────────────

export async function fetchServices(shop_id: string, filters?: {
  category_id?: string;
  pricing_type?: PricingType;
  is_active?: boolean;
  assigned_staff?: string;
}): Promise<ServiceExtended[]> {
  let query = supabase
    .from('services')
    .select('*, category:service_categories(*)')
    .eq('shop_id', shop_id)
    .order('name');

  if (filters?.category_id) query = query.eq('category_id', filters.category_id);
  if (filters?.pricing_type) query = query.eq('pricing_type', filters.pricing_type);
  if (filters?.is_active !== undefined) query = query.eq('is_active', filters.is_active);

  const { data, error } = await query;
  if (error) throw error;
  return data as ServiceExtended[];
}

export async function fetchServiceById(id: string): Promise<ServiceExtended> {
  const { data, error } = await supabase
    .from('services')
    .select('*, category:service_categories(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as ServiceExtended;
}

export async function createService(payload: CreateServicePayload): Promise<ServiceExtended> {
  const { data, error } = await supabase
    .from('services')
    .insert(payload)
    .select('*, category:service_categories(*)')
    .single();
  if (error) throw error;
  return data as ServiceExtended;
}

export async function updateService(payload: UpdateServicePayload): Promise<ServiceExtended> {
  const { id, ...rest } = payload;
  const { data, error } = await supabase
    .from('services')
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, category:service_categories(*)')
    .single();
  if (error) throw error;
  return data as ServiceExtended;
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await supabase.from('services').delete().eq('id', id);
  if (error) throw error;
}

export async function toggleServiceActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase
    .from('services')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ─── Service Jobs ─────────────────────────────────────────────

export async function fetchServiceJobs(filters: ServiceJobFilters): Promise<ServiceJobExtended[]> {
  let query = supabase
    .from('service_jobs')
    .select(`
      *,
      service:services(*),
      customer:customers(*),
      technician:employees(*, user:users(*)),
      negotiation_history:service_job_negotiations(*)
    `)
    .eq('shop_id', filters.shop_id)
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.technician_id) query = query.eq('technician_id', filters.technician_id);
  if (filters.date_from) query = query.gte('created_at', filters.date_from);
  if (filters.date_to) query = query.lte('created_at', filters.date_to);

  const { data, error } = await query;
  if (error) throw error;
  return data as ServiceJobExtended[];
}

export async function fetchServiceJobById(id: string): Promise<ServiceJobExtended> {
  const { data, error } = await supabase
    .from('service_jobs')
    .select(`
      *,
      service:services(*),
      customer:customers(*),
      technician:employees(*, user:users(*)),
      negotiation_history:service_job_negotiations(*),
      attachments:service_job_attachments(*)
    `)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as ServiceJobExtended;
}

export async function createServiceJob(payload: CreateServiceJobPayload): Promise<ServiceJobExtended> {
  const jobNumber = `JOB-${Date.now().toString(36).toUpperCase()}`;
  const { data, error } = await supabase
    .from('service_jobs')
    .insert({ ...payload, job_number: jobNumber, status: 'quoted' })
    .select(`*, service:services(*), customer:customers(*)`)
    .single();
  if (error) throw error;
  return data as ServiceJobExtended;
}

export async function updateServiceJob(payload: UpdateServiceJobPayload): Promise<ServiceJobExtended> {
  const { id, ...rest } = payload;
  const { data, error } = await supabase
    .from('service_jobs')
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(`*, service:services(*), customer:customers(*), technician:employees(*, user:users(*))`)
    .single();
  if (error) throw error;
  return data as ServiceJobExtended;
}

export async function addNegotiationEntry(
  job_id: string,
  offered_by: 'staff' | 'customer',
  amount: number,
  note?: string,
): Promise<NegotiationEntry> {
  const { data, error } = await supabase
    .from('service_job_negotiations')
    .insert({ job_id, offered_by, amount, note })
    .select()
    .single();
  if (error) throw error;
  return data as NegotiationEntry;
}

export async function recordDeposit(job_id: string, amount: number): Promise<void> {
  const { data: job, error: fetchErr } = await supabase
    .from('service_jobs')
    .select('deposit_paid, agreed_price')
    .eq('id', job_id)
    .single();
  if (fetchErr) throw fetchErr;
  const newDeposit = (job.deposit_paid ?? 0) + amount;
  const balanceDue = (job.agreed_price ?? 0) - newDeposit;
  const { error } = await supabase
    .from('service_jobs')
    .update({ deposit_paid: newDeposit, balance_due: balanceDue, updated_at: new Date().toISOString() })
    .eq('id', job_id);
  if (error) throw error;
}

export async function uploadJobAttachment(job_id: string, file: File, shop_id: string): Promise<string> {
  const path = `${shop_id}/service-jobs/${job_id}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file);
  if (uploadError) throw uploadError;
  const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path);
  const { error } = await supabase
    .from('service_job_attachments')
    .insert({ job_id, url: publicUrl, name: file.name });
  if (error) throw error;
  return publicUrl;
}
