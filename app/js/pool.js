// The song pool: pool.json from the iPhone app (15,193 songs), with a tier,
// an era, an Apple genre, scenes, and Apple's preview URL. Ported from
// Engine/Pool.swift so the web deals the same rounds the phone does.
import { Matcher, norm } from './matcher.js';
export const TIERS = ['easy', 'medium', 'hard', 'expert', 'impossible'];
/** What the reel and the era picker offer — 60s/70s stay in the pool but are not offered. */
export const ERAS = ['all', '80s', '90s', '2000s', '2010s', '2020s'];
export const eraLabel = e => (e === 'all' ? 'Any era' : e);
export const STAGES = [0.1, 0.5, 2, 8, 15];
/** Non-English categories: selectable, but left out of "All". */
const REGIONAL = new Set(['Latin', 'K-Pop', 'Bollywood']);

export function eraOf(year) {
  if (!year) return 'all';
  return year >= 2020 ? '2020s' : year >= 2010 ? '2010s' : year >= 2000 ? '2000s' : year >= 1990 ? '90s' : year >= 1980 ? '80s' : year >= 1970 ? '70s' : '60s';
}

export class Pool {
  constructor(songs) {
    this.songs = songs;
    this.byId = new Map(songs.map(s => [s.id, s]));
    const cat = new Map();
    for (const s of songs) {
      if (!s.sceneOnly) cat.set(s.category, (cat.get(s.category) || 0) + 1);
      for (const sc of s.scenes || []) cat.set(sc, (cat.get(sc) || 0) + 1);
    }
    this.categoryCounts = [...cat].map(([name, count]) => ({ name, count })).sort((a, b) => a.count === b.count ? (a.name < b.name ? -1 : 1) : b.count - a.count);
    this.categories = this.categoryCounts.map(c => c.name);
    const ac = new Map(); for (const s of songs) ac.set(s.artist, (ac.get(s.artist) || 0) + 1);
    this.artists = [...ac].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
    this.matcher = new Matcher(songs);
    this.recent = [];
    this.countCache = new Map();
    this.artistCatalogue = [];
  }
  static async load(url = '/data/pool.json') {
    const r = await fetch(url);
    if (!r.ok) throw new Error('pool.json ' + r.status);
    const d = await r.json();
    return new Pool(d.songs);
  }
  static inCategory(s, c) { return (s.scenes && s.scenes.includes(c)) || (!s.sceneOnly && s.category === c); }
  static excludedFromAll(s) { return !!s.sceneOnly || REGIONAL.has(s.category); }

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

  static depthOrdered(songs) {
    const band = s => { const i = TIERS.indexOf(s.artistTier || s.tier || ''); return i < 0 ? TIERS.length : i; };
    return songs.map((s, i) => [s, i]).sort((a, b) => (band(a[0]) - band(b[0])) || ((a[0].artistRank ?? 1e9) - (b[0].artistRank ?? 1e9)) || ((a[0].fame ?? 1e9) - (b[0].fame ?? 1e9)) || (a[1] - b[1])).map(x => x[0]);
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
    let r = Math.random() * total;
    for (const s of list) { r -= Pool.popularity(s); if (r < 0) return s; }
    return list[list.length - 1];
  }
  /** Never repeats a song inside the last 30 picks. */
  pick(tier = 'easy', era = 'all', category = 'all', artist = null) {
    let c = this.filter(tier, era, category, artist);
    if (!c.length) return null;
    const fresh = c.filter(s => !this.recent.includes(s.id)); if (fresh.length) c = fresh;
    const plain = era === 'all' && category === 'all' && !artist;
    const s = plain ? Pool.weightedPick(c) : c[Math.floor(Math.random() * c.length)];
    if (!s) return null;
    this.recent.push(s.id); if (this.recent.length > 30) this.recent.shift();
    return s;
  }
  /** Type-ahead over titles and artists, best first; scope limits it to those songs. */
  search(query, limit = 8, scope = null) { return this.matcher.search(query, limit, scope); }
}
export { norm };
