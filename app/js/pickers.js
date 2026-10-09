// The sheets that choose what to play from: Genres (CategoryPicker.swift),
// Artists (ArtistPicker.swift + ArtistCatalog.swift), Albums (AlbumPicker.swift
// + AlbumCatalog.swift), and How to play (the FAQ in Drawer.swift, below).
// Full-screen on a phone like the app's cover, a centred card on a big screen,
// on the season's backdrop (SeasonBackdrop) in a season.
import { openSheet, esc, art, TIER_COLOR, toast, mix } from './ui.js';
import { I, SF } from './icons.js';
import { Haptics } from './haptics.js';
import { Season, mountBackdrop } from './season.js';
import { localArtists, suggestedArtists, isBundled, artistsMatching, matchArt, songsFor, fullCatalogue } from './artistcatalog.js';
import { suggestedAlbums, albumsMatching, songsForLocal, songsForMatch, albumDisplayName, tooShort, MIN_TRACKS, matchArt as albumArt, localArt } from './albumcatalog.js';
import { normalise } from './matcher.js';

const head = title => `<div class="phead"><h2>${title}</h2><button class="xbtn" data-press data-act="close" aria-label="Close">${SF.xmark || I.x}</button></div>`;
const searchBox = ph => `<label class="psearch">${I.search}<input type="text" placeholder="${ph}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><button class="pclear" data-press data-act="clear" hidden aria-label="Clear search">${I.x}</button></label>`;
const CHECK = `<span class="ck">${I.check}</span>`;
const heading = t => `<p class="pheading">${t}</p>`;
const prompt = t => `<p class="pprompt">${t}</p>`;
const empty = t => `<p class="pempty2">${esc(t)}</p>`;
const waiting = t => `<p class="pwait"><i class="spin s"></i>${t}</p>`;
/** A one-line row (All genres, a genre, the current pick). */
const row = (name, count, attrs, on) => `<button class="prow2 ${on ? 'on' : ''}" data-press ${attrs}><span class="nm">${esc(name)}</span>${count != null ? `<span class="ct">${esc(count)}</span>` : ''}${on ? CHECK : ''}</button>`;
/** An artist or album row: 40pt art, the name over a line, an icon (or the check, or a spinner) at the end. */
const artRow = ({ attrs, name, img, line, icon, placeholder, on = false, busy = false, disabled = false }) =>
  `<button class="arow2 ${on ? 'on' : ''} ${disabled ? 'off' : ''}" data-press ${attrs} ${disabled ? 'aria-disabled="true"' : ''}>
    <span class="aart2">${img ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<i>${placeholder}</i></span>
    <span class="atxt2"><b>${esc(name)}</b><span>${esc(line)}</span></span>
    ${busy ? '<i class="spin s"></i>' : disabled ? '' : `<span class="aend ${on ? 'ck' : ''}">${on ? I.check : icon}</span>`}</button>`;

