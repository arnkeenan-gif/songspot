// Supabase: the same project the apps use — sign-in, the player's profile
// row, the daily and ranked boards, premium grants and the Realtime channel
// parties ride on. supabase-js comes from the CDN; nothing here needs a build.
//
// The server can be slow or down (28-29 Oct: the database starved, every
// request hung, and the page sat on a dead sign-in screen while it kept asking).
// So every request gets 10 s to answer, a refresh that failed holds the next
// one back (15 s, then 30, 60, 120), and a player whose session could not be
// refreshed is never sent out as a nobody. Rows the server didn't take wait in
// the outbox and go again later.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

export const SUPABASE_URL = 'https://ytqjphkydvzpfecbehko.supabase.co';
export const SUPABASE_ANON = 'sb_publishable_peO3Uwcw4z_nwGDZ2iRE8g_pE0uGY0X';

const GUEST_KEY = 'songspot.guestRefresh';
const AUTH_KEY = 'songspot.auth';
const OUTBOX_KEY = 'songspot.outbox';
/** How long a request gets before it is given up on. */
export const REQUEST_MS = 10000;

/** Waits that double on each failure, 15 s → 30 → 60 → 120 (the cap), and start over on success. */
export class Backoff {
  constructor(base = 15000, cap = 120000) { this.base = base; this.cap = cap; this.wait = base; }
  /** The wait before the next try; the one after that is longer. */
  next() { const w = this.wait; this.wait = Math.min(this.cap, this.wait * 2); return w; }
  reset() { this.wait = this.base; return this.base; }
  /** True while nothing has failed. */
  get calm() { return this.wait === this.base; }
}

/** The session as the browser holds it (what supabase-js keeps under storageKey), read without the network. */
function stored() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || null; } catch (e) { return null; } }
const expired = s => !!s && Number(s.expires_at || 0) * 1000 <= Date.now();

/**
 * The server as last seen. A refresh that failed (or any request that got no
 * answer) holds the next refresh back: supabase-js would otherwise try again
 * from every call that needs a token, and that was the flood of /token
 * requests in the auth log. Any answer lifts the hold.
 */
export const Reach = {
  _slow: new Backoff(15000), _until: 0,
  get held() { return Date.now() < this._until; },
  ok() { this._until = 0; this._slow.reset(); },
  fail() { if (this.held) return; this._until = Date.now() + this._slow.next(); },
};

/**
 * fetch with a 10 s limit and the hold above, handed to supabase-js for every
 * request it makes (auth, REST, functions). A caller's own signal still aborts.
 */
export async function timedFetch(input, init = {}) {
  const url = String(input instanceof Request ? input.url : input);
  const ours = url.startsWith(SUPABASE_URL), refresh = url.startsWith(SUPABASE_URL + '/auth/v1/token');
  if (ours) {
    // No refresh while one has just failed. supabase-js keeps the session on a dropped request, so nothing is lost.
    if (refresh && Reach.held) throw new TypeError('Songspot: refresh held back');
    // A request about to go out with the anon key while this browser holds a session it could not refresh (a
    // guest's or a player's) stays here: as a nobody it would read nothing, or sign up a second guest.
    const bearer = new Headers(init.headers || (input instanceof Request ? input.headers : undefined)).get('authorization');
    if (!refresh && bearer === 'Bearer ' + SUPABASE_ANON && expired(stored())) throw new TypeError('Songspot: session not refreshed');
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), REQUEST_MS);
  if (init.signal) { if (init.signal.aborted) ctl.abort(); else init.signal.addEventListener('abort', () => ctl.abort(), { once: true }); }
  try {
    const r = await fetch(input, { ...init, signal: ctl.signal });
    if (ours) { if (r.ok) Reach.ok(); else if (r.status >= 500) Reach.fail(); }
    return r;
  } catch (e) {
    if (ours) Reach.fail();
    throw e;
  } finally { clearTimeout(t); }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_KEY },
  // postgrest-js would send a dropped GET three more times by itself; the callers here pace their own retries.
  db: { retry: false },
  global: { fetch: timedFetch },
});

/**
 * Which OAuth providers are set up for the web (a provider with no client secret answers 400). Null when the
 * server gave no answer at all; that is asked again next time, an answer is kept.
 */
