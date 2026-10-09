// Ranked/RankedLine.swift on the web: real matches with real players over
// Supabase Realtime, byte for byte the way the iPhone talks, so a web player
// and an iPhone player can be matched with each other.
//
// - The queue is one broadcast + presence channel a rank: `ranked-q1-<tier>`
//   (RankedQueue.version = 1). Everyone looking tracks presence with their
//   RankedSeat. The later of two players offers the earlier one a match; the
//   earlier one accepts the first offer and declines the rest.
// - A match is a channel of its own: `ranked-m1-<match uuid>`.
// - Broadcast event "ranked", payload one flat RankedWire JSON object; presence
//   keyed by the seat id with the seat JSON as its meta. Nothing is written to
//   a table.
// The transport is supabase-js's channel (the same client the party rides on):
// it speaks the same Phoenix protocol (phx_join with broadcast {self: false,
// ack: false}, presence {key: seat.id}, private false; presence track of the
// seat; heartbeats; rejoins after a drop).
//
// Localhost-only knobs (never on songspotapp.com):
//   ?rankedQueue=<name>  prefixes every channel name with "<name>-" so two test pages
//                        meet each other and never a real player (e.g. ?rankedQueue=test)
//   ?queueWait=N         seconds to look before the stand-in (-queueWait N)
//   ?rankedLog=1         every queue and match step in the console (-rankedLog)
import { supabase } from './supabase.js';

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const Q = LOCAL ? new URLSearchParams(location.search) : new URLSearchParams();
/** The channel-name prefix of a private test queue (localhost only); '' in production. */
const testPrefix = (() => { const p = (Q.get('rankedQueue') || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24); return p ? p + '-' : ''; })();
export const RankedTest = { prefix: testPrefix, on: !!testPrefix };

/** `-rankedLog`: a timestamped line for every step of matchmaking and of a match against a person. */
export function rankedLog(s) {
  if (!LOCAL || !Q.has('rankedLog')) return;
  const t = ((Date.now() / 1000) % 100000).toFixed(3);
  console.log(`[ranked ${t}] ${typeof s === 'function' ? s() : s}`);
}

/** How long a search waits for another player in the same rank before a stand-in takes the seat (Ranked.queueWait). */
export function queueWait() {
  const n = LOCAL ? parseFloat(Q.get('queueWait') ?? '') : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const int = v => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); })).toLowerCase();

/**
 * RankedSeat: who a player is, as the other phone needs it. Every field is
 * required by the iPhone's decoder, with Ints as whole numbers.
 * { id (fresh lowercase UUID per search), name, rating, rp, face (DefaultAvatar index), form [last 5, 1 won 0 lost], at (epoch seconds) }
 */
export function makeSeat({ name, rating, rp, face, form }) {
  return { id: uuid(), name: String(name || 'Player'), rating: int(rating), rp: int(rp), face: int(face), form: (form || []).slice(-5).map(int), at: Date.now() / 1000 };
}
/** A seat as it came off the line, or null when it isn't one (Swift's decoder would refuse it). */
export function readSeat(v) {
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const nums = ['rating', 'rp', 'face', 'at'];
  if (!nums.every(k => typeof v[k] === 'number' && Number.isFinite(v[k])) || !Array.isArray(v.form)) return null;
  return { id: v.id, name: v.name, rating: int(v.rating), rp: int(v.rp), face: int(v.face), form: v.form.map(int), at: v.at };
}
const cleanSeat = s => ({ id: s.id, name: s.name, rating: int(s.rating), rp: int(s.rp), face: int(s.face), form: (s.form || []).map(int), at: Number(s.at) });

/**
 * RankedWire: everything two phones say to each other, one flat shape.
 * t, from, to?, match?, seat?, r?, songs [[id]]?, choices [[[id]]]?, ok [[Int]]?, picks [Int]?, correct?, points?,
 * hp?, gp?, hw?, gw?, hs?, gs?, hpf?, gpf?. Absent keys are left out, as Swift's encoder does.
 * Types: offer accept decline hello deal ready go abort round answer close end forfeit.
 */
