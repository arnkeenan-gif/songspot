// The player: name, character and stats (iOS Profile/Account.swift). Kept in the browser so the game never
// waits on the network, and mirrored to the player's own row in Supabase —
// the same row and the same Stats shape the iPhone app writes, so a profile
// follows its owner between the phone and the web.
import { auth, profiles, premium as grants, providerReady } from './supabase.js';
import { settings } from './ui.js';
import { Ladder } from './ladder.js';
import { NameFilter, GirlNames, parseChoice, choiceRaw, unchosen, myKey, has, SPOT_GIRL, variantOf } from './characters.js';

export const Ranked = {
  startRating: 1000,
  newRating(mine, theirs, outcome) {
    const expected = 1 / (1 + Math.pow(10, (theirs - mine) / 400));
    const k = mine < 1200 ? 40 : 24;
    return Math.max(100, Math.round(mine + k * (outcome - expected)));
  },
  points(score, outcome) { return score + (outcome > 0.6 ? 300 : outcome > 0.4 ? 100 : 0); },
};

export function freshStats() {
  return { roundsPlayed: 0, roundsWon: 0, streak: 0, bestStreak: 0, wonByStage: [0, 0, 0, 0, 0], winsByTier: {}, laddersClimbed: 0,
    partiesPlayed: 0, partiesWon: 0, partyRoundsWon: 0, partyPoints: 0, bestPartyScore: 0,
    rating: Ranked.startRating, bestRating: Ranked.startRating, rankedPlayed: 0, rankedWon: 0, rankedDrawn: 0, recentRanked: [], rankedPoints: 0, bestRankedPoints: 0, season: '',
    rp: 0, bestRP: 0, winStreak: 0, badges: [],
    dailyPlayed: 0, dailyWon: 0, dailyStreak: 0, dailyBest: 0, lastDaily: 0, lostDailyStreak: 0, lostDailyOn: 0, streakRestoredOn: 0,
    playStreak: 0, bestPlayStreak: 0, lastPlayDay: 0 };
}
/**
 * A stored or synced stats object with every field filled in, as Stats.init(from:)
 * decodes it: a row from before the ladder gets its RP from the old rating.
 * Fields this build doesn't know are kept, so a newer phone's row round-trips.
 */
export function withDefaults(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = Object.assign(freshStats(), r);
  if (r.bestRating == null) s.bestRating = s.rating;
  if (r.rp == null) s.rp = Ladder.migrated(Math.max(s.rating, s.bestRating));
  if (r.bestRP == null) s.bestRP = s.rp;
  if (!Array.isArray(s.badges)) s.badges = [];
  if (!Array.isArray(s.wonByStage)) s.wonByStage = [0, 0, 0, 0, 0];
  if (!Array.isArray(s.recentRanked)) s.recentRanked = [];
  if (!s.winsByTier || typeof s.winsByTier !== 'object') s.winsByTier = {};
  return s;
}
const played = s => (s.roundsPlayed || 0) + (s.partiesPlayed || 0) + (s.rankedPlayed || 0) + (s.dailyPlayed || 0);
/** Stats.newer: two copies of the same player, keep whichever has seen more play (the first on a tie). */
export const newer = (a, b) => (played(a) >= played(b) ? a : b);
/** Stats.playCount: everything that counts as having played a song. */
export const playCount = s => (s.roundsPlayed || 0) + (s.partyRoundsWon || 0) + (s.partiesPlayed || 0) + (s.rankedPlayed || 0) + (s.dailyPlayed || 0);

const COUNTS = ['roundsPlayed', 'roundsWon', 'laddersClimbed', 'partiesPlayed', 'partiesWon', 'partyRoundsWon',
  'partyPoints', 'rankedPlayed', 'rankedWon', 'rankedDrawn', 'rankedPoints', 'dailyPlayed', 'dailyWon'];
