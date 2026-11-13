import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/**
 * Supabase is optional at build time so the market-data development server can
 * still start before cloud credentials are configured. AuthGuard presents a
 * setup message instead of allowing an unauthenticated app when it is absent.
 */
export const isSupabaseConfigured = Boolean(url && key);
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, key)
  : null;
