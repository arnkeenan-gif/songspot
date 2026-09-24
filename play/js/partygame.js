// Party: the room, the rules and the wire. One Supabase Realtime channel per
// room — presence says who is here, broadcast carries the rest. The host owns
// the truth: it draws the songs, keeps the clock, judges the answers and sends
// the whole room as `state` on every change and every 2 s; guests render what
// arrives and send `answer` back. Nothing here touches the DOM.
import { supabase } from './supabase.js';
import { TIERS } from './pool.js';

export const MAX_PLAYERS = 50;
export const WINDOW = 15;                    // seconds a clip plays and can be guessed
export const COUNTDOWN_MS = 3200;            // 3-2-1, plus a breath to buffer the clip
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O, no 1/I
export const ROUND_OPTIONS = [5, 10, 15];
export const DIFFICULTIES = [['mixed', 'Mixed'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];

export const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const normaliseCode = s => [...String(s || '').toUpperCase()].filter(c => ALPHABET.includes(c)).join('').slice(0, 5);
/** Fastest right answer scores the most: 1000 at the start of the clip, 500 at its end. */
export const points = (elapsed, window = WINDOW) => Math.round(1000 - 500 * Math.min(window, Math.max(0, elapsed)) / window);
/** The tier a round plays at: one difficulty throughout, or Mixed climbing Easy → Impossible over the game. */
export const tierFor = (difficulty, round, rounds) => difficulty === 'mixed' ? TIERS[Math.min(TIERS.length - 1, Math.floor(round * TIERS.length / Math.max(1, rounds)))] : difficulty;
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** One room on the wire: the `party:<CODE>` channel, presence keyed by session id. */
class Wire {
  constructor(code) { this.code = code; this.channel = null; }
  /** Subscribe and announce myself. Resolves once the channel is live. */
  open(key, me, on) {
    return new Promise((resolve, reject) => {
      const ch = supabase.channel('party:' + this.code, { config: { broadcast: { self: false }, presence: { key } } });
      ch.on('broadcast', { event: 'state' }, ({ payload }) => on.state(payload))
        .on('broadcast', { event: 'answer' }, ({ payload }) => on.answer(payload))
        .on('presence', { event: 'sync' }, () => on.presence(ch.presenceState()))
        .subscribe(async status => {
          if (status === 'SUBSCRIBED') { await ch.track(me); resolve(); }
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { const e = new Error("Couldn't reach the party server."); reject(e); on.error(e.message); }
        });
      this.channel = ch;
    });
  }
  send(event, payload) { return this.channel?.send({ type: 'broadcast', event, payload }); }
  async close() { const ch = this.channel; this.channel = null; if (ch) { try { await ch.untrack(); } catch (e) {} await supabase.removeChannel(ch); } }
}

export class PartyGame {
  constructor(pool) {
    this.pool = pool;
    this.sid = rid();                        // my seat for this visit; the presence key
    this.listeners = new Set();
    this.reset();
  }
  reset() {
    clearTimeout(this.timer); clearInterval(this.beat); clearTimeout(this.watch);
    this.isHost = false; this.hostId = null; this.code = ''; this.phase = 'hub'; this.error = '';
    this.round = 0; this.settings = { rounds: 10, difficulty: 'mixed', era: 'all', category: 'all' };
    this.players = [];                       // [{ id, name, hue, host, score, roundsWon, answered, gained }] in join order
    this.song = null;                        // { id, preview, tier } while playing; + title, artist, artwork from the reveal on
    this.roundStartedAt = 0; this.window = WINDOW; this.gameId = '';
    this.presence = new Map();               // sid -> { name, avatar, hue, host }
    this.skew = 0; this.pending = null;      // my clock vs the host's; my answer before the host confirms it
    this.songs = []; this.wire = null; this.me = null;
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(f => f(this)); }

  // ---- reading the room ----
  /** The host's clock. Guests take the largest observed (sentAt − received): the sample with the least latency. */
  now() { return Date.now() + this.skew; }
  get mine() { return this.players.find(p => p.id === this.sid) || null; }
  get host() { return this.players.find(p => p.host) || null; }
  get tier() { return this.song?.tier || tierFor(this.settings.difficulty, this.round, this.settings.rounds); }
  get sorted() { return [...this.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)); }
  get answered() { return this.players.filter(p => p.answered); }
  get iAnswered() { return !!(this.mine?.answered || this.pending); }
  get myPoints() { return this.mine?.answered ? this.mine.gained : this.pending ? this.pending.gained : null; }
  get canStart() { return this.players.length >= 2; }
  get elapsed() { return Math.max(0, (this.now() - this.roundStartedAt) / 1000); }
  get progress() { return Math.min(1, this.elapsed / this.window); }
  get secondsLeft() { return Math.max(0, Math.ceil(this.window - this.elapsed)); }
  get countdown() { return Math.min(3, Math.max(0, Math.ceil((this.roundStartedAt - this.now()) / 1000))); }
  get songsLabel() { return this.settings.category === 'all' ? 'All genres' : this.settings.category; }
  avatarOf(p) { return this.presence.get(p.id)?.avatar || null; }
  /** The pool row for the song in play — every browser has the pool, so a guess is judged on the spot. */
  get answerRow() { return this.song ? this.pool.byId.get(this.song.id) || null : null; }

  // ---- in and out ----
  async host(name, avatar) {
    this.reset(); this.isHost = true; this.hostId = this.sid; this.code = makeCode(); this.phase = 'connecting';
    this.me = { name, avatar, hue: 1 + Math.floor(Math.random() * 6), host: true }; this.emit();
    try { await this.open(); } catch (e) { return; }
    this.phase = 'lobby'; this.beat = setInterval(() => this.broadcast(), 2000); this.broadcast(); this.emit();
  }
  async join(code, name, avatar) {
    code = normaliseCode(code); if (code.length !== 5) return;
    this.reset(); this.code = code; this.phase = 'connecting';
    this.me = { name, avatar, hue: 1 + Math.floor(Math.random() * 6), host: false }; this.emit();
    try { await this.open(); } catch (e) { return; }
    this.watch = setTimeout(() => { if (this.phase === 'connecting') this.fail('No party with that code.'); }, 8000);
  }
  open() {
    this.wire = new Wire(this.code);
    return this.wire.open(this.sid, this.me, { state: s => this.apply(s), answer: a => this.judge(a.sid, a.songId, a.at), presence: p => this.roster(p), error: m => this.fail(m) });
  }
  async leave() { const w = this.wire; this.reset(); this.emit(); if (w) await w.close(); }
  fail(message) { const w = this.wire; this.reset(); this.phase = 'error'; this.error = message; this.emit(); if (w) w.close(); }

  // ---- who is here ----
  roster(state) {
    this.presence = new Map(Object.entries(state).map(([k, v]) => [k, v[0]]));
    if (!this.isHost) {
      if (this.hostId && !['hub', 'connecting', 'error'].includes(this.phase) && !this.presence.has(this.hostId)) return this.fail('The host left the party.');
      return this.emit();
    }
    // Seats keep their order; leavers go, newcomers take the next seat and the least-used colour.
    const keep = this.players.filter(p => this.presence.has(p.id));
    for (const [id, m] of this.presence) {
      if (keep.some(p => p.id === id) || keep.length >= MAX_PLAYERS) continue;
      keep.push({ id, name: String(m.name || 'Player').slice(0, 20), hue: this.freeHue(keep, m.hue), host: id === this.sid, score: 0, roundsWon: 0, answered: false, gained: 0 });
    }
    this.players = keep; this.broadcast(); this.emit();
    if (this.phase === 'playing' && keep.length && keep.every(p => p.answered)) this.endRound();
  }
  freeHue(list, wish) {
    const used = h => list.filter(p => p.hue === h).length;
    return [1, 2, 3, 4, 5, 6].reduce((best, h) => used(h) < used(best) ? h : best, wish >= 1 && wish <= 6 ? wish : 1);
  }

  // ---- the state on the wire ----
  snapshot() {
    return { v: 1, sentAt: Date.now(), code: this.code, hostId: this.sid, gameId: this.gameId, phase: this.phase, round: this.round, settings: this.settings,
      players: this.players.map(p => ({ id: p.id, name: p.name, hue: p.hue, host: p.host, score: p.score, roundsWon: p.roundsWon, answered: p.answered, gained: p.gained })),
      song: this.song, roundStartedAt: this.roundStartedAt, window: this.window };
  }
  broadcast() { if (this.isHost && this.wire) this.wire.send('state', this.snapshot()); }
  /** A guest takes the host's word for everything. */
  apply(s) {
    if (this.isHost || !s || s.code !== this.code) return;
    clearTimeout(this.watch); this.watch = setTimeout(() => this.fail('Lost the party.'), 10000);
    const sk = s.sentAt - Date.now(); if (!this.hostId || sk > this.skew) this.skew = sk;
    const changed = s.phase !== this.phase || s.round !== this.round;
    Object.assign(this, { hostId: s.hostId, gameId: s.gameId, phase: s.phase, round: s.round, settings: s.settings, players: s.players, song: s.song, roundStartedAt: s.roundStartedAt, window: s.window || WINDOW });
    if ((changed && s.phase !== 'playing') || this.mine?.answered) this.pending = null;
    if (!this.mine && this.players.length >= MAX_PLAYERS) return this.fail('That party is full.');
    this.emit();
  }

  // ---- the host's controls ----
  setSettings(patch) { if (!this.isHost || this.phase !== 'lobby') return; Object.assign(this.settings, patch); this.broadcast(); this.emit(); }
  /** One song a round, no repeats; a thin tier borrows from its nearest neighbours. Null when the filters can't fill the game. */
  draw() {
    const avoid = new Set(), out = [], { rounds, difficulty, era, category } = this.settings;
    for (let r = 0; r < rounds; r++) {
      const want = TIERS.indexOf(tierFor(difficulty, r, rounds));
      const order = [...TIERS].sort((a, b) => Math.abs(TIERS.indexOf(a) - want) - Math.abs(TIERS.indexOf(b) - want));
      let s = null;
      for (const t of order) { const c = this.pool.pick(t, era, category, null, avoid); if (c && !avoid.has(c.id)) { s = c; break; } }
      if (!s) return null;
      avoid.add(s.id); out.push({ id: s.id, preview: s.preview, title: s.title, artist: s.artist, artwork: s.artwork, tier: s.tier });
    }
    return out;
  }
  start() {
    if (!this.isHost || this.phase !== 'lobby' || !this.canStart) return false;
    const songs = this.draw(); if (!songs) return false;
    this.songs = songs; this.gameId = rid(); this.players.forEach(p => { p.score = 0; p.roundsWon = 0; });
    this.startRound(0); return true;
  }
  startRound(r) {
    clearTimeout(this.timer);
    const s = this.songs[r]; this.round = r;
    this.song = { id: s.id, preview: s.preview, tier: s.tier };   // the answer stays with the host until the reveal
    this.players.forEach(p => { p.answered = false; p.gained = 0; });
    this.phase = 'countdown'; this.roundStartedAt = Date.now() + COUNTDOWN_MS;
    this.broadcast(); this.emit();
    this.timer = setTimeout(() => this.play(), COUNTDOWN_MS);
  }
  play() {
    if (this.phase !== 'countdown') return;
    this.phase = 'playing'; this.broadcast(); this.emit();
    this.timer = setTimeout(() => this.endRound(), this.roundStartedAt + this.window * 1000 - Date.now());
  }
  endRound() {
    if (!this.isHost || this.phase !== 'playing') return;
    clearTimeout(this.timer);
    const s = this.songs[this.round];
    this.song = { ...this.song, title: s.title, artist: s.artist, artwork: s.artwork };
    this.phase = 'result'; this.broadcast(); this.emit();
  }
  skip() { this.endRound(); }
  next() {
    if (!this.isHost || this.phase !== 'result') return;
    if (this.round + 1 >= this.settings.rounds) { this.phase = 'finished'; this.broadcast(); this.emit(); }
    else this.startRound(this.round + 1);
  }
  playAgain() {
    if (!this.isHost || this.phase !== 'finished') return;
    this.players.forEach(p => { p.score = 0; p.roundsWon = 0; p.answered = false; p.gained = 0; });
    this.song = null; this.round = 0; this.phase = 'lobby'; this.broadcast(); this.emit();
  }

  // ---- answers ----
  /** I named it. The host judges on the spot; a guest tells the host and banks the points it expects meanwhile. */
  submit(songId, guess = '') {
    if (this.phase !== 'playing' || this.iAnswered || !this.song || songId !== this.song.id) return null;
    const at = this.now(), gained = points((at - this.roundStartedAt) / 1000, this.window);
    if (this.isHost) this.judge(this.sid, songId, at);
    else { this.pending = { gained }; this.wire?.send('answer', { sid: this.sid, songId, guess, at }); this.emit(); }
    return gained;
  }
  judge(sid, songId, at) {
    if (!this.isHost || this.phase !== 'playing' || !this.song || songId !== this.song.id) return;
    const p = this.players.find(p => p.id === sid); if (!p || p.answered) return;
    p.answered = true; p.gained = points((Number(at) - this.roundStartedAt) / 1000, this.window); p.score += p.gained; p.roundsWon++;
    this.broadcast(); this.emit();
    // Everyone's in: a beat to read the lock-in, then the reveal.
    if (this.players.every(q => q.answered)) { clearTimeout(this.timer); this.timer = setTimeout(() => this.endRound(), 900); }
  }
}
