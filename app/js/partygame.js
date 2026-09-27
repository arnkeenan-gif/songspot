// The party engine, wire-compatible with the iPhone app (Party/PartyGame.swift,
// PartyModel.swift, PartyTransport.swift): the same Supabase Realtime room
// (topic realtime:party-<CODE>, broadcast event "party", self-echo on,
// presence keyed by player id), the same PartyMessage JSON — Swift's
// synthesized Codable, {"case": {"label": value}} — and the same rules. The
// host owns the truth: it deals the songs and the four answers, opens and
// closes every round, rules on guesses and hands out points. Everyone else
// renders what the host says and sends guesses back. Every state change
// happens on *receiving* a message, the host's own included, exactly as the
// Swift engine relies on hearing its own broadcasts.
import { supabase } from './supabase.js';
import { TIERS, Pool } from './pool.js';
import { deal, toChoice } from './choices.js';

export const MAX_PLAYERS = 50;
export const CODE_ALPHABET = '23456789BCDFGHJKLMNPQRSTVWXYZ';
export const makeCode = () => Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
export const normaliseCode = raw => [...String(raw || '').toUpperCase()].filter(c => CODE_ALPHABET.includes(c)).slice(0, 5).join('');
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })).toUpperCase();
const nowSecs = () => Date.now() / 1000;
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const int = v => Math.round(Number(v) || 0);
const num = v => Number(v) || 0;
const str = v => String(v ?? '');
const optStr = v => (v == null || v === '' ? undefined : String(v));
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);

// ---------- the wire: PartyMessage, as Swift's JSONEncoder writes it ----------

/** PartyPlayer. id, name, isHost, score, hue are required on decode; avatar is omitted when nil. */
export const wirePlayer = p => {
  const o = { id: str(p.id), name: str(p.name), isHost: !!p.isHost, score: int(p.score), hue: int(p.hue) };
  if (p.avatar) o.avatar = String(p.avatar);
  return o;
};
/** PartySettings. Every field but artist is required on decode. */
export const wireSettings = s => {
  const o = { category: str(s.category || 'all'), era: str(s.era || 'all'), difficulty: str(s.difficulty || 'mixed'), easySearch: !!s.easySearch,
    rounds: int(s.rounds || 10), guessWindow: num(s.guessWindow || 20), clipSeconds: num(s.clipSeconds || 20) };
  if (s.artist) o.artist = String(s.artist);
  return o;
};
/** PartyTrack: id, title, artist required; artwork optional. */
export const wireTrack = t => { const o = { id: str(t.id), title: str(t.title), artist: str(t.artist) }; if (t.artwork) o.artwork = String(t.artwork); return o; };
const intMap = m => Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [String(k), int(v)]));
const clean = o => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };

export const Msg = {
  lobby: (players, settings) => ({ lobby: { players: players.map(wirePlayer), settings: wireSettings(settings) } }),
  round: r => ({ round: clean({ index: int(r.index), songID: str(r.songID), artwork: optStr(r.artwork), title: str(r.title), artist: str(r.artist),
    startAt: num(r.startAt), seconds: num(r.seconds), window: num(r.window), choices: r.choices ? r.choices.map(wireTrack) : undefined }) }),
  guess: (playerID, songID, text, at) => ({ guess: clean({ playerID: str(playerID), songID: optStr(songID), text: str(text), at: num(at) }) }),
  scored: (playerID, points, answered) => ({ scored: { playerID: str(playerID), points: int(points), answered: int(answered) } }),
  result: r => ({ result: clean({ index: int(r.index), title: str(r.title), artist: str(r.artist), artwork: optStr(r.artwork), gained: intMap(r.gained), scores: intMap(r.scores) }) }),
  finished: scores => ({ finished: { scores: intMap(scores) } }),
  again: () => ({ again: {} }),
  ping: (id, sent) => ({ ping: { id: str(id), sent: num(sent) } }),
  pong: (id, sent, hostNow) => ({ pong: { id: str(id), sent: num(sent), hostNow: num(hostNow) } }),
  join: player => ({ join: { player: wirePlayer(player) } }),
  leave: playerID => ({ leave: { playerID: str(playerID) } }),
  catalogue: songs => ({ catalogue: { songs: songs.map(wireTrack) } }),
};

