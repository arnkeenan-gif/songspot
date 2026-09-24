// One solo round: a song, five stages, a guess or a skip. Win and the next
// round moves up a difficulty; lose and it stays. Filters live in memory
// only, so every fresh open starts at Easy, any era, all genres.
import { TIERS, STAGES } from './pool.js';
import { matches } from './matcher.js';

export class Game {
  constructor(pool) {
    this.pool = pool;
    this.difficulty = 'easy'; this.era = 'all'; this.category = 'all'; this.artist = null;
    this.song = null; this.stage = 0; this.status = 'playing';     // playing | won | lost
    this.recent = new Set(); this.upcoming = null;
  }
  get filterKey() { return [this.difficulty, this.era, this.category, this.artist || ''].join('|'); }
  next(tier) { const i = TIERS.indexOf(tier); return i < TIERS.length - 1 ? TIERS[i + 1] : null; }
  newRound(forced = null) {
    const s = forced || (this.upcoming && this.upcoming._key === this.filterKey ? this.upcoming : null) || this.pool.pick(this.difficulty, this.era, this.category, this.artist, this.recent);
    this.upcoming = null;
    this.song = s; this.stage = 0; this.status = 'playing';
    if (s) { this.recent.add(s.id); if (this.recent.size > 60) this.recent.delete(this.recent.values().next().value); }
    return s;
  }
  /** The song after this one, drawn now so its preview can load behind the play. */
  drawUpcoming() {
    const s = this.pool.pick(this.difficulty, this.era, this.category, this.artist, new Set([...this.recent, this.song?.id]));
    if (s) { s._key = this.filterKey; this.upcoming = s; }
    return s;
  }
  get seconds() { return STAGES[Math.min(this.stage, STAGES.length - 1)]; }
  guess(pick) {
    if (this.status !== 'playing' || !this.song) return false;
    if (matches(pick, this.song)) { this.status = 'won'; return true; }
    return false;
  }
  /** Skip to the next stage; past the last one the round is lost. */
  skip() {
    if (this.status !== 'playing') return;
    if (this.stage >= STAGES.length - 1) this.status = 'lost'; else this.stage += 1;
  }
  giveUp() { if (this.status === 'playing') this.status = 'lost'; }
}
