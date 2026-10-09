// The loading language — Loading.swift's CoverWall on the web. Full-screen
// waits (finding an opponent, opening a room, a round about to start) stand
// in front of a wall of real album covers from the game, drifting in four
// tilted columns — alternately up and down — under a dark veil.
//
// GPU-cheap on purpose: each column is one composited layer moved by a CSS
// transform animation (no per-frame JavaScript, no layout), its slight blur
// baked in once on an inner layer. Every wall takes its phase from one shared
// clock, so a wall that is rebuilt on the next screen carries on where the
// last one was, as the app's clock-driven TimelineView does.
import { esc, art } from './ui.js';
import { Season } from './season.js';
import { SeededRNG } from './kit.js';

const COLS = 4;
/** How many different sets of covers the wall has; a screen shows one. */
const PRESETS = 10;
/** Seconds for one full lap of a column: CoverWall's speed = columnHeight / (38 + 7c). */
const lap = c => 38 + c * 7;
const today = () => Math.floor(Date.now() / 86400000);

/**
 * `count` tiles from fewer covers, laid out so no cover touches itself: not
 * beside it in the row, not above it in its column (tile i sits in column
 * i % COLS), and not across the seam where a column loops back to its top.
 */
function fill(covers, count) {
  if (!covers.length) return [];
  const out = [], n = covers.length, rows = Math.floor(count / COLS);
  for (let i = 0; i < count; i++) {
    const avoid = new Set([out[i - 1], out[i - COLS]]);
    if (Math.floor(i / COLS) === rows - 1) avoid.add(out[i % COLS]);
    let pick = covers[i % n];
    for (let k = 0; k < n; k++) { const c = covers[(i + k) % n]; if (!avoid.has(c)) { pick = c; break; } }
    out.push(pick);
  }
  return out;
}


export const CoverWall = {
  presets: PRESETS,
  /** A random one of the ten sets, picked each time a screen opens. */
  randomPreset: () => Math.floor(Math.random() * PRESETS),

  /**
   * Famous songs from the pool, from the game's genre (or artist) when one is
   * chosen, so a rap game stands in front of rap covers. `preset` picks one of
   * ten sets; each is the same all day.
   */
  covers(pool, { count = 36, preset = 0, category = 'all', artist = null } = {}) {
    if (!pool) return [];
    // iOS SeededRNG (xorshift64) and Swift's shuffled(using:), bit for bit: the same day gives the same sets as the phone.
    const rng = new SeededRNG(SeededRNG.seed(0x9E37 + today() * 31 + preset));
    // In a season the unfiltered wall shows the season's covers.
    if (Season.current && (!category || category === 'all') && !artist) category = Season.genre();
    let picks = [];
    if (artist) picks = pool.filter(null, 'all', 'all', artist);
    else if (category && category !== 'all') {
      picks = pool.filter('easy', 'all', category);
      if (picks.length < count) picks = pool.filter(null, 'all', category);
    }
    // Distinct covers only: one artist's singles often share an album.
    const seen = new Set();
    picks = picks.filter(s => { const k = s.artwork ?? s.id; if (seen.has(k)) return false; seen.add(k); return true; });
    const urls = list => list.filter(s => s.artwork).map(s => art(s.artwork, 160));
    // An artist with a handful of albums still gets a wall of their own:
    // their covers repeat, never next to the same one.
    if (artist && picks.length >= 3 && picks.length < count) return fill(urls(rng.shuffled(picks)), count);
    if (picks.length < 12) {
      const easy = pool.filter('easy');
      picks = easy.length ? easy : pool.songs.slice(0, 200);
    }
    return urls(rng.shuffled(picks)).slice(0, count);
  },

  /**
   * Fetch every preset's covers into the browser's cache, `after` seconds from
   * now (CoverWall.warm(p, after: 4)): the first song has the network first.
   */
  warm(pool, after = 0) {
    if (CoverWall._warmed || !pool) return; CoverWall._warmed = true;
    setTimeout(() => {
      const urls = [...new Set(Array.from({ length: PRESETS }, (_, p) => CoverWall.covers(pool, { preset: p })).flat())];
      let i = 0;
      const next = () => { for (let k = 0; k < 6 && i < urls.length; k++, i++) { const im = new Image(); im.decoding = 'async'; im.src = urls[i]; } if (i < urls.length) setTimeout(next, 120); };
      next();
    }, after * 1000);
  },

  /** The wall's markup. `veil` is how dark the page is over it (0–1). */
  html(covers, veil = 0.7, cls = '') {
    const list = covers || [];
    const per = Math.max(1, Math.floor(list.length / COLS));
    // Every column shares one clock: a negative delay puts it where the clock says it is.
    const now = performance.now() / 1000;
    let cols = '';
    for (let c = 0; c < COLS; c++) {
      const mine = list.filter((_, i) => i % COLS === c).slice(0, per);
      const tile = u => `<i>${u ? `<img src="${esc(u)}" alt="" decoding="async" draggable="false">` : ''}</i>`;
      // Twice over, so the column loops without a seam.
      const tiles = (mine.length ? mine : [null]).map(tile).join('');
      const d = lap(c);
      cols += `<div class="cw-col${c % 2 ? ' down' : ''}" style="animation-duration:${d}s;animation-delay:-${(now % d).toFixed(2)}s"><div class="cw-in">${tiles}${tiles}</div></div>`;
    }
    return `<div class="cwall ${cls}" style="--veil:${veil}" aria-hidden="true"><div class="cw-tilt">${cols}</div><i class="cw-veil"></i><i class="cw-shade"></i></div>`;
  },

  /** Put a wall in `host` (replacing one already there only when the covers changed); returns the wall. */
  mount(host, covers, veil = 0.7, cls = '') {
    const key = (covers || []).join('|');
    let w = host.querySelector(':scope > .cwall');
    if (!w || w.dataset.key !== key) {
      w?.remove();
      host.insertAdjacentHTML('afterbegin', CoverWall.html(covers, veil, cls));
      w = host.firstElementChild; w.dataset.key = key;
    }
    w.style.setProperty('--veil', veil);
    return w;
  },
};
