// One solo round — Engine/Game.swift in JavaScript. A song, a ladder of
// stages, a guess or a skip. Knows nothing about the page or the audio.
import { STAGES, TIERS, Pool } from './pool.js';
import { normalise, namesSong } from './matcher.js';
import { settings } from './ui.js';

/** The very first round on a new browser: a song everybody knows (The Weeknd leads on purpose). */
const OPENERS = ['1488408568', '1440870375', '1193701392', '1450695739', '1538003843', '1615585008', '1440650711', '1440903439', '1544491233', '943946671', '1411628233', '1702906535', '1762656732'];

export class Game {
  constructor(pool) {
    this.pool = pool;
    this.difficulty = 'easy'; this.era = 'all'; this.category = 'all'; this.artist = null;
    /** One album instead of one artist ({ id, name, artist }); its tracks ride in artistSongs. Never with an artist. */
    this.album = null;
    this.song = null; this.stage = 0; this.maxStage = 0; this.status = 'idle';      // idle | playing | won | lost | empty
    this.bonus = 0;              // seconds a rewarded ad added this round
    this.lastStageExtra = 0;     // seconds added to the last stage (the daily's premium bonus)
    /** Premium's extra skip on Home: after 15 seconds, one more stage of 20. */
    this.extraStage = false;
    this.upcoming = null; this.upcomingKey = '';
    this.artistSongs = [];
    this.artistRecent = [];
  }
  /** The clip lengths this round steps through. */
  get ladder() { return this.extraStage ? STAGES.concat([20]) : STAGES; }
  /** An artist or an album narrows the game to one set of songs: the reel locks, difficulty is depth. */
  get narrowed() { return this.artist != null || this.album != null; }
  get filterKey() { return this.filterKeyFor(this.difficulty); }
  filterKeyFor(tier) { return [tier, this.era, this.category, this.artist || '', this.album?.id || '', this.artistSongs.length].join('|'); }
  static nextTier(t) { return TIERS[(TIERS.indexOf(t) + 1) % TIERS.length]; }
  get duration() { const l = this.ladder, i = Math.min(this.stage, l.length - 1); return l[i] + this.bonus + (i === l.length - 1 ? this.lastStageExtra : 0); }
  get isOver() { return this.status === 'won' || this.status === 'lost'; }
  get isLastStage() { return this.maxStage >= this.ladder.length - 1; }

  setArtistSongs(list) { this.artistSongs = list || []; this.pool.setArtistCatalogue(this.artistSongs); }
  draw(tier = this.difficulty) {
    const first = this.firstEver(tier); if (first) return first;
    // An album with no tracks loaded deals nothing rather than the whole pool.
    return this.pickFromArtist(tier) ?? (!this.artistSongs.length && !this.album ? this.pool.pick(tier, this.era, this.category, this.artist) : null);
  }
  /** A tier is a fifth of a catalogue: a memory of the last 30, as pool.pick keeps. */
  pickFromArtist(tier) {
    if (!this.artistSongs.length) return null;
    const band = Pool.depthBand(this.artistSongs, tier), from = band.length ? band : this.artistSongs;
    const fresh = from.filter(s => !this.artistRecent.includes(s.id)), list = fresh.length ? fresh : from;
    const s = list[Math.floor(Math.random() * list.length)]; if (!s) return null;
    this.artistRecent.push(s.id); if (this.artistRecent.length > 30) this.artistRecent.shift();
    return s;
  }
  static band(songs, tier) { return songs.length ? Pool.depthBand(songs, tier) : []; }
  firstEver(tier = this.difficulty) {
    if (settings.get('firstRoundDrawn', false)) return null;
    if (tier !== 'easy' || this.era !== 'all' || this.category !== 'all' || this.artist || this.artistSongs.length) return null;
    settings.set('firstRoundDrawn', true);
    const ids = [OPENERS[0], ...OPENERS.slice(1).sort(() => Math.random() - 0.5)];
    for (const id of ids) { const s = this.pool.byId.get(id); if (s) return s; }
    return null;
  }
  /** `tier` is the level the next round will be on: a finished round moves up one. */
  drawUpcoming(tier = null) {
    const t = tier || this.difficulty;
    let s = this.draw(t); if (s && this.song && s.id === this.song.id) s = this.draw(t);
    this.upcoming = s; this.upcomingKey = this.filterKeyFor(t); return s;
  }
  newRound(forced = null) {
    let p = forced;
    if (!p && this.upcoming && this.upcomingKey === this.filterKey && this.upcoming.id !== this.song?.id) p = this.upcoming;
    this.upcoming = null;
    if (!p) p = this.draw(this.difficulty);
    this.stage = 0; this.maxStage = 0; this.bonus = 0;
    if (!p) { this.song = null; this.status = 'empty'; return null; }
    this.song = p; this.status = 'playing';
    return p;
  }
  artistCounts() { const o = {}; for (const t of TIERS) o[t] = Game.band(this.artistSongs, t).length; return o; }
  /** Open the round on a step of the bar (the -stage test flag). */
  setStage(index, unlock = false) {
    if (this.isOver) return false;
    const i = Math.max(0, Math.min(index, this.ladder.length - 1));
    if (i > this.maxStage) { if (!unlock) return false; this.maxStage = i; }
    this.stage = i; return true;
  }
  /** A picked song, or typed text. */
  matches(c) {
    if (!this.song) return false;
    if (typeof c !== 'object' || c == null) return this.matchesText(String(c ?? ''));
    const song = this.song;
    if (c.id === song.id || this.matchesText(`${c.title} ${c.artist}`)) return true;
    // The same recording filed under two spellings of the act, or an Apple row whose artist is the credit line.
    if (!namesSong(c.title, song.title, song.artist)) return false;
    const a = normalise(c.artist), s = normalise(song.artist);
    const theirs = ` ${normalise(c.credit ?? c.artist)} `, ours = ` ${normalise(song.credit ?? song.artist)} `;
    return a === s || ours.includes(` ${a} `) || theirs.includes(` ${s} `);
  }
  matchesText(text) { return !!this.song && namesSong(text, this.song.title, this.song.artist); }
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
    if (this.maxStage >= this.ladder.length - 1) { this.status = 'lost'; return; }
    this.maxStage += 1; this.stage = this.maxStage;
  }
}
