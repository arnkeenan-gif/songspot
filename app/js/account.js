// The player: name, picture and stats. Kept in the browser so the game never
// waits on the network, and mirrored to the player's own row in Supabase —
// the same row and the same Stats shape the iPhone app writes, so a profile
// follows its owner between the phone and the web.
import { auth, profiles, premium as grants, providerReady } from './supabase.js';
import { settings } from './ui.js';
import { Ladder } from './ladder.js';

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
    rating: Ranked.startRating, bestRating: Ranked.startRating, rankedPlayed: 0, rankedWon: 0, recentRanked: [], rankedPoints: 0, bestRankedPoints: 0, season: '',
    rp: 0, bestRP: 0, winStreak: 0, badges: [],
    dailyPlayed: 0, dailyWon: 0, dailyStreak: 0, dailyBest: 0, lastDaily: 0, lostDailyStreak: 0, lostDailyOn: 0, streakRestoredOn: 0 };
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
  return s;
}
const played = s => (s.roundsPlayed || 0) + (s.partiesPlayed || 0) + (s.rankedPlayed || 0) + (s.dailyPlayed || 0);
const newer = (a, b) => (played(a) >= played(b) ? a : b);

/** Daily.number(): day one is 19 Sep 2026, UTC. */
export const dailyNumber = (now = Date.now()) => Math.max(1, Math.floor((now - Date.UTC(2026, 8, 19)) / 864e5) + 1);

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
  ladder: [[0, 'Newcomer'], [10, 'Listener'], [50, 'Regular'], [150, 'Sharp ear'], [400, 'Crate digger'], [1000, 'Encyclopedia'], [2500, 'Legend']],
  at(named) {
    let i = 0; this.ladder.forEach(([at], k) => { if (at <= named) i = k; });
    const here = this.ladder[i], next = this.ladder[i + 1] || null;
    const frac = next ? Math.min(1, Math.max(0, (named - here[0]) / Math.max(1, next[0] - here[0]))) : 1;
    return { title: here[1], next: next && { at: next[0], title: next[1] }, frac };
  },
};

export class Account {
  constructor() {
    this.user = null;
    this.name = settings.get('profile.name', '') || '';
    this.avatar = settings.get('profile.avatar', null);
    this.stats = withDefaults(settings.get('profile.stats', {}));
    this.memberSince = settings.get('profile.since', null) ? new Date(settings.get('profile.since')) : null;
    this.premium = false;
    this.syncing = false;
    this.listeners = new Set();
    this._push = null;
  }
  /** Signed in with a real provider (not a guest session). */
  get signedIn() { return !!this.user && !this.user.is_anonymous; }
  get isGuest() { return !this.user || !!this.user.is_anonymous; }
  /** What boards and rooms show: the name, or Guest. */
  get displayName() { return (this.name || '').trim() || 'Guest'; }
  get initial() { return (this.name.trim()[0] || '').toUpperCase(); }
  get provider() { return this.user?.app_metadata?.provider || null; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(f => { try { f(this); } catch (e) { console.error(e); } }); }

  async boot() {
    let u = null;
    try { u = await auth.user(); } catch (e) {}
    if (u) await this.adopt(u);
    auth.onChange(async s => {
      if (s?.user && (!this.user || this.user.id !== s.user.id || this.user.is_anonymous !== s.user.is_anonymous)) await this.adopt(s.user);
      else if (!s?.user && this.user) { this.user = null; this.premium = false; this.emit(); }
    });
  }
  async adopt(user) {
    this.user = user; this.syncing = true; this.emit();
    try {
      if (!user.is_anonymous) await auth.handOverGuest(user.id);
      let remote = null, read = false;
      try { remote = await profiles.fetch(user.id); read = true; } catch (e) {}
      if (remote) {
        if (remote.display_name && remote.display_name !== 'Player') this.name = remote.display_name;
        if (remote.avatar) this.avatar = remote.avatar;
        if (remote.stats) this.stats = newer(withDefaults(remote.stats), this.stats);
        if (remote.created_at) this.memberSince = new Date(remote.created_at);
      }
      if (!this.name && !user.is_anonymous) this.name = user.user_metadata?.full_name || user.user_metadata?.name || 'Player';
      if (!this.memberSince) this.memberSince = new Date();
      this.premium = await grants.has().catch(() => false);
      this.persist();
      if (read) await this.push();
    } finally { this.syncing = false; this.emit(); }
  }
  async refreshPremium() { if (!this.user) return false; this.premium = await grants.has().catch(() => false); this.emit(); return this.premium; }
  /** A user id for boards and checkout: the real account, or a guest one made now. */
  async ensureUser() { if (this.user) return this.user; const u = await auth.ensureGuest(); await this.adopt(u); return u; }
  signIn(provider = 'google', returning = false) { return auth.signInWith(provider, returning); }
  providerReady(p) { return providerReady(p); }
  async signOut() { clearTimeout(this._push); await auth.signOut().catch(() => {}); this.user = null; this.name = ''; this.avatar = null; this.stats = freshStats(); this.memberSince = null; this.premium = false; this.persist(); this.emit(); }
  async deleteAccount() { clearTimeout(this._push); await profiles.deleteAccount(); await auth.signOut().catch(() => {}); this.user = null; this.name = ''; this.avatar = null; this.stats = freshStats(); this.memberSince = null; this.premium = false; this.persist(); this.emit(); }

