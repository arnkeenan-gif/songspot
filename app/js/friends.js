// Friends.swift on the web: the list, who is online, and 1v1 challenges. One
// per page: the heartbeat runs every 15 s while the tab is visible and the
// player is signed in, and doubles as the check for incoming challenges (see
// heartbeat() in supabase/friends.sql). The same RPCs the iPhone app calls, so
// friends made on the phone are here and a web player can challenge an iPhone.
// The friend bell (friendbell.js) makes it instant: a ring on bell-<my id>
// fetches at once instead of at the next beat, and every friend action here
// rings the other player's bell.
// Also here: ChallengeBanner / challengeOverlay, the card that drops in over
// whatever screen is up when a friend challenges you, and the toast for a
// friend request that has just arrived.
import { supabase } from './supabase.js';
import { el, esc, settings, toast } from './ui.js';
import { I } from './icons.js';
import { Haptics } from './haptics.js';
import { FriendBell } from './friendbell.js';
import { mountOffline } from './offline.js';
import { faceHTML } from './characters.js';

/** Songbot: always there, always says yes. Its own 3D face (char 47). */
export const BOT = Object.freeze({ id: 'bot-songbot', name: 'Songbot', avatar: 'char:47:portrait', rating: 450, last_active: null, status: 'accepted', incoming: false });
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
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const knob = new URLSearchParams(location.search);
/** Localhost test knob, the app's -demoFriends: sample friends, no server. (?friendsDemo=1 is the old spelling.) */
export const demoMode = local && (knob.has('demoFriends') || knob.has('friendsDemo'));

