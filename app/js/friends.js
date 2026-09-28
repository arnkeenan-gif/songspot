// Friends.swift on the web: the list, who is online, and 1v1 challenges. One
// per page: the heartbeat runs every 15 s while the tab is visible and the
// player is signed in, and doubles as the check for incoming challenges (see
// heartbeat() in supabase/friends.sql). The same RPCs the iPhone app calls, so
// friends made on the phone are here and a web player can challenge an iPhone.
// Also here: ChallengeBanner / challengeOverlay, the card that drops in over
// whatever screen is up when a friend challenges you.
import { supabase } from './supabase.js';
import { el, esc, face, settings } from './ui.js';
import { I } from './icons.js';
import { Haptics } from './haptics.js';

/** Songbot: always there, always says yes. */
export const BOT = Object.freeze({ id: 'bot-songbot', name: 'Songbot', avatar: null, rating: 450, last_active: null, status: 'accepted', incoming: false });
export const isBot = f => f && f.id === BOT.id;
export const accepted = f => f.status === 'accepted';
/** The app beats every 15 seconds while open; a minute of silence is gone. */
export const isOnline = f => isBot(f) || (!!f.last_active && Date.now() - Date.parse(f.last_active) < 60000);
const rtf = (() => { try { return new Intl.RelativeTimeFormat('en', { style: 'short', numeric: 'always' }); } catch (e) { return null; } })();
/** "Online", "Seen 3 hr. ago" (RelativeDateTimeFormatter, .short) or "Offline". */
export function seenLabel(f) {
  if (isOnline(f)) return 'Online';
  if (!f.last_active || !rtf) return 'Offline';
  const s = (Date.parse(f.last_active) - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, n] of units) if (Math.abs(s) >= n) return 'Seen ' + rtf.format(Math.round(s / n), u);
  return 'Seen ' + rtf.format(Math.round(s), 'second');
}
/** A friend code from a link or the bare six characters (FriendLink.code(from:)). */
export function codeFrom(raw) {
  let s = String(raw || '').trim();
  try { const u = new URL(s); s = u.searchParams.get('c') || u.searchParams.get('add') || s; } catch (e) {}
  const c = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 6 ? c : null;
}
export const friendLink = code => `https://songspotapp.com/add?c=${code}`;

const BEAT_MS = 15000;
const PENDING_KEY = 'friends.pendingCode';