const BESTS = ['bestStreak', 'bestPartyScore', 'bestRating', 'bestRankedPoints', 'bestRP', 'dailyBest', 'bestPlayStreak', 'streakRestoredOn'];
/**
 * Stats.merge: this browser's copy, the server's, and `base`, the last copy the two agreed on. What this
 * browser added since `base` is added to the server's copy, so play on two devices adds up. Bests keep the
 * higher; the ladder, the daily streak and the play streak come from whichever copy is further along (local on a tie).
 */
export function mergeStats(l, r, b) {
  l = withDefaults(l); r = withDefaults(r); b = withDefaults(b);
  const m = JSON.parse(JSON.stringify(r));
  for (const k of COUNTS) m[k] = (r[k] || 0) + Math.max(0, (l[k] || 0) - (b[k] || 0));
  for (const k of BESTS) m[k] = Math.max(l[k] || 0, r[k] || 0);
  const at = (a, i) => (i < a.length ? a[i] || 0 : 0);
  m.wonByStage = Array.from({ length: Math.max(5, l.wonByStage.length, r.wonByStage.length) }, (_, i) => at(r.wonByStage, i) + Math.max(0, at(l.wonByStage, i) - at(b.wonByStage, i)));
  for (const t of new Set([...Object.keys(l.winsByTier), ...Object.keys(r.winsByTier)])) m.winsByTier[t] = (r.winsByTier[t] || 0) + Math.max(0, (l.winsByTier[t] || 0) - (b.winsByTier[t] || 0));
  if (l.roundsPlayed > b.roundsPlayed) m.streak = l.streak;
  m.badges = [...r.badges, ...l.badges.filter(x => !r.badges.includes(x))];
  if (l.rankedPlayed >= r.rankedPlayed) { m.rating = l.rating; m.rp = l.rp; m.winStreak = l.winStreak; m.recentRanked = l.recentRanked.slice(); m.season = l.season; }
  if (l.lastDaily >= r.lastDaily) { m.dailyStreak = l.dailyStreak; m.lastDaily = l.lastDaily; m.lostDailyStreak = l.lostDailyStreak; m.lostDailyOn = l.lostDailyOn; }
  if (l.lastPlayDay >= r.lastPlayDay) { m.playStreak = l.playStreak; m.lastPlayDay = l.lastPlayDay; }
  return m;
}
/** Stats ==: the same numbers (key order and unknown extras aside). */
export function sameStats(a, b) {
  if (!a || !b) return false;
  const x = withDefaults(a), y = withDefaults(b);
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) return false;
  return true;
}

/** Daily.number(): day one is 19 Sep 2026, UTC. */
export const dailyNumber = (now = Date.now()) => Math.max(1, Math.floor((now - Date.UTC(2026, 8, 19)) / 864e5) + 1);
/** Stats.localDay: the daily's count, but turning over at the player's own midnight instead of UTC's. */
export const localDay = (date = new Date()) => { const d = date instanceof Date ? date : new Date(date); return dailyNumber(d.getTime() - d.getTimezoneOffset() * 60000); };

/** The play streak (days in a row with a song played in any mode), from Stats. */
export const PlayStreak = {
  /** As it stands today: gone once a whole day is missed. */
  live: (s, today = localDay()) => ((s.lastPlayDay || 0) >= today - 1 ? (s.playStreak || 0) : 0),
  /** Stats.notePlayed: a song was played today. Not before the last day played either (a flight west). */
  note(s, day = localDay()) {
    if (!(day > (s.lastPlayDay || 0))) return;
    s.playStreak = (s.lastPlayDay || 0) === day - 1 ? (s.playStreak || 0) + 1 : 1;
    s.bestPlayStreak = Math.max(s.bestPlayStreak || 0, s.playStreak);
    s.lastPlayDay = day;
  },
};