/** Decode one message the way Swift would, tolerating what the iPhone omits. Null for anything malformed. */
export function decode(m) {
  if (!m || typeof m !== 'object') return null;
  const keys = Object.keys(m); if (keys.length !== 1) return null;
  const kind = keys[0], v = m[kind] || {};
  const player = p => (p && typeof p === 'object' && p.id != null ? { id: str(p.id), name: str(p.name), isHost: !!p.isHost, score: int(p.score), hue: int(p.hue), avatar: p.avatar || null } : null);
  const track = t => (t && t.id != null ? { id: str(t.id), title: str(t.title), artist: str(t.artist), artwork: t.artwork || null } : null);
  switch (kind) {
    case 'lobby': return { kind, players: (v.players || []).map(player).filter(Boolean), settings: { ...(v.settings || {}) } };
    case 'round': return { kind, index: int(v.index), songID: str(v.songID), artwork: v.artwork || null, title: str(v.title), artist: str(v.artist),
      startAt: num(v.startAt), seconds: num(v.seconds), window: num(v.window) || 20, choices: Array.isArray(v.choices) ? v.choices.map(track).filter(Boolean) : null };
    case 'guess': return { kind, playerID: str(v.playerID), songID: v.songID == null ? null : str(v.songID), text: str(v.text), at: num(v.at) };
    case 'scored': return { kind, playerID: str(v.playerID), points: int(v.points), answered: int(v.answered) };
    case 'result': return { kind, index: int(v.index), title: str(v.title), artist: str(v.artist), artwork: v.artwork || null, gained: intMap(v.gained), scores: intMap(v.scores) };
    case 'finished': return { kind, scores: intMap(v.scores) };
    case 'again': return { kind };
    case 'ping': return { kind, id: str(v.id), sent: num(v.sent) };
    case 'pong': return { kind, id: str(v.id), sent: num(v.sent), hostNow: num(v.hostNow) };
    case 'join': { const p = player(v.player); return p ? { kind, player: p } : null; }
    case 'leave': return { kind, playerID: str(v.playerID) };
    case 'catalogue': return { kind, songs: (v.songs || []).map(track).filter(Boolean) };
    default: return null;
  }
}

// ---------- the transport: Supabase Realtime, the room the iPhone joins ----------

