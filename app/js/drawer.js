// The menu: Drawer.swift. A panel from the left over a dimmed stage — the
// profile card, Go Premium, the three ways to play, the difficulty ladder,
// artist and genre, the spotlight, the settings, and a quiet footer that
// holds the only link out of the game: Get the app.
import { TIERS } from './pool.js';
import { el, face, TIER_COLOR, TIER_INK, cap, esc, settings, LINKS } from './ui.js';
import { I } from './icons.js';
import { Level } from './account.js';
import { Haptics } from './haptics.js';

let dailyMod = null;
import('./daily.js').then(m => { dailyMod = m; }).catch(() => {});

export async function openDrawer(ctx) {
  if (document.querySelector('.drawer-wrap')) return;
  if (!dailyMod) { try { dailyMod = await import('./daily.js'); } catch (e) {} }
  const { game, pool, account, sound } = ctx;
  const wrap = el(`<div class="drawer-wrap"><div class="scrim"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Menu"></aside></div>`);
  const d = wrap.querySelector('.drawer');
  const S = (k, def) => settings.get(k, def);
  const canVibrate = 'vibrate' in navigator;

  const render = () => {
    const accent = TIER_COLOR[game.difficulty], ink = TIER_INK[game.difficulty];
    wrap.style.setProperty('--accent', accent); wrap.style.setProperty('--accent-ink', ink);
    const st = account.stats, level = Level.at(st.roundsWon);
    const counts = game.artistSongs.length ? Object.fromEntries(TIERS.map(t => [t, 1])) : pool.counts(game.era, game.category, game.artist);
    const D = dailyMod?.Daily;
    const playedToday = D ? !!D.todayRecord() : false;
    const avatar = account.avatar ? face(account.name, account.avatar, accent, 46) : account.initial ? `<span class="face" style="width:46px;height:46px;background:${accent};color:#08120c;font-size:18px">${esc(account.initial)}</span>` : '';
    const top = ['all', ...pool.categoryCounts.slice(0, 8).map(c => c.name)];
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
      ${prow('daily', 'Daily challenge', playedToday ? 'Played today' : 'One song a day, one go', I.calendar, TIER_COLOR.easy, !playedToday && !!D,
        playedToday ? `<span class="tick">${I.check}</span>` : D ? `<span class="num">#${D.displayNumber()}</span>` : `<span class="chev">${I.chevron}</span>`)}
      ${prow('party', 'Play with friends', 'Up to 50 players', I.people, TIER_COLOR.impossible, false, `<span class="chev">${I.chevron}</span>`)}
      ${prow('ranked', 'Play ranked', ctx.premium ? 'Climb the ladder' : 'Premium · climb the ladder', I.trophy, TIER_COLOR.medium, false, ctx.premium ? `<span class="chev">${I.chevron}</span>` : `<span class="tick">${I.lock}</span>`)}
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
      <div class="seg">${[['off', 'Off'], ['simple', 'On']].map(([v, t]) => `<button data-spot="${v}" class="${S('spotlight', 'off') === v ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="rule"></div>
      <p class="dlabel">Settings</p>
      <div class="group card">
        ${tline('easySearch', 'Easy search', I.search, true)}
        ${tline('glow', 'Accent glow', I.sparkles, false)}
        ${tline('artwork', 'Reveal artwork', I.photo, true)}
        ${tline('motion', 'Animations', I.wand, true)}
        ${canVibrate ? tline('haptics', 'Haptics', I.haptics, true) : ''}
        ${tline('sounds', 'Sounds', I.sound, true)}
        <div class="vol">${I.sound}<input type="range" min="0" max="1" step="0.02" value="${S('volume', 0.28)}" aria-label="Volume" data-vol></div>
        ${tline('hint', 'Hint', I.bulb, false)}
      </div>
      <div class="dfoot">
        <button data-act="faq">How to play</button>
        ${ctx.premium ? '' : `<button data-act="restore">Restore purchases</button>`}
        <a class="getapp" href="${LINKS.get}" target="_blank" rel="noopener">${I.apple}Get the app</a>
        <a href="/privacy">Privacy</a><a href="/support">Support</a>
      </div>`;
  };
  function prow(act, title, sub, icon, tint, lit, trailing) {
    const bg = lit ? `background:color-mix(in srgb, ${tint} 12%, transparent);border-color:color-mix(in srgb, ${tint} 40%, transparent)` : '';
    const tile = lit ? `background:${tint};color:#04160b` : `background:color-mix(in srgb, ${tint} 16%, transparent);color:${tint}`;
    return `<button class="prow card" style="${bg}" data-press data-act="${act}"><span class="tile" style="${tile}">${icon}</span><span class="txt"><b>${title}</b><span>${sub}</span></span>${trailing}</button>`;
  }
  const tline = (k, t, icon, def) => `<div class="tline ${S(k, def) ? 'on' : ''}" role="switch" tabindex="0" aria-checked="${S(k, def)}" data-toggle="${k}" data-def="${def}">${icon}<span>${t}</span><i class="sw"></i></div>`;

  render();
  document.body.appendChild(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('in')));
  const off = account.onChange(() => render());
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  let closing = false;
  const close = then => { if (closing) return; closing = true; off(); document.removeEventListener('keydown', onKey); wrap.classList.remove('in'); setTimeout(() => { wrap.remove(); then && then(); }, 260); };
  wrap.querySelector('.scrim').addEventListener('click', () => close());

  d.addEventListener('click', e => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) { const k = tg.dataset.toggle, v = !S(k, tg.dataset.def === 'true'); settings.set(k, v); Haptics.select(); sound.enabled = S('sounds', true); tg.classList.toggle('on', v); tg.setAttribute('aria-checked', v); ctx.refresh(); if (k === 'sounds' && v) sound.click(); return; }
    const b = e.target.closest('button, a, [data-act]'); if (!b) return;
    if (b.dataset.tier) { sound.click(); Haptics.select(); ctx.setTier(b.dataset.tier); return render(); }
    if (b.dataset.cat) { sound.click(); Haptics.select(); game.category = b.dataset.cat; ctx.newRound(); return render(); }
    if (b.dataset.spot) { sound.click(); Haptics.select(); settings.set('spotlight', b.dataset.spot); ctx.refresh(); return render(); }
    const act = b.dataset.act; if (!act) return;
    if (b.tagName !== 'A') e.preventDefault();
    sound.click();
    if (act === 'close') close();
    else if (act === 'profile') { close(); ctx.openProfile(); }
    else if (act === 'premium') ctx.openPremium(null);
    else if (act === 'daily') { close(); ctx.openDaily(); }
    else if (act === 'party') { close(); ctx.openParty(); }
    else if (act === 'ranked') ctx.premium ? (close(), ctx.openRanked()) : ctx.openPremium('ranked');
    else if (act === 'reroll') { ctx.toast('New song.'); ctx.newRound(); }
    else if (act === 'anyera') { game.era = 'all'; ctx.newRound(); render(); }
    else if (act === 'noartist') { e.stopPropagation(); game.artist = null; game.setArtistSongs([]); ctx.newRound(); render(); }
    else if (act === 'artist') { close(); ctx.openArtists(); }
    else if (act === 'lockedartist') ctx.openPremium('artist');
    else if (act === 'genres') { close(); ctx.openGenres(); }
    else if (act === 'faq') ctx.openFAQ();
    else if (act === 'restore') restore();
  });
  d.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.toggle) { e.preventDefault(); e.target.click(); } });
  d.addEventListener('input', e => { if (e.target.dataset.vol !== undefined) { settings.set('volume', +e.target.value); ctx.player.setVolume(+e.target.value); } });
  async function restore() {
    if (!account.signedIn) { ctx.toast('Sign in with the account you bought premium on.'); return close(() => ctx.signIn()); }
    const has = await account.refreshPremium();
    ctx.toast(has ? 'Premium restored.' : 'No premium was found for this account.');
    ctx.refresh(); render();
  }
  return { close };
}
