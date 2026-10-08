// The party engine, wire-compatible with the iPhone app (Party/PartyGame.swift,
// PartyModel.swift, PartyTransport.swift): the same Supabase Realtime room
// (topic realtime:party-<CODE>, broadcast event "party", self-echo on,
// presence keyed by player id), the same PartyMessage JSON — Swift's
// synthesized Codable, {"case": {"label": value}} — and the same rules. The
// host owns the truth: it deals the songs and the four answers, opens and
// closes every round, rules on guesses and hands out points. Everyone else
// renders what the host says and sends guesses back. Every state change
// happens on *receiving* a message; the host applies its own rounds, results
// and rulings at once (handing them to the same handler) instead of waiting
// for the room's echo, which it then ignores. Guesses and clock pings go to
// the host's inbox (realtime:party-<CODE>-inbox) when the host has one.
import { supabase, SUPABASE_URL, SUPABASE_ANON } from './supabase.js';
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
  // The host's team seat (PartyPlayer.team). Omitted in solo, as Swift omits a nil optional.
  if (p.team != null && Number.isFinite(Number(p.team))) o.team = int(p.team);
  // Their default cartoon, 1…20 (PartyPlayer.face). Omitted when unknown, as Swift omits a nil optional.
  if (p.face != null && Number.isFinite(Number(p.face))) o.face = int(p.face);
  return o;
};
/** PartySettings. Every field but artist is required on decode. */
export const wireSettings = s => {
  const o = { category: str(s.category || 'all'), era: str(s.era || 'all'), difficulty: str(s.difficulty || 'mixed'), easySearch: !!s.easySearch,
    rounds: int(s.rounds || 10), guessWindow: num(s.guessWindow || 20), clipSeconds: num(s.clipSeconds || 20) };
  if (s.artist) o.artist = String(s.artist);
  // The host listens on the room's inbox. Only ever sent as true; older hosts leave it out.
  if (s.inbox === true) o.inbox = true;
  // Teams (PartySettings.teams): "two" | "three" | "pairs" | "trios". Absent is solo; older phones ignore it.
  if (teamsOn(s.teams)) o.teams = String(s.teams);
  // One album's songs, named in artist (PartySettings.album). Only ever true; absent for an artist or a genre.
  if (s.album === true && s.artist) o.album = true;
  // Anti-Shazam (PartySettings.antiShazam): a new party sends false, as the iPhone does; absent (an older host) counts as on.
  if (s.antiShazam === true || s.antiShazam === false) o.antiShazam = s.antiShazam;
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
  /** Host → everyone: this player is out of the room for good. Older phones can't read it and simply see them go. */
  kick: playerID => ({ kick: { playerID: str(playerID) } }),
  /** Host → everyone: clock replies, gathered into one message. */
  pongs: entries => ({ pongs: { entries: entries.map(e => clean({ id: str(e.id), sent: num(e.sent), hostNow: num(e.hostNow), hostSent: e.hostSent == null ? undefined : num(e.hostSent) })) } }),
  /** Host → everyone: this player's join was turned away, "full" or "removed" (PartyMessage.refused). */
  refused: (playerID, reason) => ({ refused: { playerID: str(playerID), reason: str(reason) } }),
  /** Host → everyone: the round's answers so far, gathered once a second in a big room. */
  tally: points => ({ tally: { points: intMap(points) } }),
};

/** Decode one message the way Swift would, tolerating what the iPhone omits. Null for anything malformed. */
export function decode(m) {
  if (!m || typeof m !== 'object') return null;
  const keys = Object.keys(m); if (keys.length !== 1) return null;
  const kind = keys[0], v = m[kind] || {};
  const player = p => (p && typeof p === 'object' && p.id != null ? { id: str(p.id), name: str(p.name), isHost: !!p.isHost, score: int(p.score), hue: int(p.hue), avatar: p.avatar || null, team: p.team == null ? null : int(p.team), face: p.face == null ? null : int(p.face) } : null);
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
    case 'kick': return { kind, playerID: str(v.playerID) };
    case 'pongs': return { kind, entries: (Array.isArray(v.entries) ? v.entries : []).filter(e => e && e.id != null).map(e => ({ id: str(e.id), sent: num(e.sent), hostNow: num(e.hostNow), hostSent: e.hostSent == null ? null : num(e.hostSent) })) };
    case 'refused': return { kind, playerID: str(v.playerID), reason: str(v.reason) };
    case 'tally': return { kind, points: intMap(v.points) };
    default: return null;
  }
}

// ---------- the transport: Supabase Realtime, the room the iPhone joins ----------

class RealtimeTransport {
  constructor() { this.channel = null; this.inbox = null; this.room = ''; this.closed = false; this.onMessage = null; this.onPresence = null; this.onError = null; this.onReconnect = null; this.tap = null; this.lost = 0; }
  /** Same room and payload nesting as RealtimeTransport.swift: topic realtime:party-<room>, event "party", presence key = player id, track {id, name}. */
  join(room, playerID, name) {
    this.closed = false; this.room = room;
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
  /**
   * One message to the room. A send that fails doesn't end the party: like the iPhone's recover(), it is tried
   * again up to four times (1.5 s × attempt) while the client rejoins, and only then is the line called lost.
   * Every write gives up after 6 s.
   */
  async send(message) {
    if (this.closed || !this.channel) return;
    if (this.tap) this.tap('out', message);
    for (let attempt = 0; attempt <= 4; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 1500 * attempt));
      if (this.closed || !this.channel) return;
      let r = 'error';
      try { r = await Promise.race([this.channel.send({ type: 'broadcast', event: 'party', payload: message }), new Promise(res => setTimeout(() => res('timed out'), 6000))]); }
      catch (e) { r = 'error'; }
      if (r === 'ok') return;
    }
    if (!this.closed && this.onError) this.onError('Lost the connection to the party.');
  }
  /** Host only, after joining: also listen on the room's inbox (party-<room>-inbox, no self-echo, no presence). True once it is open. */
  openInbox() {
    if (this.closed || !this.room) return Promise.resolve(false);
    const ch = supabase.channel('party-' + this.room + '-inbox', { config: { broadcast: { self: false, ack: false }, private: false } });
    this.inbox = ch;
    ch.on('broadcast', { event: 'party' }, ({ payload }) => { if (this.tap) this.tap('in', payload); if (this.onMessage) this.onMessage(payload); });
    return new Promise(resolve => {
      let done = false;
      const finish = ok => { if (!done) { done = true; clearTimeout(timer); resolve(ok); } };
      const timer = setTimeout(() => finish(false), 6000);
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') finish(true);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') finish(false);
      });
    });
  }
  /** A message for the host alone, over Realtime's REST broadcast to the inbox. If the inbox can't be reached, the room itself still gets there. */
  async sendToHost(message) {
    if (this.closed || !this.room) return;
    if (this.tap) this.tap('out', message);
    let ok = false;
    try {
      const r = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ messages: [{ topic: `party-${this.room}-inbox`, event: 'party', payload: message, private: false }] }),
      });
      ok = r.ok;
    } catch (e) { ok = false; }
    if (!ok) await this.send(message);
  }
  async leave() {
    this.closed = true; clearTimeout(this.lost); this.lost = 0;
    const ch = this.channel, inbox = this.inbox; this.channel = null; this.inbox = null;
    if (ch) { try { await ch.untrack(); } catch (e) {} try { await supabase.removeChannel(ch); } catch (e) {} }
    if (inbox) { try { await supabase.removeChannel(inbox); } catch (e) {} }
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
  /** No inbox on the loopback: the host is the only real player, and handles its own guesses. */
  async openInbox() { return false; }
  async sendToHost(message) { await this.send(message); }
  async leave() { this.closed = true; this.channel = null; }
}
const DEMO_NAMES = ['Mia', 'Noah', 'Liv', 'Theo', 'Sofia', 'Eli', 'Aya', 'Max'];

