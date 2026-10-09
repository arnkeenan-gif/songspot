// Ranked/RankedGame.swift + Ranked.swift on the web: one ranked match, five
// songs, two players, the faster right answer worth more. The opponent is
// either another player (found in the queue for this rank, the match run over
// its own Realtime channel, see rankedline.js) or a stand-in; everything below
// plays the same either way. Rules and numbers are the app's, number for number.
//
// The view (ranked.js) owns the screens; this owns the state and calls
// `onChange()` after every change. Phases: idle, searching, found,
// countdown (secondsLeft), playing, roundResult, finished, error.
import { deal as dealBoard, toChoice } from './choices.js';
import { eraOf } from './pool.js';
import { art, settings as store } from './ui.js';
import { Ranked as Elo } from './account.js';
import { config } from './supabase.js';
import { Ladder } from './ladder.js';
import { RankedLine, RankedQueue, wire, rankedLog, queueWait } from './rankedline.js';

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Swift's `.rounded()`: half away from zero. */
const swiftRound = x => Math.sign(x) * Math.round(Math.abs(x));
const ERA_NAMES = ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'];

/** The rules of the ladder (Ranked.swift). */
export const RK = {
  startRating: 1000, rounds: 5, window: 15, resultHold: 3, perfectBonus: 500, defaultBotSkill: 0.7,
  get queueWait() { return queueWait(); },
  names: ['Mia', 'Noah', 'Liv', 'Theo', 'Sofia', 'Eli', 'Aya', 'Max', 'Ida', 'Otto', 'Nora', 'Felix', 'Luca', 'Ruby', 'Ivan', 'Alma'],
  base: t => ({ easy: 500, medium: 600, hard: 700, expert: 850, impossible: 1000 })[t] || 500,
  /** A snap answer inside a second earns a quarter over the base, easing to 40% at the buzzer; a tenth off per wrong guess. */
  points(elapsed, tier, wrongGuesses = 0, window = RK.window) {
    const t = Math.min(Math.max(0, elapsed), window);
    const speed = t <= 1 ? 1.25 : 1 - 0.6 * Math.pow((t - 1) / (window - 1), 0.8);
    const penalty = Math.max(0.5, 1 - 0.1 * wrongGuesses);
    return swiftRound(RK.base(tier) * speed * penalty);
  },
  opponentRating: mine => Math.max(600, mine + randInt(-80, 80)),
  opponentForm(rating) { const p = Math.min(0.78, Math.max(0.28, 0.5 + (rating - RK.startRating) / 900)); return Array.from({ length: 5 }, () => (Math.random() < p ? 1 : 0)); },
  /** How the stand-in plays one round: does it get it, and how long it takes. */
  opponentRound(rating, window, botSkill = RK.defaultBotSkill) {
    const k = Math.min(1.5, Math.max(0.2, botSkill));
    const accuracy = Math.min(0.9, (0.3 + (rating - 600) / 1400) * k);
    // Like a person, it always answers: a miss is a wrong tile tapped, a little quicker than a right one, never silence.
    if (!(Math.random() < accuracy)) return { correct: false, at: Math.max(1.5, rand(window * 0.18, window * 0.7)) };
    const skill = clamp((rating - 600) / 1000);
    const best = window * (0.55 - 0.40 * skill), worst = window * (0.98 - 0.35 * skill);
    const raw = rand(Math.min(best, worst), Math.max(best, worst));
    const at = Math.min(window * 0.98, raw / Math.max(0.5, k));
    return { correct: true, at: Math.max(1.2, at) };
  },
  /** Leaderboard.points: what was scored, plus a bonus for taking it. */
  boardPoints: (score, outcome) => score + (outcome > 0.6 ? 300 : outcome > 0.4 ? 100 : 0),
  /** app_config.ranked_bot_skill (3 s, else 0.7). */
  async fetchBotSkill() {
    const v = await Promise.race([config.get('ranked_bot_skill', RK.defaultBotSkill), sleep(3000).then(() => RK.defaultBotSkill)]).catch(() => RK.defaultBotSkill);
    const n = Number(v); return Number.isFinite(n) ? n : RK.defaultBotSkill;
  },
  // Walking out by closing the tab counts as a loss, once (Ranked.markPending / settlePending).
  markPending: opponentRating => store.set('ranked.pending', Math.round(opponentRating)),
  clearPending: () => store.del('ranked.pending'),
  settlePending(account) {
    const opp = store.get('ranked.pending', null);
    if (opp == null) return;
    store.del('ranked.pending');
    account.recordRanked(0, Number(opp) || RK.startRating, 0);
  },
};

