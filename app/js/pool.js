// The song pool: pool.json from the iPhone app, with a tier, an era, an
// Apple genre, scenes, and Apple's preview URL. Ported from Engine/Pool.swift
// so the web deals the same rounds the phone does. Rows marked `hidden` (a
// second copy of a recording, an instrumental, a live take) are never dealt
// or listed, but still resolve by id for the daily plan or an older phone.
import { Matcher, norm, normalise, namesSong } from './matcher.js';
export const TIERS = ['easy', 'medium', 'hard', 'expert', 'impossible'];
/** What the reel and the era picker offer — 60s/70s stay in the pool but are not offered. */
export const ERAS = ['all', '80s', '90s', '2000s', '2010s', '2020s'];
export const eraLabel = e => (e === 'all' ? 'Any era' : e);
export const STAGES = [0.1, 0.5, 2, 8, 15];
/** Non-English categories: selectable, but left out of "All". */
const REGIONAL = new Set(['Latin', 'K-Pop', 'Bollywood']);
/** Who the song is by, as a suggestion shows it: everyone credited (Song.byline). */
export const byline = s => s.credit || s.artist;

export function eraOf(year) {
  if (!year) return 'all';
  return year >= 2020 ? '2020s' : year >= 2010 ? '2010s' : year >= 2000 ? '2000s' : year >= 1990 ? '90s' : year >= 1980 ? '80s' : year >= 1970 ? '70s' : '60s';
}

/**
 * The seasons' genres (Halloween, Christmas) are not categories in the pool:
 * Season.isGenre / Season.inGenre answer for them. season.js hands itself
 * over with setSeasonGenres() once it has loaded.
 */
let season = { isGenre: () => false, inGenre: () => false };
export function setSeasonGenres(s) { if (s && typeof s.isGenre === 'function' && typeof s.inGenre === 'function') season = s; }