// ---------- the game ----------

export const ROUND_OPTIONS = [5, 10, 15, 20];
export const DIFFICULTIES = [['mixed', 'Mixed'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['expert', 'Expert'], ['impossible', 'Impossible']];
export const WINDOWS = [10, 20, 30, 45, 60];
export const YEARS = [['all', 'Any'], ['80s', '80s'], ['90s', '90s'], ['2000s', '00s'], ['2010s', '10s'], ['2020s', '20s']];
/** A new party's settings (PartySettings()). antiShazam is off for a new party; album only rides with an album. */
export const freshSettings = () => ({ category: 'all', era: 'all', artist: null, album: null, difficulty: 'mixed', easySearch: true, rounds: 10, guessWindow: 20, clipSeconds: 20, teams: null, antiShazam: false });

/** Songbot's level in a 1v1 (PartyGame.BotLevel): how often it names the song and when it answers, in seconds after the clip starts. */
export const BOT_LEVELS = [
  { key: 'easy', title: 'Easy', tier: 'easy', rightRate: 0.6, answerAt: [4.5, 12] },
  { key: 'hard', title: 'Hard', tier: 'hard', rightRate: 0.8, answerAt: [2.6, 6] },
  { key: 'impossible', title: 'Impossible', tier: 'impossible', rightRate: 0.93, answerAt: [1.6, 3.2] },
];
const BOT_KEY = 'songspot.party.botLevel';
const readBotLevel = () => { try { const v = localStorage.getItem(BOT_KEY); return BOT_LEVELS.some(l => l.key === v) ? v : 'easy'; } catch (e) { return 'easy'; } };

// ---------- namesSong (Engine/Matcher.swift): whether a typed answer names this song ----------
const NUM_WORD = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50',
  sixty: '60', seventy: '70', eighty: '80', ninety: '90',
  first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th',
  to: '2', too: '2', for: '4', u: 'you', ur: 'your', n: 'and', em: 'them', yall: 'you', tupac: '2pac' };
const TAILS = new Set(['t', 's', 'd', 'm', 'll', 're', 've']);
const normalise = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const canonWord = w => { if (NUM_WORD[w]) return NUM_WORD[w]; if (w.length >= 5) { if (w.endsWith('ing')) return w.slice(0, -3) + 'in'; if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1); } return w; };
const canonical = s => { const raw = s.split(' ').filter(Boolean), glued = []; for (const w of raw) { if (raw.length > 1 && TAILS.has(w) && glued.length) glued[glued.length - 1] += w; else glued.push(w); } return glued.map(canonWord).join(' '); };
/** The title, or the title and the artist, compared as the matcher reads words: "believing" is "Believin'", "dont" is "Don't". */
export function namesSong(typed, title, artist) {
  const guess = normalise(typed); if (!guess) return false;
  const t = normalise(title);
  if (guess === t || guess === `${t} ${normalise(artist)}`) return true;
  const g = canonical(guess), c = canonical(t);
  return !!c && (g === c || g === `${c} ${canonical(normalise(artist))}`);
}
/** PlayerName.first: the first word, else the part before "_" or ".". characters.js's own wins once it is wired in (setNameHelpers). */
let firstNameImpl = n => { const t = String(n || '').trim(); const w = t.split(/\s+/)[0] || ''; return (w.split(/[_.]/)[0] || w) || t; };
let shownNameImpl = n => String(n ?? '');
let myFaceImpl = () => null;
export const firstName = n => firstNameImpl(n);
/** The room's name and face rules from characters.js (NameFilter.shown, PlayerName.first, DefaultAvatar.myIndex). */
export function setNameHelpers({ first, shown, myFace } = {}) { if (first) firstNameImpl = first; if (shown) shownNameImpl = shown; if (myFace) myFaceImpl = myFace; }

// ---------- teams (Party/PartyTeams.swift, rule for rule) ----------
// The host alone seats players (player.team) and sends the seating with the lobby. Scores stay per
// player on the wire; a team's score is the average of its players, worked out on every phone.
export const TEAM_MODES = [['solo', 'Solo'], ['two', '2 teams'], ['three', '3 teams'], ['pairs', 'Pairs'], ['trios', 'Trios']];
export const TEAM_NAMES = ['Bass', 'Treble', 'Tempo', 'Encore', 'Reverb', 'Vinyl', 'Chorus', 'Remix', 'Echo', 'Groove', 'Riff', 'Hook', 'Mixtape', 'B-Side', 'Backbeat', 'Falsetto',
  'Loop', 'Drop', 'Verse', 'Bridge', 'Sample', 'Stereo', 'Tape', 'Unplugged', 'Crescendo'];