/** RankedGame.era(of:): a song with no year falls back to the catalogue's own era for it. */
export const eraOfSong = s => (s?.year ? eraOf(s.year) : (ERA_NAMES.includes(s?.era) ? s.era : 'all'));
/** opponentHue = 1 + (hash of the seat id % 6), hash (h*31+scalar)&0xffff over unicode scalars. */
export const hueOf = id => 1 + [...String(id)].reduce((h, ch) => ((h * 31 + ch.codePointAt(0)) & 0xffff), 0) % 6;

export class RankedGame {
  constructor(pool) {
    this.pool = pool;
    this.onChange = null;
    this.phase = 'idle'; this.secondsLeft = 0; this.error = '';
    this.round = 0; this.current = null; this.currentEra = 'all'; this.roundStartedAt = Date.now();
    this.myScore = 0; this.theirScore = 0; this.myPoints = null; this.theirPoints = null;
    this.iAnswered = false; this.theyAnswered = false; this.wrongGuesses = 0; this.hintTaken = false;
    this.myCorrect = 0; this.perfect = false; this.lastAnswer = null; this.preparing = false;
    this.currentChoices = []; this.myPick = null; this.hiddenChoices = new Set(); this.choices = []; this.history = [];
    this.opponentName = ''; this.opponentRating = RK.startRating; this.opponentIsStandIn = true; this.opponentHue = 1; this.opponentForm = [];
    this.myRating = RK.startRating; this.myRP = 0; this.opponentRP = 0; this.ladderIndex = 0;
    this.ratingBefore = 0; this.ratingAfter = 0; this.forfeited = false;
    this.queue = []; this.opponentPlan = []; this.theyWereWrong = false; this.timers = new Set();
    // A real opponent
    this.real = false; this.opponentFace = null; this.opponentLeft = false; this.matchmaker = null; this.link = null;
    this.isHost = false; this.mySeatID = ''; this.theirSeatID = ''; this.inbox = []; this.absence = 0; this.standIn = null;
    this.pausedAt = null; this.startToken = 0;
    /** A practice match (localhost ?rankedDemo=play): nothing waits to be banked as a walk-out. */
    this.practice = false;
  }
  changed() { if (this.onChange) try { this.onChange(); } catch (e) { console.error(e); } }
  setPhase(p, n = 0) { this.phase = p; this.secondsLeft = n; this.changed(); }
  after(ms, fn) { const id = setTimeout(() => { this.timers.delete(id); fn(); }, Math.max(0, ms)); this.timers.add(id); return id; }
  cancelTimers() { this.timers.forEach(clearTimeout); this.timers.clear(); }

  get window() { return RK.window; }
  get iWon() { return !this.forfeited && (this.opponentLeft || this.myScore > this.theirScore); }
  get drawn() { return !this.forfeited && !this.opponentLeft && this.myScore === this.theirScore; }
  get didForfeit() { return this.forfeited; }
  get outcome() { if (this.forfeited) return 0; if (this.opponentLeft) return 1; return this.myScore > this.theirScore ? 1 : this.myScore === this.theirScore ? 0.5 : 0; }
  /** Once the match has started (the first countdown included) the X is a forfeit. */
  get inMatch() { return this.phase === 'playing' || this.phase === 'roundResult' || this.phase === 'countdown'; }
  get pickedRight() { return this.myPick != null && this.myPick === this.current?.id; }
  /** Within the song's own seconds: a tap in the close-grace is not taken. */
  get clockRunning() { return (Date.now() - this.roundStartedAt) / 1000 <= RK.window; }
  /** Harder songs the higher you are on the ladder (Ladder.roundTiers). */
  tier(r) { const t = Ladder.roundTiers(this.ladderIndex); return t[Math.min(Math.max(0, r), t.length - 1)]; }

  // ---------- a match ----------

