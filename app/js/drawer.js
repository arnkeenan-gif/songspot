// The menu: Drawer.swift. A panel from the left over a dimmed stage — the
// profile card, Go Premium, the three ways to play, the difficulty ladder,
// artist and genre, the spotlight, the settings, and a quiet footer that
// holds the only link out of the game: Get the app.
import { TIERS } from './pool.js';
import { el, face, TIER_COLOR, TIER_INK, cap, esc, settings, LINKS, LevelTheme } from './ui.js';
import { I } from './icons.js';
import { Level, Streak } from './account.js';
import { Haptics } from './haptics.js';
import { Friends } from './friends.js';
import { Ladder } from './ladder.js';

// person.2.fill, for Friends (Play with friends keeps person.3.fill), drawn like icons.js.
const TWO = '<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="7.4" r="3.8"/><path d="M1.6 19.8a7.4 7.4 0 0 1 14.8 0z"/><circle cx="17" cy="8.3" r="3.1"/><path d="M18.3 19.8h4.3a5.7 5.7 0 0 0-8.3-5.1 9.3 9.3 0 0 1 4 5.1z"/></svg>';
// SF's calendar, for the daily's tile: a thick top band and a grid of days, as the app draws it.
const CAL = '<svg class="i" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M6.5 3.3h11a4 4 0 0 1 4 4v9.4a4 4 0 0 1-4 4h-11a4 4 0 0 1-4-4V7.3a4 4 0 0 1 4-4zM6.1 8.4a1.2 1.2 0 0 0-1.2 1.2v7.4a1.2 1.2 0 0 0 1.2 1.2h11.8a1.2 1.2 0 0 0 1.2-1.2V9.6a1.2 1.2 0 0 0-1.2-1.2z"/>'
  + [[10.5, 10.5], [13.5, 10.5], [16.4, 10.5], [7.6, 13.4], [10.5, 13.4], [13.5, 13.4], [16.4, 13.4], [7.6, 16.2], [10.5, 16.2], [13.5, 16.2]]
    .map(([x, y]) => `<rect x="${(x - .8).toFixed(1)}" y="${(y - .8).toFixed(1)}" width="1.6" height="1.6" rx=".35"/>`).join('') + '</svg>';
// SF's flame.fill, with its inner flame cut out, on a box that is the flame's own height (so 1em is the flame).
const FLAME = '<svg class="i" viewBox="5.5 2 13 17" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M12.6 2.3c.4 3.2 4.9 5.6 4.9 10.6a5.5 5.5 0 0 1-11 0c0-2.4 1.2-4 2.6-5.3.3 1.5 1 2.6 2 3.1-.3-3.4.5-6 1.5-8.4zM12 17.3a2.3 2.3 0 0 1-2.3-2.3c0-1.5 1.2-2.4 2.3-4.1 1.1 1.7 2.3 2.6 2.3 4.1a2.3 2.3 0 0 1-2.3 2.3z"/></svg>';

let dailyMod = null;
import('./daily.js').then(m => { dailyMod = m; }).catch(() => {});

