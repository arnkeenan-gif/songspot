// Apple's iTunes Search API for the web, which cannot call it directly
// (no CORS): artist search, an artist's catalogue, and one track by id —
// returned in pool.json's own song shape, so artist mode and parties treat
// them like any other song.
const eraOf = y => !y ? 'all' : y >= 2020 ? '2020s' : y >= 2010 ? '2010s' : y >= 2000 ? '2000s' : y >= 1990 ? '90s' : y >= 1980 ? '80s' : y >= 1970 ? '70s' : '60s';
const song = (t, i) => {
  const year = t.releaseDate ? new Date(t.releaseDate).getUTCFullYear() : null;
  return { id: String(t.trackId), title: t.trackName, artist: t.artistName, album: t.collectionName || null, year, era: eraOf(year),
    category: t.primaryGenreName || 'Other', genre: t.primaryGenreName || null,
    artwork: t.artworkUrl100 ? t.artworkUrl100.replace(/\/[0-9]+x[0-9]+bb\.(jpg|png)$/, '/{w}x{h}bb.$1') : null,
    preview: t.previewUrl || null, url: t.trackViewUrl || null, tier: null, artistTier: null, fame: null, artistRank: i };
};
export default async function handler(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const country = (q.get('country') || req.headers['x-vercel-ip-country'] || 'US').slice(0, 2).toUpperCase();
  let url, kind;
  if (q.get('id')) { url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(q.get('id'))}&country=${country}&entity=song`; kind = 'id'; }
  else if (q.get('artistId')) { url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(q.get('artistId'))}&entity=song&limit=200&country=${country}`; kind = 'catalogue'; }
  else if (q.get('term')) { url = `https://itunes.apple.com/search?term=${encodeURIComponent(q.get('term').slice(0, 80))}&entity=musicArtist&limit=12&country=${country}`; kind = 'artists'; }
  else { res.statusCode = 400; return res.end('{}'); }
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'songspot-web/1.0' } });
    const d = await r.json();
    const results = d.results || [];
    let body;
    if (kind === 'artists') {
      const artists = results.filter(a => a.wrapperType === 'artist').map(a => ({ id: String(a.artistId), name: a.artistName, genre: a.primaryGenreName || null }));
      // A cover for each face: the artist's top song's artwork.
      await Promise.all(artists.slice(0, 8).map(async a => {
        try { const x = await (await fetch(`https://itunes.apple.com/lookup?id=${a.id}&entity=song&limit=1&country=${country}`)).json(); const t = (x.results || []).find(z => z.wrapperType === 'track'); if (t?.artworkUrl100) a.artwork = t.artworkUrl100.replace(/\/[0-9]+x[0-9]+bb\.(jpg|png)$/, '/{w}x{h}bb.$1'); } catch (e) {}
      }));
      body = { artists };
    } else {
      const seen = new Set();
      const songs = results.filter(t => t.wrapperType === 'track' && t.kind === 'song').filter(t => { const k = String(t.trackName).toLowerCase().split('(')[0].trim(); if (seen.has(k)) return false; seen.add(k); return true; }).map(song);
      body = { songs };
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=3600');
    res.end(JSON.stringify(body));
  } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end('{"songs":[],"artists":[]}'); }
}