export const Friends = {
  list: [], code: null, loaded: false,
  /** The newest challenge nobody has answered yet. */
  incoming: null,
  /** A friend request that has just arrived, for the page to announce. */
  arrived: null,
  /** Counts the rings of the bell, for whoever is waiting on an answer. */
  rings: 0,
  account: null, ctx: null,
  /** Opens a 1v1: { name, bot, friendId } to host, or { join: code, name } to join. Set by app.js. */
  onLaunch: null,
  /** Screens that close when a 1v1 opens (the Friends sheet). */
  closers: new Set(),
  _dismissed: new Set(), _timer: 0, _listeners: new Set(), _beating: false, _ringing: null,
  /** The requests already seen, so only a new one is announced. */
  _knownRequests: null,
  /** The user id `code` belongs to. */
  _codeOwner: null,

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
  get signedIn() { return demoMode || !!this.account?.signedIn; },
  get userID() { return this.account?.user && !this.account.user.is_anonymous ? this.account.user.id : null; },
  /** True while a party or a ranked match (not the ranked lobby) is on screen, so a challenge can't stack a second one. */
  get inParty() { return !!document.querySelector('#views > .view.party.in, #views > .view.ranked.rk-inmatch'); },   // iOS hides challenges only during a ranked match

  // ---- a code that arrived by link (/add?c= or ?add=), kept through a sign-in redirect for an hour ----
  get pendingCode() { const p = settings.get(PENDING_KEY, null); return p && Date.now() - (p.at || 0) < 3600e3 ? p.code : null; },
  set pendingCode(c) { if (c) settings.set(PENDING_KEY, { code: c, at: Date.now() }); else settings.del(PENDING_KEY); },

  // ---- heartbeat ----
  init(account, ctx) {
    this.account = account;
    this.ctx = ctx || window.__songspot || null;
    mountBanner();
    mountOffline();
    this.onChange(announceArrival);
    FriendBell.onRing = () => this.rung();
    let wasIn = this.signedIn;
    account.onChange(() => {
      const now = this.signedIn;
      if (now === wasIn) return;
      wasIn = now;
      if (now) this.start(); else { this.stop(); this.signedOut(); }
    });
    // A hidden tab is the iPhone's background: the beat and the bell stop, and both come back with the page.
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); else this.start(); });
    if (demoMode) { this.demo(); debugKnobs(this); return; }
    if (this.signedIn) this.start();
    debugKnobs(this);
  },
  start() {
    if (this._timer || document.hidden || !this.signedIn || demoMode) return;
    // Once at the start, so the menu badge and the Friends tab can show a waiting request without the page open.
    this.beat().then(() => this.refresh());
    this._timer = setInterval(() => this.beat(), BEAT_MS);
  },
  stop() {
    clearInterval(this._timer); this._timer = 0;
    this._ringing = null;
    FriendBell.stop();
  },
  /** The bell rang: fetch what is new now. Rings in a burst are one fetch. */
  rung() {
    this.rings++;
    if (this._ringing || demoMode) return;
    this._ringing = (async () => {
      await this.beat();
      await this.refresh();
      await new Promise(r => setTimeout(r, 400));
      this._ringing = null;
    })();
  },
  /** A push came in or was tapped: fetch at once, as the bell does (the web has no pushes; kept for the same shape). */
  pokeFromPush() { this.rung(); },
  /** Wait for the bell, or for `seconds` to pass, whichever is first. Resolves true if it rang. */
  async waitForRing(seconds) {
    const before = this.rings, until = Date.now() + seconds * 1000;
    while (this.rings === before && Date.now() < until) await new Promise(r => setTimeout(r, 150));
    return this.rings !== before;
  },
  async beat() {
    if (!this.signedIn || demoMode || this._beating) return;
    this._beating = true;
    try {
      // The bell is answered only while the heartbeat runs (page open and visible).
      if (this._timer && this.userID) FriendBell.listen(this.userID);
      const { data, error } = await supabase.rpc('heartbeat');
      if (error || !Array.isArray(data)) return;
      const next = data.find(c => !this._dismissed.has(c.id)) || null;
      const shown = this.inParty ? null : next;
      if ((shown?.id ?? null) !== (this.incoming?.id ?? null)) { this.incoming = shown; this.emit(); }
    } catch (e) {} finally { this._beating = false; }
  },

  // ---- the list ----
  async refresh() {
    if (demoMode) { this.emit(); return; }
    if (!this.signedIn) { this.list = []; this.loaded = true; this.emit(); return; }
    try {
      const { data, error } = await supabase.rpc('my_friends');
      if (!error && Array.isArray(data)) { this.list = data; this._noteRequests(); }
    } catch (e) {}
    // Fetched again when someone else has signed in since, so a code is never another player's.
    if (!this.code || this._codeOwner !== this.userID) {
      this._codeOwner = this.userID;
      try { const { data } = await supabase.rpc('my_friend_code'); this.code = data || null; } catch (e) { this.code = null; }
    }
    this.loaded = true;
    this.emit();
  },
  /** A request not seen before becomes `arrived` (never on the first load). */
  _noteRequests() {
    const now = new Set(this.requests.map(f => f.id));
    if (this._knownRequests) { const fresh = this.requests.find(f => !this._knownRequests.has(f.id)); if (fresh) this.arrived = fresh; }
    this._knownRequests = now;
  },
  /** Returns what to tell the player. */
  async add(raw) {
    const c = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 6) return 'Friend codes are 6 characters.';
    if (demoMode) return demoAdd(this, c);
    const before = new Map(this.list.map(f => [f.id, f]));
    let r;
    try { const { data, error } = await supabase.rpc('add_friend', { p_code: c }); if (error) throw error; r = data; }
    catch (e) { return "Couldn't reach the server. Try again."; }
    await this.refresh();
    // Whoever this changed something for hears of it now: the player we just sent a request to,
    // or the one whose request this accepted. Nobody else.
    for (const f of this.list) {
      const was = before.get(f.id);
      if (!was && !accepted(f) && !f.incoming) this.ringFor(f.id);
      else if (was && !accepted(was) && was.incoming && accepted(f)) this.ringFor(f.id);
    }
    switch (r) {
      case 'requested': return 'Request sent.';
      case 'accepted': return "You're now friends.";
      // Said for a request still waiting and for a friend already made.
      case 'already': return "You've already added them.";
      case 'self': return "That's your own code.";
      case 'too_many': return "That's a lot of requests in an hour. Try again later.";
      // The hourly brake (30 requests waiting) answers the same as a wrong code.
      default: return this.sent.length >= 30 ? "Couldn't add that code. Check it, or try again in an hour." : 'No player with that code.';
    }
  },
  /** FriendBell.ring as me. (The iPhone also asks the push function to tell them; see PARITY-WEB: no CORS for the web.) */
  ringFor(id) { const me = this.userID; if (me && id) FriendBell.ring(id, me); },
  async respond(f, accept) {
    if (demoMode) { this.list = this.list.map(x => x.id === f.id ? { ...x, status: accept ? 'accepted' : 'declined', last_active: accept ? new Date().toISOString() : x.last_active } : x).filter(x => x.status !== 'declined'); this._knownRequests = new Set(this.requests.map(x => x.id)); this.emit(); return; }
    try { await supabase.rpc('respond_friend', { p_other: f.id, p_accept: !!accept }); } catch (e) {}
    this.ringFor(f.id);
    await this.refresh();
  },
  async remove(f) {
    this.list = this.list.filter(x => x.id !== f.id); this.emit();
    if (demoMode) return;
    try { await supabase.rpc('remove_friend', { p_other: f.id }); } catch (e) {}
    this.ringFor(f.id);
    await this.refresh();
  },

  // ---- challenges ----
  /** Invite friend `to` (an id, or the friend) to the party room `code`. Returns the challenge id, or null. Rings them. */
  async challenge(to, code) {
    const id = typeof to === 'object' && to ? to.id : to;
    let cid = null;
    try { const { data, error } = await supabase.rpc('send_challenge', { p_to: id, p_code: code }); cid = error ? null : (data ?? null); } catch (e) {}
    if (cid != null) this.ringFor(id);
    return cid;
  },
  async status(id) {
    try { const { data, error } = await supabase.rpc('challenge_status', { p_id: id }); return error ? null : data; } catch (e) { return null; }
  },
  /** `to`: who was invited, so their banner goes at once. */
  async cancel(id, to = null) {
    try { await supabase.rpc('cancel_challenge', { p_id: id }); } catch (e) {}
    if (to) this.ringFor(to);
  },
  answer(c, accept) {
    this._dismissed.add(c.id);
    this.incoming = null;
    this.emit();
    if (!(demoMode || c.demo)) supabase.rpc('answer_challenge', { p_id: c.id, p_accept: !!accept }).then(() => this.ringFor(c.from_id), () => {});
    if (accept) this.launch({ join: c.code, name: c.from_name });
  },
  /** Out of whatever is on screen, then into the 1v1 (StageView's onChange(of: friends.launch)). */
  launch(l) {
    if (this.inParty) return;
    this.closers.forEach(fn => { try { fn(); } catch (e) {} });
    this.onLaunch && this.onLaunch(l);
  },

  /** Sample friends for looking at the list (Friends.demo, -demoFriends). */
  demo() {
    const now = new Date().toISOString(), ago = new Date(Date.now() - 3 * 3600e3).toISOString();
    this.list = [
      { id: 'd1', name: 'Mia', avatar: null, rating: 720, last_active: now, status: 'accepted', incoming: false },
      { id: 'd2', name: 'Noah', avatar: null, rating: 340, last_active: now, status: 'accepted', incoming: false },
      { id: 'd3', name: 'Liv', avatar: null, rating: 150, last_active: ago, status: 'accepted', incoming: false },
      { id: 'd4', name: 'Theo', avatar: null, rating: 1000, last_active: null, status: 'pending', incoming: true },
      { id: 'd5', name: 'Sofia', avatar: null, rating: 1000, last_active: null, status: 'pending', incoming: false },
    ];
    this.code = 'K7QX4M'; this.loaded = true;
    this._knownRequests = new Set(this.requests.map(f => f.id));
    // The online dots stay true while the demo sits there.
    clearInterval(this._demoTick);
    this._demoTick = setInterval(() => { const t = new Date().toISOString(); this.list.forEach(f => { if (f.id === 'd1' || f.id === 'd2') f.last_active = t; }); }, 20000);
    this.emit();
  },

  signedOut() {
    this._knownRequests = null; this.arrived = null; this._codeOwner = null;
    FriendBell.stop();
    this.list = []; this.code = null; this.incoming = null; this.loaded = false;
    this.emit();
  },
};

