import { supabase } from '../lib/supabase';
import type { User, Role, Permission } from '../types';

// ------------------------------------------------------------------
// Auth API helpers
// ------------------------------------------------------------------

export const authService = {
  /**
   * Sign in with email + password.
   */
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw error;
    return data;
  },

  /**
   * Sign in using a 4-digit PIN.
   * PIN lookup works by hashing the PIN and querying the users table.
   * Server-side RPC handles the hash comparison.
   */
  async loginWithPin(pin: string) {
    const { data, error } = await supabase.rpc('login_with_pin', { pin_input: pin });
    if (error) throw error;
    if (!data?.email) throw new Error('Invalid PIN');

    // Exchange the email for a magic link / session via admin-side RPC
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.temp_token,
    });
    if (authError) throw authError;
    return authData;
  },

  /**
   * Sign out the current user.
   */
  async logout() {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  },

  /**
   * Register a new user (self-registration, status = pending).
   */
  async register(email: string, password: string, fullName: string) {
    const { error } = await supabase.functions.invoke('register-staff', {
      body: { email: email.trim().toLowerCase(), password, name: fullName },
    });
    if (!error) return;
    if (error.context instanceof Response) {
      const detail = await error.context.json().catch(() => null);
      throw Object.assign(new Error('Registration failed'), { code: detail?.code, status: error.context.status });
    }
    throw error;
  },

  /**
   * Send a password reset email.
   */
  async resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  },

  /**
   * Update the authenticated user's password.
   */
  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  /**
   * Fetch the full user profile (joined with role + permissions).
   */
  async getProfile(userId: string): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id, email, full_name, phone, avatar_url, role_id, account_status, created_at, updated_at,
        role:roles(id, name, role_type, permissions)
      `)
      .eq('id', userId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('PROFILE_MISSING');

    const { account_status, role: joinedRole, ...profile } = data;
    const rawRole = joinedRole as unknown as {
      id: string;
      name: string;
      role_type: Role['name'];
      permissions: Record<string, Record<string, boolean>>;
    } | null;
    const permissions: Permission[] = Object.entries(rawRole?.permissions ?? {}).flatMap(
      ([module, actions]) => Object.entries(actions)
        .filter(([, allowed]) => allowed === true)
        .map(([action]) => ({ id: `${module}.${action}`, module, action })),
    );
    const role = rawRole && {
      id: rawRole.id,
      name: rawRole.role_type,
      display_name: rawRole.name,
      permissions,
    };

    return { ...profile, status: account_status, role: role ?? undefined };
  },

  /**
   * Update the current user's profile.
   */
  async updateProfile(userId: string, updates: Partial<User>) {
    const { data, error } = await supabase
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data as User;
  },

  /**
   * Fetch all roles (admin use).
   */
  async getRoles(): Promise<Role[]> {
    const { data, error } = await supabase.from('roles').select('*, permissions:role_permissions(permission:permissions(*))');
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      ...r,
      permissions: (r.permissions ?? []).map((rp: any) => rp.permission),
    })) as Role[];
  },

  /**
   * Fetch all available permissions.
   */
  async getPermissions(): Promise<Permission[]> {
    const { data, error } = await supabase.from('permissions').select('*');
    if (error) throw error;
    return (data ?? []) as Permission[];
  },

  /**
   * Log a successful login to the login_history table.
   */
  async logLoginHistory(userId: string) {
    await supabase.from('login_history').insert({
      user_id: userId,
      user_agent: navigator.userAgent,
    });
  },
};
