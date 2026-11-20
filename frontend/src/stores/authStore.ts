import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { authService } from '../services/authService';
import type { Permission, Role, User } from '../types';

interface AuthState {
  user: User | null;
  role: Role | null;
  permissions: Permission[];
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  recovery: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithPin: (pin: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  hasPermission: (module: string, action: string) => boolean;
  checkSession: () => Promise<void>;
}

const signedOut = {
  user: null, role: null, permissions: [], session: null, isLoading: false, isAuthenticated: false, recovery: false,
};

async function readProfile(session: Session) {
  const profile = await authService.getProfile(session.user.id);
  if (profile.status === 'pending') throw new Error('ACCOUNT_PENDING');
  if (profile.status !== 'active') throw new Error('ACCOUNT_SUSPENDED');
  if (!profile.role) throw new Error('ROLE_MISSING');
  return {
    session, user: profile, role: profile.role, permissions: profile.role.permissions,
    isAuthenticated: true, isLoading: false, recovery: false,
  };
}

function isAccountError(error: unknown) {
  return error instanceof Error && ['PROFILE_MISSING', 'ACCOUNT_PENDING', 'ACCOUNT_SUSPENDED', 'ROLE_MISSING'].includes(error.message);
}

export const useAuthStore = create<AuthState>((set, get) => {
  let generation = 0;

  async function loginFrom(authenticate: () => Promise<{ session: Session | null }>) {
    const attempt = ++generation;
    set({ isLoading: true });
    try {
      const { session } = await authenticate();
      if (!session) throw new Error('Authentication failed');
      const authenticated = await readProfile(session);
      if (attempt === generation) {
        set(authenticated);
        void authService.logLoginHistory(session.user.id).catch(() => {});
      }
    } catch (error) {
      if (attempt === generation) {
        if (isAccountError(error)) await authService.logout().catch(() => {});
        set(signedOut);
      }
      throw error;
    }
  }

  return {
    ...signedOut,
    isLoading: true,
    login: (email, password) => loginFrom(() => authService.login(email, password)),
    loginWithPin: pin => loginFrom(() => authService.loginWithPin(pin)),
    logout: async () => {
      ++generation;
      set({ isLoading: true });
      try {
        await authService.logout();
      } finally {
        set(signedOut);
      }
    },
    updateProfile: async data => {
      const { user } = get();
      if (!user) return;
      const updated = await authService.updateProfile(user.id, data);
      if (get().user?.id === user.id) set({ user: { ...user, ...updated } });
    },
    hasPermission: (module, action) => {
      const { role, permissions } = get();
      return role?.name === 'admin' || role?.name === 'super_admin'
        || permissions.some(permission => permission.module === module && permission.action === action);
    },
    checkSession: async () => {
      const attempt = ++generation;
      set({ isLoading: true });
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (attempt !== generation) return;
        if (!data.session) {
          set(signedOut);
          return;
        }
        if (get().recovery) {
          set({ ...signedOut, session: data.session, recovery: true });
          return;
        }
        const authenticated = await readProfile(data.session);
        if (attempt === generation) set(authenticated);
      } catch (error) {
        if (attempt !== generation) return;
        if (isAccountError(error)) await authService.logout().catch(() => {});
        set(signedOut);
      }
    },
  };
});

supabase.auth.onAuthStateChange((event, session) => {
  // The library holds its internal lock during this callback.
  if (event === 'PASSWORD_RECOVERY' && session) {
    useAuthStore.setState({ ...signedOut, session, recovery: true });
  } else if (event === 'SIGNED_OUT') {
    useAuthStore.setState(signedOut);
  } else if (event === 'TOKEN_REFRESHED' && session) {
    useAuthStore.setState({ session });
  } else if (event === 'SIGNED_IN' && session) {
    const state = useAuthStore.getState();
    if (!state.isAuthenticated && !state.isLoading && !state.recovery) {
      setTimeout(() => {
        const current = useAuthStore.getState();
        if (!current.isAuthenticated && !current.isLoading && !current.recovery) void current.checkSession();
      }, 0);
    }
  }
});