export class Pool {
  constructor(all) {
    // Hidden rows answer to their id and nothing else.
    const songs = all.filter(s => s.hidden !== true);
    this.songs = songs;
    this.byId = new Map();
    for (const s of all) if (!this.byId.has(s.id)) this.byId.set(s.id, s);
    const cat = new Map();
    for (const s of songs) {
      if (s.sceneOnly !== true) cat.set(s.category, (cat.get(s.category) || 0) + 1);
      // A row can list its own category among its scenes: count it once.
      for (const sc of s.scenes || []) if (s.sceneOnly === true || sc !== s.category) cat.set(sc, (cat.get(sc) || 0) + 1);
    }
    this.categoryCounts = [...cat].map(([name, count]) => ({ name, count })).sort((a, b) => a.count === b.count ? (a.name < b.name ? -1 : 1) : b.count - a.count);
    this.categories = [...cat.keys()].sort();
    const ac = new Map(); for (const s of songs) ac.set(s.artist, (ac.get(s.artist) || 0) + 1);
    this.artists = [...ac].map(([name, count]) => ({ name, count })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    this.matcher = new Matcher(songs);
    this.recent = [];
    this.recordings = new Map();
    this.countCache = new Map();
    this.artistCatalogue = [];
    this.scoped = null;            // a matcher over songs the pool never shipped (an artist's or album's catalogue)
    // The search index is built in idle time once the page is up.
    const idle = typeof requestIdleCallback === 'function' ? f => requestIdleCallback(f, { timeout: 1500 }) : f => setTimeout(f, 30);
    const step = () => { if (!this.matcher.work(8)) idle(step); };
    if (typeof window !== 'undefined') setTimeout(() => idle(step), 300);
  }
  static async load(url = '/data/pool.json') {
    const r = await fetch(url);
    if (!r.ok) throw new Error('pool.json ' + r.status);
    const d = await r.json();
    return new Pool(d.songs);
  }
  /** A curated song counts for its Apple genre and for any scene it was tagged with. */
  static inCategory(s, c) {
    if (season.isGenre(c)) return season.inGenre(c, s.id, s.category);
    return (s.scenes && s.scenes.includes(c)) || (s.sceneOnly !== true && s.category === c);
  }
  static excludedFromAll(s) { return s.sceneOnly === true || REGIONAL.has(s.category); }

  /** tier null = every tier. artist narrows to that artist's own songs, banded by catalogue depth. */
  filter(tier = 'easy', era = 'all', category = 'all', artist = null) {
    if (artist) {
      let own = this.songs.filter(s => s.artist === artist);
      if (this.artistCatalogue.length) { const seen = new Set(own.map(s => s.title.toLowerCase())); own = own.concat(this.artistCatalogue.filter(s => { const k = s.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })); }
      return tier ? Pool.depthBand(own, tier) : own;
    }
    return this.songs.filter(s => {
      if (tier && s.tier !== tier) return false;
      if (era !== 'all' && s.era !== era) return false;
      if (category === 'all') { if (Pool.excludedFromAll(s)) return false; }
      else if (!Pool.inCategory(s, category)) return false;
      return true;
    });
  }
  counts(era = 'all', category = 'all', artist = null) {
    const key = `${era}|${category}|${artist || ''}|${this.artistCatalogue.length}`;
    if (this.countCache.has(key)) return this.countCache.get(key);
    const out = Object.fromEntries(TIERS.map(t => [t, 0]));
    if (artist) for (const t of TIERS) out[t] = this.filter(t, era, category, artist).length;
    else for (const s of this.songs) {
      if (era !== 'all' && s.era !== era) continue;
      if (category === 'all') { if (Pool.excludedFromAll(s)) continue; } else if (!Pool.inCategory(s, category)) continue;
      if (s.tier in out) out[s.tier]++;
    }
    this.countCache.set(key, out);
    return out;
  }
  setArtistCatalogue(list) { this.artistCatalogue = list || []; this.countCache.clear(); }
  /** Season genres change with the date and the Seasonal switch: counts are taken again. */
  clearCounts() { this.countCache.clear(); }

  static depthOrdered(songs) {
    const band = s => { const i = TIERS.indexOf(s.artistTier || s.tier || ''); return i < 0 ? TIERS.length : i; };
    const M = Number.MAX_SAFE_INTEGER;
    return songs.map((s, i) => [s, i]).sort((a, b) => (band(a[0]) - band(b[0])) || ((a[0].artistRank ?? M) - (b[0].artistRank ?? M)) || ((a[0].fame ?? M) - (b[0].fame ?? M)) || (a[1] - b[1])).map(x => x[0]);
  }
  static depthBand(songs, tier) {
    if (!songs.length) return [];
    const o = Pool.depthOrdered(songs), n = o.length, i = Math.max(0, TIERS.indexOf(tier)), b = TIERS.length;
    const lo = Math.min(Math.floor(i * n / b), n - 1), hi = Math.min(n, Math.max(lo + 1, Math.floor((i + 1) * n / b)));
    return o.slice(lo, hi);
  }
  static popularity(s) {
    let w = (s.fame ?? 3) <= 1 ? 8 : s.fame === 2 ? 4 : 1;
    if ((s.year || 0) >= 1990) w *= 3;
    if (s.artistRank === 0) w *= 1.5;
    return w;
  }
  static weightedPick(list) {
    if (!list.length) return null;
    const total = list.reduce((a, s) => a + Pool.popularity(s), 0);
    if (!(total > 0)) return list[Math.floor(Math.random() * list.length)];
    let r = Math.random() * total;
    for (const s of list) { r -= Pool.popularity(s); if (r < 0) return s; }
    return list[list.length - 1];
  }
  /** The recording a row holds (title|artist normalised): a remaster of the song just dealt is not fresh. */
  recording(s) {
    let r = this.recordings.get(s.id);
    if (r === undefined) { r = normalise(s.title) + '|' + normalise(s.artist); this.recordings.set(s.id, r); }
    return r;
  }
  /** Never repeats a recording inside the last 30 picks. */
  pick(tier = 'easy', era = 'all', category = 'all', artist = null) {
    let c = this.filter(tier, era, category, artist);
    if (!c.length) return null;
    const key = s => this.recording(s);
    const fresh = c.filter(s => !this.recent.includes(key(s)));
    if (fresh.length) c = fresh;
    else if (c.length > 1) {
      // A small filter has dealt everything lately: the one heard longest ago, never the one that just played.
      const heard = s => this.recent.lastIndexOf(key(s));
      let best = c[0]; for (const s of c) if (heard(s) < heard(best)) best = s;
      c = [best];
    }
    const plain = era === 'all' && category === 'all' && !artist;
    const s = plain ? Pool.weightedPick(c) : c[Math.floor(Math.random() * c.length)];
    if (!s) return null;
    this.recent.push(key(s)); if (this.recent.length > 30) this.recent.shift();
    return s;
  }
  /**
   * Type-ahead search, best match first. `scope` limits it to those songs;
   * songs the pool never shipped (an artist's or an album's catalogue) get an
   * index of their own, as Game.artistMatcher does on the iPhone.
   * `artistBrowse` false when judging an answer: a bare artist's name then never stands for one of their songs.
   */
  search(query, limit = 8, scope = null, artistBrowse = true) {
    if (!scope) return this.matcher.search(query, limit, null, artistBrowse);
    const foreign = scope.some(s => this.byId.get(s.id) !== s || s.hidden === true);
    if (!foreign) return this.matcher.search(query, limit, new Set(scope.map(s => s.id)), artistBrowse);
    return this.searchWithin(scope, query, limit, artistBrowse);
  }
  /** Search one set of songs on an index of its own (Game.searchArtist: an artist's or an album's catalogue). */
  searchWithin(list, query, limit = 8, artistBrowse = true) {
    if (!list || !list.length) return [];
    const key = list.length + '|' + list.map(s => s.id).join(',');
    if (!this.scoped || this.scoped.key !== key) this.scoped = { key, m: new Matcher(list) };
    return this.scoped.m.search(query, limit, null, artistBrowse);
  }
}
export { norm, normalise, namesSong };