  /**
   * Find an opponent and build the match. Another player looking in the same rank is tried first; if nobody
   * turns up in `RK.queueWait` seconds, a stand-in plays instead. `playable(song)` resolves whether a song can
   * sound here, so a song that cannot is never dealt.
   */
  async start(seat, playable) {
    this.cancelTimers();
    this.closeLink();
    // Cancel (leave) bumps the token; every await below checks it, so a cancelled search can never become a match.
    const token = ++this.startToken, live = () => token === this.startToken;
    Object.assign(this, { myRating: seat.rating, myRP: seat.rp, ladderIndex: Ladder.place(seat.rp).tier.index, ratingBefore: seat.rating,
      myScore: 0, theirScore: 0, round: 0, forfeited: false, myCorrect: 0, perfect: false, history: [],
      real: false, opponentLeft: false, opponentFace: null, inbox: [], pausedAt: null });
    this.setPhase('searching');

    // The songs are dealt while the queue is searched, so whoever the opponent turns out to be, the match is ready.
    const dealing = this.deal(token, playable);
    const skill = RK.fetchBotSkill();
    this.standIn = () => this.playStandIn(dealing, skill, token);

    const q = new RankedQueue();
    this.matchmaker = q;
    const found = await q.find(seat, this.ladderIndex, RK.queueWait);
    this.matchmaker = null;
    if (!live()) return;
    if (found) {
      this.preparing = true; this.changed();
      const on = await this.playReal(found, seat, dealing, token, playable);
      if (!live()) return;
      rankedLog(on ? `match: set up, ${this.isHost ? 'host' : 'guest'}` : 'match: fell through, stand-in');
      if (on) return;
      // It fell through (they left, or no song both can play).
      this.closeLink();
    }
    await this.playStandIn(dealing, skill, token);
  }

  /** Five songs that can sound here, climbing: the rank's easiest level first, its hardest last. */
  async deal(token, playable) {
    const picked = [], seen = new Set();
    for (let r = 0; r < RK.rounds; r++) {
      const t = this.tier(r);
      for (let i = 0; i < 40 && picked.length === r; i++) {
        const s = this.pool.pick(t, 'all', 'all');
        if (!s || seen.has(s.id)) continue;
        seen.add(s.id);
        if (await playable(s)) picked.push(s);
        if (token !== this.startToken) return [];
      }
    }
    return picked;
  }

  /** Nobody was looking: a stand-in plays, pitched at the player's own rating. */
  async playStandIn(dealing, skill, token) {
    const live = () => token === this.startToken;
    this.real = false; this.opponentLeft = false;
    this.opponentRating = RK.opponentRating(this.myRating);
    this.opponentRP = Ladder.opponentRP(this.myRP, this.myRating, this.opponentRating);
    this.opponentName = RK.names[randInt(0, RK.names.length - 1)];
    this.opponentHue = randInt(1, 6);
    this.opponentFace = null;
    this.opponentIsStandIn = true;
    this.opponentForm = RK.opponentForm(this.opponentRating);
    this.preparing = true; this.changed();
    const picked = await dealing;
    const botSkill = await skill;
    this.preparing = false;
    if (!live()) return;
    this.opponentPlan = Array.from({ length: RK.rounds }, () => RK.opponentRound(this.opponentRating, RK.window, botSkill));
    if (picked.length !== RK.rounds) { this.error = 'Not enough songs are available here right now.'; this.setPhase('error'); return; }
    this.queue = picked;
    this.choices = picked.map((s, r) => dealBoard(s, this.tier(r), this.pool));
    this.setPhase('found');
    // Long enough for the card to land and be read.
    await sleep(3200);
    // They left while it played, or the page went offline (`resume` opens it).
    if (!live() || this.phase !== 'found' || this.pausedAt != null) return;
    this.openRound();
  }

  // ---------- offline ----------

  /** The page went offline: a stand-in's clock stops with it instead of running rounds out unseen. */
  suspend() {
    if (this.pausedAt != null) return;
    this.pausedAt = Date.now();
    if (this.real) return;
    this.cancelTimers();
  }
  /** Back online: the match picks up where it stopped. */
  resume() {
    const at = this.pausedAt; if (at == null) return;
    this.pausedAt = null;
    if (this.real) return;
    switch (this.phase) {
      case 'found': case 'countdown': this.cancelTimers(); this.openRound(); break;
      case 'playing': this.roundStartedAt += Date.now() - at; this.runClock(); if (this.iAnswered && this.theyAnswered) this.closeSoon(); break;
      case 'roundResult': this.next(); break;
    }
  }

