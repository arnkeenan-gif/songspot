// The sheets the menu opens: Genres (CategoryPicker.swift), Artists
// (ArtistPicker.swift) and How to play (the FAQ in Drawer.swift).
import { openSheet, esc, art, TIER_COLOR, toast } from './ui.js';
import { I } from './icons.js';
import { Haptics } from './haptics.js';

const head = title => `<div class="phead"><h2>${title}</h2><button class="xbtn" data-press data-act="close" aria-label="Close">${I.x}</button></div>`;
const searchBox = ph => `<label class="psearch">${I.search}<input type="text" placeholder="${ph}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><button class="pclear" data-act="clear" hidden aria-label="Clear">${I.x}</button></label>`;

export function openGenres(ctx) {
  const { pool, game, sound } = ctx;
  const accent = TIER_COLOR[game.difficulty];
  const sh = openSheet(`${head('Genres')}${searchBox('Search genres')}<div class="plist"></div>`, { cls: 'picker tall', label: 'Genres' });
  sh.node.style.setProperty('--accent', accent);
  const list = sh.body.querySelector('.plist'), input = sh.body.querySelector('input'), clear = sh.body.querySelector('.pclear');
  const row = (name, count, key) => { const on = key === game.category; return `<button class="prow2 ${on ? 'on' : ''}" data-press data-key="${esc(key)}"><span class="nm">${esc(name)}</span>${count != null ? `<span class="ct">${count}</span>` : ''}${on ? `<span class="ck">${I.check}</span>` : ''}</button>`; };
  const draw = () => {
    const t = input.value.trim().toLowerCase(); clear.hidden = !t;
    const hits = t ? pool.categoryCounts.filter(c => c.name.toLowerCase().includes(t)) : pool.categoryCounts;
    list.innerHTML = (t ? '' : row('All genres', null, 'all')) + hits.map(c => row(c.name, c.count, c.name)).join('') + (hits.length ? '' : '<p class="pempty">Nothing by that name.</p>');
  };
  draw();
  input.addEventListener('input', draw);
  sh.body.addEventListener('click', e => {
    const b = e.target.closest('[data-key], [data-act]'); if (!b) return;
    sound.click();
    if (b.dataset.act === 'close') return sh.close();
    if (b.dataset.act === 'clear') { input.value = ''; draw(); input.focus(); return; }
    Haptics.select();
    game.category = b.dataset.key; if (game.artist) { game.artist = null; game.setArtistSongs([]); }
    ctx.newRound(); sh.close();
  });
}