class RealtimeTransport {
  constructor() { this.channel = null; this.closed = false; this.onMessage = null; this.onPresence = null; this.onError = null; this.onReconnect = null; this.tap = null; this.lost = 0; }
  /** Same room and payload nesting as RealtimeTransport.swift: topic realtime:party-<room>, event "party", presence key = player id, track {id, name}. */
  join(room, playerID, name) {
    this.closed = false;
    const ch = supabase.channel('party-' + room, { config: { broadcast: { self: true, ack: false }, presence: { key: playerID }, private: false } });
    this.channel = ch;
    ch.on('broadcast', { event: 'party' }, ({ payload }) => { if (this.tap) this.tap('in', payload); if (this.onMessage) this.onMessage(payload); });
    ch.on('presence', { event: 'sync' }, () => { if (this.onPresence) this.onPresence(Object.keys(ch.presenceState())); });
    return new Promise((resolve, reject) => {
      let joined = false;
      const timer = setTimeout(() => { if (!joined) reject(new Error("Couldn't reach the party. Check your connection.")); }, 10000);
      ch.subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          if (joined) {
            // The line dropped and came back by itself (supabase-js rejoins): say who we are again and let the game re-announce.
            if (this.lost) { clearTimeout(this.lost); this.lost = 0; try { await ch.track({ id: playerID, name }); } catch (e) {} if (this.onReconnect) this.onReconnect(); }
            return;
          }
          joined = true; clearTimeout(timer);
          // Presence: say who we are, so the host can list us even before our join message lands.
          try { await ch.track({ id: playerID, name }); } catch (e) {}
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (!joined) { clearTimeout(timer); reject(new Error(status === 'CLOSED' ? 'The party refused us: closed' : "Couldn't reach the party. Check your connection.")); }
          // Dropped after joining: the client retries on its own; like the iPhone's four rejoins, give it a while before giving up.
          else if (!this.closed && status !== 'CLOSED' && !this.lost) this.lost = setTimeout(() => { this.lost = 0; if (!this.closed && this.onError) this.onError('Lost the connection to the party.'); }, 15000);
        }
      });
    });
  }
  async send(message) {
    if (this.closed || !this.channel) return;
    if (this.tap) this.tap('out', message);
    try { await this.channel.send({ type: 'broadcast', event: 'party', payload: message }); }
    catch (e) { if (this.onError) this.onError("Couldn't reach the party. Check your connection."); }
  }
  async leave() {
    this.closed = true; clearTimeout(this.lost); this.lost = 0;
    const ch = this.channel; this.channel = null;
    if (ch) { try { await ch.untrack(); } catch (e) {} try { await supabase.removeChannel(ch); } catch (e) {} }
  }
}

/**
 * A room with no network: every message comes straight back, as Realtime's
 * self-echo does. The demo party (localhost only, -demoParty on the iPhone)
 * plays on it, so every screen can be held and looked at without opening a
 * real room anyone could see.
 */
class LoopbackTransport {
  constructor() { this.channel = null; this.closed = false; this.onMessage = null; this.onPresence = null; this.onError = null; this.tap = null; }
  join() { this.closed = false; this.channel = {}; return new Promise(r => setTimeout(r, 700)); }
  async send(message) {
    if (this.closed || !this.channel) return;
    if (this.tap) this.tap('out', message);
    const copy = JSON.parse(JSON.stringify(message));
    setTimeout(() => { if (this.closed) return; if (this.tap) this.tap('in', copy); if (this.onMessage) this.onMessage(copy); }, 20);
  }
  async leave() { this.closed = true; this.channel = null; }
}
const DEMO_NAMES = ['Mia', 'Noah', 'Liv', 'Theo', 'Sofia', 'Eli', 'Aya', 'Max'];

// ---------- the game ----------

