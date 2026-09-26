// One solo round — Engine/Game.swift in JavaScript. A song, five stages, a
// guess or a skip. Knows nothing about the page or the audio.
import { STAGES, TIERS, Pool } from './pool.js';
import { norm } from './matcher.js';
import { settings } from './ui.js';

/** The very first round on a new browser: a song everybody knows. */
const OPENERS = ['1488408568', '1440870375', '1193701392', '1450695739', '1538003843', '1615585008', '1440650711', '1440903439', '1544491233', '943946671', '1411628233', '1702906535', '1762656732'];

export class Game {
  constructor(pool) {
    this.pool = pool;
    this.difficulty = 'easy'; this.era = 'all'; this.category = 'all'; this.artist = null;
    this.song = null; this.stage = 0; this.maxStage = 0; this.status = 'idle';      // idle | playing | won | lost | empty
    this.bonus = 0;              // seconds a rewarded ad added this round
    this.lastStageExtra = 0;     // premium: 20 s on the last stage instead of 15
    this.upcoming = null; this.upcomingKey = '';
    this.artistSongs = [];
  }
  get filterKey() { return [this.difficulty, this.era, this.category, this.artist || '', this.artistSongs.length].join('|'); }
  static nextTier(t) { return TIERS[(TIERS.indexOf(t) + 1) % TIERS.length]; }
  get duration() { return STAGES[this.stage] + this.bonus + (this.stage === STAGES.length - 1 ? this.lastStageExtra : 0); }
  get isOver() { return this.status === 'won' || this.status === 'lost'; }
  get isLastStage() { return this.maxStage >= STAGES.length - 1; }

  setArtistSongs(list) { this.artistSongs = list || []; this.pool.setArtistCatalogue(this.artistSongs); }
  draw() {
    const first = this.firstEver(); if (first) return first;
    if (this.artistSongs.length) { const band = Game.band(this.artistSongs, this.difficulty); const from = band.length ? band : this.artistSongs; return from[Math.floor(Math.random() * from.length)]; }
    return this.pool.pick(this.difficulty, this.era, this.category, this.artist);
  }
  static band(songs, tier) { return songs.length ? Pool.depthBand(songs, tier) : []; }
  firstEver() {
    if (settings.get('firstRoundDrawn', false)) return null;
    if (this.difficulty !== 'easy' || this.era !== 'all' || this.category !== 'all' || this.artist) return null;
    settings.set('firstRoundDrawn', true);
    const ids = [OPENERS[0], ...OPENERS.slice(1).sort(() => Math.random() - 0.5)];
    for (const id of ids) { const s = this.pool.byId.get(id); if (s) return s; }
    return null;
  }
  drawUpcoming() {
    let s = this.draw(); if (s && this.song && s.id === this.song.id) s = this.draw();
    this.upcoming = s; this.upcomingKey = this.filterKey; return s;
  }
  newRound(forced = null) {
    let p = forced;
    if (!p && this.upcoming && this.upcomingKey === this.filterKey && this.upcoming.id !== this.song?.id) p = this.upcoming;
    this.upcoming = null;
    if (!p) p = this.draw();
    this.stage = 0; this.maxStage = 0; this.bonus = 0;
    if (!p) { this.song = null; this.status = 'empty'; return null; }
    this.song = p; this.status = 'playing';
    return p;
  }
  artistCounts() { const o = {}; for (const t of TIERS) o[t] = Game.band(this.artistSongs, t).length; return o; }
  matches(c) {
    if (!this.song) return false;
    if (typeof c === 'object') return c.id === this.song.id || this.matchesText(`${c.title} ${c.artist}`);
    return this.matchesText(c);
  }
  matchesText(text) {
    const g = norm(text).replace(/\s*\(.*?\)|\[.*?\]/g, ''); if (!g) return false;
    const t = norm(this.song.title.replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\s*-\s*(single|ep|remaster(ed)?.*|.*version|.*edit)$/i, ' '));
    return g === t || g === `${t} ${norm(this.song.artist)}`;
  }
  /** true when right; a wrong guess moves on a stage, and past the last one loses. */
  guess(c) {
    if (this.status !== 'playing') return false;
    if (this.matches(c)) { this.status = 'won'; return true; }
    this.advance(); return false;
  }
  skip() { if (this.status === 'playing') this.advance(); }
  giveUp() { if (this.status === 'playing') this.status = 'lost'; }
  /** A rewarded ad after the last guess: the same song, longer, one more go. */
  revive(extra) { if (this.status !== 'lost') return; this.bonus += extra; this.status = 'playing'; }
  advance() {
    if (this.maxStage >= STAGES.length - 1) { this.status = 'lost'; return; }
    this.maxStage += 1; this.stage = this.maxStage;
  }
}
