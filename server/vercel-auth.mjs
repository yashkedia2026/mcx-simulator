import { createClient } from '@supabase/supabase-js';

let supabase;

function getSupabase() {
  if (supabase !== undefined) return supabase;
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
  supabase = url && key ? createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) : null;
  return supabase;
}

export async function requireSupabaseUser(req) {
  const authorization = req.headers?.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return { error: { status: 401, body: { error: 'Sign in to use live market data.', code: 'UNAUTHORIZED' } } };

  const client = getSupabase();
  if (!client) return { error: { status: 503, body: { error: 'Supabase authentication is not configured on the server.', code: 'AUTH_NOT_CONFIGURED' } } };

  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) return { error: { status: 401, body: { error: 'Your session has expired. Sign in again.', code: 'UNAUTHORIZED' } } };
  return { user: data.user };
}