  // ---------- a real opponent ----------

  /** Agree on five songs both can play with the other player, then show the card. False: it fell through. */
  async playReal(m, seat, dealing, token, playable) {
    const live = () => token === this.startToken;
    const line = new RankedLine();
    this.isHost = m.host; this.mySeatID = seat.id; this.theirSeatID = m.opponent.id;
    line.onMessage = w => this.receive(w);
    line.onPresence = s => this.presence(s);
    line.onDrop = () => this.lineDropped();
    try { await line.join(`ranked-m${RankedQueue.version}-${m.id}`, seat); } catch (e) { return false; }
    if (!live()) { line.leave(); return false; }
    this.link = line;

    const pool = this.pool, songs = [], boards = [];
    if (m.host) {
      const hello = await this.nextIn(['hello', 'abort'], 8);
      if (hello?.t !== 'hello' || !live()) return false;
      const mine = await dealing;
      if (!live() || mine.length !== RK.rounds) return false;
      // A round: my own song first, then two more of its level, in case the other player's country does not carry it.
      const seen = new Set(mine.map(s => s.id)), rows = [];
      mine.forEach((s, r) => {
        const row = [s];
        for (let i = 0; i < 20 && row.length < 3; i++) { const a = pool.pick(this.tier(r), 'all', 'all'); if (a && !seen.has(a.id)) { seen.add(a.id); row.push(a); } }
        rows.push(row);
      });
      const deals = rows.map((row, r) => row.map(s => dealBoard(s, this.tier(r), pool)));
      await line.send(wire('deal', seat.id, { songs: rows.map(row => row.map(s => s.id)), choices: deals.map(d => d.map(b => b.map(s => s.id))) }));
      const ready = await this.nextIn(['ready', 'abort'], 14);
      if (!ready || !live() || ready.t !== 'ready' || !ready.ok || ready.ok.length !== RK.rounds) return false;
      const picks = [];
      for (let r = 0; r < RK.rounds; r++) {
        let chosen = null;
        for (const i of ready.ok[r]) {
          if (chosen != null) break;
          if (!(i >= 0 && i < rows[r].length)) continue;
          if (i === 0) chosen = 0;
          else if (await playable(rows[r][i])) chosen = i;
          if (!live()) return false;
        }
        if (chosen == null) { await line.send(wire('abort', seat.id)); return false; }
        picks.push(chosen);
      }
      await line.send(wire('go', seat.id, { picks }));
      picks.forEach((p, r) => { songs.push(rows[r][p]); boards.push(deals[r][p]); });
    } else {
      // Say hello until the songs arrive: the host may still be joining.
      let d = null;
      for (let i = 0; i < 28 && !d; i++) {
        await line.send(wire('hello', seat.id));
        d = await this.nextIn(['deal', 'abort'], 0.5);
        if (!live()) return false;
      }
      if (!d || d.t !== 'deal' || !d.songs || !d.choices || d.songs.length !== RK.rounds || d.choices.length !== RK.rounds) return false;
      const ids = d.songs, boardIDs = d.choices;
      // Which of each round's songs this player knows and can play. The host's first choice first; the spares only if it fails.
      // (The rounds are checked side by side: fetching a preview takes longer than the app's catalogue lookup.)
      const ok = await Promise.all(ids.map(async (row, r) => {
        const good = [];
        for (let i = 0; i < row.length; i++) {
          const s = pool.byId.get(row[i]);
          if (!s || i >= boardIDs[r].length || boardIDs[r][i].length !== 4 || !boardIDs[r][i].every(id => pool.byId.has(id))) continue;
          if (await playable(s)) good.push(i);
          if (!live()) return good;
          if (i === 0 && good.length) break;
        }
        return good;
      }));
      if (!live()) return false;
      await line.send(wire('ready', seat.id, { ok }));
      const go = await this.nextIn(['go', 'abort'], 12);
      if (!go || !live() || go.t !== 'go' || !go.picks || go.picks.length !== RK.rounds) return false;
      for (let r = 0; r < RK.rounds; r++) {
        const i = go.picks[r], s = i >= 0 && i < ids[r].length ? pool.byId.get(ids[r][i]) : null;
        if (!s) return false;
        songs.push(s); boards.push(boardIDs[r][i].map(id => pool.byId.get(id)).filter(Boolean));
      }
    }
    // They cancelled just after their last word: no match against nobody.
    if (this.inbox.some(w => w.t === 'abort')) return false;

    const o = m.opponent;
    this.opponentName = o.name ? this.shownName(o.name) : 'Player';
    this.opponentRating = o.rating; this.opponentRP = o.rp; this.opponentFace = o.face; this.opponentForm = o.form;
    this.opponentHue = hueOf(o.id);
    this.opponentIsStandIn = false;
    this.queue = songs; this.choices = boards;
    this.preparing = false; this.real = true; this.inbox = [];
    this.setPhase('found');
    if (m.host) {
      await sleep(3200);
      if (!live() || !this.real || this.phase !== 'found') return true;
      this.openRound();
    } else {
      // The host opens the first round. If it never does, it is gone.
      this.after(10000, () => { if (this.phase === 'found') this.opponentGone(); });
    }
    return true;
  }
  /** NameFilter.shown, from the characters module when it is there (set by the view). */
  shownName(n) { return this.nameFilter ? this.nameFilter(n) : n; }

