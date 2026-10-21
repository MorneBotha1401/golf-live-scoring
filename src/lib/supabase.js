import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const supabase = configured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }, realtime: { params: { eventsPerSecond: 20 } } })
  : null;

// Turn a Supabase/Postgres error into a sentence for the screen.
export function errText(e) {
  if (!e) return '';
  const m = e.message || String(e);
  if (/row-level security|permission denied/i.test(m)) return "You don't have permission to do that.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No connection. Check your signal and try again.';
  return m.replace(/^.*?ERROR:\s*/, '');
}

export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: d2, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return d2.session;
}

export const isRealUser = (session) => !!session && !session.user?.is_anonymous;