/** The sheet itself: the picker look, the accent, the season's backdrop behind it. */
function pickerSheet(ctx, title, placeholder) {
  const accent = TIER_COLOR[ctx.game.difficulty];
  const sh = openSheet(`${head(title)}${searchBox(placeholder)}<div class="plist"></div>`, { cls: 'picker tall', label: title });
  sh.node.style.setProperty('--accent', accent);
  sh.node.style.setProperty('--accent-on', mix(accent, '#ffffff', 0.22));
  const back = mountBackdrop(sh.body);
  const close = sh.close;
  sh.close = () => { back?.destroy?.(); close(); };
  sh.node.querySelector('.scrim').addEventListener('click', () => back?.destroy?.());
  const list = sh.body.querySelector('.plist'), input = sh.body.querySelector('input'), clear = sh.body.querySelector('.pclear');
  // .scrollDismissesKeyboard(.immediately)
  list.addEventListener('scroll', () => { if (document.activeElement === input) input.blur(); }, { passive: true });
  return { sh, list, input, clear };
}
const ARROW_DOWN = SF['arrow.down.circle'] || `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.4v8.4M8.4 12.4l3.6 3.6 3.6-3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function openGenres(ctx) {
  const { pool, game } = ctx;
  const { sh, list, input, clear } = pickerSheet(ctx, 'Genres', 'Search genres');
  const draw = () => {
    const t = input.value.trim().toLowerCase(); clear.hidden = !input.value;
    const hits = t ? pool.categoryCounts.filter(c => c.name.toLowerCase().includes(t)) : pool.categoryCounts;
    let h = '';
    if (!t) {
      h += row('All genres', null, 'data-key="all"', game.category === 'all');
      // The season's genre sits right under All genres.
      if (Season.current) { const g = Season.genre(), c = pool.counts('all', g); h += row(g, Object.values(c).reduce((a, b) => a + b, 0), `data-key="${esc(g)}"`, game.category === g); }
    }
    h += hits.map(c => row(c.name, c.count, `data-key="${esc(c.name)}"`, c.name === game.category)).join('');
    if (!hits.length) h += empty('Nothing by that name.');
    list.innerHTML = h;
  };
  draw();
  input.addEventListener('input', draw);
  sh.body.addEventListener('click', e => {
    const b = e.target.closest('[data-key], [data-act]'); if (!b) return;
    if (b.dataset.act === 'close') { ctx.sound.click(); return sh.close(); }
    if (b.dataset.act === 'clear') { input.value = ''; draw(); return; }
    game.category = b.dataset.key;
    ctx.newRound(); sh.close();
  });
}

/** Artist mode: anyone in the pool plays instantly; anyone else on Apple Music loads their catalogue. */
export function openArtists(ctx) {
  const { pool, game } = ctx;
  const { sh, list, input, clear } = pickerSheet(ctx, 'Artists', 'Search any artist');
  // Suggestions first; the keyboard waits for a tap on the field.
  const suggested = suggestedArtists(pool.songs);
  let matches = [], searching = false, loading = false, lastError = null, timer = 0, seq = 0;
  const localLine = a => [`${a.count} ready · full catalogue`, a.genre].filter(Boolean).join(' · ');
  const localRow = a => artRow({ attrs: `data-local="${esc(a.name)}"`, name: a.name, img: a.artwork ? art(a.artwork, 120) : null, line: localLine(a), icon: I.bolt, placeholder: I.mic, on: game.artist === a.name });
  const draw = () => {
    const typed = input.value.trim(); clear.hidden = !input.value;
    const hits = localArtists(typed, pool.songs);
    const strangers = matches.filter(m => !isBundled(m.name, pool.songs));
    let h = '';
    if (!typed) {
      h += row('All artists', null, 'data-all="1"', !game.artist);
      if (game.artist) h += `<div class="prow2 on"><span class="nm">${esc(game.artist)}</span><span class="ct">${game.artistSongs.length} songs</span>${CHECK}</div>`;
      h += prompt('Type a name. Anyone at all — small and local bands included.');
      h += heading('SUGGESTED') + suggested.map(localRow).join('');
    }
    if (hits.length) h += heading('IN THE GAME · PLAYS INSTANTLY') + hits.map(localRow).join('');
    if (strangers.length) h += heading('EVERYONE ON APPLE MUSIC') + strangers.map(m => artRow({ attrs: `data-stranger="${esc(m.id)}"`, name: m.name, img: matchArt(m, 120), line: ['Full catalogue', m.genre, m.sample].filter(Boolean).join(' · '), icon: ARROW_DOWN, placeholder: I.mic, on: game.artist === m.name })).join('');
    if (searching && !strangers.length) h += waiting('Searching Apple Music…');
    else if (typed && !hits.length && !strangers.length && !searching) h += empty(lastError ?? 'Nobody by that name.');
    if (loading) h += waiting('Loading their songs…');
    list.innerHTML = h;
  };
  /** Debounced 280 ms, two characters or more; offline is not "nobody". */
  const search = () => {
    clearTimeout(timer); const term = input.value.trim(), my = ++seq;
    if (term.length < 2) { matches = []; searching = false; lastError = null; return draw(); }
    searching = true; draw();
    timer = setTimeout(async () => {
      const found = await artistsMatching(term);
      if (my !== seq) return;
      matches = found || []; searching = false; lastError = found == null ? "Can't reach Apple Music. Check your connection." : null;
      draw();
    }, 280);
  };
  draw();
  input.addEventListener('input', search);
  // `?artistQuery=<name>` (localhost): mid-search, for screenshots (iOS -artistQuery).
  { const aq = new URLSearchParams(location.search).get('artistQuery'); if (aq && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { input.value = aq; search(); } }
  const pickLocal = name => {
    game.album = null;                 // an artist and an album never stand together
    game.setArtistSongs([]);
    game.artist = name;
    ctx.newRound(); sh.close();
    // Their bundled songs start the round at once; the rest of the catalogue lands a moment later.
    const bundled = pool.filter(null, 'all', 'all', name);
    fullCatalogue(name, bundled).then(({ songs }) => { if (game.artist === name) { game.setArtistSongs(songs); ctx.refresh?.(); } });
  };
  sh.body.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'close') { ctx.sound.click(); return sh.close(); }
    if (b.dataset.act === 'clear') { input.value = ''; seq++; clearTimeout(timer); matches = []; searching = false; lastError = null; return draw(); }
    if (b.dataset.all) { if (game.artist) { game.artist = null; game.setArtistSongs([]); ctx.newRound(); } return sh.close(); }
    if (b.dataset.local) return pickLocal(b.dataset.local);
    if (b.dataset.stranger) {
      const m = matches.find(x => String(x.id) === b.dataset.stranger); if (!m || loading) return;
      loading = true; draw();
      const { songs, error } = await songsFor(m);
      loading = false; draw();
      if (!songs.length) return toast(error ?? `No playable songs found for ${m.name}.`);
      game.album = null; game.setArtistSongs(songs); game.artist = m.name;
      ctx.newRound(); sh.close();
    }
  });
}

/** One-album mode: well-known albums from the pool first, any album on Apple Music by search. */
export function openAlbums(ctx) {
  const { pool, game } = ctx;
  const { sh, list, input, clear } = pickerSheet(ctx, 'Albums', 'Search any album');
  const suggested = suggestedAlbums(pool.songs);
  let matches = [], searching = false, loadingAny = false, loading = null, lastError = null, timer = 0, seq = 0;
  const isOn = (name, artist) => !!game.album && normalise(game.album.name) === normalise(name) && normalise(game.album.artist) === normalise(artist);
  const draw = () => {
    const typed = input.value.trim(); clear.hidden = !input.value;
    let h = '';
    if (!typed) {
      h += row('All albums', null, 'data-all="1"', !game.album);
      if (game.album) h += `<div class="prow2 on"><span class="nm">${esc(albumDisplayName(game.album.name))}</span><span class="ct">${game.artistSongs.length} songs</span>${CHECK}</div>`;
      h += prompt('Type an album or an artist. Anything on Apple Music.');
      h += heading('SUGGESTED') + suggested.map(a => artRow({ attrs: `data-local="${esc(a.id)}"`, name: albumDisplayName(a.name), img: localArt(a, 120), line: [a.artist, a.year].filter(x => x != null).join(' · '), icon: ARROW_DOWN, placeholder: SF.opticaldisc, on: isOn(a.name, a.artist), busy: loading === a.id })).join('');
    }
    if (matches.length) h += heading('ON APPLE MUSIC') + matches.map(m => {
      const short = tooShort(m);
      const line = short ? `${m.artist} · only ${m.trackCount} song${m.trackCount === 1 ? '' : 's'}` : [m.artist, m.year, `${m.trackCount} songs`].filter(x => x != null).join(' · ');
      return artRow({ attrs: `data-match="${esc(m.id)}"`, name: albumDisplayName(m.name), img: albumArt(m, 120), line, icon: ARROW_DOWN, placeholder: SF.opticaldisc, on: game.album?.id === String(m.id), busy: loading === String(m.id), disabled: short });
    }).join('');
    if (searching && !matches.length) h += waiting('Searching Apple Music…');
    else if (typed && !matches.length && !searching) h += empty(lastError ?? 'No album by that name.');
    if (loadingAny) h += waiting('Loading the album…');
    list.innerHTML = h;
  };
  const search = () => {
    clearTimeout(timer); const term = input.value.trim(), my = ++seq;
    if (term.length < 2) { matches = []; searching = false; lastError = null; return draw(); }
    searching = true; draw();
    timer = setTimeout(async () => {
      const found = await albumsMatching(term);
      if (my !== seq) return;
      matches = found || []; searching = false; lastError = found == null ? "Can't reach Apple Music. Check your connection." : null;
      draw();
    }, 280);
  };
  draw();
  input.addEventListener('input', search);
  /** Too few playable tracks and nothing changes: a toast says why. */
  const apply = (songs, error, album) => {
    if (songs.length < MIN_TRACKS) {
      const name = albumDisplayName(album.name);
      return toast(error ?? (songs.length ? `Only ${songs.length} playable songs on ${name}. Try another album.` : `No playable songs found on ${name}.`));
    }
    game.artist = null;                // an album and an artist never stand together
    game.setArtistSongs(songs); game.album = album;
    ctx.newRound(); sh.close();
  };
  const load = async (key, fetcher, album) => {
    if (loading) return;
    loading = key; loadingAny = true; draw();
    const { songs, error } = await fetcher();
    loading = null; loadingAny = false; draw();
    apply(songs, error, album);
  };
  sh.body.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'close') { ctx.sound.click(); return sh.close(); }
    if (b.dataset.act === 'clear') { input.value = ''; seq++; clearTimeout(timer); matches = []; searching = false; lastError = null; return draw(); }
    if (b.dataset.all) { if (game.album) { game.album = null; game.setArtistSongs([]); ctx.newRound(); } return sh.close(); }
    if (b.dataset.local) {
      const a = suggested.find(x => x.id === b.dataset.local); if (!a) return;
      return load(a.id, () => songsForLocal(a, pool.songs), { id: a.collectionID ?? a.id, name: a.name, artist: a.artist });
    }
    if (b.dataset.match) {
      const m = matches.find(x => String(x.id) === b.dataset.match); if (!m || tooShort(m)) return;
      return load(String(m.id), () => songsForMatch(m, pool.songs), { id: String(m.id), name: m.name, artist: m.artist });
    }
  });
  // `?albumQuery=<text>` (localhost): mid-search, for screenshots.
  const q = new URLSearchParams(location.search).get('albumQuery');
  if (q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { input.value = q; search(); }
}

// [tabs] Drawer.swift FAQ, verbatim. Web differences: "Do I need Apple Music?" stops at the preview (no full
// tracks on the web); the keyboard item (desktop) and "Is there an app?" are web only.
const FAQ = [
  ['How do I play?', 'You hear a fraction of a second of a song. Name it, or skip for more: 0.1s, 0.5s, 2s, 8s, then 15s.'],
  ['Where do the songs come from?', 'A curated pool of well-known tracks, tiered by how recognisable they are, played from Apple Music.'],
  ['What do the difficulties mean?', 'Easy is the biggest hits and Impossible the deepest cuts still worth knowing. Every finished round moves you up one, and Impossible wraps back to Easy.'],
  ['Out of guesses?', 'Once a round, free play can watch a short ad to hear five more seconds of the same song and guess again. Premium gets one more skip after 15 seconds, to 20.'],
  ['What are the eras?', 'Five decades from the 80s to the 2020s, or Any era. Tap the reel to spin for one.'],
  ['Can I play one artist or one album?', 'Yes, with Premium. Pick an artist or an album in the menu and difficulty becomes how deep into their songs the round goes instead.'],
  ['Do I need Apple Music?', 'No. Everyone hears the Apple Music preview of each song.'],
  ['Why did a skip keep playing?', "Skipping never cuts the audio — the clip keeps sounding and runs on to the new stage's length."],
  ['Does it remember me?', 'Your options are kept on this device. Your account, stats and scores are stored with Songspot so they follow you to a new phone. See songspotapp.com/privacy.'],
  ...(matchMedia('(pointer: fine)').matches ? [['Keyboard?', 'Space plays the clip, / jumps to the guess field, the arrows walk the suggestions, Enter guesses and Enter again moves on.']] : []),
  ['Is there an app?', 'Yes — Songspot is on the App Store, with the same game, the daily song, ranked and parties. Your account works in both.'],
];
export function openFAQ(ctx) {
  const accent = TIER_COLOR[ctx.game.difficulty];
  const sh = openSheet(`<div class="fhead"><h2>How to play</h2><button class="done" data-press>Done</button></div><div class="fline"></div>
    <div class="flist card">${FAQ.map(([q, a]) => `<div class="qa"><b>${esc(q)}</b><p>${esc(a)}</p></div>`).join('')}</div>`, { cls: 'faq tall', label: 'How to play' });
  sh.node.style.setProperty('--accent', accent);
  sh.body.querySelector('.done').addEventListener('click', () => { ctx.sound.click(); sh.close(); });
}