const providerCache = {};
export async function providerReady(provider) {
  if (provider in providerCache) return providerCache[provider];
  const p = (async () => {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(location.origin + '/')}`, { headers: { apikey: SUPABASE_ANON }, redirect: 'manual', signal: AbortSignal.timeout(REQUEST_MS) });
      return r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400);
    } catch (e) { delete providerCache[provider]; return null; }
  })();
  providerCache[provider] = p;
  return p;
}

export const auth = {
  async user() { const { data } = await supabase.auth.getUser(); return data.user || null; },
  async session() { const { data } = await supabase.auth.getSession(); return data.session || null; },
  async token() { const s = await this.session(); return s?.access_token || null; },
  /** The session this browser holds, as stored: no refresh, no network. Null when signed out. */
  stored() { const s = stored(); return s && s.user ? s : null; },
  /** The user of the stored session, so a returning player is known before the server answers (or doesn't). */
  cached() { return this.stored()?.user || null; },
  /** One small read through the database: can Songspot be reached right now? */
  async reachable() {
    try { const r = await timedFetch(`${SUPABASE_URL}/rest/v1/app_config?select=key&limit=1`, { headers: { apikey: SUPABASE_ANON } }); return r.ok; }
    catch (e) { return false; }
  },
  /** A guest keeps their id (and anything bought on it) by linking the provider; a returning player signs in. */
  async signInWith(provider, returning = false) {
    const options = { redirectTo: location.origin + location.pathname, queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined };
    const s = this.stored();
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
      const signal = AbortSignal.timeout(REQUEST_MS);
      const t = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: h, body: JSON.stringify({ refresh_token: refresh }), signal }).then(r => r.ok ? r.json() : null);
      if (!t?.access_token || t.user?.id === toId) return;
      const as = { method: 'POST', headers: { ...h, Authorization: `Bearer ${t.access_token}` }, body: JSON.stringify({ p_to: toId }), signal };
      // Premium bought as a guest, then the daily: both follow the player to the account they signed in to.
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/hand_over_premium`, as);
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/hand_over_daily`, as);
    } catch (e) {}
  },
  /**
   * A guest account: a real user id with no email, so boards and premium have somewhere to live. The one this
   * browser already holds comes first, refreshed or not: a second guest would strand the first one's play.
   */
  async ensureGuest() {
    const u = this.cached(); if (u) return u;
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
    const r = await fetch(SUPABASE_URL + '/functions/v1/delete-account', { method: 'POST', headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + t }, signal: AbortSignal.timeout(REQUEST_MS) });
    if (!r.ok) throw new Error('delete ' + r.status);
  },
};

/** How an insert went: 2xx or a duplicate landed; no answer, a 5xx or a 401 are worth another go; anything else was refused. */
export function outcome(res) {
  const { error, status } = res || {};
  if (!error || (status >= 200 && status < 300) || status === 409 || error.code === '23505') return 'landed';
  return !status || status >= 500 || status === 401 ? 'failed' : 'refused';
}

/**
 * Rows the server didn't take (a result posted into a timeout or a 5xx): kept
 * in this browser and sent again 30 s on, then 60, then 120, and on the next
 * open. A refused row (the policy said no) is dropped. The newest 50 are kept.
 */
export const outbox = {
  _slow: new Backoff(30000), _timer: 0, _sending: false,
  get rows() { try { const r = JSON.parse(localStorage.getItem(OUTBOX_KEY)); return Array.isArray(r) ? r : []; } catch (e) { return []; } },
  set rows(r) { try { if (r.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(r.slice(-50))); else localStorage.removeItem(OUTBOX_KEY); } catch (e) {} },
  /** Insert `row` into `table`; if the server gives no answer, it waits here. Resolves with the outcome. */
  async insert(table, row) {
    let o = 'failed';
    try { o = outcome(await supabase.from(table).insert(row)); } catch (e) {}
    if (o === 'failed') { this.rows = [...this.rows, { table, row }]; this.later(); }
    return o;
  },
  later(ms = this._slow.next()) { clearTimeout(this._timer); this._timer = setTimeout(() => this.flush(), ms); },
  /** Send what is waiting, oldest first. */
  async flush() {
    if (this._sending) return;
    this._sending = true; clearTimeout(this._timer);
    try {
      const left = [];
      for (const r of this.rows) {
        let o = 'failed';
        try { o = outcome(await supabase.from(r.table).insert(r.row)); } catch (e) {}
        if (o === 'failed') left.push(r);
      }
      this.rows = left;
      if (left.length) this.later(); else this._slow.reset();
    } finally { this._sending = false; }
  },
};
// The next open, and the connection coming back, send what waited.
if (outbox.rows.length) setTimeout(() => outbox.flush(), 5000);
window.addEventListener('online', () => { if (outbox.rows.length) outbox.later(2000); });

export const config = {
  /** app_config: live knobs, e.g. ranked_bot_skill. */
  async get(key, fallback) {
    try { const { data } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle(); return data?.value ?? fallback; } catch (e) { return fallback; }
  },
};

export const premium = {
  /** An active premium_grants row for this account (Stripe, App Store, or given by hand). Null when the server gave no answer, so what was last known stands. */
  async has() {
    try {
      const { data, error } = await supabase.rpc('my_premium');
      // forever: a grant with no end date (lifetime, or given by hand) - the profile shows plain "Premium", as iOS does for lifetime.
      if (!error && data) { this.forever = !!data.premium && data.expires_at == null; return !!data.premium; }
    } catch (e) {}
    try {
      const u = await auth.user(); if (!u) return null;
      const { data, error } = await supabase.from('premium_grants').select('user_id').eq('user_id', u.id).maybeSingle();
      return error ? null : !!data;
    } catch (e) { return null; }
  },
};
