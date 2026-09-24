// Supabase: the same project the apps use. Google sign-in, the player's
// profile row, ranked results and the boards, and the Realtime channel the
// party rides on. supabase-js comes from the CDN; nothing here needs a build.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://ytqjphkydvzpfecbehko.supabase.co';
export const SUPABASE_ANON = 'sb_publishable_peO3Uwcw4z_nwGDZ2iRE8g_pE0uGY0X';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

export const auth = {
  async user() { const { data } = await supabase.auth.getUser(); return data.user || null; },
  async session() { const { data } = await supabase.auth.getSession(); return data.session || null; },
  signInWithGoogle() {
    return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/play/', queryParams: { prompt: 'select_account' } } });
  },
  signOut() { return supabase.auth.signOut(); },
  onChange(fn) { return supabase.auth.onAuthStateChange((_e, s) => fn(s)); },
};

/** The profiles table: display_name, avatar (base64 jpeg), stats (json), created_at — one row per user. */
export const profiles = {
  async fetch(userId) {
    const { data } = await supabase.from('profiles').select('display_name, avatar, stats, created_at').eq('id', userId).maybeSingle();
    return data;
  },
  async save(userId, displayName, avatar, stats) {
    return supabase.from('profiles').upsert({ id: userId, display_name: displayName, avatar, stats, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  },
  async deleteAccount() {
    // The apps call an edge function that deletes the auth user and its row.
    const { data: s } = await supabase.auth.getSession();
    return fetch(SUPABASE_URL + '/functions/v1/delete-account', { method: 'POST', headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + s?.session?.access_token } });
  },
};

export const ranked = {
  /** Bank a finished match. Fire and forget. */
  post(userId, points, score, won, name, avatar) {
    return supabase.from('ranked_results').insert({ user_id: userId, points, score, won, display_name: name.slice(0, 20), avatar });
  },
  async board(days) {
    const { data, error } = await supabase.rpc('ranked_board', { window_days: days });
    if (error) throw error;
    return data;
  },
};

export const premium = {
  /** A grant written by Stripe's webhook (or by hand) switches premium on for the account. */
  async has(userId) {
    if (!userId) return false;
    const { data } = await supabase.from('premium_grants').select('user_id').eq('user_id', userId).maybeSingle();
    return !!data;
  },
};