/** The daily streak rules from Stats (Account.swift), on a plain stats object. */
export const Streak = {
  /** The streak as it stands today: a day skipped since the last go ends it. */
  live: (s, today = dailyNumber()) => ((s.lastDaily || 0) >= today - 1 ? (s.dailyStreak || 0) : 0),
  /** The streak premium can restore today, if any: ended by a miss in the last two days, or by skipping up to two days. Once a week. */
  restorable(s, today = dailyNumber()) {
    const restored = s.streakRestoredOn || 0, lost = s.lostDailyStreak || 0, streak = s.dailyStreak || 0, last = s.lastDaily || 0;
    if (!(restored === 0 || today - restored >= 7)) return null;
    if (lost > 1 && (s.lostDailyOn || 0) >= today - 1 && streak <= 1) return lost;
    if (streak > 1 && last < today - 1 && last >= today - 3) return streak;
    return null;
  },
  /** Bring the streak back on `s` (Stats.restoreStreak); nothing when there is none to restore. */
  restore(s, today = dailyNumber()) {
    const n = Streak.restorable(s, today); if (n == null) return;
    if ((s.lostDailyStreak || 0) > 1 && (s.lostDailyOn || 0) >= today - 1 && (s.dailyStreak || 0) <= 1) { s.dailyStreak = n + (s.dailyStreak || 0); s.lostDailyStreak = 0; }
    else s.dailyStreak = n;
    s.lastDaily = Math.max(s.lastDaily || 0, today - 1);
    s.dailyBest = Math.max(s.dailyBest || 0, s.dailyStreak);
    s.streakRestoredOn = today;
  },
};

/** The level ladder from ProfileView.swift: songs named → a title. */
export const Level = {
  ladder: [[0, 'Newcomer'], [10, 'Listener'], [50, 'Regular'], [150, 'Sharp ear'], [400, 'Headliner'], [1000, 'Superstar'], [2500, 'Legend']],
  at(named) {
    let i = 0; this.ladder.forEach(([at], k) => { if (at <= named) i = k; });
    const here = this.ladder[i], next = this.ladder[i + 1] || null;
    const frac = next ? Math.min(1, Math.max(0, (named - here[0]) / Math.max(1, next[0] - here[0]))) : 1;
    return { title: here[1], next: next && { at: next[0], title: next[1] }, frac };
  },
};

// localhost-only knobs (README): ?demoProfile=1 dresses a signed-out local run as a signed-in player with
// demo stats, so the whole profile can be seen without an account; nothing is ever sent to Supabase.
const LOCAL = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const DEMO = LOCAL && Q.get('demoProfile') === '1';

function demoStats() {
  const today = localDay(), s = freshStats();
  Object.assign(s, {
    roundsPlayed: 412, roundsWon: 287, streak: 4, bestStreak: 19, wonByStage: [21, 64, 118, 61, 23],
    winsByTier: { easy: 141, medium: 82, hard: 41, expert: 17, impossible: 6 }, laddersClimbed: 6,
    partiesPlayed: 9, partiesWon: 4, partyRoundsWon: 31, partyPoints: 5240, bestPartyScore: 1180,
    rating: 1184, bestRating: 1240, rankedPlayed: 23, rankedWon: 13, rankedDrawn: 2, recentRanked: [1, 0, 1, 2, 1],
    rankedPoints: 6120, bestRankedPoints: 640, season: Ladder.seasonKey(), rp: 1135, bestRP: 1210, winStreak: 2,
    badges: ['2026-09:Silver II'], dailyPlayed: 14, dailyWon: 11, dailyStreak: 3, dailyBest: 6, lastDaily: dailyNumber() - 1,
    playStreak: 5, bestPlayStreak: 12, lastPlayDay: today - 1,
  });
  const n = +Q.get('demoNamed'); if (Number.isFinite(n) && Q.get('demoNamed') != null) s.roundsWon = Math.max(0, n);
  return s;
}

