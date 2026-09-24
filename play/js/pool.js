// The song pool: 13,450 songs with a tier, an era, a category and Apple's
// preview URL. Same file the iPhone and Android ship; the default game
// leaves out the songs marked sceneOnly, exactly as the apps do.
export const TIERS = ['easy', 'medium', 'hard', 'expert', 'impossible'];
export const ERAS = ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'];
export const STAGES = [0.1, 0.5, 2, 8, 15];

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export class Pool {
  constructor(songs) {
    this.songs = songs;
    this.byId = new Map(songs.map(s => [s.id, s]));
    this.categories = [...new Set(songs.filter(s => !s.sceneOnly).map(s => s.category))].sort();
    for (const s of songs) { s._t = norm(s.title); s._a = norm(s.artist); s._k = s._t + ' ' + s._a; }
  }
  static async load(url = '/data/pool.json') {
    const r = await fetch(url);
    if (!r.ok) throw new Error('pool.json ' + r.status);
    const d = await r.json();
    return new Pool(d.songs);
  }
  /** Everything playable under the filters. artist narrows to one artist's own songs (still pool rows). */
  filter(tier, era = 'all', category = 'all', artist = null) {
    return this.songs.filter(s => (artist ? s._a === norm(artist) : !s.sceneOnly)
      && s.tier === tier && (era === 'all' || s.era === era) && (category === 'all' || s.category === category));
  }
  counts(era = 'all', category = 'all', artist = null) {
    const c = Object.fromEntries(TIERS.map(t => [t, 0]));
    for (const s of this.songs) {
      if (artist ? s._a !== norm(artist) : s.sceneOnly) continue;
      if ((era === 'all' || s.era === era) && (category === 'all' || s.category === category)) c[s.tier]++;
    }
    return c;
  }
  pick(tier, era, category, artist, avoid = new Set()) {
    const all = this.filter(tier, era, category, artist);
    const fresh = all.filter(s => !avoid.has(s.id));
    const from = fresh.length ? fresh : all;
    return from.length ? from[Math.floor(Math.random() * from.length)] : null;
  }
  /** Suggestions: title or artist starts with what was typed, then contains it. */
  search(query, limit = 8, scope = null) {
    const q = norm(query);
    if (!q) return [];
    const src = scope || this.songs;
    const starts = [], has = [];
    for (const s of src) {
      if (s._t.startsWith(q) || s._a.startsWith(q)) starts.push(s);
      else if (s._k.includes(q)) has.push(s);
      if (starts.length >= limit) break;
    }
    const out = [...starts, ...has].slice(0, limit);
    const seen = new Set();
    return out.filter(s => { const k = s._t + '|' + s._a; if (seen.has(k)) return false; seen.add(k); return true; });
  }
}
export { norm };