const INTS = ['r', 'points', 'hp', 'gp', 'hs', 'gs'], BOOLS = ['correct', 'hw', 'gw', 'hpf', 'gpf'];
export function wire(t, from, fields = {}) {
  const m = { t, from };
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    if (k === 'to' || k === 'match') m[k] = String(v);
    else if (k === 'seat') m.seat = cleanSeat(v);
    else if (INTS.includes(k)) m[k] = int(v);
    else if (BOOLS.includes(k)) m[k] = !!v;
    else if (k === 'songs') m.songs = v.map(row => row.map(String));
    else if (k === 'choices') m.choices = v.map(row => row.map(b => b.map(String)));
    else if (k === 'ok') m.ok = v.map(row => row.map(int));
    else if (k === 'picks') m.picks = v.map(int);
  }
  return m;
}
/** A message as it came off the line; null when it isn't one the iPhone would decode. */
export function readWire(v) {
  if (!v || typeof v !== 'object' || typeof v.t !== 'string' || typeof v.from !== 'string') return null;
  const m = { t: v.t, from: v.from };
  if (typeof v.to === 'string') m.to = v.to;
  if (typeof v.match === 'string') m.match = v.match;
  if (v.seat != null) { const s = readSeat(v.seat); if (!s) return null; m.seat = s; }
  for (const k of INTS) if (v[k] != null) { if (typeof v[k] !== 'number') return null; m[k] = int(v[k]); }
  for (const k of BOOLS) if (v[k] != null) { if (typeof v[k] !== 'boolean') return null; m[k] = v[k]; }
  const strs = a => Array.isArray(a) && a.every(x => typeof x === 'string');
  const ints = a => Array.isArray(a) && a.every(x => typeof x === 'number');
  if (v.songs != null) { if (!(Array.isArray(v.songs) && v.songs.every(strs))) return null; m.songs = v.songs; }
  if (v.choices != null) { if (!(Array.isArray(v.choices) && v.choices.every(r => Array.isArray(r) && r.every(strs)))) return null; m.choices = v.choices; }
  if (v.ok != null) { if (!(Array.isArray(v.ok) && v.ok.every(ints))) return null; m.ok = v.ok.map(r => r.map(int)); }
  if (v.picks != null) { if (!ints(v.picks)) return null; m.picks = v.picks.map(int); }
  return m;
}

/**
 * One Supabase Realtime channel for ranked: a broadcast channel with presence.
 * Callbacks: onMessage(wire), onPresence([seat]) whenever who is present changes, onDrop() when
 * the line went down and could not be brought back.
 */
export class RankedLine {
  constructor() { this.onMessage = null; this.onPresence = null; this.onDrop = null; this.ch = null; this.closed = true; this.seat = null; this.lost = 0; this.topic = ''; }

  /** Join `name` (without "realtime:") as `seat`: 6 s to be let in, then the seat goes up on presence. */
  join(name, seat) {
    this.seat = seat; this.closed = false;
    this.topic = testPrefix + name;
    const ch = supabase.channel(this.topic, { config: { broadcast: { self: false, ack: false }, presence: { key: seat.id }, private: false } });
    this.ch = ch;
    ch.on('broadcast', { event: 'ranked' }, ({ payload }) => {
      if (this.closed || this.ch !== ch) return;
      const m = readWire(payload); if (m && this.onMessage) this.onMessage(m);
    });
    ch.on('presence', { event: 'sync' }, () => {
      if (this.closed || this.ch !== ch) return;
      const state = ch.presenceState(), seats = [];
      for (const metas of Object.values(state)) { const s = readSeat(metas && metas[0]); if (s) seats.push(s); }
      if (this.onPresence) this.onPresence(seats);
    });
    return new Promise((resolve, reject) => {
      let joined = false;
      const timer = setTimeout(() => { if (!joined) { joined = true; this.leave(); reject(new Error('timeout')); } }, 6000);
      ch.subscribe(async status => {
        if (this.ch !== ch) return;
        if (status === 'SUBSCRIBED') {
          if (joined) {
            // Back after a drop (supabase-js rejoined by itself): the seat goes up again.
            if (this.lost) { clearTimeout(this.lost); this.lost = 0; rankedLog('line: back'); try { await ch.track(cleanSeat(seat)); } catch (e) {} }
            return;
          }
          joined = true; clearTimeout(timer);
          try { await Promise.race([ch.track(cleanSeat(seat)), sleep(5000)]); } catch (e) {}
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (!joined) { joined = true; clearTimeout(timer); this.leave(); reject(new Error(status)); return; }
          // Joined, the channel closing under us is a drop: the client rejoins by itself;
          // like the iPhone's three rejoins with 1/2/3 s backoff, give it a while, then it is gone.
          if (!this.closed && !this.lost) {
            rankedLog('line: dropped (' + status + ')');
            this.lost = setTimeout(() => { this.lost = 0; if (this.closed) return; rankedLog('line: gone'); this.leave(); if (this.onDrop) this.onDrop(); }, 10000);
          }
        }
      });
    });
  }

  /** Broadcast one message to everyone else on the channel. Every write has 5 s. */
  async send(m) {
    if (this.closed || !this.ch) return;
    try { await Promise.race([this.ch.send({ type: 'broadcast', event: 'ranked', payload: m }), sleep(5000)]); } catch (e) {}
  }

