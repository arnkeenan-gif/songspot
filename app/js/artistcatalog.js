// ArtistCatalog.swift: the artists that ship in pool.json (one row each,
// with the cover of their best-known song), the suggestions shown before
// anything is typed, and anyone else on Apple Music through the iTunes API.
import { Pool, normalise } from './pool.js';
import { search, lookup, OFFLINE, songFrom, bandOf, template } from './itunes.js';

/** A title to tell songs apart by; non-Latin titles keep their letters instead of folding into "". */
export const titleKey = t => { const n = normalise(t); return n || String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); };

let localIndex = null, localNormalised = null, indexedFor = null;
const fullCatalogues = new Map();

function buildLocalIndex(songs) {
  if (indexedFor === songs && localIndex) return;
  indexedFor = songs;
  const counts = new Map(), best = new Map();
  const sig = s => [s.artistRank ?? Number.MAX_SAFE_INTEGER, s.fame ?? Number.MAX_SAFE_INTEGER];
  const less = (a, b) => a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];
  for (const s of songs) {
    counts.set(s.artist, (counts.get(s.artist) || 0) + 1);
    const b = best.get(s.artist);
    if (!b || less(sig(s), sig(b))) best.set(s.artist, s);
  }
  // A joint credit with a song or two is a feature, not an act.
  const solo = new Set(counts.keys());
  localIndex = [];
  for (const [name, count] of counts) {
    if (count <= 2) {
      const parts = name.split(', ').flatMap(p => p.split(' & '));
      if (parts.length >= 2 && parts.some(p => solo.has(p))) continue;
    }
    const top = best.get(name);
    localIndex.push({ name, count, genre: top?.genre ?? top?.category ?? null, artwork: top?.artwork ?? null });
  }
  localNormalised = localIndex.map(a => normalise(a.name));
}

/** Bundled artists whose name contains `raw`: an exact name, then a leading match, then anywhere; bigger first. */
export function localArtists(raw, songs, limit = 8) {
  const term = String(raw || '').trim(); if (!term) return [];
  buildLocalIndex(songs);
  const needle = normalise(term); if (!needle) return [];
  const out = [];
  localIndex.forEach((a, i) => { const hay = localNormalised[i]; if (!hay.includes(needle)) return; out.push([a, hay === needle ? 0 : hay.startsWith(needle) ? 1 : 2]); });
  out.sort((l, r) => l[1] === r[1] ? r[0].count - l[0].count : l[1] - r[1]);
  return out.slice(0, limit).map(x => x[0]);
}
/** Before anything is typed: the acts behind the best-known songs in the normal game, biggest catalogues first. */
export function suggestedArtists(songs, limit = 24) {
  buildLocalIndex(songs);
  const famous = new Set();
  for (const s of songs) if (s.fame === 1 && s.tier === 'easy' && !Pool.excludedFromAll(s)) famous.add(s.artist);
  return localIndex.filter(a => famous.has(a.name)).sort((a, b) => a.count === b.count ? (a.name < b.name ? -1 : 1) : b.count - a.count).slice(0, limit);
}
export function isBundled(name, songs) { buildLocalIndex(songs); return localNormalised.includes(normalise(name)); }

/** Anyone on Apple Music: up to 12, each with a cover and one track to tell namesakes apart. null when offline. */
export async function artistsMatching(term) {
  const d = await search({ term, entity: 'musicArtist', limit: 12 });
  if (!d || !Array.isArray(d.results)) return null;
  const seen = new Set(), found = [];
  for (const r of d.results) {
    if (r.artistId == null || !r.artistName || seen.has(r.artistId)) continue;
    seen.add(r.artistId); found.push({ id: r.artistId, name: r.artistName, genre: r.primaryGenreName || null, artwork: null, sample: null });
  }
  if (!found.length) return [];
  const e = await lookup({ id: found.map(m => m.id).join(','), entity: 'song', limit: 1 });
  if (e && Array.isArray(e.results)) {
    const by = new Map();
    for (const t of e.results) if (t.wrapperType === 'track' && t.artistId != null && !by.has(t.artistId)) by.set(t.artistId, t);
    for (const m of found) { const t = by.get(m.id); if (t) { m.artwork = t.artworkUrl100 || null; m.sample = t.trackName || null; m.genre = m.genre ?? t.primaryGenreName ?? null; } }
  }
  return found;
}
/** Artwork of a match, sized: Apple's 100x100bb link. */
export const matchArt = (m, size) => m.artwork ? m.artwork.replace('100x100bb', `${size}x${size}bb`) : null;

/** Everything of theirs with a playable preview, best known first. { songs, error }. */
export async function songsFor(artist) {
  const d = await lookup({ id: String(artist.id), entity: 'song', limit: 200 });
  if (!d || !Array.isArray(d.results)) return { songs: [], error: OFFLINE };
  const seen = new Set();
  const tracks = d.results.filter(t => t.wrapperType === 'track' && t.previewUrl).filter(t => { const k = titleKey(t.trackName || ''); if (seen.has(k)) return false; seen.add(k); return true; });
  return { songs: tracks.map((t, i) => { const b = bandOf(i, tracks.length); return songFrom({ ...t, trackId: t.trackId ?? i }, { artist: t.artistName || artist.name, tier: b, artistTier: b }); }), error: null };
}
/** A bundled artist's whole catalogue: the pool's rows first, then the rest from Apple Music (that exact act only). */
export async function fullCatalogue(name, bundled) {
  const key = normalise(name);
  if (fullCatalogues.has(key)) return { songs: fullCatalogues.get(key), error: null };
  const found = await artistsMatching(name);
  const match = found?.find(m => normalise(m.name) === key);
  if (!match) return { songs: bundled, error: found == null ? OFFLINE : null };
  const { songs: theirs } = await songsFor(match);
  const seen = new Set(bundled.map(s => titleKey(s.title)));
  const merged = bundled.concat(theirs.filter(s => { const k = titleKey(s.title); if (seen.has(k)) return false; seen.add(k); return true; }));
  fullCatalogues.set(key, merged);
  return { songs: merged, error: null };
}
export { template };
