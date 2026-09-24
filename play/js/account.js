// The signed-in player: name, picture and stats. Kept in the browser so the
// game never waits on the network, and mirrored to the player's own row in
// Supabase so it follows them to the phone — the same row the apps use.
import { auth, profiles, premium as grants } from './supabase.js';

export const Ranked = {
  startRating: 1000,
  newRating(mine, theirs, outcome) {
    const expected = 1 / (1 + Math.pow(10, (theirs - mine) / 400));
    const k = mine < 1200 ? 40 : 24;
    return Math.max(100, Math.round(mine + k * (outcome - expected)));
  },
  rank(r) { return r < 1100 ? 'easy' : r < 1300 ? 'medium' : r < 1500 ? 'hard' : r < 1700 ? 'expert' : 'impossible'; },
  /** ISO week, local time — the same key the apps write, so a season is one season everywhere. */
  seasonKey(d = new Date()) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
    const y = t.getUTCFullYear(); const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
    return `${y}-W${w}`;
  },
  points(score, outcome) { return score + (outcome > 0.6 ? 300 : outcome > 0.4 ? 100 : 0); },
};

export function freshStats() {
  return { roundsPlayed: 0, roundsWon: 0, streak: 0, bestStreak: 0, wonByStage: [0, 0, 0, 0, 0], winsByTier: {}, laddersClimbed: 0,
    partiesPlayed: 0, partiesWon: 0, partyRoundsWon: 0, partyPoints: 0, bestPartyScore: 0,
    rating: Ranked.startRating, bestRating: Ranked.startRating, rankedPlayed: 0, rankedWon: 0, recentRanked: [], rankedPoints: 0, bestRankedPoints: 0, season: '' };
}
const played = s => s.roundsPlayed + s.partiesPlayed + s.rankedPlayed;

export class Account {
  constructor() {
    const j = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
    this.user = null;
    this.name = (() => { try { return localStorage.getItem('songspot.name') || ''; } catch (e) { return ''; } })();
    this.avatar = (() => { try { return localStorage.getItem('songspot.avatar'); } catch (e) { return null; } })();
    this.stats = Object.assign(freshStats(), j('songspot.stats') || {});
    this.memberSince = null;
    this.premium = false;
    this.syncing = false;
    this.listeners = new Set();
    this._push = null;
  }
  get signedIn() { return !!this.user; }
  get initial() { return (this.name.trim()[0] || '?').toUpperCase(); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(f => f(this)); }

  async boot() {
    const u = await auth.user();
    if (u) await this.adopt(u);
    auth.onChange(async s => { if (s?.user && !this.user) await this.adopt(s.user); if (!s?.user && this.user) { this.user = null; this.emit(); } });
  }
  async adopt(user) {
    this.user = user; this.syncing = true; this.emit();
    try {
      const remote = await profiles.fetch(user.id).catch(() => null);
      if (remote) {
        if (remote.display_name && remote.display_name !== 'Player') this.name = remote.display_name;
        if (remote.avatar) this.avatar = remote.avatar;
        if (remote.stats) { const r = Object.assign(freshStats(), remote.stats); if (remote.stats.bestRating == null) r.bestRating = r.rating; if (played(r) >= played(this.stats)) this.stats = r; }
        if (remote.created_at) this.memberSince = new Date(remote.created_at);
      }
      if (!this.name) this.name = user.user_metadata?.full_name || user.user_metadata?.name || 'Player';
      if (!this.memberSince) this.memberSince = new Date();
      this.premium = await grants.has(user.id).catch(() => false);
      this.persist(); await this.push();
    } finally { this.syncing = false; this.emit(); }
  }
  signIn() { return auth.signInWithGoogle(); }
  async signOut() { clearTimeout(this._push); await auth.signOut(); this.user = null; this.name = ''; this.avatar = null; this.stats = freshStats(); this.memberSince = null; this.premium = false; this.persist(); this.emit(); }
  async deleteAccount() { clearTimeout(this._push); await profiles.deleteAccount(); await auth.signOut(); this.user = null; this.name = ''; this.avatar = null; this.stats = freshStats(); this.memberSince = null; this.persist(); this.emit(); }

  rename(n) { const c = n.trim().slice(0, 20); if (!c || c === this.name) return; this.name = c; this.persist(); this.schedulePush(); this.emit(); }
  setAvatar(b64) { this.avatar = b64; this.persist(); this.schedulePush(); this.emit(); }
  /** Change the stats in place, then save. */
  record(fn) { fn(this.stats); this.persist(); this.schedulePush(); this.emit(); }
  recordRound(won, stage, tier) {
    this.record(s => { s.roundsPlayed++; if (won) { s.roundsWon++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); s.wonByStage[Math.min(stage, 4)]++; s.winsByTier[tier] = (s.winsByTier[tier] || 0) + 1; if (tier === 'impossible') s.laddersClimbed++; } else s.streak = 0; });
  }
  recordParty(won, score, roundsWon) { this.record(s => { s.partiesPlayed++; if (won) s.partiesWon++; s.partyRoundsWon += roundsWon; s.partyPoints += score; s.bestPartyScore = Math.max(s.bestPartyScore, score); }); }
  recordRanked(outcome, opponentRating, score) {
    this.record(s => { s.rankedPlayed++; if (outcome > 0.6) s.rankedWon++; s.rating = Ranked.newRating(s.rating, opponentRating, outcome); s.bestRating = Math.max(s.bestRating, s.rating);
      s.recentRanked.push(outcome > 0.6 ? 1 : outcome < 0.4 ? 0 : 2); while (s.recentRanked.length > 5) s.recentRanked.shift();
      const earned = Ranked.points(score, outcome); s.rankedPoints += earned; s.bestRankedPoints = Math.max(s.bestRankedPoints, earned); });
  }
  /** A new week is a new ladder. Returns true when a rating was reset. */
  rolloverSeasonIfNeeded() {
    const key = Ranked.seasonKey(); if (this.stats.season === key) return false;
    const had = this.stats.rankedPlayed > 0;
    this.record(s => { s.season = key; s.rating = Ranked.startRating; s.recentRanked = []; });
    return had;
  }
  persist() { try { localStorage.setItem('songspot.name', this.name); if (this.avatar) localStorage.setItem('songspot.avatar', this.avatar); else localStorage.removeItem('songspot.avatar'); localStorage.setItem('songspot.stats', JSON.stringify(this.stats)); } catch (e) {} }
  schedulePush() { clearTimeout(this._push); this._push = setTimeout(() => this.push(), 2000); }
  async push() { if (!this.user || !this.name) return; await profiles.save(this.user.id, this.name, this.avatar, this.stats).catch(() => {}); }
}