  async leave() {
    if (this.closed && !this.ch) return;
    this.closed = true; clearTimeout(this.lost); this.lost = 0;
    const ch = this.ch; this.ch = null;
    if (ch) { try { await supabase.removeChannel(ch); } catch (e) {} }
  }
}

/**
 * The ranked queue (RankedQueue): everyone looking for a match in one rank sits on one channel and can see
 * each other. find() resolves { id, host, opponent } or null when nobody turned up in `wait` seconds.
 */
export class RankedQueue {
  static version = 1;
  constructor() { this.line = new RankedLine(); this.me = null; this.seats = []; this.offer = null; this.skipped = new Map(); this.waiter = null; this.settled = false; }

  async find(me, tier, wait) {
    this.me = me;
    const line = this.line;
    line.onPresence = s => { rankedLog(`queue: ${s.length} looking`); this.seats = s; this.evaluate(); };
    line.onMessage = m => this.handle(m);
    line.onDrop = () => this.settle(null);
    try { await line.join(`ranked-q${RankedQueue.version}-${tier}`, me); } catch (e) {
      rankedLog(`queue: could not join (${e.message})`);
      return null;
    }
    rankedLog(`queue: joined rank ${tier} as ${me.id.slice(0, 6)}${testPrefix ? ` on test queue "${testPrefix}"` : ''}`);
    if (this.settled) { await line.leave(); return null; }
    const match = await new Promise(resolve => {
      this.waiter = resolve;
      this.evaluate();
      (async () => {
        // Look again every second: someone skipped a moment ago may be free now, and nothing else would ask.
        let left = wait;
        while (left > 0 && !this.settled) {
          await sleep(Math.min(1, left) * 1000);
          left -= 1;
          if (left > 0) this.evaluate();
        }
        // An offer already out gets its answer before the wait ends.
        let extra = 0;
        while (this.offer && extra < 25) { await sleep(100); extra++; }
        this.settle(null);
      })();
    });
    await line.leave();
    rankedLog(match ? `queue: matched with ${match.opponent.name}, ${match.host ? 'host' : 'guest'}` : 'queue: nobody');
    return match;
  }

  /** The player stopped looking. */
  cancel() { this.settle(null); }

  settle(match) {
    if (this.settled) return;
    this.settled = true; this.offer = null;
    const w = this.waiter; this.waiter = null;
    if (w) w(match);
  }

  /** Offer a match to whoever has been waiting longest, if I am the later one. */
  evaluate() {
    const me = this.me;
    if (this.settled || !this.waiter || this.offer || !me) return;
    const now = Date.now();
    for (const [k, at] of this.skipped) if (now - at >= 2500) this.skipped.delete(k);
    const before = (a, b) => a.at < b.at || (a.at === b.at && a.id < b.id);
    const earlier = this.seats.filter(s => s.id !== me.id && !this.skipped.has(s.id) && before(s, me)).sort((a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0));
    const pick = earlier[0]; if (!pick) return;
    const id = uuid();
    this.offer = { to: pick.id, match: id };
    rankedLog(`queue: offer to ${pick.name}`);
    this.line.send(wire('offer', me.id, { to: pick.id, match: id, seat: me }));
    setTimeout(() => {
      const o = this.offer; if (!o || o.match !== id) return;
      // No answer: they found someone else or left. Try the next one.
      this.skipped.set(o.to, Date.now()); this.offer = null; this.evaluate();
    }, 2000);
  }

  handle(m) {
    const me = this.me;
    if (!me || m.to !== me.id) return;
    rankedLog(`queue: got ${m.t}`);
    switch (m.t) {
      case 'offer': {
        const id = m.match, seat = m.seat; if (!id || !seat) return;
        if (!this.settled && !this.offer && this.waiter) {
          this.settled = true;
          (async () => {
            await this.line.send(wire('accept', me.id, { to: m.from, match: id, seat: me }));
            const w = this.waiter; this.waiter = null;
            if (w) w({ id, host: false, opponent: seat });
          })();
        } else {
          // Matched or done looking: still say no, at once, so the one asking tries someone else.
          this.line.send(wire('decline', me.id, { to: m.from, match: id }));
        }
        break;
      }
      case 'accept': {
        const o = this.offer;
        if (this.settled || !o || o.match !== m.match || !m.seat) return;
        this.settle({ id: o.match, host: true, opponent: m.seat });
        break;
      }
      case 'decline': {
        const o = this.offer;
        if (this.settled || !o || o.match !== m.match) return;
        this.skipped.set(o.to, Date.now()); this.offer = null; this.evaluate();
        break;
      }
    }
  }
}
