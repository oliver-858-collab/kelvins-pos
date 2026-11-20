import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

// ─── Defaults ─────────────────────────────────────────────────

const defaultShop = {
  id:        'default',
  name:      "Kelvin's Shop",
  address:   '',
  country:   'Kenya',
  phone:     '',
  currency:  import.meta.env.VITE_DEFAULT_CURRENCY ?? 'KES',
  timezone:  import.meta.env.VITE_DEFAULT_TIMEZONE ?? 'Africa/Nairobi',
  date_format: 'dd MMM yyyy',
  updated_at: new Date().toISOString(),
};

const defaultSettings = {
  id:   'default',
  shop: defaultShop,
  pos: {
    allow_negative_stock:              false,
    require_customer:                  false,
    default_tax_rate:                  16,
    enable_discounts:                  true,
    max_discount_percent:              30,
    require_discount_approval_above:   10,
    enable_loyalty_points:             false,
    loyalty_points_per_kes:            0.01,
    enable_hold_sales:                 true,
    receipt_auto_print:                false,
  },
  inventory: {
    low_stock_threshold: 10,
    auto_reorder:        false,
    track_expiry:        false,
    fifo_costing:        true,
  },
  notifications: {
    low_stock_alerts:   true,
    daily_summary:      true,
    approval_alerts:    true,
    whatsapp_enabled:   false,
    email_enabled:      true,
    sms_enabled:        false,
  },
  receipt: {
    show_logo:            true,
    show_tax_breakdown:   true,
    show_cashier_name:    true,
    show_customer_name:   true,
    paper_size:           '80mm',
  },
  updated_at: new Date().toISOString(),
};

// ─── State Shape ─────────────────────────────────────────────

type ShopProfile = typeof defaultShop;
type Settings = typeof defaultSettings;

interface SettingsState {
  settings: Settings;
  isLoading: boolean;
  isDirty: boolean;

  fetchSettings: () => Promise<void>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  updateShop: (updates: Partial<ShopProfile>) => Promise<void>;
  resetToDefaults: () => void;
}

// ─── Store ────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      (set, get) => ({
        settings:  defaultSettings,
        isLoading: false,
        isDirty:   false,

        fetchSettings: async () => {
          set({ isLoading: true });
          try {
            const { data, error } = await supabase
              .from('settings')
              .select('*')
              .single();

            if (error || !data) {
              // Use defaults if no settings row exists yet
              set({ isLoading: false });
              return;
            }

            set({ settings: data as Settings, isLoading: false, isDirty: false });
          } catch {
            set({ isLoading: false });
          }
        },

        updateSettings: async (updates) => {
          const merged = { ...get().settings, ...updates, updated_at: new Date().toISOString() };
          set({ settings: merged, isDirty: true });

          const { error } = await supabase
            .from('settings')
            .upsert(merged, { onConflict: 'id' });

          if (!error) set({ isDirty: false });
        },

        updateShop: async (updates) => {
          const shop = { ...get().settings.shop, ...updates };
          await get().updateSettings({ shop });
        },

        resetToDefaults: () => {
          set({ settings: defaultSettings, isDirty: false });
        },
      }),
      {
        name: 'kpos-settings',
        partialize: (state) => ({ settings: state.settings }),
      }
    ),
    { name: 'settingsStore' }
  )
);
