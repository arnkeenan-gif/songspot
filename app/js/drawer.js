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

// person.2.fill, for Friends (the party row keeps person.3.fill), drawn like icons.js.
const TWO = '<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="7.4" r="3.8"/><path d="M1.6 19.8a7.4 7.4 0 0 1 14.8 0z"/><circle cx="17" cy="8.3" r="3.1"/><path d="M18.3 19.8h4.3a5.7 5.7 0 0 0-8.3-5.1 9.3 9.3 0 0 1 4 5.1z"/></svg>';

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

  // The level title never runs under the streak pill: where it doesn't fit, the card tightens (app.css .hero.tight).
  const fitHero = () => { const h = d.querySelector('.hero'), t = h && h.querySelector('.who span'); if (t && t.scrollWidth > t.clientWidth) h.classList.add('tight'); };
  const render = () => {
    const accent = TIER_COLOR[game.difficulty], ink = TIER_INK[game.difficulty];
    wrap.style.setProperty('--accent', accent); wrap.style.setProperty('--accent-ink', ink);
    const st = account.stats, level = Level.at(st.roundsWon);
    const freeMatch = !ctx.premium && (st.rankedPlayed || 0) === 0;
    const counts = game.artistSongs.length ? Object.fromEntries(TIERS.map(t => [t, 1])) : pool.counts(game.era, game.category, game.artist);
    const D = dailyMod?.Daily;
    const today = D ? D.todayRecord() : null;
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
      <div class="plays card">${(() => {
        // One surface, four rows. Under each title, what the row is for or how today went; on the right,
        // where you stand, in words. In a narrower drawer the right side gives way first (the dots, then the
        // division, then all of it), so no title or line is ever cut.
        const chev = `<span class="pl-chev">${I.chevron}</span>`;
        const streak = Streak.live(st), n = v => `<b class="mono">${v}</b>`;
        // Played: a plain tick, never the time (the owner's rule); the streak is words in the line, not a second flame.
        const daily = today ? `<span class="pl-mark">${I.check}<span class="sr">Played today</span></span>` : D ? '<span class="pl-new">New</span>' : chev;
        const dailySub = today ? (streak > 1 ? [`Played today · ${n(streak)}-day streak`, `${n(streak)}-day streak`, true] : 'Played today')
          : streak > 0 ? (streak < 100 ? [`Keep your ${n(streak)}-day streak`, `${n(streak)}-day streak`] : `${n(streak)}-day streak`) : ['One song a day, one go', 'One song a day'];
        // Your rank in plain words, its colour a dot beside it. No lock with it: the line already says premium.
        // Before your first match there is no rank to show.
        const place = Ladder.place(st.rp), tier = place.tier.name;
        const ranked = (st.rankedPlayed || 0) > 0
          ? `<span class="pl-rank"><i class="pl-dot" style="background:${place.tier.color}"></i><span>${esc(tier)}<span class="pl-div">${esc(place.name.slice(tier.length))}</span></span></span>`
          : chev;
        // Requests are counted once, in the line; who's online sits on the right, or in the line when narrow.
        const friendsSub = requests ? `${n(requests)} new request${requests > 1 ? 's' : ''}`
          : online > 0 ? ['Challenge a 1v1', `${n(online)} online`] : ['Challenge a friend to a 1v1', 'Challenge a 1v1'];
        const friends = online > 0 ? `<span class="pl-online pl-wide"><i class="pl-dot"></i>${n(online)} online</span><span class="pl-narrow">${chev}</span>` : chev;
        return prow('daily', 'Daily challenge', dailySub, I.calendar, TIER_COLOR.easy, daily)
          + prow('party', 'Play with friends', ['Host or join a party', `Up to ${n(50)} players`], I.people, TIER_COLOR.impossible,
            `<span class="pl-cap pl-wide">Up to ${n(50)}</span><span class="pl-narrow">${chev}</span>`)
          + prow('ranked', 'Play ranked', ctx.premium ? 'Climb the ladder' : freeMatch ? 'First match is free' : 'Part of premium', I.trophy, TIER_COLOR.medium, ranked)
          + prow('friends', 'Friends', friendsSub, TWO, TIER_COLOR.hard, friends);
      })()}</div>
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
    if (wrap.isConnected) fitHero();
  };
  // A row of the Play list: a tile in a quiet tint of the row's colour, the title and one line, and a status on the right.
  // `sub` can be [wide, narrow]: the second line for a narrow drawer, where the status on the right shrinks.
  // [long, short, true] keeps the long line for a roomy drawer only (414 phones and desktop).
  function prow(act, title, sub, icon, tint, end) {
    const [a, b] = Array.isArray(sub) && sub[2] ? ['pl-roomy', 'pl-snug'] : ['pl-wide', 'pl-narrow'];
    const line = Array.isArray(sub) ? `<span class="pl-sub ${a}">${sub[0]}</span><span class="pl-sub ${b}">${sub[1]}</span>` : `<span class="pl-sub">${sub}</span>`;
    return `<button class="pl" style="--tint:${tint}" data-press data-act="${act}"><span class="pl-tile">${icon}</span><span class="pl-txt"><b class="pl-title">${title}</b>${line}</span><span class="pl-end">${end}</span></button>`;
  }
  const tline = (k, t, icon, def) => `<div class="tline ${S(k, def) ? 'on' : ''}" role="switch" tabindex="0" aria-checked="${S(k, def)}" data-toggle="${k}" data-def="${def}">${icon}<span>${t}</span><i class="sw"></i></div>`;

  render();
  document.body.appendChild(wrap);
  fitHero(); if (document.fonts) document.fonts.ready.then(() => { if (wrap.isConnected) fitHero(); });
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('in')));
  const offAccount = account.onChange(() => render());
  // Who's online, for the Friends row (it redraws when the list comes back).
  const offFriends = Friends.onChange(() => render());
  const off = () => { offAccount(); offFriends(); };
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