/** The demo's add(): the iPhone's answers without a server, by code. */
function demoAdd(F, c) {
  const answers = { K7QX4M: 'self', AAAAAA: 'already', TOOMNY: 'too_many', ZZZZZZ: 'none' };
  const r = answers[c] || 'requested';
  if (r === 'requested') { F.list = [...F.list, { id: 'd-' + c, name: 'Player ' + c.slice(0, 2), avatar: null, rating: 500, last_active: null, status: 'pending', incoming: false }]; F.emit(); }
  return { requested: 'Request sent.', self: "That's your own code.", already: "You've already added them.", too_many: "That's a lot of requests in an hour. Try again later." }[r] || 'No player with that code.';
}

/** StageView's onChange(of: friends.arrived): "<name> sent you a friend request.", unless Friends is showing it already. */
function announceArrival(F) {
  const f = F.arrived; if (!f) return;
  F.arrived = null;
  const ctx = F.ctx || window.__songspot;
  if (document.querySelector('.friends-sheet') || ctx?.tabs?.current === 'friends' || document.querySelector('.login')) return;
  Haptics.select();
  toast(`${f.name} sent you a friend request.`);
}

/**
 * Localhost knobs (the app's DEBUG args): ?bellListen=<id> sits on that bell and logs each ring;
 * ?bellRing=<id> rings it three seconds in (two pages on a made-up id test the bell without accounts).
 * ?demoChallenge=1 drops a challenge banner in; ?demoRequest=1 has a request arrive 2 s in.
 */