/** Artist mode: anyone in the pool plays instantly; anyone else on Apple Music loads their catalogue. */
export function openArtists(ctx) {
  const { pool, game, sound } = ctx;
  const accent = TIER_COLOR[game.difficulty];
  const sh = openSheet(`${head('Artists')}${searchBox('Search any artist')}<div class="plist"></div>`, { cls: 'picker tall', label: 'Artists' });
  sh.node.style.setProperty('--accent', accent);
  const list = sh.body.querySelector('.plist'), input = sh.body.querySelector('input'), clear = sh.body.querySelector('.pclear');
  const local = new Map(); for (const s of pool.songs) { const a = local.get(s.artist) || { name: s.artist, count: 0, art: null, genre: s.category }; a.count++; if (!a.art && s.artwork && s.artistRank === 0) a.art = s.artwork; if (!a.art && s.artwork) a.art = s.artwork; local.set(s.artist, a); }
  const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let strangers = [], searching = false, loading = false, timer = 0, seq = 0;
  const heading = t => `<p class="pheading">${t}</p>`;
  const arow = (key, name, img, line, icon, on) => `<button class="arow ${on ? 'on' : ''}" data-press data-${key}="${esc(name)}"><span class="aart">${img ? `<img src="${esc(art(img, 120))}" alt="" loading="lazy">` : I.mic}</span><span class="atxt"><b>${esc(name)}</b><span><i class="aic">${icon}</i>${esc(line)}</span></span>${on ? `<span class="ck">${I.check}</span>` : ''}</button>`;
  const draw = () => {
    const t = input.value.trim(); clear.hidden = !t;
    let h = '';
    if (!t) {
      const on = !game.artist;
      h += `<button class="prow2 ${on ? 'on' : ''}" data-press data-all="1"><span class="nm">All artists</span>${on ? `<span class="ck">${I.check}</span>` : ''}</button>`;
      if (game.artist) h += `<div class="prow2 on"><span class="nm">${esc(game.artist)}</span><span class="ct">${game.artistSongs.length || pool.filter(null, 'all', 'all', game.artist).length} songs</span><span class="ck">${I.check}</span></div>`;
      h += `<p class="pempty" style="margin-top:24px">Type a name. Anyone at all — small and local bands included.</p>`;
    } else {
      const q = norm(t);
      const hits = [...local.values()].filter(a => norm(a.name).includes(q)).sort((a, b) => (norm(b.name).startsWith(q) - norm(a.name).startsWith(q)) || b.count - a.count).slice(0, 12);
      if (hits.length) h += heading('IN THE GAME · PLAYS INSTANTLY') + hits.map(a => arow('local', a.name, a.art, `${a.count} ready · ${a.genre}`, I.bolt, game.artist === a.name)).join('');
      const names = new Set(hits.map(a => a.name.toLowerCase()));
      const st = strangers.filter(m => !names.has(m.name.toLowerCase()) && !local.has(m.name));
      if (st.length) h += heading('EVERYONE ON APPLE MUSIC') + st.map(m => `<button class="arow ${game.artist === m.name ? 'on' : ''}" data-press data-stranger="${esc(m.id)}"><span class="aart">${m.artwork ? `<img src="${esc(art(m.artwork, 120))}" alt="" loading="lazy">` : I.mic}</span><span class="atxt"><b>${esc(m.name)}</b><span><i class="aic">${I.download}</i>${esc(['Full catalogue', m.genre].filter(Boolean).join(' · '))}</span></span></button>`).join('');
      if (searching && !st.length) h += `<p class="pwait"><i class="spin s"></i>Searching Apple Music…</p>`;
      else if (!hits.length && !st.length) h += `<p class="pempty">Nobody by that name.</p>`;
    }
    if (loading) h += `<p class="pwait"><i class="spin s"></i>Loading their songs…</p>`;
    list.innerHTML = h;
  };
  const search = () => {
    clearTimeout(timer); const t = input.value.trim(); const my = ++seq;
    if (t.length < 2) { strangers = []; searching = false; return draw(); }
    searching = true; draw();
    timer = setTimeout(async () => {
      try { const r = await fetch('/api/itunes?term=' + encodeURIComponent(t)); const d = r.ok ? await r.json() : { artists: [] }; if (my === seq) strangers = d.artists || []; }
      catch (e) { if (my === seq) strangers = []; }
      if (my === seq) { searching = false; draw(); }
    }, 260);
  };
  draw(); setTimeout(() => input.focus(), 350);
  input.addEventListener('input', search);
  const pick = (name, songs) => {
    game.artist = name; game.era = 'all'; game.category = 'all';
    game.setArtistSongs(songs);
    ctx.newRound(); sh.close();
    toast(`${name}: ${songs.length || pool.filter(null, 'all', 'all', name).length} songs. Easy is their best known.`, 4);
  };
  sh.body.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    sound.click();
    if (b.dataset.act === 'close') return sh.close();
    if (b.dataset.act === 'clear') { input.value = ''; strangers = []; draw(); input.focus(); return; }
    Haptics.select();
    if (b.dataset.all) { if (game.artist) { game.artist = null; game.setArtistSongs([]); ctx.newRound(); } return sh.close(); }
    if (b.dataset.local) return pick(b.dataset.local, []);
    if (b.dataset.stranger) {
      const m = strangers.find(x => String(x.id) === b.dataset.stranger); if (!m || loading) return;
      loading = true; draw();
      try {
        const r = await fetch('/api/itunes?artistId=' + encodeURIComponent(m.id)); const d = r.ok ? await r.json() : { songs: [] };
        const songs = (d.songs || []).filter(s => s.preview);
        loading = false;
        if (songs.length < 3) { draw(); return toast(`Couldn't find enough of ${m.name}'s songs to play.`); }
        pick(m.name, songs);
      } catch (err) { loading = false; draw(); toast("Couldn't reach Apple Music. Try again."); }
    }
  });
}

const FAQ = [
  ['How do I play?', 'You hear a fraction of a second of a song. Name it, or skip for more: 0.1s, 0.5s, 2s, 8s, then 15s.'],
  ['Where do the songs come from?', 'A curated pool of more than 15,000 well-known tracks, tiered by how recognisable they are. On the web you hear Apple Music’s preview of each song.'],
  ['What do the difficulties mean?', 'Easy is the biggest hits and Impossible the deepest cuts still worth knowing. Every finished round moves you up one, and Impossible wraps back to Easy.'],
  ['Out of guesses?', 'Once a round, free play can watch a short ad to hear five more seconds of the same song and guess again. Premium hears 20 seconds on the last stage as standard.'],
  ['What are the eras?', 'The 80s to the 2020s, or Any era. Tap the reel to spin for one, or drag it to pick.'],
  ['Can I play one artist?', 'Yes, with premium. Pick an artist in the menu and difficulty becomes catalogue depth for that artist instead.'],
  ['Why did a skip keep playing?', "Skipping never cuts the audio — the clip keeps sounding and runs on to the new stage's length."],
  ['Keyboard?', 'Space plays the clip, / jumps to the guess field, the arrows walk the suggestions, Enter guesses and Enter again moves on.'],
  ['Is there an app?', 'Yes — Songspot is on the App Store, with the same game, the daily song, ranked and parties. Your account works in both.'],
  ['Does it remember me?', 'Your options are kept in this browser. Sign in and your account, stats and scores are stored with Songspot so they follow you to your phone. See songspotapp.com/privacy.'],
];
export function openFAQ(ctx) {
  const accent = TIER_COLOR[ctx.game.difficulty];
  const sh = openSheet(`<div class="fhead"><h2>How to play</h2><button class="done" data-press>Done</button></div><div class="fline"></div>
    <div class="flist card">${FAQ.map(([q, a]) => `<div class="qa"><b>${esc(q)}</b><p>${esc(a)}</p></div>`).join('')}</div>`, { cls: 'faq tall', label: 'How to play' });
  sh.node.style.setProperty('--accent', accent);
  sh.body.querySelector('.done').addEventListener('click', () => { ctx.sound.click(); sh.close(); });
}