export class Account {
  constructor() {
    this.user = null;
    // A name saved before the filter, that it would refuse now, is "Player".
    const saved = settings.get('profile.name', '') || '';
    this.name = saved && NameFilter.blocked(saved) ? 'Player' : saved;
    this.avatar = settings.get('profile.avatar', null);
    this.stats = withDefaults(settings.get('profile.stats', {}));
    this.memberSince = settings.get('profile.since', null) ? new Date(settings.get('profile.since')) : null;
    /** The last stats the server confirmed for this player (the merge's base). */
    const sy = settings.get('profile.synced', null); this.synced = sy ? withDefaults(sy) : null;
    /** Stats sent whose answer never came back: if the server turns out to hold exactly these, they landed. */
    const at = settings.get('profile.attempted', null); this.attempted = at ? withDefaults(at) : null;
    /** Changes here the server hasn't confirmed yet (unknown on the first run of this build: assume some). */
    this.unsynced = settings.get('profile.unsynced', true) !== false;
    this.premium = false;
    this.syncing = false;
    this.listeners = new Set();
    this._push = null;
    this.demo = DEMO;
    if (DEMO) {
      this.user = { id: 'demo-profile', is_anonymous: false, app_metadata: { provider: 'demo' }, user_metadata: {} };
      this.name = Q.get('playerName') || 'Liv';
      this.avatar = Q.get('demoAvatar') ? `char:${Q.get('demoAvatar')}:portrait:1.1.1.1.1` : null;
      this.stats = demoStats();
      this.memberSince = new Date(2026, 8, 21);
      this.premium = Q.get('premium') === '1';
      GirlNames.ready.then(() => { if (this.dress()) this.emit(); });
      return;
    }
    // Players from before Spot's sister: dressed by their name once now (the list loads in a moment).
    GirlNames.ready.then(() => { if (this.name && this.dress()) this.changed(); });
  }
  /** Signed in with a real provider (not a guest session). */
  get signedIn() { return !!this.user && !this.user.is_anonymous; }
  get isGuest() { return !this.user || !!this.user.is_anonymous; }
  /** What boards and rooms show: the name, or Guest. */
  get displayName() { return (this.name || '').trim() || 'Guest'; }
  get initial() { return (this.name.trim()[0] || '').toUpperCase(); }
  get provider() { return this.user?.app_metadata?.provider || null; }
  /** Your chosen character and pose, if you picked one (a photo or nothing is null). */
  get character() { return parseChoice(this.avatar); }
  /** Your character: the one you picked, else Spot. */
  get faceIndex() { return this.character?.id ?? unchosen(myKey(this)); }
  /** The pose shown on your profile: always the portrait now. */
  get pose() { return 'portrait'; }
  /** Which version of a pose you picked (1 when you never chose). */
  variant(p) { return variantOf(this.character, p); }
  /** The play streak as it stands today. */
  get livePlayStreak() { return PlayStreak.live(this.stats); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(f => { try { f(this); } catch (e) { console.error(e); } }); }