  rename(n) { const c = String(n || '').trim().slice(0, 20); if (!c || c === this.name) return; this.name = c; this.persist(); this.schedulePush(); this.emit(); }
  setAvatar(b64) { this.avatar = b64; this.persist(); this.schedulePush(); this.emit(); }
  /** Change the stats in place, then save. */
  record(fn) { fn(this.stats); this.persist(); this.schedulePush(); this.emit(); }
  recordRound(won, stage, tier) {
    this.record(s => { s.roundsPlayed++; if (won) { s.roundsWon++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); while (s.wonByStage.length < 5) s.wonByStage.push(0); s.wonByStage[Math.min(Math.max(0, stage), 4)]++; s.winsByTier[tier] = (s.winsByTier[tier] || 0) + 1; if (tier === 'impossible') s.laddersClimbed++; } else s.streak = 0; });
  }
  recordParty(won, score, roundsWon) { this.record(s => { s.partiesPlayed++; if (won) s.partiesWon++; s.partyRoundsWon += roundsWon; s.partyPoints += score; s.bestPartyScore = Math.max(s.bestPartyScore, score); }); }
  /** A finished ranked match (Stats.recordRanked): RP first, judged against the ratings as they stood, then the hidden rating. */
  recordRanked(outcome, opponentRating, score = 0, perfect = false) {
    this.record(s => {
      s.rankedPlayed++; if (outcome > 0.6) s.rankedWon++;
      s.winStreak = outcome > 0.6 ? (s.winStreak || 0) + 1 : outcome < 0.4 ? 0 : (s.winStreak || 0);
      const c = Ladder.change(outcome, s.rating, opponentRating, s.winStreak, perfect);
      s.rp = Math.max(Ladder.tierFloor(s.rp || 0), (s.rp || 0) + c.delta);
      s.bestRP = Math.max(s.bestRP || 0, s.rp);
      s.rating = Ranked.newRating(s.rating, opponentRating, outcome); s.bestRating = Math.max(s.bestRating, s.rating);
      s.recentRanked.push(outcome > 0.6 ? 1 : outcome < 0.4 ? 0 : 2); while (s.recentRanked.length > 5) s.recentRanked.shift();
      const earned = Ranked.points(score, outcome); s.rankedPoints += earned; s.bestRankedPoints = Math.max(s.bestRankedPoints, earned);
    });
  }
  /** Stats.recordDaily — once per day number. A streak a miss or a skipped day ends is kept aside for a restore. */
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
        if (Streak.live(s, day) > 0) { s.lostDailyStreak = s.dailyStreak; s.lostDailyOn = day; }
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
  persist() { settings.set('profile.name', this.name); settings.set('profile.avatar', this.avatar); settings.set('profile.stats', this.stats); settings.set('profile.since', this.memberSince ? this.memberSince.getTime() : null); }
  schedulePush() { clearTimeout(this._push); this._push = setTimeout(() => this.push(), 2000); }
  async push() {
    if (!this.user || !this.name) return;
    try {
      const remote = await profiles.fetch(this.user.id);
      // Local first: on a tie (a streak restore, a season rollover — changes that add no play) this copy is the one saved.
      if (remote?.stats) { const merged = newer(this.stats, withDefaults(remote.stats)); if (merged !== this.stats) { this.stats = merged; this.persist(); } }
      await profiles.save(this.user.id, this.name, this.avatar, this.stats);
    } catch (e) {}
  }
}