  /** The first message of one of these kinds, waited for while the match is being set up. */
  async nextIn(kinds, seconds) {
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) {
      const i = this.inbox.findIndex(w => kinds.includes(w.t));
      if (i >= 0) return this.inbox.splice(i, 1)[0];
      await sleep(40);
    }
    return null;
  }

  receive(m) {
    if (m.from !== this.theirSeatID) return;
    rankedLog(`match: got ${m.t}${m.r != null ? ' r' + m.r : ''}${this.real ? '' : ' (setup)'}`);
    if (!this.real) { this.inbox.push(m); return; }
    switch (m.t) {
      case 'round': {
        // The host has opened a round. Its `close`, or a whole round, can be lost while the line rejoins:
        // a later one catches this player up to the host's round and its totals.
        const r = m.r;
        if (this.isHost || r == null) return;
        if (this.phase === 'found') {
          this.cancelTimers(); this.round = r;
          // Joined late, the match still counts from here.
          if (r > 0 && !this.practice) RK.markPending(this.opponentRating);
        } else if (r > this.round) {
          if (this.phase === 'playing') this.closeRound();
          if (this.phase !== 'roundResult') return;
          this.cancelTimers(); this.round = r;
        } else return;
        if (m.gs != null) this.myScore = m.gs;
        if (m.hs != null) this.theirScore = m.hs;
        this.openRound();
        break;
      }
      case 'answer':
        if (m.r !== this.round || this.phase !== 'playing' || this.theyAnswered) return;
        this.theyAnswered = true;
        if (m.correct === true) { const pts = Math.max(0, Math.min(m.points ?? 0, 1250)); this.theirPoints = pts; this.theirScore += pts; }
        else { this.theirPoints = 0; this.theyWereWrong = true; }
        this.changed();
        if (this.iAnswered && this.isHost) this.closeSoon();
        break;
      case 'close':
        if (this.isHost || m.r !== this.round || this.phase !== 'playing') return;
        this.closeRound(m);
        break;
      case 'end':
        if (this.isHost || this.phase === 'finished') return;
        if (m.gs != null) this.myScore = m.gs;
        if (m.hs != null) this.theirScore = m.hs;
        this.perfect = m.gpf ?? false;
        this.finish(true);
        break;
      // An "abort" here was sent while setting up and crossed this player's "go": they never reached the card.
      case 'forfeit': case 'abort':
        this.opponentGone();
        break;
    }
  }

  /** Who is on the match's channel. Missing for 8 s: they are gone. */
  presence(seats) {
    if (seats.some(s => s.id === this.theirSeatID)) { clearTimeout(this.absence); this.absence = 0; return; }
    if (!this.link || this.absence) return;
    this.absence = setTimeout(() => {
      this.absence = 0;
      // Still being set up: stop waiting on a player who has gone, as if they had said "abort" themselves.
      if (this.real) this.opponentGone(); else this.inbox.push(wire('abort', this.theirSeatID));
    }, 8000);
  }

  /**
   * The other player left. Once the first song counts for them too, that is their forfeit and the match is
   * won; before it, nothing is lost and a stand-in takes the seat.
   */
  opponentGone() {
    if (!this.real || this.phase === 'finished') return;
    rankedLog('match: opponent gone');
    if (this.inMatch && (!this.isHost || this.round > 0 || this.theyAnswered)) {
      this.opponentLeft = true;
      this.finish();
    } else {
      this.cancelTimers();
      this.closeLink();
      // This match never counted: no loss waiting for the next visit.
      RK.clearPending();
      this.myScore = 0; this.theirScore = 0; this.myCorrect = 0; this.round = 0; this.history = [];
      this.setPhase('searching');
      if (this.standIn) this.standIn();
    }
  }
  /** This player's own line died and would not come back: the other side has already been given the match. */
  lineDropped() { if (!this.real) return; if (this.inMatch) this.forfeit(); else this.opponentGone(); }

  tell(m) { if (!this.real || !this.link) return; rankedLog(`match: send ${m.t}${m.r != null ? ' r' + m.r : ''}`); this.link.send(m); }
  closeLink() {
    clearTimeout(this.absence); this.absence = 0;
    this.real = false;
    const l = this.link; this.link = null;
    if (l) l.leave();
  }

  openRound() {
    if (this.round >= this.queue.length) return this.finish();
    // From the first clip the match counts. If the page is closed before it finishes, the loss is applied next visit.
    if (this.round === 0 && !this.practice) RK.markPending(this.opponentRating);
    const song = this.queue[this.round];
    this.current = { id: song.id, title: song.title, artist: song.artist, artwork: song.artwork ? art(song.artwork, 300) : null, preview: song.preview, song };
    this.currentEra = eraOfSong(song);
    Object.assign(this, { myPoints: null, theirPoints: null, iAnswered: false, theyAnswered: false, theyWereWrong: false, wrongGuesses: 0, hintTaken: false, myPick: null, hiddenChoices: new Set() });
    this.currentChoices = (this.round < this.choices.length ? this.choices[this.round] : []).map(toChoice);
    this.setPhase('countdown', 3);
    if (this.real && this.isHost) this.tell(wire('round', this.mySeatID, { r: this.round, hs: this.myScore, gs: this.theirScore }));
    const step = n => {
      if (n >= 1) { if (n !== 3) this.setPhase('countdown', n); this.after(1000, () => step(n - 1)); return; }
      this.roundStartedAt = Date.now();
      this.setPhase('playing');
      this.runClock();
    };
    step(3);
  }

  /** The round's clock, counted from `roundStartedAt`, so after a pause it carries on from where it stopped. */
  runClock() {
    const elapsed = (Date.now() - this.roundStartedAt) / 1000;
    if (!this.real) {
      // The stand-in answers on its own clock, exactly as a person would: always an answer, sometimes the wrong one.
      const plan = this.opponentPlan[this.round];
      this.after((plan.at - elapsed) * 1000, () => {
        if (this.phase !== 'playing' || this.theyAnswered) return;
        this.theyAnswered = true;
        if (plan.correct) { const pts = RK.points(plan.at, this.tier(this.round)); this.theirPoints = pts; this.theirScore += pts; }
        else { this.theirPoints = 0; this.theyWereWrong = true; }
        this.changed();
        if (this.iAnswered) this.closeSoon();
      });
    }
    // The clock runs out. A host waits a moment longer for an answer given at the buzzer to cross; a guest only
    // closes by itself if the host never says so.
    const grace = this.real ? (this.isHost ? 1.2 : 5) : 0.4;
    this.after((RK.window + grace - elapsed) * 1000, () => { if (this.phase === 'playing') this.closeRound(); });
  }

  pointsAt(elapsed) {
    const p = RK.points(elapsed, this.tier(this.round), this.wrongGuesses);
    return this.hintTaken ? swiftRound(p * 0.75) : p;
  }

  /** A tap on one of the four answers. Right scores on the speed curve; wrong loses the round outright. */
  pick(id) {
    if (this.phase !== 'playing' || this.iAnswered || this.myPick != null || this.round >= this.queue.length || !this.clockRunning) return;
    this.myPick = id;
    if (id === this.queue[this.round].id) { this.submit(true); return; }
    this.iAnswered = true; this.myPoints = 0;
    this.tell(wire('answer', this.mySeatID, { r: this.round, correct: false, points: 0 }));
    this.changed();
    if (this.theyAnswered && (!this.real || this.isHost)) this.closeSoon();
  }
  submit(correct) {
    if (this.phase !== 'playing' || this.iAnswered || !(this.myPick != null || this.clockRunning) || !correct) return;
    this.iAnswered = true; this.myCorrect++;
    const pts = this.pointsAt((Date.now() - this.roundStartedAt) / 1000);
    this.myPoints = pts; this.myScore += pts;
    this.tell(wire('answer', this.mySeatID, { r: this.round, correct: true, points: pts }));
    this.changed();
    if (this.theyAnswered && (!this.real || this.isHost)) this.closeSoon();
  }
  /** Hold the board a beat so the tile goes green or red before the answer card. */
  closeSoon() { const r = this.round; this.after(900, () => { if (r === this.round) this.closeRound(); }); }

  closeRound(told = null) {
    if (this.phase !== 'playing') return;
    this.cancelTimers();
    if (told) {
      // A guest takes the host's count of the round: an answer that crossed after the host's buzzer did not score.
      this.myPoints = told.gp ?? null; this.theirPoints = told.hp ?? null; this.theyWereWrong = told.hw ?? false;
      if (told.gs != null) this.myScore = told.gs;
      if (told.hs != null) this.theirScore = told.hs;
    } else if (this.real && this.isHost) {
      this.tell(wire('close', this.mySeatID, { r: this.round, hp: this.myPoints, gp: this.theirPoints, hw: this.myPick != null && !this.pickedRight, gw: this.theyWereWrong, hs: this.myScore, gs: this.theirScore }));
    }
    const c = this.current;
    if (c) {
      this.lastAnswer = { title: c.title, artist: c.artist, artwork: c.artwork };
      if (!this.history.some(h => h.id === this.round)) this.history.push({ id: this.round, title: c.title, artist: c.artist, artwork: c.artwork, mine: this.myPoints > 0 ? this.myPoints : null, theirs: this.theirPoints, myWrong: this.myPick != null && !this.pickedRight });
    }
    this.setPhase('roundResult');
    if (this.real && !this.isHost) {
      // The host moves the match on. After the last round there is nothing left to be told.
      const last = this.round + 1 >= this.queue.length;
      const wait = last ? RK.resultHold + 0.6 : RK.resultHold * 2 + 3 + RK.window + 7;
      const due = Date.now() + wait * 1000;
      this.after(wait * 1000, () => {
        if (this.phase !== 'roundResult') return;
        if (last) this.finish();
        // Woken seconds late: this page was the one asleep in the background, and the host has long since taken the match.
        else if (Date.now() - due > 3000) this.forfeit();
        else this.opponentGone();
      });
      return;
    }
    this.after(RK.resultHold * 1000, () => { if (this.phase === 'roundResult') this.next(); });
  }

  next() {
    // A guest is moved on by the host's `round`, not by its own clock.
    if (this.real && !this.isHost) return;
    this.cancelTimers();
    this.round++;
    if (this.round >= this.queue.length) this.finish(); else this.openRound();
  }

  finish(told = false) {
    if (this.phase === 'finished') return;
    this.cancelTimers();
    if (this.real && !told) {
      // Against a person both sides can take the bonus, and the rounds as closed are what counts.
      const mine = this.history.filter(h => (h.mine ?? 0) > 0).length, theirs = this.history.filter(h => (h.theirs ?? 0) > 0).length;
      if (!this.forfeited && mine === RK.rounds) { this.perfect = true; this.myScore += RK.perfectBonus; }
      if (!this.opponentLeft && theirs === RK.rounds) this.theirScore += RK.perfectBonus;
      if (this.isHost && !this.forfeited && !this.opponentLeft) this.tell(wire('end', this.mySeatID, { hs: this.myScore, gs: this.theirScore, hpf: this.perfect, gpf: theirs === RK.rounds }));
    } else if (!this.real && !this.forfeited && this.myCorrect === RK.rounds) {
      this.perfect = true; this.myScore += RK.perfectBonus;
    }
    this.ratingAfter = Elo.newRating(this.ratingBefore, this.opponentRating, this.outcome);
    this.setPhase('finished');
    // The line has done its work; a moment for the last message to leave.
    clearTimeout(this.absence); this.absence = 0;
    const l = this.link;
    if (l) { this.link = null; setTimeout(() => l.leave(), 1000); }
  }

  /** Walk out of a match in progress: a loss, banked through the normal end of the match. */
  forfeit() {
    if (!this.inMatch) return;
    this.forfeited = true;
    this.tell(wire('forfeit', this.mySeatID));
    this.finish();
  }

  leave() {
    this.startToken++;
    this.cancelTimers();
    if (this.matchmaker) { this.matchmaker.cancel(); this.matchmaker = null; }
    // Walking away from the card before the first song, or while the match is being set up: say so.
    if (this.real && this.phase === 'found') this.tell(wire('forfeit', this.mySeatID));
    else if (!this.real && this.link) this.link.send(wire('abort', this.mySeatID));
    clearTimeout(this.absence); this.absence = 0;
    this.real = false;
    const l = this.link;
    if (l) { this.link = null; setTimeout(() => l.leave(), 400); }
    this.standIn = null; this.pausedAt = null;
    this.setPhase('idle');
  }

  // ---------- demo screens (the app's DEBUG flags; localhost knobs in ranked.js) ----------
  demoIntro(myRating) {
    this.cancelTimers();
    this.myRating = myRating;
    this.opponentName = 'Mia'; this.opponentHue = 3;
    this.myScore = 912; this.theirScore = 780;
    this.history = [{ id: 0, title: 'Blinding Lights', artist: 'The Weeknd', artwork: null, mine: 912, theirs: 780, myWrong: false }];
    this.round = 1;
    const s = this.pool.pick('medium', '90s', 'all');
    if (s) { this.current = { id: s.id, title: s.title, artist: s.artist, artwork: null, preview: s.preview, song: s }; this.currentEra = eraOfSong(s); }
    this.setPhase('countdown', 2);
  }
  demoRoundResult(myRating) {
    this.demoIntro(myRating);
    this.cancelTimers();
    const s = this.pool.pick('easy', 'all', 'all');
    if (s) this.lastAnswer = { title: s.title, artist: s.artist, artwork: s.artwork ? art(s.artwork, 600) : null };
    this.myPoints = 874; this.theirPoints = 612;
    this.myScore = 1786; this.theirScore = 1392;
    this.setPhase('roundResult');
  }
  demoFinished(myRating) { this.demoIntro(myRating); this.cancelTimers(); this.myScore = 843; this.theirScore = 612; this.setPhase('finished'); }
  demoRP(rp) { this.myRP = rp; this.ladderIndex = Ladder.place(rp).tier.index; this.opponentRP = Ladder.opponentRP(rp, this.myRating, this.opponentRating); this.changed(); }
  demoSearching(myRating) { this.cancelTimers(); this.myRating = myRating; this.setPhase('searching'); }
  demoFound(myRating) {
    this.cancelTimers();
    this.myRating = myRating; this.ratingBefore = myRating;
    this.opponentRating = RK.opponentRating(myRating);
    this.opponentName = 'Mia'; this.opponentHue = 3; this.opponentForm = [1, 1, 0, 1, 1];
    this.setPhase('found');
  }
  demoFinish(myRating, won) {
    this.cancelTimers();
    this.myRating = myRating; this.ratingBefore = myRating;
    this.opponentRating = RK.opponentRating(myRating);
    this.opponentRP = Ladder.opponentRP(this.myRP, myRating, this.opponentRating);
    this.opponentName = RK.names[randInt(0, RK.names.length - 1)];
    this.opponentHue = randInt(1, 6);
    this.opponentForm = RK.opponentForm(this.opponentRating);
    this.myScore = won ? 3840 : 2110; this.theirScore = won ? 2960 : 4120;
    const demo = [['Blinding Lights', 'The Weeknd', 912, 780, false], ['Mr. Brightside', 'The Killers', null, 840, true], ['Levitating', 'Dua Lipa', 1046, null, false],
      ['Stronger', 'Kanye West', 902, 1340, false], ['Heartless', 'Kanye West', 980, null, false]];
    this.history = demo.map((d, i) => ({ id: i, title: d[0], artist: d[1], artwork: null, mine: d[2], theirs: d[3], myWrong: d[4] }));
    this.round = RK.rounds;
    this.finish();
  }
}