  async boot() {
    if (this.demo) return;
    let u = null;
    try { u = await auth.user(); } catch (e) {}
    if (u) await this.adopt(u);
    auth.onChange(async s => {
      if (s?.user && (!this.user || this.user.id !== s.user.id || this.user.is_anonymous !== s.user.is_anonymous)) await this.adopt(s.user);
      else if (!s?.user && this.user) { this.user = null; this.premium = false; this.emit(); }
    });
  }
  /**
   * Account.adoptSession: take the row that already exists for this player, or create it. Local and remote
   * stats are merged against the base; on a first sync, the copy with more play is kept. A failed read is not
   * "no row yet": nothing is written then (push reads and merges before it ever writes).
   */
  async adopt(user) {
    this.user = user; this.syncing = true; this.emit();
    try {
      // What is here is another real player's (their session ran out and someone else signed in): start clean.
      const owner = settings.get('profile.owner', null);
      if (owner && !user.is_anonymous && owner !== user.id) { clearTimeout(this._push); this.clearLocal(); }
      if (!user.is_anonymous) await auth.handOverGuest(user.id);
      let remote = null, read = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { remote = await profiles.fetch(user.id); read = true; break; }
        catch (e) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
      }
      if (remote) {
        const n = remote.display_name;
        if (n && n !== 'Player' && NameFilter.allows(n)) this.name = n;
        else if (this.name && NameFilter.blocked(this.name)) this.name = 'Player';
        if (remote.avatar) { this.avatar = remote.avatar; if (remote.avatar !== this.autoAvatar) this.autoAvatar = null; }
        if (remote.stats) {
          const r = withDefaults(remote.stats);
          if (this.attempted && sameStats(r, this.attempted)) this.synced = r;
          if (this.synced) { this.stats = mergeStats(this.stats, r, this.synced); this.synced = r; }
          else this.stats = newer(r, this.stats);
        }
        if (remote.created_at) { const d = new Date(remote.created_at); if (!isNaN(d)) this.memberSince = d; }
      }
      if (!this.name && !user.is_anonymous) {
        const p = user.user_metadata?.full_name || user.user_metadata?.name || '';
        this.name = p && NameFilter.allows(p) ? String(p).trim().slice(0, 20) : 'Player';
      }
      if (!this.memberSince) this.memberSince = new Date();
      await Promise.race([GirlNames.ready, new Promise(r => setTimeout(r, 1500))]);
      this.dress();
      this.premium = await grants.has().catch(() => false);
      this.premiumForever = !!(this.premium && grants.forever);
      this.persist();
      if (read) await this.push();
    } finally { this.syncing = false; this.emit(); }
  }
  async refreshPremium() { if (this.demo) return this.premium; if (!this.user) return false; this.premium = await grants.has().catch(() => false); this.premiumForever = !!(this.premium && grants.forever); this.emit(); return this.premium; }
  /** A user id for boards and checkout: the real account, or a guest one made now. */
  async ensureUser() { if (this.user) return this.user; const u = await auth.ensureGuest(); await this.adopt(u); return u; }
  signIn(provider = 'google', returning = false) { return auth.signInWith(provider, returning); }
  providerReady(p) { return providerReady(p); }

  /**
   * Before signing out: send what the server hasn't confirmed yet, waiting 8 s at most. False when some play
   * would be left only in this browser, so the player can be asked first.
   */
  async saveBeforeSignOut() {
    if (this.demo || !this.unsynced) return true;
    clearTimeout(this._push);
    const saved = await Promise.race([this.push(), new Promise(r => setTimeout(() => r(false), 8000))]);
    if (!saved) this.schedulePush(30000);       // still signed in: keep trying
    return !!saved;
  }
  /** Signing out leaves nothing of this player behind for the next one. Call saveBeforeSignOut first. */
  async signOut() {
    clearTimeout(this._push);
    if (!this.demo) await auth.signOut().catch(() => {});
    this.user = null; this.premium = false;
    this.clearLocal(); this.emit();
  }
  /** Gone for good: the server row and the login, then everything here. Throws if the server refused (nothing here touched). */
  async deleteAccount() {
    clearTimeout(this._push);
    if (!this.demo) { await profiles.deleteAccount(); await auth.signOut().catch(() => {}); }
    this.user = null; this.premium = false;
    this.clearLocal(); this.emit();
  }

  // ---------- edits ----------
  /** False when the name was refused (NameFilter); the old name stays. */
  setName(n) {
    const clean = String(n ?? '').trim().slice(0, 20);
    if (!NameFilter.allows(clean)) return false;
    if (!clean || clean === this.name) return true;
    this.name = clean;
    this.dress();
    this.changed(); this.emit();
    return true;
  }
  /** The old name for setName (kept for older call sites). */
  rename(n) { return this.setName(n); }
  /** Their own pick now: the name no longer decides. */
  setAvatar(v) { this.avatar = v; this.autoAvatar = null; this.changed(); this.emit(); }
  /** Wear a character, with the pose on your profile and your version of each pose. */
  setCharacter(id, pose = 'portrait', variants = {}) { this.setAvatar(choiceRaw({ id, pose, variants })); }
  /** The character the name gave them, while they have not picked one. */
  get autoAvatar() { return settings.get('profile.autoAvatar', null); }
  set autoAvatar(v) { if (v == null) settings.del('profile.autoAvatar'); else settings.set('profile.autoAvatar', v); }
  /**
   * Account.dress: a player who never picked wears Spot; one whose first name is a girl's name wears Spot's
   * sister, stored like a pick so friends, boards and parties draw her too. Decided again on a name change
   * until they choose. True when it changed the avatar.
   */
  dress() {
    const auto = this.autoAvatar;
    const unpicked = this.avatar == null || this.avatar === '' || (auto != null && this.avatar === auto);
    if (!unpicked || !has(SPOT_GIRL)) return false;
    const want = GirlNames.contains(this.name) ? choiceRaw({ id: SPOT_GIRL, pose: 'portrait' }) : null;
    if (want === (this.avatar || null)) return false;
    this.avatar = want; this.autoAvatar = want;
    return true;
  }

  /** Change the stats in place, then save. Any song played, in any mode, keeps the play streak going. */
  record(fn) {
    const before = playCount(this.stats);
    fn(this.stats);
    if (playCount(this.stats) > before) PlayStreak.note(this.stats);
    this.changed(); this.emit();
  }
  recordRound(won, stage, tier) {
    this.record(s => { s.roundsPlayed++; if (won) { s.roundsWon++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); while (s.wonByStage.length < 5) s.wonByStage.push(0); s.wonByStage[Math.min(Math.max(0, stage), 4)]++; s.winsByTier[tier] = (s.winsByTier[tier] || 0) + 1; if (tier === 'impossible') s.laddersClimbed++; } else s.streak = 0; });
  }
  recordParty(won, score, roundsWon) { this.record(s => { s.partiesPlayed++; if (won) s.partiesWon++; s.partyRoundsWon += roundsWon; s.partyPoints += score; s.bestPartyScore = Math.max(s.bestPartyScore, score); }); }
  /** A finished ranked match (Stats.recordRanked): RP first, judged against the ratings as they stood, then the hidden rating. */
  recordRanked(outcome, opponentRating, score = 0, perfect = false) {
    this.record(s => {
      s.rankedPlayed++; if (outcome > 0.6) s.rankedWon++; else if (outcome >= 0.4) s.rankedDrawn = (s.rankedDrawn || 0) + 1;
      s.winStreak = outcome > 0.6 ? (s.winStreak || 0) + 1 : outcome < 0.4 ? 0 : (s.winStreak || 0);
      const c = Ladder.change(outcome, s.rating, opponentRating, s.winStreak, perfect);
      s.rp = Math.max(Ladder.tierFloor(s.rp || 0), (s.rp || 0) + c.delta);
      s.bestRP = Math.max(s.bestRP || 0, s.rp);
      s.rating = Ranked.newRating(s.rating, opponentRating, outcome); s.bestRating = Math.max(s.bestRating, s.rating);
      s.recentRanked.push(outcome > 0.6 ? 1 : outcome < 0.4 ? 0 : 2); while (s.recentRanked.length > 5) s.recentRanked.shift();
      const earned = Ranked.points(score, outcome); s.rankedPoints += earned; s.bestRankedPoints = Math.max(s.bestRankedPoints, earned);
    });
  }
  /** Stats.recordDaily — once per day number. A streak a miss or a skipped day or two ends is kept aside for a restore. */
  recordDaily(day, won) {
    this.record(s => {
      if (day === s.lastDaily) return;
      s.dailyPlayed++;
      if (won) {
        s.dailyWon++;
        if (s.lastDaily < day - 1 && s.lastDaily >= day - 3 && s.dailyStreak > 1) { s.lostDailyStreak = s.dailyStreak; s.lostDailyOn = day; }
        s.dailyStreak = s.lastDaily === day - 1 ? s.dailyStreak + 1 : 1;
        s.dailyBest = Math.max(s.dailyBest, s.dailyStreak);
      } else {
        if (s.dailyStreak > 0 && s.lastDaily >= day - 3) { s.lostDailyStreak = s.dailyStreak; s.lostDailyOn = day; }
        s.dailyStreak = 0;
      }
      s.lastDaily = day;
    });
  }
  /** Premium brings a lost daily streak back, as if the missed day had been named (Stats.restoreStreak). */
  restoreStreak(today = dailyNumber()) {
    if (Streak.restorable(this.stats, today) == null) return false;
    this.record(s => Streak.restore(s, today));
    return true;
  }
  /**
   * A season is a calendar month (Account.rolloverSeasonIfNeeded). At the turn you keep a badge for
   * where you finished and start the new one a tier lower; the hidden rating, career totals and best
   * rank are kept. The old weekly keys ("2026-W39") were the previous ladder: moving off one is not a season ending.
   */
  rolloverSeasonIfNeeded() {
    const key = Ladder.seasonKey(); if (this.stats.season === key) return false;
    const old = this.stats.season || '';
    this.record(s => {
      if (old && !old.includes('-W') && s.rp > 0) {
        const badge = `${old}:${Ladder.place(s.rp).name}`;
        if (!s.badges.includes(badge)) s.badges.push(badge);
        s.rp = Ladder.seasonDrop(s.rp); s.winStreak = 0; s.recentRanked = [];
      }
      s.season = key;
    });
    return !!old && !old.includes('-W');
  }

  // ---------- plumbing ----------
  clearLocal() {
    this.name = ''; this.avatar = null; this.stats = freshStats(); this.memberSince = null;
    this.synced = null; this.attempted = null; this.unsynced = false; this.autoAvatar = null;
    settings.del('profile.owner');
    try { ['songspot.creator.code', 'songspot.creator.name'].forEach(k => localStorage.removeItem(k)); } catch (e) {}
    this.persist();
  }
  persist() {
    if (this.demo) return;
    settings.set('profile.name', this.name); settings.set('profile.avatar', this.avatar); settings.set('profile.stats', this.stats);
    settings.set('profile.since', this.memberSince ? this.memberSince.getTime() : null);
    settings.set('profile.synced', this.synced); settings.set('profile.attempted', this.attempted); settings.set('profile.unsynced', this.unsynced);
  }
  /** A change here: kept at once, sent to the server shortly. */
  changed() { this.unsynced = true; this.persist(); this.schedulePush(); }
  /** Writes are coalesced: a burst of rounds becomes one request. A failed one is tried again in 30 s. */
  schedulePush(delay = 2000) { if (this.demo) return; clearTimeout(this._push); this._push = setTimeout(() => this.push(), delay); }
  retryLater() { this.schedulePush(30000); }
  /**
   * Read, merge, then write (Account.push). The server copy is fetched first and merged with this one, so play
   * on another device, or here while offline, is added rather than overwritten. If the read fails, nothing is
   * written this time. True once the server has it all.
   */
  async push() {
    if (this.demo || !this.user || !this.name) return false;
    const uid = this.user.id;
    // Another real player's profile, left from a session that ran out: adopt clears it.
    const owner = settings.get('profile.owner', null);
    if (owner && !this.user.is_anonymous && owner !== uid) return false;
    let remote; const was = JSON.stringify([this.stats, this.avatar]);
    try { remote = await profiles.fetch(uid); } catch (e) { this.retryLater(); return false; }
    if (!this.user || this.user.id !== uid) return false;
    // The name's character never overwrites one picked on another device.
    const auto = this.autoAvatar;
    if (remote?.avatar && remote.avatar !== this.avatar && auto != null && this.avatar === auto) { this.avatar = remote.avatar; this.autoAvatar = null; }
    if (remote?.stats) {
      const r = withDefaults(remote.stats);
      if (this.attempted && sameStats(r, this.attempted)) this.synced = r;
      if (this.synced) { this.stats = mergeStats(this.stats, r, this.synced); this.synced = r; }
      else this.stats = newer(this.stats, r);     // first sync: local on a tie (a restore, a rollover add no play)
    }
    const sent = JSON.parse(JSON.stringify(this.stats)), sentName = this.name, sentAvatar = this.avatar;
    this.attempted = sent; this.persist();
    try {
      const res = await profiles.save(uid, sentName, sentAvatar, sent);
      if (res && res.error) throw res.error;
    } catch (e) { this.retryLater(); return false; }
    this.synced = sent; this.attempted = null;
    if (!this.user.is_anonymous) settings.set('profile.owner', uid);
    // A round played while the save was out goes with the next push.
    if (sameStats(this.stats, sent) && this.name === sentName && this.avatar === sentAvatar) this.unsynced = false;
    this.persist();
    if (JSON.stringify([this.stats, this.avatar]) !== was) this.emit();
    return true;
  }
}
