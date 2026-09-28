// Supabase: the same project the apps use — sign-in, the player's profile
// row, the daily and ranked boards, premium grants and the Realtime channel
// parties ride on. supabase-js comes from the CDN; nothing here needs a build.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

export const SUPABASE_URL = 'https://ytqjphkydvzpfecbehko.supabase.co';
export const SUPABASE_ANON = 'sb_publishable_peO3Uwcw4z_nwGDZ2iRE8g_pE0uGY0X';

const GUEST_KEY = 'songspot.guestRefresh';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'songspot.auth' } });

/** Which OAuth providers are set up for the web (a provider with no client secret answers 400). */
const providerCache = {};
export async function providerReady(provider) {
  if (provider in providerCache) return providerCache[provider];
  const p = (async () => {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(location.origin + '/')}`, { headers: { apikey: SUPABASE_ANON }, redirect: 'manual' });
      return r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400);
    } catch (e) { return false; }
  })();
  providerCache[provider] = p;
  return p;
}

export const auth = {
  async user() { const { data } = await supabase.auth.getUser(); return data.user || null; },
  async session() { const { data } = await supabase.auth.getSession(); return data.session || null; },
  async token() { const s = await this.session(); return s?.access_token || null; },
  /** A guest keeps their id (and anything bought on it) by linking the provider; a returning player signs in. */
  async signInWith(provider, returning = false) {
    const options = { redirectTo: location.origin + location.pathname, queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined };
    const s = await this.session();
    if (!returning && s?.user?.is_anonymous) {
      const r = await supabase.auth.linkIdentity({ provider, options }).catch(e => ({ error: e }));
      if (!r?.error) return r;
    }
    // Signing in lands on a different account than the guest one; keep the
    // guest's key so its daily can be handed over once we're back.
    if (s?.user?.is_anonymous && s.refresh_token) { try { localStorage.setItem(GUEST_KEY, s.refresh_token); } catch (e) {} }
    return supabase.auth.signInWithOAuth({ provider, options });
  },
  /**
   * After a sign-in that left a guest account behind: as that guest, hand its
   * premium (bought before making a profile) and its daily results to `toId`.
   * Once, then the key is gone.
   */
  async handOverGuest(toId) {
    let refresh = null;
    try { refresh = localStorage.getItem(GUEST_KEY); localStorage.removeItem(GUEST_KEY); } catch (e) {}
    if (!refresh || !toId) return;
    try {
      const h = { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' };
      const t = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: h, body: JSON.stringify({ refresh_token: refresh }) }).then(r => r.ok ? r.json() : null);
      if (!t?.access_token || t.user?.id === toId) return;
      const as = { method: 'POST', headers: { ...h, Authorization: `Bearer ${t.access_token}` }, body: JSON.stringify({ p_to: toId }) };
      // Premium bought as a guest, then the daily: both follow the player to the account they signed in to.
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/hand_over_premium`, as);
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/hand_over_daily`, as);
    } catch (e) {}
  },
  /** A guest account: a real user id with no email, so boards and premium have somewhere to live. */
  async ensureGuest() {
    const s = await this.session(); if (s?.user) return s.user;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    return data.user;
  },
  signOut() { return supabase.auth.signOut(); },
  onChange(fn) { return supabase.auth.onAuthStateChange((_e, s) => fn(s)); },
};

/** The profiles table: display_name, avatar (base64 jpeg), stats (json), created_at — one row per user. */
export const profiles = {
  async fetch(userId) {
    const { data, error } = await supabase.from('profiles').select('display_name, avatar, stats, created_at').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async save(userId, displayName, avatar, stats) {
    return supabase.from('profiles').upsert({ id: userId, display_name: displayName, avatar, stats, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  },
  async deleteAccount() {
    const t = await auth.token();
    const r = await fetch(SUPABASE_URL + '/functions/v1/delete-account', { method: 'POST', headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + t } });
    if (!r.ok) throw new Error('delete ' + r.status);
  },
};

export const config = {
  /** app_config: live knobs, e.g. ranked_bot_skill. */
  async get(key, fallback) {
    try { const { data } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle(); return data?.value ?? fallback; } catch (e) { return fallback; }
  },
};

export const premium = {
  /** An active premium_grants row for this account (Stripe, App Store, or given by hand). */
  async has() {
    try {
      const { data, error } = await supabase.rpc('my_premium');
      if (!error && data) return !!data.premium;
    } catch (e) {}
    try {
      const u = await auth.user(); if (!u) return false;
      const { data } = await supabase.from('premium_grants').select('user_id').eq('user_id', u.id).maybeSingle();
      return !!data;
    } catch (e) { return false; }
  },
};
