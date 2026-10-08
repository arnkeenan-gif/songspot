// AlbumCatalog.swift: one-album mode. Well-known albums suggested from the
// bundled pool before anything is typed, any album on Apple Music by search,
// and an album's tracklist, ordered so Easy is its hits and Impossible its
// deep cuts. Tracks travel in game.artistSongs, as a searched artist's do.
import { Pool, normalise } from './pool.js';
import { search, lookup, OFFLINE, songFrom, bandOf } from './itunes.js';

/** Under this many tracks an album is a single or a short EP. */
export const MIN_TRACKS = 5;

/** An album name without the edition it is filed under: "Hybrid Theory (Deluxe Edition)" → "Hybrid Theory". */
export function albumDisplayName(raw) {
  const edition = /\s*[\(\[][^\)\]]*(deluxe|remaster|edition|expanded|bonus|version|anniversary|reloaded)[^\)\]]*[\)\]]\s*$/i;
  let s = String(raw || '');
  while (edition.test(s)) s = s.replace(edition, '');
  return s || String(raw || '');
}

/** Hits packages and soundtracks are not an album anyone means; a single is not an album. */
const notAnAlbum = /greatest|best of|\bhits\b|essential|\bgold\b|collection|anthology|legend|#1|number ones|\bsingles?\b|- ep\b|\bep\b|very best|playlist|now that|soundtrack|\blive\b|remixes/i;

/** `https://music.apple.com/us/album/<slug>/<collectionId>?i=<trackId>` → the collection id. */
function collectionID(url) {
  if (!url) return null;
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean), i = parts.indexOf('album');
    if (i < 0 || i + 2 >= parts.length) return null;
    return /^[0-9]+$/.test(parts[i + 2]) ? parts[i + 2] : null;
  } catch (e) { return null; }
}

let suggestions = null, suggestedFor = null;
/** Albums the pool carries at least three songs from, a famous one among them; two per artist at most. */
export function suggestedAlbums(songs, limit = 30) {
  if (suggestedFor === songs && suggestions) return suggestions.slice(0, limit);
  suggestedFor = songs;
  const groups = new Map();
  for (const s of songs) {
    if (Pool.excludedFromAll(s) || !s.album) continue;
    const k = `${s.album}|${s.artist}`; const g = groups.get(k); if (g) g.push(s); else groups.set(k, [s]);
  }
  const out = [], M = Number.MAX_SAFE_INTEGER;
  for (const rows of groups.values()) {
    if (rows.length < 3 || !rows.some(s => s.fame === 1)) continue;
    const first = rows[0], album = first.album;
    if (notAnAlbum.test(album)) continue;
    let score = rows.reduce((acc, s) => acc + (s.fame === 1 ? 8 : s.fame === 2 ? 3 : 0.5), 0);
    if (rows.some(s => s.artistRank === 0)) score += 10;
    let lead = rows[0];
    for (const s of rows) { const a = [s.fame ?? 9, s.artistRank ?? M], b = [lead.fame ?? 9, lead.artistRank ?? M]; if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) lead = s; }
    const years = rows.map(s => s.year).filter(y => y != null);
    let cid = null; for (const s of rows) { cid = collectionID(s.url); if (cid) break; }
    out.push({ id: `${album}|${first.artist}`, name: album, artist: first.artist, year: years.length ? Math.min(...years) : null,
      count: rows.length, artwork: lead.artwork || null, collectionID: cid, score });
  }
  out.sort((a, b) => a.score === b.score ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : b.score - a.score);
  const per = new Map();
  suggestions = out.filter(a => { per.set(a.artist, (per.get(a.artist) || 0) + 1); return per.get(a.artist) <= 2; });
  return suggestions.slice(0, limit);
}

/** Any album on Apple Music: no singles, one row for the clean and explicit editions. null when offline. */
export async function albumsMatching(term) {
  const d = await search({ term, entity: 'album', limit: 25 });
  if (!d || !Array.isArray(d.results)) return null;
  const seen = new Set(), out = [];
  for (const r of d.results) {
    if (r.collectionId == null || !r.collectionName || !r.artistName || r.collectionName.endsWith(' - Single')) continue;
    const k = `${normalise(r.collectionName)}|${normalise(r.artistName)}`; if (seen.has(k)) continue; seen.add(k);
    const y = r.releaseDate ? parseInt(String(r.releaseDate).slice(0, 4), 10) : NaN;
    out.push({ id: r.collectionId, name: r.collectionName, artist: r.artistName, year: Number.isFinite(y) ? y : null, trackCount: r.trackCount || 0, artwork: r.artworkUrl100 || null });
  }
  return out;
}
export const tooShort = m => m.trackCount < MIN_TRACKS;
export const matchArt = (m, size) => m.artwork ? m.artwork.replace('100x100bb', `${size}x${size}bb`) : null;
export const localArt = (a, size) => a.artwork ? a.artwork.replace('{w}x{h}', `${size}x${size}`) : null;

/** Every playable track, one per title, skits under 45 s left out; the pool's known songs lead, best known first. */
async function tracks(id, pool) {
  const d = await lookup({ id: String(id), entity: 'song', limit: 200 });
  if (!d || !Array.isArray(d.results)) return null;
  const seen = new Set();
  const list = d.results.filter(t => t.wrapperType === 'track' && t.kind !== 'music-video' && t.trackId != null && t.previewUrl && (t.trackTimeMillis ?? 60000) >= 45000)
    .filter(t => { const k = normalise(t.trackName || ''); if (seen.has(k)) return false; seen.add(k); return true; });
  const known = new Map();
  if (list.length && list[0].artistName) {
    const a = normalise(list[0].artistName);
    for (const s of pool) {
      if (normalise(s.artist) !== a) continue;
      const k = normalise(s.title), have = known.get(k);
      if (have && (have.fame ?? 9) <= (s.fame ?? 9)) continue;
      known.set(k, s);
    }
  }
  const M = Number.MAX_SAFE_INTEGER;
  const keyOf = (t, i) => { const k = known.get(normalise(t.trackName || '')); return [k ? 0 : 1, k?.fame ?? 9, k?.artistRank ?? M, i]; };
  const ordered = list.map((t, i) => [t, keyOf(t, i)]).sort((x, y) => { for (let j = 0; j < 4; j++) if (x[1][j] !== y[1][j]) return x[1][j] - y[1][j]; return 0; }).map(x => x[0]);
  return ordered.map((t, i) => {
    const b = bandOf(i, ordered.length), pooled = known.get(normalise(t.trackName || ''));
    return songFrom(t, { credit: pooled?.credit ?? null, tier: b, artistTier: b, fame: pooled?.fame ?? null });
  });
}
/** A bundled album: by the pool's collection id, else found by name. { songs, error }. */
export async function songsForLocal(album, pool) {
  if (album.collectionID) { const found = await tracks(album.collectionID, pool); if (found && found.length >= MIN_TRACKS) return { songs: found, error: null }; }
  const cands = await albumsMatching(`${album.name} ${album.artist}`);
  if (!cands) return { songs: [], error: OFFLINE };
  const want = normalise(album.name), by = normalise(album.artist);
  const best = cands.find(c => normalise(c.name) === want && normalise(c.artist) === by) || cands.find(c => normalise(c.artist) === by && normalise(c.name).startsWith(want));
  if (!best) return { songs: [], error: null };
  const found = await tracks(best.id, pool);
  return { songs: found || [], error: found == null ? OFFLINE : null };
}
export async function songsForMatch(m, pool) {
  const found = await tracks(m.id, pool);
  return { songs: found || [], error: found == null ? OFFLINE : null };
}