function debugKnobs(F) {
  if (!local) return;
  const listen = knob.get('bellListen'), ring = knob.get('bellRing');
  if (listen) {
    window.__bellRings = 0;
    FriendBell.onRing = () => { F.rings++; window.__bellRings++; console.info('bell: rung'); };
    FriendBell.listen(listen).then(() => { window.__bellListening = FriendBell.listening; console.info('bell: listening', FriendBell.listening); });
  }
  if (ring) setTimeout(() => { console.info('bell: ringing'); FriendBell.ring(ring, 'tester').then(() => { window.__bellRang = true; }); }, 3000);
  if (knob.has('demoChallenge')) setTimeout(() => { F.incoming = { id: -1, code: 'ABCDE', from_id: 'd1', from_name: 'Mia', from_avatar: null, demo: true }; F.emit(); }, 1200);
  if (knob.has('demoRequest')) setTimeout(() => {
    if (!demoMode) { F.loaded = true; F._knownRequests = new Set(); }
    F.list = [...F.list, { id: 'd9', name: 'Ella', avatar: null, rating: 600, last_active: null, status: 'pending', incoming: true }];
    F._noteRequests(); F.emit();
  }, 2000);
}

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
    banner.innerHTML = `<div class="cbanner" role="alertdialog" aria-label="${esc(c.from_name)} challenged you">
      <span class="cb-av">${faceHTML(c.from_avatar, c.from_id, 42)}</span>
      <span class="cb-tx"><b>${esc(c.from_name)} challenged you</b><small>1v1, right now</small></span>
      <button class="cb-no" data-press data-cb="no" aria-label="Decline the challenge">${I.x}</button>
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
