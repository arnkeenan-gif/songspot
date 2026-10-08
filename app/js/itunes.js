// Apple's keyless iTunes Search / Lookup API, as ArtistCatalog.swift,
// AlbumCatalog.swift and the full-search Catalog use it. Asked straight from
// the browser (Apple answers with CORS headers, so no proxy is needed, and the
// storefront follows the player as on the phone). Every helper returns null
// when Apple could not be reached or answered nonsense, which is not the same
// as "nothing by that name".
import { eraOf, TIERS } from './pool.js';

/** The player's storefront: the region of their language setting (Locale.current.region), else US. */
export const country = (() => {
  try {
    const loc = new Intl.Locale(navigator.language || 'en-US');
    const r = (loc.maximize?.().region || loc.region || 'US').toUpperCase();
    return /^[A-Z]{2}$/.test(r) ? r : 'US';
  } catch (e) { return 'US'; }
})();
export const OFFLINE = "Can't reach Apple Music. Check your connection.";

async function get(url, ms = 8000) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, t = ac && setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac?.signal }); if (!r.ok) return null; return await r.json(); }
  catch (e) { return null; }
  finally { clearTimeout(t); }
}
const qs = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
export const search = params => get(`https://itunes.apple.com/search?${qs({ ...params, country })}`);
export const lookup = params => get(`https://itunes.apple.com/lookup?${qs({ ...params, country })}`);

/** A `{w}x{h}` template from Apple's 100x100bb artwork link. */
export const template = u => u ? u.replace(/\/[0-9]+x[0-9]+bb\.(jpg|png)$/, '/{w}x{h}bb.$1').replace('100x100bb', '{w}x{h}bb') : null;
const year = d => { const y = d ? parseInt(String(d).slice(0, 4), 10) : NaN; return Number.isFinite(y) ? y : null; };

/** A lookup/search track in pool.json's own song shape. */
export function songFrom(t, extra = {}) {
  const y = year(t.releaseDate);
  return { id: String(t.trackId), title: t.trackName || '', artist: t.artistName || '', credit: null, album: t.collectionName || null,
    year: y, era: eraOf(y), category: t.primaryGenreName || 'Other', genre: t.primaryGenreName || null,
    artwork: template(t.artworkUrl100), preview: t.previewUrl || null, url: t.trackViewUrl || null,
    tier: null, artistTier: null, fame: null, artistRank: null, ...extra };
}
/** Catalogue depth: the first fifth is Easy, the last is Impossible. */
export const bandOf = (i, n) => TIERS[Math.min(TIERS.length - 1, Math.floor(i * TIERS.length / Math.max(n, 1)))];

/** Easy search off: songs from the whole catalogue, for the guess list (Catalog.swift). */
export async function searchSongs(term) {
  const d = await search({ term, entity: 'song', limit: 8 });
  if (!d) return null;
  return (d.results || []).filter(t => t.wrapperType === 'track' && t.kind === 'song' && t.trackId).map(t => songFrom(t));
}