export async function openDrawer(ctx) {
  if (document.querySelector('.drawer-wrap')) return;
  if (!dailyMod) { try { dailyMod = await import('./daily.js'); } catch (e) {} }
  const { game, pool, account, sound } = ctx;
  const wrap = el(`<div class="drawer-wrap"><div class="scrim"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Menu"></aside></div>`);
  const d = wrap.querySelector('.drawer');
  const S = (k, def) => settings.get(k, def);
  let restoring = false;
  // Ranked is premium, with one free match for a new player (Drawer.swift).
  const rankedOpen = () => ctx.premium || (account.stats.rankedPlayed || 0) === 0;

  const render = () => {
    const accent = TIER_COLOR[game.difficulty], ink = TIER_INK[game.difficulty];
    wrap.style.setProperty('--accent', accent); wrap.style.setProperty('--accent-ink', ink);
    const st = account.stats, level = Level.at(st.roundsWon);
    const freeMatch = !ctx.premium && (st.rankedPlayed || 0) === 0, rankedOpen = ctx.premium || freeMatch;
    const counts = game.artistSongs.length ? Object.fromEntries(TIERS.map(t => [t, 1])) : pool.counts(game.era, game.category, game.artist);
    const D = dailyMod?.Daily;
    const avatar = account.avatar ? face(account.name, account.avatar, accent, 46) : account.initial ? `<span class="face" style="width:46px;height:46px;background:${accent};color:#08120c;font-size:18px">${esc(account.initial)}</span>` : '';
    const top = ['all', ...pool.categoryCounts.slice(0, 8).map(c => c.name)];
    const online = Friends.onlineCount, requests = Friends.requests.length;
    d.innerHTML = `
      <div class="brand"><span class="wordmark">songspot</span><button class="xbtn" data-press data-act="close" aria-label="Close menu">${I.x}</button></div>
      <button class="hero card" data-press data-act="profile">
        <div class="top"><span class="av ${avatar ? '' : 'anon'}">${avatar || I.person}</span>
          <span class="who"><b>${account.name ? esc(account.name) : 'Your profile'}</b><span>${esc(level.title)}</span></span>
          ${st.streak > 1 ? `<span class="streak">${I.flame}${st.streak}</span>` : ''}<span class="chev">${I.chevron}</span></div>
        <div class="bar"><span class="lv"><i style="width:${(level.frac * 100).toFixed(1)}%"></i></span><small>${level.next ? `${level.next.at - st.roundsWon} to ${esc(level.next.title)}` : 'Top of the ladder'}</small></div>
      </button>
      ${ctx.premium ? '<div style="height:14px"></div>' : `<button class="gopro" data-press data-act="premium">${I.crown}<span>Go Premium</span></button>`}
      <p class="dlabel">Play</p>
      ${dailyCard(D, st)}
      ${(() => {
        // The other three as one grouped list. On the right, where you stand, only while it fits:
        // a row that runs out of room drops to shorter words, then to its chevron (fitPlay).
        const chev = `<span class="chev">${I.chevron}</span>`, n = v => `<b class="mono">${v}</b>`;
        // Your rank as words with a dot in its colour; before a first match there is none to show.
        const place = Ladder.place(st.rp), tier = place.tier.name;
        const rank = (st.rankedPlayed || 0) > 0 ? `<span class="pl-stat"><i class="pl-dot" style="background:${place.tier.color}"></i><span class="pl-wide">${esc(place.name)}</span><span class="pl-narrow">${esc(tier)}</span></span>` : '';
        const lock = `<span class="pl-lock" aria-label="Premium">${I.lock}</span>`;
        // Requests are counted in the line and on a badge; else who's online sits on the right (in the line when narrow).
        const friendsSub = requests ? `${n(requests)} friend request${requests > 1 ? 's' : ''}`
          : online > 0 ? ['Challenge a 1v1', `${n(online)} online`] : 'Challenge a friend';
        const friendsEnd = requests ? `<span class="pl-badge mono">${requests}</span>`
          : online > 0 ? `<span class="pl-stat pl-wide"><i class="pl-dot" style="background:${TIER_COLOR.easy}"></i>${n(online)} online</span>${chev}` : chev;
        return `<div class="pgroup card" data-fit-group>`
          + prow('party', 'Play with friends', `Up to ${n(50)} players`, I.people, TIER_COLOR.impossible, chev)
          + prow('ranked', 'Play ranked', ctx.premium || freeMatch ? 'Climb the ladder' : 'Part of Premium', I.trophy, TIER_COLOR.medium, rank + (rankedOpen ? chev : lock))
          + prow('friends', 'Friends', friendsSub, TWO, TIER_COLOR.hard, friendsEnd)
          + `</div>`;
      })()}
      <div class="rule"></div>
      <div class="dhead"><p class="dlabel">Difficulty</p><button data-press data-act="reroll">${I.reroll}Reroll</button></div>
      <div class="ladder">${TIERS.map(t => `<button class="rung card ${t === game.difficulty ? 'on' : ''} ${counts[t] === 0 ? 'dead' : ''}" style="--t:${TIER_COLOR[t]}" data-tier="${t}">${cap(t)}${t === game.difficulty ? I.check : ''}</button>`).join('')}</div>
      ${game.era !== 'all' && !game.artist ? `<button class="action" data-act="anyera">${I.arrows}Any era</button>` : ''}
      <div class="rule"></div>
      <p class="dlabel">Artist</p>
      ${ctx.premium ? `<button class="pick card ${game.artist ? 'on' : ''}" data-press data-act="artist">${I.mic}<span class="v">${esc(game.artist || 'All artists')}</span>${game.artist ? `<span class="clear" data-act="noartist" role="button" aria-label="Clear artist">${I.x}</span>` : ''}<span class="chev">${I.chevron}</span></button>
        <p class="dnote">${game.artist ? `${game.artistSongs.length || pool.filter(null, 'all', 'all', game.artist).length} songs loaded. Difficulty is catalogue depth: Easy is their best known.` : "Play only one artist's songs. Anyone at all, small and local bands included."}</p>`
      : `<button class="pick card locked" data-press data-act="lockedartist"><span style="font-size:11px;display:inline-flex">${I.lock}</span><span class="v">Pick one artist</span><span class="pbadge">PREMIUM</span></button>
        <p class="dnote">Play only one artist's songs — anyone at all, small and local bands included. Part of premium.</p>`}
      <div class="rule"></div>
      <p class="dlabel">Genre</p>
      <button class="pick card ${game.category !== 'all' ? 'on' : ''}" data-press data-act="genres">${I.genres}<span class="v">${game.category === 'all' ? 'All genres' : esc(game.category)}</span><span class="n">${pool.categoryCounts.length}</span><span class="chev">${I.chevron}</span></button>
      <div class="chips">${top.map(c => `<button class="${c === game.category ? 'on' : ''}" data-cat="${esc(c)}" title="${esc(c)}">${c === 'all' ? 'All' : esc(c)}</button>`).join('')}</div>
      <div class="rule"></div>
      <p class="dlabel">Spotlight</p>
      <div class="seg">${[['off', 'Off'], ['simple', 'On']].map(([v, t]) => `<button data-spot="${v}" class="${S('spotlight', 'simple') === v ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="rule"></div>
      <p class="dlabel">Settings</p>
      <div class="group card">
        ${tline('easySearch', 'Easy search', I.search, true)}
        ${tline('glow', 'Accent glow', I.sparkles, false)}
        ${tline('artwork', 'Reveal artwork', I.photo, true)}
        ${tline('motion', 'Animations', I.wand, true)}
        ${tline('haptics', 'Haptics', I.haptics, true)}
        ${tline('levelColours', 'Level colours', I.palette, true)}
        ${tline('sounds', 'Sounds', I.sound, true)}
        <div class="vol">${I.sound}<input type="range" min="0" max="1" step="0.02" value="${S('volume', 0.28)}" aria-label="Volume" data-vol></div>
        ${tline('hint', 'Hint', I.bulb, false)}
      </div>
      <div class="dfoot">
        <button data-act="faq">How to play</button>
        ${!ctx.premium && window.googlefc && typeof window.googlefc.showRevocationMessage === 'function' ? `<button data-act="privacy">Privacy choices</button>` : ''}
        ${ctx.premium ? '' : `<button data-act="restore" ${restoring ? 'disabled' : ''}>${restoring ? 'Restoring…' : 'Restore purchases'}</button>`}
        <a class="getapp" href="${LINKS.get}" target="_blank" rel="noopener">${I.apple}Get the app</a>
        <a href="/privacy">Privacy</a><a href="/support">Support</a>
      </div>`;
    fitPlay();
  };
  // Today's song, first and a little larger: the title, one short line and today's state (New, or a plain tick
  // once played, never the time: not here, not in the foot); under a hairline the last seven days as dots,
  // today last, and the streak.
  function dailyCard(D, st) {
    const today = D ? D.todayRecord() : null, day = D ? D.number() : 0, streak = Streak.live(st);
    const state = today ? `<span class="pf-tick ${today.won ? 'won' : ''}" role="img" aria-label="Played today">${I.check}</span>`
      : D ? '<span class="pf-new">New</span>' : `<span class="chev">${I.chevron}</span>`;
    const sub = today ? (today.won ? 'Named today' : 'Missed today') : 'One song, one go';
    let foot = '';
    if (D) {
      // A dot is lit for a day inside the live streak; today is an open ring until played, grey if missed.
      const end = today ? day : day - 1;
      const dots = Array.from({ length: 7 }, (_, k) => {
        const on = day - 6 + k;
        if (k === 6 && !today) return '<i class="due"></i>';
        if (k === 6 && !today.won) return '<i class="miss"></i>';
        return `<i class="${streak > 0 && on <= end && on > end - streak ? 'on' : ''}"></i>`;
      }).join('');
      // Played and missed: no streak to show, and no countdown either, just when the next one comes.
      const note = streak > 0 ? `<span class="pf-note lit">${FLAME}<span class="pf-long"><b class="mono">${streak}</b>-day streak</span><span class="pf-short"><b class="mono">${streak}</b> days</span></span>`
        : today ? `<span class="pf-note"><span class="pf-long">New song tomorrow</span><span class="pf-short">Tomorrow</span></span>`
        : `<span class="pf-note">${FLAME}<span class="pf-long">Start a streak</span><span class="pf-short">Start one</span></span>`;
      foot = `<span class="pf-foot" data-fit="2"><span class="pf-week" aria-hidden="true">${dots}</span>${note}</span>`;
    }
    return `<button class="pfeat card ${D && !today ? 'due' : ''}" data-press data-act="daily">
      <span class="pf-top" data-fit="2"><span class="pf-tile ${today && !today.won ? 'miss' : ''}"><span class="pf-cal">${CAL}</span>${today ? `<span class="pf-done">${I.check}</span>` : ''}</span><span class="pf-txt"><b class="pf-title">Daily challenge</b><span class="pf-sub">${sub}</span></span>${state}</span>${foot}</button>`;
  }
  // A row of the grouped list: a tile in a quiet tint of its colour, the title and one line, and the end.
  // `sub` can be [wide, narrow]: the second line takes over when the row steps down (a status moves into it).
  function prow(act, title, sub, icon, tint, end) {
    const line = Array.isArray(sub) ? `<span class="pl-sub pl-wide">${sub[0]}</span><span class="pl-sub pl-narrow">${sub[1]}</span>` : `<span class="pl-sub">${sub}</span>`;
    return `<button class="pli" style="--tint:${tint}" data-press data-act="${act}" data-fit="2"><span class="pl-tile">${icon}</span><span class="pl-txt"><b class="pl-title">${title}</b>${line}</span><span class="pl-end">${end}</span></button>`;
  }
  // Nothing in the Play section is ever cut. Where a line needs more room than the drawer has, its box steps
  // down (.f1, then .f2: shorter words, then the status goes; on the card a smaller New, then no New). If the
  // card's top line or a list row doesn't fit even so, the card and the list take smaller tiles together
  // (.snug, then .tight), so tiles and titles keep one line down the section. Measured, so it holds for any
  // width, font and state.
  const TEXT = '.pf-title, .pf-sub, .pf-note, .pl-title, .pl-sub';
  // The text's own width against its box, to the subpixel: scrollWidth rounds, and a line 0.3px too long still gets an ellipsis.
  const range = document.createRange();
  const over = t => { if (t.offsetParent === null) return false; range.selectNodeContents(t); return range.getBoundingClientRect().width > t.getBoundingClientRect().width + 0.01; };
  const cut = box => [...box.querySelectorAll(TEXT)].some(over);
  const fitBoxes = boxes => boxes.forEach(box => {
    const max = +box.dataset.fit;
    for (let l = 1; l <= max; l++) box.classList.remove('f' + l);
    for (let l = 1; l <= max && cut(box); l++) box.classList.add('f' + l);
  });
  const fitPlay = () => {
    if (!wrap.isConnected) return;
    const card = d.querySelector('.pfeat'), g = d.querySelector('[data-fit-group]');
    const parts = [card, g].filter(Boolean), boxes = parts.flatMap(p => [...p.querySelectorAll('[data-fit]')]);
    const top = card?.querySelector('.pf-top'), rows = g ? [...g.querySelectorAll('[data-fit]')] : [];
    const SIZES = ['snug', 'tight'];
    parts.forEach(p => p.classList.remove(...SIZES)); fitBoxes(boxes);
    // The card steps as soon as its top line is short of room; the list only once its words are as short as they go.
    for (const size of SIZES) {
      if (!top?.classList.contains('f1') && !rows.some(cut)) break;
      parts.forEach(p => { p.classList.remove(...SIZES); p.classList.add(size); }); fitBoxes(boxes);
    }
  };
  const tline = (k, t, icon, def) => `<div class="tline ${S(k, def) ? 'on' : ''}" role="switch" tabindex="0" aria-checked="${S(k, def)}" data-toggle="${k}" data-def="${def}">${icon}<span>${t}</span><i class="sw"></i></div>`;

  render();
  document.body.appendChild(wrap);
  fitPlay(); if (document.fonts) document.fonts.ready.then(fitPlay);
  let fitting = 0; const onResize = () => { cancelAnimationFrame(fitting); fitting = requestAnimationFrame(fitPlay); };
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('in')));
  const offAccount = account.onChange(() => render());
  // Who's online, for the Friends row (it redraws when the list comes back).
  const offFriends = Friends.onChange(() => render());
  const off = () => { offAccount(); offFriends(); window.removeEventListener('resize', onResize); };
  if (account.signedIn) Friends.refresh();
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  let closing = false;
  const close = then => { if (closing) return; closing = true; off(); document.removeEventListener('keydown', onKey); wrap.classList.remove('in'); setTimeout(() => { wrap.remove(); then && then(); }, 260); };
  wrap.querySelector('.scrim').addEventListener('click', () => close());

  d.addEventListener('click', e => {
    const tg = e.target.closest('[data-toggle]');
    // Toggles: the select tick first, with the setting as it was (Haptics.select(settings.haptics); tap()).
    if (tg) { const k = tg.dataset.toggle, v = !S(k, tg.dataset.def === 'true'); Haptics.select(); if (k === 'levelColours') LevelTheme.enabled = v; else settings.set(k, v); sound.enabled = S('sounds', true); tg.classList.toggle('on', v); tg.setAttribute('aria-checked', v); ctx.refresh(); if (k === 'sounds' && v) sound.click(); return; }
    const b = e.target.closest('button, a, [data-act]'); if (!b) return;
    // The drawer makes no sounds in the app; only the switches, the segment and the era action tick.
    if (b.dataset.tier) { if (b.classList.contains('dead')) return; ctx.setTier(b.dataset.tier); return render(); }
    if (b.dataset.cat) { game.category = b.dataset.cat; ctx.newRound(); return render(); }
    if (b.dataset.spot) { if (S('spotlight', 'simple') !== b.dataset.spot) Haptics.select(); settings.set('spotlight', b.dataset.spot); ctx.refresh(); return render(); }
    const act = b.dataset.act; if (!act) return;
    if (b.tagName !== 'A') e.preventDefault();
    if (act === 'close') close();
    else if (act === 'profile') { close(); ctx.openProfile(); }
    // Anything that opens a sheet closes the drawer first: sheets live under it.
    else if (act === 'premium') close(() => ctx.openPremium(null));
    else if (act === 'daily') { close(); ctx.openDaily(); }
    else if (act === 'party') { close(); ctx.openParty(); }
    else if (act === 'ranked') rankedOpen() ? (close(), ctx.openRanked()) : close(() => ctx.openPremium('ranked'));
    else if (act === 'reroll') { ctx.toast('New song.'); ctx.newRound(); }
    else if (act === 'anyera') { Haptics.select(); game.era = 'all'; ctx.newRound(); render(); }
    else if (act === 'friends') { close(); ctx.openFriends(); }
    else if (act === 'privacy') { try { window.googlefc.showRevocationMessage(); } catch (err) {} }
    else if (act === 'noartist') { e.stopPropagation(); game.artist = null; game.setArtistSongs([]); ctx.newRound(); render(); }
    else if (act === 'artist') { close(); ctx.openArtists(); }
    else if (act === 'lockedartist') close(() => ctx.openPremium('artist'));
    else if (act === 'genres') { close(); ctx.openGenres(); }
    else if (act === 'faq') close(() => ctx.openFAQ());
    else if (act === 'restore') restore();
  });
  d.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.toggle) { e.preventDefault(); e.target.click(); } });
  d.addEventListener('input', e => { if (e.target.dataset.vol !== undefined) { settings.set('volume', +e.target.value); ctx.player.setVolume(+e.target.value); } });
  async function restore() {
    if (restoring) return;
    if (!account.signedIn) { ctx.toast('Sign in with the account you bought premium on.'); return close(() => ctx.signIn()); }
    restoring = true; render();
    let has = false;
    try { has = await account.refreshPremium(); } catch (err) {}
    restoring = false;
    ctx.toast(has ? 'Premium restored.' : 'No premium was found for this account.');
    ctx.refresh(); render();
  }
  return { close };
}
