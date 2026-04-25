import { createClient } from '@supabase/supabase-js';

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY — auth will be disabled.',
  );
}

export const supabase = createClient(SUPABASE_URL ?? 'https://invalid.supabase.co', SUPABASE_KEY ?? 'invalid', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'hoki_sb_session',
  },
});

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