export const ROUND_OPTIONS = [5, 10, 15];
export const DIFFICULTIES = [['mixed', 'Mixed'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
export const WINDOWS = [10, 20, 30, 45, 60];
export const YEARS = [['all', 'Any'], ['80s', '80s'], ['90s', '90s'], ['2000s', '00s'], ['2010s', '10s'], ['2020s', '20s']];
export const freshSettings = () => ({ category: 'all', era: 'all', artist: null, difficulty: 'mixed', easySearch: true, rounds: 10, guessWindow: 20, clipSeconds: 20 });

export class PartyGame {
  /** loopback: no network (localhost demos). standIns: eight stand-ins fill a hosted room and answer at random (-demoParty). */
  constructor(pool, { loopback = false, standIns = false } = {}) {
    this.pool = pool;
    this.demo = standIns;
    this.transport = loopback ? new LoopbackTransport() : new RealtimeTransport();
    /** Seats in the room: 50 for a party, 2 for a friend's 1v1. */
    this.seatLimit = MAX_PLAYERS;
    this.transport.onMessage = m => this.handle(m);
    this.transport.onError = e => { this.phase = 'error'; this.error = e; this.emit(); };
    this.transport.onPresence = ids => this.prune(ids);
    this.transport.onReconnect = () => this.reannounce();
    this.myID = uuid();
    this.phase = 'idle'; this.error = null;
    this.players = []; this.settings = freshSettings(); this.catalogue = [];
    this.code = ''; this.myName = ''; this.isHost = false;
    this.round = 0; this.current = null; this.roundStartedAt = 0; this.roundWindow = 20; this.roundSeconds = 20;
    this.currentChoices = []; this.myPick = null; this.answered = []; this.wrong = new Set();
    this.myPoints = null; this.myRoundsWon = 0; this.lastGained = {}; this.lastAnswer = null;
    /** Every finished round of this game: the song and what each player took (PartyRoundRecord, for the 1v1 breakdown). */
    this.history = [];
    this.preparingSongs = false; this.clockOffset = 0; this.bestRtt = Infinity;
    // host only
    this.queue = []; this.deck = []; this.roundOpen = false; this.gainedThisRound = {}; this.closer = null; this.artistSongs = [];
    this.pings = new Map(); this.timers = new Set();
    this.listeners = new Set();
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(f => { try { f(this); } catch (e) { console.error(e); } }); }
  later(fn, secs) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, Math.max(0, secs) * 1000); this.timers.add(t); return t; }
  /** Shared clock: everyone works in host time. */
  get now() { return nowSecs() + this.clockOffset; }
  get me() { return this.players.find(p => p.id === this.myID) || null; }
  get sortedPlayers() { return this.players.slice().sort((a, b) => (a.score === b.score ? a.hue - b.hue : b.score - a.score)); }
  get sortedByHue() { return this.players.slice().sort((a, b) => a.hue - b.hue); }
  get canStart() { return this.isHost && this.players.length >= 2; }
  get iAnswered() { return this.answered.includes(this.myID); }
  get hostName() { return this.players.find(p => p.isHost)?.name || null; }
  get songsLabel() { return this.settings.artist || (this.settings.category === 'all' ? 'All genres' : this.settings.category); }
  /** "mixed" climbs Easy → Impossible over the game, from the round index alone so every phone agrees. */
  tier(i = this.round) {
    if (TIERS.includes(this.settings.difficulty)) return this.settings.difficulty;
    const rounds = Math.max(1, int(this.settings.rounds));
    return TIERS[Math.min(TIERS.length - 1, Math.floor(i * TIERS.length / rounds))];
  }

  // ---- starting ----
  async host(name, avatar) {
    this.myName = name; this.isHost = true; this.code = makeCode();
    this.players = [{ id: this.myID, name, isHost: true, score: 0, avatar: avatar || null, hue: 0 }];
    this.phase = 'connecting'; this.emit();
    try {
      await this.transport.join(this.code, this.myID, name);
      if (this.phase !== 'connecting') return;
      this.phase = 'lobby';
      // The demo: eight stand-ins fill the room so every screen can be seen with a full house.
      if (this.demo) DEMO_NAMES.forEach((n, i) => this.players.push({ id: 'demo-' + i, name: n, isHost: false, score: 0, avatar: null, hue: i + 2 }));
      this.emit();
      await this.broadcastLobby();
    } catch (e) { this.phase = 'error'; this.error = e.message; this.emit(); }
  }
  /** Host only: Songbot takes a seat. It answers from this device (see the round handler). */
  async addBot(name) {
    if (!this.isHost || this.players.some(p => p.id.startsWith('bot-'))) return;
    this.players.push({ id: 'bot-songbot', name, isHost: false, score: 0, avatar: null, hue: 3 });
    this.emit(); await this.broadcastLobby();
  }
  async join(raw, name, avatar) {
    this.myName = name; this.isHost = false; this.code = normaliseCode(raw);
    if (this.code.length !== 5) { this.phase = 'error'; this.error = "That code doesn't look right."; this.emit(); return; }
    this.phase = 'connecting'; this.emit();
    try {
      await this.transport.join(this.code, this.myID, name);
      await this.transport.send(Msg.join({ id: this.myID, name, isHost: false, score: 0, avatar: avatar || null, hue: 0 }));
      await this.measureClock();
      // If no lobby arrives, the code points at an empty room.
      this.later(() => { if (this.phase === 'connecting') { this.phase = 'error'; this.error = 'No party with that code. Check it with the host.'; this.emit(); } }, 4);
    } catch (e) { if (this.phase === 'connecting') { this.phase = 'error'; this.error = e.message; this.emit(); } }
  }
  /** A finished 1v1 against Songbot, for looking at the result (-demoDuelResult). */
  demoDuelFinish(name) {
    this.isHost = true;
    this.players = [{ id: this.myID, name, isHost: true, score: 3620, avatar: null, hue: 0 }, { id: 'bot-songbot', name: 'Songbot', isHost: false, score: 2890, avatar: null, hue: 3 }];
    const demo = [['Blinding Lights', 'The Weeknd', 962, 0], ['Levitating', 'Dua Lipa', 0, 874], ['Mr. Brightside', 'The Killers', 918, 802], ['Stronger', 'Kanye West', 811, 0], ['Heartless', 'Kanye West', 929, 1214]];
    this.history = demo.map(([title, artist, a, b], i) => ({ id: i, title, artist, artwork: null, gained: { [this.myID]: a, 'bot-songbot': b } }));
    this.settings.rounds = 5;
    this.phase = 'finished'; this.emit();
  }
  async leave() {
    clearTimeout(this.closer); clearTimeout(this.pruneTimer);
    this.timers.forEach(clearTimeout); this.timers.clear();
    if (this.transport.channel) { await this.transport.send(Msg.leave(this.myID)); await this.transport.leave(); }
    this.phase = 'idle'; this.players = []; this.round = 0; this.queue = []; this.current = null;
    this.emit();
  }

  // ---- the host's controls ----
  async pushSettings() { if (this.isHost) await this.broadcastLobby(); }
  async setCategory(category) {
    if (!this.isHost) return;
    this.settings.category = category; this.settings.artist = null; this.artistSongs = []; this.catalogue = [];
    this.emit(); await this.broadcastLobby();
  }
  async setArtist(name, songs) {
    if (!this.isHost) return;
    this.settings.artist = name; this.settings.category = 'all'; this.artistSongs = songs;
    this.catalogue = songs.map(s => ({ id: s.id, title: s.title, artist: s.artist }));
    this.emit(); await this.broadcastLobby();
  }
  async playAgain() { if (this.isHost) await this.transport.send(Msg.again()); }
  async nextRound() { if (!this.isHost) return; this.round += 1; await this.openRound(); }
  async skipRound() { if (this.isHost && this.roundOpen) await this.closeRound(); }

  /**
   * Deal the game. The iPhone host checks every candidate against Apple
   * Music; on the web a song is playable when it has a preview, so the check
   * is local — three candidates a round, the first playable one is dealt.
   */
  async start() {
    if (!this.isHost || this.preparingSongs) return;
    this.preparingSongs = true; this.emit();
    try {
      const rounds = int(this.settings.rounds);
      const candidates = this.drawCandidates(rounds, 3);
      const ok = s => !!s.preview;
      const used = new Set(), picked = [];
      for (const options of candidates) { const s = options.find(x => ok(x) && !used.has(x.id)); if (s) { picked.push(s); used.add(s.id); } }
      for (const s of candidates.flat()) { if (picked.length >= rounds) break; if (ok(s) && !used.has(s.id)) { picked.push(s); used.add(s.id); } }
      this.queue = picked;
      this.deck = picked.map((s, i) => deal(s, this.tier(i), this.pool, this.artistSongs.length ? this.artistSongs : null));
      if (this.queue.length < 2) { this.phase = 'error'; this.error = 'Not enough of those songs are available here.'; return; }
      this.round = 0;
      this.players.forEach(p => { p.score = 0; });
      await this.openRound();
    } finally { this.preparingSongs = false; this.emit(); }
  }
  drawCandidates(rounds, perRound) {
    const seen = new Set(), out = [], era = this.settings.era || 'all';
    for (let r = 0; r < rounds; r++) {
      const t = this.tier(r), options = [];
      if (this.artistSongs.length) {
        // Artist mode: difficulty is catalogue depth — the best known songs Easy, the deep cuts Impossible.
        const band = Pool.depthBand(this.artistSongs, t);
        const fresh = shuffle((band.length ? band : this.artistSongs).filter(s => !seen.has(s.id)));
        const fallback = shuffle(this.artistSongs.filter(s => !seen.has(s.id)));
        for (const s of fresh.concat(fallback)) { if (options.length >= perRound) break; if (!seen.has(s.id)) { seen.add(s.id); options.push(s); } }
      } else {
        for (let k = 0; k < 60 && options.length < perRound; k++) {
          const s = this.pool.pick(t, era, this.settings.category || 'all');
          if (!s || seen.has(s.id)) continue;
          seen.add(s.id); options.push(s);
        }
      }
      out.push(options);
    }
    return out;
  }
  async openRound() {
    if (!this.isHost) return;
    if (this.round >= this.queue.length) { await this.transport.send(Msg.finished(this.scoreMap())); return; }
    const song = this.queue[this.round];
    // Far enough ahead that every phone has the message in hand; the first round gets the full five-second count.
    const startAt = this.now + (this.round === 0 ? 5 : 3);
    await this.transport.send(Msg.round({ index: this.round, songID: song.id, artwork: song.artwork, title: song.title, artist: song.artist,
      startAt, seconds: this.settings.clipSeconds, window: this.settings.guessWindow,
      choices: (this.deck[this.round] || []).map(toChoice) }));
  }
  /** A guess arriving at the host. A wrong tap on the board is final (0 points); typed guesses just miss. */
  async judge(playerID, songID, text, at) {
    if (!this.isHost || !this.roundOpen || this.round >= this.queue.length) return;
    if (playerID in this.gainedThisRound) return;
    const song = this.queue[this.round];
    const correct = songID === song.id || norm(text) === norm(song.title) || norm(text) === norm(`${song.title} ${song.artist}`);
    const answered = () => Object.keys(this.gainedThisRound).length;
    if (!correct && songID != null && this.currentChoices.length) {
      this.gainedThisRound[playerID] = 0;
      await this.transport.send(Msg.scored(playerID, 0, answered()));
      if (answered() >= this.players.length) await this.closeRound();
      return;
    }
    if (!correct) return;
    const elapsed = Math.min(Math.max(0, at - this.roundStartedAt), this.roundWindow);
    // 1000 at the gun, 500 at the buzzer, straight line between.
    const points = Math.round(1000 - 500 * (elapsed / this.roundWindow));
    this.gainedThisRound[playerID] = points;
    const p = this.players.find(x => x.id === playerID); if (p) p.score += points;
    await this.transport.send(Msg.scored(playerID, points, answered()));
    if (answered() >= this.players.length) await this.closeRound();
  }
  async closeRound() {
    if (!this.isHost || !this.roundOpen || this.round >= this.queue.length) return;
    this.roundOpen = false; clearTimeout(this.closer);
    const song = this.queue[this.round];
    await this.transport.send(Msg.result({ index: this.round, title: song.title, artist: song.artist, artwork: song.artwork, gained: this.gainedThisRound, scores: this.scoreMap() }));
  }

  // ---- a player's moves ----
  async pick(id) {
    if (this.phase !== 'playing' || this.iAnswered || this.myPick != null) return;
    this.myPick = id; this.emit();
    const title = this.currentChoices.find(c => c.id === id)?.title || '';
    await this.transport.send(Msg.guess(this.myID, id, title, this.now));
  }
  async submit(songID, text) {
    if (this.phase !== 'playing' || this.iAnswered) return;
    await this.transport.send(Msg.guess(this.myID, songID, text, this.now));
  }

  // ---- receiving ----
  handle(raw) {
    const m = decode(raw); if (!m) return;
    switch (m.kind) {
      case 'join': {
        if (!this.isHost) return;
        if (!this.players.some(p => p.id === m.player.id)) {
          if (this.players.length >= this.seatLimit) return;
          const hue = Math.max(-1, ...this.players.map(p => p.hue)) + 1;
          this.players.push({ ...m.player, isHost: false, score: 0, hue });
        }
        this.broadcastLobby(); this.emit();
        return;
      }
      case 'leave': {
        if (m.playerID === this.myID) return;
        const wasHost = this.players.find(p => p.id === m.playerID)?.isHost;
        this.players = this.players.filter(p => p.id !== m.playerID);
        if (this.isHost) this.broadcastLobby();
        else if (wasHost) { this.phase = 'error'; this.error = 'The host ended the party.'; }
        this.emit(); return;
      }
      case 'lobby':
        if (!this.isHost) { this.players = m.players; this.settings = { ...freshSettings(), ...m.settings, artist: m.settings.artist || null }; }
        if (this.phase === 'connecting') this.phase = 'lobby';
        // The podium stays up until the host sends "again".
        this.emit(); return;
      case 'round': {
        this.round = m.index;
        if (m.index === 0) this.history = [];
        this.currentChoices = m.choices || [];
        this.myPick = null; this.wrong = new Set();
        if (m.index === 0) this.myRoundsWon = 0;
        this.current = { songID: m.songID, title: m.title, artist: m.artist, artwork: m.artwork };
        this.roundStartedAt = m.startAt; this.roundWindow = m.window; this.roundSeconds = m.seconds || m.window;
        this.answered = []; this.myPoints = null; this.gainedThisRound = {}; this.lastGained = {}; this.resultFor = -1;
        const wait = m.startAt - this.now, i = m.index;
        this.phase = wait > 0 ? 'countdown' : 'playing';
        if (wait > 0) this.later(() => { if (this.phase === 'countdown' && this.round === i) { this.phase = 'playing'; this.emit(); } }, wait);
        if (this.isHost) {
          // Songbot plays like a person: right about seven times in ten, at a human speed; a wrong tap costs it the round.
          for (const p of this.players.filter(x => x.id.startsWith('bot-'))) {
            const right = Math.random() < 0.7, delay = Math.max(0, wait) + 2.5 + Math.random() * (Math.max(3, m.window * 0.7) - 2.5);
            const wrongs = (m.choices || []).filter(c => c.id !== m.songID), wrongPick = wrongs.length ? wrongs[Math.floor(Math.random() * wrongs.length)].id : null;
            this.later(() => { if (this.round !== i) return; if (right) this.judge(p.id, m.songID, '', this.now); else if (wrongPick) this.judge(p.id, wrongPick, '', this.now); }, delay);
          }
          if (this.demo) for (const p of this.players.filter(x => x.id.startsWith('demo-'))) {
            if (Math.random() >= 0.75) continue;
            const delay = Math.max(0, wait) + 1.5 + Math.random() * (Math.max(2, m.window - 1) - 1.5);
            this.later(() => { if (this.round === i) this.judge(p.id, m.songID, '', this.now); }, delay);
          }
          this.roundOpen = true; clearTimeout(this.closer);
          this.closer = setTimeout(() => this.closeRound(), (Math.max(0, wait) + m.window + 0.5) * 1000);
        }
        this.emit(); return;
      }
      case 'guess':
        if (this.isHost) this.judge(m.playerID, m.songID, m.text, m.at);
        return;
      case 'scored':
        // Realtime can deliver a round's result before its last score; the result already carries the totals, so a late score is ignored.
        if (this.phase === 'result') return;
        if (!this.answered.includes(m.playerID)) this.answered.push(m.playerID);
        if (m.points === 0) this.wrong.add(m.playerID);
        if (m.playerID === this.myID) { this.myPoints = m.points; if (m.points > 0) this.myRoundsWon += 1; }
        // Realtime can hand over the round's result before its last "scored": the result's totals are the truth, so never add on top of them.
        if (!this.isHost && this.resultFor !== this.round) { const p = this.players.find(x => x.id === m.playerID); if (p) p.score += m.points; }
        this.emit(); return;
      case 'result':
        for (const [id, s] of Object.entries(m.scores)) { const p = this.players.find(x => x.id === id); if (p) p.score = s; }
        this.lastGained = m.gained; this.lastAnswer = { title: m.title, artist: m.artist, artwork: m.artwork };
        if (!this.history.some(r => r.id === m.index)) this.history.push({ id: m.index, title: m.title, artist: m.artist, artwork: m.artwork, gained: m.gained });
        this.round = m.index; this.resultFor = m.index; this.phase = 'result'; this.emit(); return;
      case 'finished':
        for (const [id, s] of Object.entries(m.scores)) { const p = this.players.find(x => x.id === id); if (p) p.score = s; }
        this.phase = 'finished'; this.emit(); return;
      case 'again':
        this.round = 0; this.current = null; this.players.forEach(p => { p.score = 0; });
        this.phase = 'lobby';
        if (this.isHost) this.broadcastLobby();
        this.emit(); return;
      case 'catalogue':
        if (!this.isHost) { this.catalogue = m.songs; this.emit(); }
        return;
      case 'ping':
        if (this.isHost) this.transport.send(Msg.pong(m.id, m.sent, this.now));
        return;
      case 'pong': {
        const t0 = this.pings.get(m.id); if (t0 == null) return;
        this.pings.delete(m.id);
        const rtt = nowSecs() - t0;
        // Host time at the midpoint of the round trip; keep the tightest sample.
        if (rtt < this.bestRtt) { this.bestRtt = rtt; this.clockOffset = m.hostNow + rtt / 2 - nowSecs(); }
        return;
      }
    }
  }
  /** Five quick round trips, keep the tightest — the phones' own clock trick. */
  async measureClock() {
    this.bestRtt = Infinity;
    for (let k = 0; k < 5; k++) {
      const id = uuid(), t0 = nowSecs();
      this.pings.set(id, t0);
      await this.transport.send(Msg.ping(id, t0));
      await new Promise(r => setTimeout(r, 150));
    }
  }
  async broadcastLobby() {
    await this.transport.send(Msg.lobby(this.players, this.settings));
    // Late joiners need the artist's songs too, so it rides with the lobby.
    await this.transport.send(Msg.catalogue(this.catalogue));
  }
  /** Back on the line after a drop: the host re-sends the room, a guest re-introduces itself (same id, so its seat and score are kept). */
  async reannounce() {
    if (this.isHost) await this.broadcastLobby();
    else if (this.me) { await this.transport.send(Msg.join(this.me)); await this.measureClock(); }
  }
  /** Someone missing from presence may only have switched apps for a moment: twenty seconds to come back before their seat goes. */
  prune(ids) {
    clearTimeout(this.pruneTimer);
    this.pruneTimer = setTimeout(() => this.pruneNow(ids), 20000);
  }
  pruneNow(ids) {
    if (!this.isHost || !ids.length || this.phase === 'idle') return;
    const before = this.players.length;
    this.players = this.players.filter(p => ids.includes(p.id) || p.id === this.myID || p.id.startsWith('bot-') || p.id.startsWith('demo-'));
    if (this.players.length !== before) { this.broadcastLobby(); this.emit(); }
  }
  scoreMap() { return Object.fromEntries(this.players.map(p => [p.id, p.score])); }
}