export const Friends = {
  list: [], code: null, loaded: false,
  /** The newest challenge nobody has answered yet. */
  incoming: null,
  account: null,
  /** Opens a 1v1: { name, bot, friendId } to host, or { join: code, name } to join. Set by app.js. */
  onLaunch: null,
  /** Screens that close when a 1v1 opens (the Friends sheet). */
  closers: new Set(),
  _dismissed: new Set(), _timer: 0, _listeners: new Set(), _beating: false,

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); },
  emit() { this._listeners.forEach(f => { try { f(this); } catch (e) { console.error(e); } }); },

  /** Songbot first, then online friends, then the rest (by name). */
  get friends() {
    const key = f => (isOnline(f) ? '0' : '1') + (f.name || '').toLowerCase();
    return [BOT, ...this.list.filter(accepted).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))];
  },
  get requests() { return this.list.filter(f => !accepted(f) && f.incoming); },
  get sent() { return this.list.filter(f => !accepted(f) && !f.incoming); },
  get onlineCount() { return this.friends.filter(f => isOnline(f) && !isBot(f)).length; },
  get signedIn() { return !!this.account?.signedIn; },
  /** True while a party or a ranked match is on screen, so a challenge can't stack a second one. */
  get inParty() { return !!document.querySelector('#views > .view.party.in, #views > .view.ranked.in'); },

  // ---- a code that arrived by link (/add?c= or ?add=), kept through a sign-in redirect for an hour ----
  get pendingCode() { const p = settings.get(PENDING_KEY, null); return p && Date.now() - (p.at || 0) < 3600e3 ? p.code : null; },
  set pendingCode(c) { if (c) settings.set(PENDING_KEY, { code: c, at: Date.now() }); else settings.del(PENDING_KEY); },

  // ---- heartbeat ----
  init(account) {
    this.account = account;
    mountBanner();
    let wasIn = this.signedIn;
    account.onChange(() => {
      const now = this.signedIn;
      if (now === wasIn) return;
      wasIn = now;
      if (now) { this.start(); this.refresh(); } else { this.stop(); this.signedOut(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); else this.start(); });
    if (this.signedIn) { this.start(); this.refresh(); }
  },
  start() {
    if (this._timer || document.hidden || !this.signedIn) return;
    this.beat();
    this._timer = setInterval(() => this.beat(), BEAT_MS);
  },
  stop() { clearInterval(this._timer); this._timer = 0; },
  async beat() {
    if (!this.signedIn || this._beating) return;
    this._beating = true;
    try {
      const { data, error } = await supabase.rpc('heartbeat');
      if (error || !Array.isArray(data)) return;
      const next = data.find(c => !this._dismissed.has(c.id)) || null;
      const shown = this.inParty ? null : next;
      if ((shown?.id ?? null) !== (this.incoming?.id ?? null)) { this.incoming = shown; this.emit(); }
    } catch (e) {} finally { this._beating = false; }
  },

  // ---- the list ----
  async refresh() {
    if (!this.signedIn) { this.list = []; this.loaded = true; this.emit(); return; }
    try { const { data, error } = await supabase.rpc('my_friends'); if (!error && Array.isArray(data)) this.list = data; } catch (e) {}
    if (!this.code) { try { const { data } = await supabase.rpc('my_friend_code'); if (data) this.code = data; } catch (e) {} }
    this.loaded = true;
    this.emit();
  },
  /** Returns what to tell the player. */
  async add(raw) {
    const c = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 6) return 'Friend codes are 6 characters.';
    let r;
    try { const { data, error } = await supabase.rpc('add_friend', { p_code: c }); if (error) throw error; r = data; }
    catch (e) { return "Couldn't reach the server. Try again."; }
    await this.refresh();
    return { requested: 'Request sent.', accepted: "You're now friends.", already: 'Already sent.', self: "That's your own code." }[r] || 'No player with that code.';
  },
  async respond(f, accept) {
    try { await supabase.rpc('respond_friend', { p_other: f.id, p_accept: !!accept }); } catch (e) {}
    await this.refresh();
  },
  async remove(f) {
    this.list = this.list.filter(x => x.id !== f.id); this.emit();
    try { await supabase.rpc('remove_friend', { p_other: f.id }); } catch (e) {}
    await this.refresh();
  },

  // ---- challenges ----
  /** Invite friend `id` to the party room `code`. Returns the challenge id, or null. */
  async challenge(id, code) {
    try { const { data, error } = await supabase.rpc('send_challenge', { p_to: id, p_code: code }); return error ? null : (data ?? null); } catch (e) { return null; }
  },
  async status(id) {
    try { const { data, error } = await supabase.rpc('challenge_status', { p_id: id }); return error ? null : data; } catch (e) { return null; }
  },
  async cancel(id) { try { await supabase.rpc('cancel_challenge', { p_id: id }); } catch (e) {} },
  answer(c, accept) {
    this._dismissed.add(c.id);
    this.incoming = null;
    this.emit();
    supabase.rpc('answer_challenge', { p_id: c.id, p_accept: !!accept }).then(() => {}, () => {});
    if (accept) this.launch({ join: c.code, name: c.from_name });
  },
  /** Out of whatever is on screen, then into the 1v1 (StageView's onChange(of: friends.launch)). */
  launch(l) {
    if (this.inParty) return;
    this.closers.forEach(fn => { try { fn(); } catch (e) {} });
    this.onLaunch && this.onLaunch(l);
  },

  signedOut() { this.list = []; this.code = null; this.incoming = null; this.loaded = false; this.emit(); },
};

// ---------- ChallengeBanner + ChallengeOverlay ----------
let banner = null;
function mountBanner() {
  if (banner) return;
  banner = el('<div class="cb-wrap" aria-live="polite"></div>');
  document.body.appendChild(banner);
  let shownId = null;
  const draw = () => {
    const c = Friends.incoming && !Friends.inParty ? Friends.incoming : null;
    if ((c?.id ?? null) === shownId) return;
    shownId = c?.id ?? null;
    if (!c) { banner.classList.remove('on'); return; }
    banner.innerHTML = `<div class="cb" role="alertdialog" aria-label="${esc(c.from_name)} challenged you">
      <span class="cb-av">${face(c.from_name, c.from_avatar, 'var(--easy)', 42, 'rgba(0,0,0,.75)')}</span>
      <span class="cb-tx"><b>${esc(c.from_name)} challenged you</b><small>1v1, right now</small></span>
      <button class="cb-no" data-press data-cb="no" aria-label="Decline">${I.x}</button>
      <button class="cb-yes" data-press data-cb="yes">Play</button></div>`;
    void banner.offsetWidth;
    banner.classList.add('on');
    Haptics.press(0.8);
  };
  Friends.onChange(draw);
  // A party or ranked match coming up hides it at once, not at the next beat.
  const views = document.getElementById('views');
  if (views) new MutationObserver(ms => { if (ms.some(m => m.type === 'childList' || m.target.parentNode === views)) draw(); }).observe(views, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  banner.addEventListener('click', e => {
    const b = e.target.closest('[data-cb]'); const c = Friends.incoming; if (!b || !c) return;
    if (b.dataset.cb === 'yes') Haptics.success();
    Friends.answer(c, b.dataset.cb === 'yes');
  });
}