export const TEAM_COLORS = ['#4cc9f0', '#f8545c', '#19df70', '#f7c823', '#a855f7', '#ff8a2b', '#f72585', '#2ec4b6'];
/** How many teams a room of n has in this mode; 0 is solo (and any mode this build doesn't know). */
export function teamCount(mode, n) {
  switch (mode) {
    case 'two': return 2;
    case 'three': return 3;
    case 'pairs': return Math.max(2, Math.floor((n + 1) / 2));
    case 'trios': return Math.max(2, Math.floor((n + 2) / 3));
    default: return 0;
  }
}
export const teamsOn = mode => teamCount(mode, 2) > 0;
export const teamName = i => (i >= 0 && i < TEAM_NAMES.length ? TEAM_NAMES[i] : `Team ${i + 1}`);
export const teamColor = i => TEAM_COLORS[((i % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length];
export const teamModeLabel = mode => (TEAM_MODES.find(([k]) => k === mode) || [null, 'Teams'])[1];
export function describeTeams(mode, n) {
  const c = teamCount(mode, n);
  if (!c) return 'Everyone for themselves';
  if (mode === 'pairs') return `Teams of two · ${c} teams`;
  if (mode === 'trios') return `Teams of three · ${c} teams`;
  return `${c} teams split the room`;
}
/** Everyone dealt round the teams like cards — in join order, or shuffled. */
export function balanceTeams(players, mode, shuffled = false) {
  const n = teamCount(mode, players.length);
  if (!n) return players.map(p => ({ ...p, team: null }));
  const order = shuffled ? shuffle(players.map(p => p.id)) : players.slice().sort((a, b) => a.hue - b.hue).map(p => p.id);
  const seat = new Map(order.map((id, k) => [id, k % n]));
  return players.map(p => ({ ...p, team: seat.get(p.id) }));
}
/** Where a newcomer sits: the smallest team, the first of equals. */
export function seatTeam(players, mode) {
  const n = teamCount(mode, players.length + 1);
  if (!n) return null;
  const sizes = Array(n).fill(0);
  for (const p of players) if (p.team != null && p.team >= 0 && p.team < n) sizes[p.team]++;
  let best = 0; for (let i = 0; i < n; i++) if (sizes[i] < sizes[best]) best = i;
  return best;
}
/** The teams a lobby shows: every seat the mode has, empty or not, plus any team a player is still on. */
export function lobbyTeams(players, mode) {
  const n = teamCount(mode, players.length);
  if (!n) return [];
  const all = new Set([...Array(n).keys(), ...players.filter(p => p.team != null).map(p => p.team)]);
  return [...all].sort((a, b) => a - b).map(t => ({ team: t, members: players.filter(p => p.team === t).sort((a, b) => a.hue - b.hue) }));
}
/** Teams with players on them, best first (ties: the lower team first). score and gained are averages, rounded. */
export function teamStandings(players, mode, gained = {}) {
  if (!teamsOn(mode)) return [];
  const groups = new Map();
  for (const p of players) if (p.team != null) { if (!groups.has(p.team)) groups.set(p.team, []); groups.get(p.team).push(p); }
  return [...groups].map(([t, ms]) => ({
    id: t, name: teamName(t), color: teamColor(t),
    members: ms.slice().sort((a, b) => (a.score === b.score ? a.hue - b.hue : b.score - a.score)),
    score: Math.round(ms.reduce((s, p) => s + p.score, 0) / ms.length),
    gained: Math.round(ms.reduce((s, p) => s + (gained[p.id] || 0), 0) / ms.length),
  })).sort((a, b) => (a.score === b.score ? a.id - b.id : b.score - a.score));
}

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
    /** Why the last Start didn't start, for the host's lobby. The room stays open. */
    this.startNote = null;
    /** The room as the game ended, best first: the podium and the 1v1 result read this, so someone leaving can't reshuffle it. */
    this.finalPlayers = [];
    /** How good Songbot plays in a 1v1, kept for next time (songspot.party.botLevel). */
    this.botLevel = readBotLevel();
    this.preparingSongs = false; this.clockOffset = 0;
    /** Held countdowns (the -demoRoomCountdown / -demoDuelCountdown stagers) stay on screen. */
    this.holdCountdown = false;
    // host only
    this.queue = []; this.deck = []; this.roundOpen = false; this.gainedThisRound = {}; this.closer = null; this.artistSongs = [];
    /** Who made the album in play, for the Songs sheet. */
    this.albumArtist = null;
    this.pings = new Map(); this.pingRTT = new Map(); this.timers = new Set();
    /** Players the host removed; their joins are turned away for the rest of the room. */
    this.kicked = new Set();
    /** The scores of players who dropped out this game, by id (their points wait for them). */
    this.departed = {};
    /** The rounds the host picked, while a short game plays fewer. */
    this.chosenRounds = null;
    this.pendingPongs = []; this.pongFlush = 0; this.pendingTally = {}; this.tallyFlush = 0;
    this.lobbyTimer = 0; this.sentCatalogue = false;
    /** The last round index this device heard. */
    this.heardRound = -1;
    this.listeners = new Set();
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(f => { try { f(this); } catch (e) { console.error(e); } }); }
  later(fn, secs) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, Math.max(0, secs) * 1000); this.timers.add(t); return t; }
  cancel(t) { if (t) { clearTimeout(t); this.timers.delete(t); } }
  /** Shared clock: everyone works in host time. */
  get now() { return nowSecs() + this.clockOffset; }
  get me() { return this.players.find(p => p.id === this.myID) || null; }
  get sortedPlayers() { return this.players.slice().sort((a, b) => (a.score === b.score ? a.hue - b.hue : b.score - a.score)); }
  get sortedByHue() { return this.players.slice().sort((a, b) => a.hue - b.hue); }
  get canStart() {
    if (!this.isHost || this.players.length < 2) return false;
    // A team game needs two sides with someone on them.
    return !this.teamsOn || new Set(this.players.filter(p => p.team != null).map(p => p.team)).size >= 2;
  }
  get teamsOn() { return teamsOn(this.settings.teams); }
  get myTeam() { return this.teamsOn ? (this.me?.team ?? null) : null; }
  get iAnswered() { return this.answered.includes(this.myID); }
  get hostName() { return this.players.find(p => p.isHost)?.name || null; }
  /** The artist, the album's name (already without its edition), or the genre. */
  get songsLabel() { return this.settings.artist || (this.settings.category === 'all' ? 'All genres' : this.settings.category); }
  /** The room plays one album (named in settings.artist). */
  get isAlbum() { return this.settings.album === true && !!this.settings.artist; }
  /** The room plays one artist. */
  get isArtist() { return !!this.settings.artist && !this.isAlbum; }
  /** The host has anti-Shazam on. An older host, who sends no setting, always had it. */
  get antiShazam() { return this.settings.antiShazam ?? true; }
  setBotLevel(key) { if (!BOT_LEVELS.some(l => l.key === key)) return; this.botLevel = key; try { localStorage.setItem(BOT_KEY, key); } catch (e) {} this.emit(); }
  /** "mixed" climbs Easy → Impossible over the game, from the round index alone so every phone agrees. */
  tier(i = this.round) {
    if (TIERS.includes(this.settings.difficulty)) return this.settings.difficulty;
    const rounds = Math.max(1, int(this.settings.rounds));
    return TIERS[Math.min(TIERS.length - 1, Math.floor(i * TIERS.length / rounds))];
  }
  /**
   * The count has run out by the game clock: start the round now. The countdown screen calls this every frame,
   * so the round begins on the same clock the number is drawn from (a timer set when the round arrived can run
   * late after a mid-count clock re-sync, which left the count sitting on 0).
   */
  startIfDue() {
    if (this.holdCountdown) return;
    if (this.phase === 'countdown' && this.now >= this.roundStartedAt) { this.phase = 'playing'; this.emit(); }
  }

  // ---- starting ----
  async host(name, avatar) {
    this.myName = name; this.isHost = true;
    // fixedCode: a known room (the -roomCode knob), so a second page can join it.
    this.code = this.fixedCode ? normaliseCode(this.fixedCode) : makeCode();
    this.players = [{ id: this.myID, name, isHost: true, score: 0, avatar: avatar || null, hue: 0, face: myFaceImpl(name) }];
    this.phase = 'connecting'; this.emit();
    try {
      await this.transport.join(this.code, this.myID, name);
      if (this.phase !== 'connecting') return;
      // Guesses and clock pings come in on the inbox; the lobby tells guests it is there.
      if (await this.transport.openInbox()) this.settings.inbox = true;
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
  joinPlayer() { return { id: this.myID, name: this.myName, isHost: false, score: 0, avatar: this.myAvatar || null, hue: 0, face: myFaceImpl(this.myName) }; }
  async join(raw, name, avatar) {
    this.myName = name; this.myAvatar = avatar; this.isHost = false; this.code = normaliseCode(raw);
    if (this.code.length !== 5) { this.phase = 'error'; this.error = "That code doesn't look right."; this.emit(); return; }
    this.phase = 'connecting'; this.emit();
    try {
      await this.transport.join(this.code, this.myID, name);
      this.lastJoinSent = Date.now();
      await this.transport.send(Msg.join(this.joinPlayer()));
      // The clock is measured once the lobby is here, so the pings can go to the host's inbox. If no lobby arrives, the room is empty.
      for (let k = 0; k < 40 && this.phase === 'connecting'; k++) await new Promise(r => setTimeout(r, 100));
      if (this.phase === 'connecting') { this.phase = 'error'; this.error = 'No answer from that code. Check it, and that the host has Songspot open.'; this.emit(); return; }
      if (this.phase === 'error' || this.phase === 'idle') return;   // turned away (full, or removed)
      await this.measureClock();
    } catch (e) { if (this.phase === 'connecting') { this.phase = 'error'; this.error = e.message; this.emit(); } }
  }

  // ---- the stagers (localhost knobs, the iPhone's DEBUG launch flags) ----
  /** A finished 1v1 against Songbot (-demoDuelResult). */
  demoDuelFinish(name) {
    this.isHost = true;
    this.players = [{ id: this.myID, name, isHost: true, score: 3620, avatar: null, hue: 0, face: myFaceImpl(name) }, { id: 'bot-songbot', name: 'Songbot', isHost: false, score: 2890, avatar: null, hue: 3 }];
    const demo = [['Blinding Lights', 'The Weeknd', 962, 0], ['Levitating', 'Dua Lipa', 0, 874], ['Mr. Brightside', 'The Killers', 918, 802], ['Stronger', 'Kanye West', 811, 0], ['Heartless', 'Kanye West', 929, 1214]];
    this.history = demo.map(([title, artist, a, b], i) => ({ id: i, title, artist, artwork: null, gained: { [this.myID]: a, 'bot-songbot': b } }));
    this.settings.rounds = 5;
    this.finalPlayers = this.sortedPlayers;
    this.phase = 'finished'; this.emit();
  }
  /** A room of ten in two teams: seated (lobby), scored mid-game (round) or finished (-demoTeams, -demoTeamRound, -demoTeamResult). */
  demoTeams(name, target, mode = 'two') {
    this.isHost = true; this.code = this.code || 'BCDFG';
    const names = [name, ...DEMO_NAMES, 'Zoe'], scores = [4210, 3890, 5120, 2980, 4460, 3310, 4705, 2650, 3995, 3570];
    this.players = names.map((n, i) => ({ id: i === 0 ? this.myID : 'demo-' + i, name: n, isHost: i === 0, score: target ? scores[i] : 0, avatar: null, hue: i === 0 ? 0 : i + 1, team: null, face: i === 0 ? myFaceImpl(name) : null }));
    this.settings.teams = mode;
    this.players = balanceTeams(this.players, mode);
    if (target === 'round') {
      this.settings.rounds = 10;
      this.round = 6; this.heardRound = 6;
      this.lastGained = Object.fromEntries(this.players.map(p => [p.id, [0, 612, 874, 0, 755][Math.abs(p.hue) % 5]]));
      this.lastAnswer = { title: 'Blinding Lights', artist: 'The Weeknd', artwork: null };
      this.answered = this.players.map(p => p.id);
      this.phase = 'result';
    } else if (target === 'finished') { this.settings.rounds = 10; this.finalPlayers = this.sortedPlayers; this.phase = 'finished'; }
    else this.phase = 'lobby';
    this.emit();
  }
  /** A finished party without teams, for the podium (-demoSoloResult). */
  demoSoloFinish(name) {
    this.isHost = true; this.code = this.code || 'BCDFG';
    const scores = [4210, 3890, 5120, 2980, 4460, 3310, 4705, 2650, 3995, 3570];
    this.players = [name, ...DEMO_NAMES].map((n, i) => ({ id: i === 0 ? this.myID : 'demo-' + i, name: n, isHost: i === 0, score: scores[i % scores.length], avatar: null, hue: i === 0 ? 0 : i + 1, face: i === 0 ? myFaceImpl(name) : null }));
    this.settings.teams = null; this.settings.rounds = 10;
    this.finalPlayers = this.sortedPlayers;
    this.phase = 'finished'; this.emit();
  }
  /** Hold a 1v1 round intro on screen (-demoDuelCountdown). */
  demoDuelCountdown(name) {
    this.isHost = true; this.holdCountdown = true;
    this.players = [{ id: this.myID, name, isHost: true, score: 912, avatar: null, hue: 0, face: myFaceImpl(name) }, { id: 'bot-songbot', name: 'Songbot', isHost: false, score: 780, avatar: null, hue: 3 }];
    this.settings.rounds = 5; this.round = 1;
    this.roundStartedAt = this.now + 3.2;
    this.phase = 'countdown'; this.emit();
  }
  /** Hold a full room's round intro on screen (-demoRoomCountdown; first round: -demoFirstRound). */
  demoRoomCountdown(name, first = false, emit = true) {
    this.isHost = true; this.holdCountdown = true;
    const scores = [1480, 1668, 1603, 1493, 939, 1210, 870, 1140, 660];
    this.players = [name, ...DEMO_NAMES].map((n, i) => ({ id: i === 0 ? this.myID : 'demo-' + i, name: n, isHost: i === 0, score: scores[i], avatar: null, hue: i, face: i === 0 ? myFaceImpl(n) : null }));
    this.settings.rounds = 10;
    this.round = first ? 0 : 2;
    this.roundStartedAt = this.now + 3.2;
    this.phase = 'countdown'; if (emit) this.emit();
  }
  /** Hold a full room mid-round, four answers on the board and half the room already in (-demoRoomRound). */
  demoRoomRound(name) {
    this.demoRoomCountdown(name, false, false);
    const song = this.pool.pick('medium', 'all', 'all'); if (!song) return;
    const others = [];
    for (let k = 0; k < 60 && others.length < 3; k++) { const x = this.pool.pick('medium', 'all', 'all'); if (x && x.id !== song.id && !others.some(o => o.id === x.id)) others.push(x); }
    this.current = { songID: song.id, title: song.title, artist: song.artist, artwork: song.artwork };
    this.currentChoices = shuffle([song, ...others]).map(toChoice);
    this.myPick = null; this.roundWindow = 20; this.roundSeconds = 20;
    this.roundStartedAt = this.now - 6;
    this.answered = this.players.filter(p => p.hue % 2 === 1).map(p => p.id);
    this.phase = 'playing'; this.emit();
  }

  async leave() {
    clearTimeout(this.closer); clearTimeout(this.pruneTimer);
    this.timers.forEach(clearTimeout); this.timers.clear();
    this.lobbyTimer = 0; this.pongFlush = 0; this.tallyFlush = 0; this.pendingPongs = []; this.pendingTally = {};
    const t = this.transport;
    if (t.channel) { await t.send(Msg.leave(this.myID)); await t.leave(); }
    this.phase = 'idle'; this.players = []; this.round = 0; this.queue = []; this.current = null;
    this.startNote = null;
    if (this.chosenRounds != null) { this.settings.rounds = this.chosenRounds; this.chosenRounds = null; }
    this.emit();
  }

  // ---- the host's controls ----
  /** The host changed a setting: tell the room. */
  async pushSettings() { if (!this.isHost) return; this.startNote = null; await this.broadcastLobby(); }
  async setCategory(category) {
    if (!this.isHost) return;
    this.settings.category = category; this.settings.artist = null; this.settings.album = null; this.albumArtist = null;
    this.artistSongs = []; this.catalogue = []; this.startNote = null;
    this.emit(); await this.broadcastLobby();
  }
  /** One artist's songs for the whole game: straight from the pool, or loaded from Apple for anyone else. */
  async setArtist(name, songs) {
    if (!this.isHost) return;
    this.settings.artist = name; this.settings.album = null; this.albumArtist = null; this.settings.category = 'all'; this.artistSongs = songs;
    this.catalogue = songs.map(s => ({ id: s.id, title: s.title, artist: s.artist }));
    this.startNote = null;
    this.emit(); await this.broadcastLobby();
  }
  /**
   * One album's songs, through the artist's own mechanism so older phones still play along: settings.artist
   * carries the album's display name and the tracks go out as the catalogue; album tells newer phones it's an album.
   */
  async setAlbum(displayName, artist, songs) {
    if (!this.isHost) return;
    this.settings.artist = displayName; this.settings.album = true; this.albumArtist = artist; this.settings.category = 'all'; this.artistSongs = songs;
    this.catalogue = songs.map(s => ({ id: s.id, title: s.title, artist: s.artist }));
    this.startNote = null;
    this.emit(); await this.broadcastLobby();
  }
  // ---- teams (host only); the caller tells the room (pushSettings) ----
  /** A new team mode: everyone dealt out again in join order. Solo clears the seats. */
  setTeams(mode) {
    if (!this.isHost) return;
    const m = teamsOn(mode) ? mode : null;
    this.settings.teams = m;
    this.players = balanceTeams(this.players, m);
    this.emit();
  }
  /** Deal the teams again at random, still even. */
  shuffleTeams() { if (this.isHost && this.teamsOn) { this.players = balanceTeams(this.players, this.settings.teams, true); this.emit(); } }
  /** The host moves one player to another team. */
  moveToTeam(id, team) {
    const p = this.isHost && this.teamsOn ? this.players.find(x => x.id === id) : null;
    if (p) { p.team = team; this.emit(); }
  }
  /** The team after this player's, round the room's teams — a tap in the lobby. */
  nextTeam(id) {
    const n = Math.max(2, teamCount(this.settings.teams, this.players.length));
    const t = this.players.find(p => p.id === id)?.team ?? -1;
    return (t + 1) % n;
  }
  async playAgain() { if (this.isHost) await this.transport.send(Msg.again()); }
  /** One tap only: a double tap used to skip a song and end the game early. */
  async nextRound() { if (!this.isHost || this.phase !== 'result') return; this.round += 1; await this.openRound(); }
  /** Host only: take a player out of the room for good. */
  async kick(id) {
    if (!this.isHost || id === this.myID) return;
    this.kicked.add(id);
    this.players = this.players.filter(p => p.id !== id);
    this.emit();
    await this.transport.send(Msg.kick(id));
    await this.broadcastLobby();
  }
  async skipRound() { if (this.isHost && this.roundOpen) await this.closeRound(); }

  /**
   * Deal the game. The iPhone host checks every candidate against Apple Music; on the web a song plays
   * when it has a preview, so the check is local. Three candidates a round, the first playable one is dealt.
   * Too few to play: the room stays open with a note rather than ending the party for everyone.
   */
  async start() {
    if (!this.isHost || this.preparingSongs) return;
    this.preparingSongs = true; this.startNote = null; this.emit();
    try {
      const rounds = int(this.settings.rounds);
      const candidates = this.drawCandidates(rounds, 3);
      const ok = new Set(candidates.flat().filter(s => !!s.preview).map(s => s.id));
      const used = new Set(), picked = [];
      for (const options of candidates) { const s = options.find(x => ok.has(x.id) && !used.has(x.id)); if (s) { picked.push(s); used.add(s.id); } }
      // Rounds that lost all three candidates borrow any playable leftover.
      for (const s of candidates.flat()) { if (picked.length >= rounds) break; if (ok.has(s.id) && !used.has(s.id)) { picked.push(s); used.add(s.id); } }
      this.queue = picked;
      if (this.queue.length < 2) {
        const all = candidates.flat().length, a = this.settings.artist;
        this.startNote = all < 2
          ? (a ? (this.isAlbum ? `Too few songs on ${a}. Try another album.` : `Too few songs by ${a}. Try another artist.`) : 'Too few songs for these settings. Try another genre or decade.')
          : !ok.size ? "Couldn't check the songs. Check your connection and try again."
          : 'Not enough of those songs play on Apple Music here.';
        return;
      }
      // Fewer songs than rounds: the game is as long as the songs, so every count, the final round and the mixed ladder agree.
      const short = this.queue.length < rounds;
      if (short) { this.chosenRounds = rounds; this.settings.rounds = this.queue.length; }
      this.deck = picked.map((s, i) => deal(s, this.tier(i), this.pool, this.artistSongs.length ? this.artistSongs : null, this.settings.category || 'all'));
      this.round = 0; this.heardRound = -1; this.departed = {};
      this.players.forEach(p => { p.score = 0; });
      // Straight to the room, not debounced, so it lands before the first round.
      if (short) await this.transport.send(Msg.lobby(this.players, this.settings));
      await this.openRound();
    } finally { this.preparingSongs = false; this.emit(); }
  }
  drawCandidates(rounds, perRound) {
    const seen = new Set(), out = [], era = this.settings.era || 'all';
    for (let r = 0; r < rounds; r++) {
      const t = this.tier(r), options = [];
      if (this.artistSongs.length) {
        // Artist (or album) mode: difficulty is catalogue depth — the best known songs Easy, the deep cuts Impossible.
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
    if (this.round >= this.queue.length) {
      // The host finishes at once and says it twice; a phone that missed it would sit on the last round.
      const m = Msg.finished(this.scoreMap());
      this.handle(m);
      await this.transport.send(m);
      // Not after a quick "Play again": it would pull the room back to the podium.
      this.later(() => { if (this.phase === 'finished') this.transport.send(m); }, 1.2);
      return;
    }
    const song = this.queue[this.round], index = this.round;
    // Far enough ahead that every phone has the message in hand; the first round gets the full five-second count.
    const startAt = this.now + (index === 0 ? 5 : 3);
    const m = Msg.round({ index, songID: song.id, artwork: song.artwork, title: song.title, artist: song.artist,
      startAt, seconds: this.settings.clipSeconds, window: this.settings.guessWindow,
      choices: (this.deck[index] || []).map(toChoice) });
    // The host starts the round itself, not on the room's echo, and says it twice.
    this.handle(m);
    await this.transport.send(m);
    this.later(() => { if (this.round === index) this.transport.send(m); }, 1.5);
  }
  /** A guess arriving at the host. A wrong tap on the board is final (0 points); typed guesses just miss. */
  async judge(playerID, songID, text, at) {
    if (!this.isHost || !this.roundOpen || this.round >= this.queue.length) return;
    if (this.answered.includes(playerID) || playerID in this.gainedThisRound) return;
    // Only seats count towards closing the round: a phone that was turned away still hears the rounds.
    if (!this.players.some(p => p.id === playerID)) return;
    const song = this.queue[this.round];
    const correct = songID === song.id || namesSong(text, song.title, song.artist);
    const answered = () => Object.keys(this.gainedThisRound).length;
    if (!correct && songID != null && this.currentChoices.length) {
      this.gainedThisRound[playerID] = 0;
      await this.announce(playerID, 0);
      if (answered() >= this.players.length) await this.closeRound();
      return;
    }
    if (!correct) return;
    const elapsed = Math.min(Math.max(0, at - this.roundStartedAt), this.roundWindow);
    // 1000 at the gun, 500 at the buzzer, straight line between.
    const points = Math.round(1000 - 500 * (elapsed / this.roundWindow));
    this.gainedThisRound[playerID] = points;
    const p = this.players.find(x => x.id === playerID); if (p) p.score += points;
    await this.announce(playerID, points);
    if (answered() >= this.players.length) await this.closeRound();
  }
  /** Tell the room an answer was ruled: a small room hears each one, a big one gets them gathered once a second. */
  async announce(playerID, points) {
    this.applyScore(playerID, points);
    if (this.players.length <= 10) { await this.transport.send(Msg.scored(playerID, points, Object.keys(this.gainedThisRound).length)); return; }
    this.pendingTally[playerID] = points;
    if (!this.tallyFlush) this.tallyFlush = this.later(() => {
      const batch = this.pendingTally;
      this.pendingTally = {}; this.tallyFlush = 0;
      if (Object.keys(batch).length) this.transport.send(Msg.tally(batch));
    }, 1);
  }
  async closeRound() {
    if (!this.isHost || !this.roundOpen || this.round >= this.queue.length) return;
    this.roundOpen = false; clearTimeout(this.closer);
    const song = this.queue[this.round], index = this.round;
    this.cancel(this.tallyFlush); this.tallyFlush = 0; this.pendingTally = {};   // the result carries every score
    const m = Msg.result({ index, title: song.title, artist: song.artist, artwork: song.artwork, gained: this.gainedThisRound, scores: this.scoreMap() });
    this.handle(m);
    await this.transport.send(m);
    this.later(() => { if (this.round === index && this.phase === 'result') this.transport.send(m); }, 1.2);
  }
  /** One player's answer this round, once however many times it arrives. */
  applyScore(id, points) {
    // Realtime can deliver a round's result before its last score; the result already carries the totals.
    if (this.phase === 'result') return;
    if (this.answered.includes(id)) return;
    this.answered.push(id);
    if (points === 0) this.wrong.add(id);
    if (id === this.myID) { this.myPoints = points; if (points > 0) this.myRoundsWon += 1; }
    if (!this.isHost) { const p = this.players.find(x => x.id === id); if (p) p.score += points; }
    this.emit();
  }
  /** A message for the host alone: handled here on the host's own device, sent to the inbox when the host has one, else to the room. */
  async toHost(m) {
    if (this.isHost) { this.handle(m); return; }
    if (this.settings.inbox === true) await this.transport.sendToHost(m); else await this.transport.send(m);
  }

  // ---- a player's moves ----
  async pick(id) {
    if (this.phase !== 'playing' || this.iAnswered || this.myPick != null) return;
    this.myPick = id; this.emit();
    const title = this.currentChoices.find(c => c.id === id)?.title || '';
    await this.toHost(Msg.guess(this.myID, id, title, this.now));
  }
  async submit(songID, text) {
    if (this.phase !== 'playing' || this.iAnswered) return;
    await this.toHost(Msg.guess(this.myID, songID, text, this.now));
  }

  // ---- receiving ----
  handle(raw) {
    const m = decode(raw); if (!m) return;
    switch (m.kind) {
      case 'join': {
        if (!this.isHost) return;
        // Turned away: say so, or that phone waits in a room it isn't in.
        if (this.kicked.has(m.player.id)) { this.transport.send(Msg.refused(m.player.id, 'removed')); return; }
        // Already seated (a rejoin after a drop): just send the lobby back.
        if (!this.players.some(p => p.id === m.player.id)) {
          if (this.players.length >= this.seatLimit) { this.transport.send(Msg.refused(m.player.id, 'full')); return; }
          // A new seat is a guest's, with the points it had before a drop and no others: a join can't crown itself or name a score.
          const score = this.departed[m.player.id] ?? 0; delete this.departed[m.player.id];
          const hue = Math.max(-1, ...this.players.map(p => p.hue)) + 1;
          // In a team game a newcomer joins the smallest team.
          const team = seatTeam(this.players, this.settings.teams);
          this.players.push({ ...m.player, name: shownNameImpl(m.player.name), isHost: false, score, hue, team });
        }
        this.broadcastLobby(); this.emit();
        return;
      }
      case 'leave': {
        if (m.playerID === this.myID) return;
        const p = this.players.find(x => x.id === m.playerID), wasHost = !!p?.isHost;
        if (this.isHost && p) this.departed[p.id] = p.score;
        this.players = this.players.filter(x => x.id !== m.playerID);
        if (this.isHost) this.broadcastLobby();
        else if (wasHost) { this.phase = 'error'; this.error = 'The host ended the party.'; }
        this.emit(); return;
      }
      case 'lobby':
        if (!this.isHost) {
          this.players = m.players.map(p => ({ ...p, name: shownNameImpl(p.name) }));
          // As decoded on the iPhone: what the host sent, absent optionals stay absent (antiShazam absent counts as on).
          const s = m.settings;
          this.settings = { ...freshSettings(), ...s, artist: s.artist || null, album: s.album === true ? true : null, antiShazam: typeof s.antiShazam === 'boolean' ? s.antiShazam : null, teams: s.teams || null };
        }
        // Our join was lost on the way: the lobby doesn't list us, so ask again, every few seconds at most.
        if (!this.isHost && !m.players.some(p => p.id === this.myID) && Date.now() - (this.lastJoinSent || 0) > 3000) {
          this.lastJoinSent = Date.now();
          this.transport.send(Msg.join(this.joinPlayer()));
        }
        if (this.phase === 'connecting') this.phase = 'lobby';
        // The podium stays up until the host sends "again".
        this.emit(); return;
      case 'round': {
        // The host re-sends a round; hearing it twice is harmless.
        if (m.index === this.heardRound && (this.phase === 'countdown' || this.phase === 'playing')) return;
        this.heardRound = m.index;
        this.round = m.index;
        if (m.index === 0) this.history = [];
        this.currentChoices = m.choices || [];
        this.myPick = null; this.wrong = new Set();
        if (m.index === 0) this.myRoundsWon = 0;
        this.current = { songID: m.songID, title: m.title, artist: m.artist, artwork: m.artwork };
        this.roundStartedAt = m.startAt; this.roundWindow = m.window; this.roundSeconds = m.seconds || m.window;
        this.answered = []; this.myPoints = null; this.gainedThisRound = {}; this.lastGained = {};
        const wait = m.startAt - this.now, i = m.index;
        this.phase = 'countdown';
        this.later(() => { if (this.phase === 'countdown' && this.round === i && !this.holdCountdown) { this.phase = 'playing'; this.emit(); } }, Math.max(0, wait));
        if (this.isHost) {
          // Songbot, the friend who always says yes: it plays like a person at the level the host picked.
          const level = BOT_LEVELS.find(l => l.key === this.botLevel) || BOT_LEVELS[0];
          for (const p of this.players.filter(x => x.id.startsWith('bot-'))) {
            const right = Math.random() < level.rightRate, [lo, hi] = level.answerAt;
            const latest = Math.max(lo, Math.min(hi, m.window - 1));
            const delay = Math.max(0, wait) + lo + Math.random() * (latest - lo);
            const wrongs = (m.choices || []).filter(c => c.id !== m.songID), wrongPick = wrongs.length ? wrongs[Math.floor(Math.random() * wrongs.length)].id : null;
            this.later(() => { if (this.round !== i) return; if (right) this.judge(p.id, m.songID, '', this.now); else if (wrongPick) this.judge(p.id, wrongPick, '', this.now); }, delay);
          }
          if (this.demo) for (const p of this.players.filter(x => x.id.startsWith('demo-'))) {
            const delay = Math.max(0, wait) + 1.5 + Math.random() * (Math.max(2, m.window - 1) - 1.5);
            const wrongs = (m.choices || []).filter(c => c.id !== m.songID);
            const pick = Math.random() < 0.75 || !wrongs.length ? m.songID : wrongs[Math.floor(Math.random() * wrongs.length)].id;
            this.later(() => { if (this.round === i) this.judge(p.id, pick, '', this.now); }, delay);
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
        this.applyScore(m.playerID, m.points);
        return;
      case 'tally':
        for (const [id, p] of Object.entries(m.points)) this.applyScore(id, p);
        return;
      case 'result':
        // A repeat that arrives after the next round has begun is old news.
        if (this.heardRound > m.index) return;
        // A big room's last answers were still waiting in the tally: count them before the result locks the round.
        for (const [id, pts] of Object.entries(m.gained)) this.applyScore(id, pts);
        for (const [id, s] of Object.entries(m.scores)) { const p = this.players.find(x => x.id === id); if (p) p.score = s; }
        this.lastGained = m.gained; this.lastAnswer = { title: m.title, artist: m.artist, artwork: m.artwork };
        if (!this.history.some(r => r.id === m.index)) this.history.push({ id: m.index, title: m.title, artist: m.artist, artwork: m.artwork, gained: m.gained });
        this.round = m.index; this.phase = 'result'; this.emit(); return;
      case 'finished':
        // A late copy must not pull a fresh lobby back to the podium.
        if (this.phase === 'lobby') return;
        for (const [id, s] of Object.entries(m.scores)) { const p = this.players.find(x => x.id === id); if (p) p.score = s; }
        if (this.phase !== 'finished') this.finalPlayers = this.sortedPlayers;
        this.phase = 'finished'; this.emit(); return;
      case 'again':
        this.round = 0; this.current = null; this.players.forEach(p => { p.score = 0; });
        // A game cut short by too few songs: the next is as long as the host chose.
        if (this.isHost && this.chosenRounds != null) { this.settings.rounds = this.chosenRounds; this.chosenRounds = null; }
        this.phase = 'lobby';
        if (this.isHost) this.broadcastLobby();
        this.emit(); return;
      case 'catalogue':
        if (!this.isHost) { this.catalogue = m.songs; this.emit(); }
        return;
      case 'kick':
        this.players = this.players.filter(p => p.id !== m.playerID);
        if (m.playerID === this.myID && !this.isHost) {
          this.phase = 'error'; this.error = 'The host removed you from the party.';
          this.transport.leave();
        }
        this.emit(); return;
      case 'refused':
        // Only a phone without a seat can be turned away.
        if (m.playerID !== this.myID || this.isHost || this.players.some(p => p.id === this.myID)) return;
        this.phase = 'error'; this.error = m.reason === 'removed' ? 'The host removed you from the party.' : 'That room is full.';
        this.transport.leave();
        this.emit(); return;
      case 'ping': {
        // Replies are gathered for a quarter second and sent as one, stamped with when they really went.
        if (!this.isHost) return;
        this.pendingPongs.push({ id: m.id, sent: m.sent, hostNow: this.now });
        if (!this.pongFlush) this.pongFlush = this.later(() => {
          const sentAt = this.now, batch = this.pendingPongs.map(e => ({ ...e, hostSent: sentAt }));
          this.pendingPongs = []; this.pongFlush = 0;
          if (batch.length) this.transport.send(Msg.pongs(batch));
        }, 0.25);
        return;
      }
      case 'pongs':
        for (const e of m.entries) this.clockReply(e.id, e.hostNow, e.hostSent);
        return;
      case 'pong':
        this.clockReply(m.id, m.hostNow, null);
        return;
    }
  }
  /** One clock reply, the four-timestamp sum: what the host held the reply for is taken out of the trip, so only the travel is halved. */
  clockReply(id, hostNow, hostSent) {
    const t0 = this.pings.get(id); if (t0 == null) return;
    this.pings.delete(id);
    const t3 = nowSecs();
    const held = Math.max(0, (hostSent ?? hostNow) - hostNow);
    const travel = Math.max(0, t3 - t0 - held);
    this.pingRTT.set(id, { travel, offset: hostNow + held + travel / 2 - t3 });
  }
  /** Five quick round trips 450 ms apart; the tightest trip sets the clock, and the best so far counts at once (a round can open mid-measure). */
  async measureClock() {
    let best = Infinity, bestOffset = 0;
    for (let k = 0; k < 5; k++) {
      const id = uuid(), t0 = nowSecs();
      this.pings.set(id, t0);
      await this.toHost(Msg.ping(id, t0));
      await new Promise(r => setTimeout(r, 450));
      const r = this.pingRTT.get(id); this.pingRTT.delete(id);
      if (r && r.travel < best) { best = r.travel; bestOffset = r.offset; }
      this.pings.delete(id);   // a reply later than this is too slow to trust
      if (best < Infinity) this.clockOffset = bestOffset;
    }
    this.clockTrip = best;
  }
  /** The lobby, to everyone, a burst of joins gathered into one send (400 ms), the catalogue riding along. */
  async broadcastLobby() {
    this.cancel(this.lobbyTimer);
    this.lobbyTimer = this.later(async () => {
      this.lobbyTimer = 0;
      await this.transport.send(Msg.lobby(this.players, this.settings));
      if (this.catalogue.length || this.sentCatalogue) {
        this.sentCatalogue = this.catalogue.length > 0;
        await this.transport.send(Msg.catalogue(this.catalogue));
      }
    }, 0.4);
  }
  /** Back on the line after a drop: the host re-sends the room, a guest re-introduces itself (same id, so its seat and score are kept). */
  async reannounce() {
    if (this.isHost) await this.broadcastLobby();
    else if (this.me) { await this.transport.send(Msg.join(this.me)); await this.measureClock(); }
  }
  /** Someone missing from presence may only have switched apps: twenty seconds to come back (a guest gives a missing host thirty). */
  prune(ids) {
    clearTimeout(this.pruneTimer);
    this.pruneTimer = setTimeout(() => this.pruneNow(ids), (this.isHost ? 20 : 30) * 1000);
  }
  pruneNow(ids) {
    if (!ids.length) return;
    if (!this.isHost) {
      // Only the host runs the room. Gone from it this long, it has crashed, been closed or lost the network.
      if (['idle', 'connecting', 'error'].includes(this.phase)) return;
      const h = this.players.find(p => p.isHost)?.id;
      if (h && !ids.includes(h)) { this.phase = 'error'; this.error = 'The host left the party.'; this.emit(); }
      return;
    }
    // Their points wait for them, in case they come back this game.
    for (const p of this.players) if (!ids.includes(p.id) && p.id !== this.myID) this.departed[p.id] = p.score;
    const before = this.players.length;
    this.players = this.players.filter(p => ids.includes(p.id) || p.id === this.myID || p.id.startsWith('bot-') || p.id.startsWith('demo-'));
    if (this.players.length !== before) { this.broadcastLobby(); this.emit(); }
  }
  scoreMap() { return Object.fromEntries(this.players.map(p => [p.id, p.score])); }
}
