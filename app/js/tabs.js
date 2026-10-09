// The app's five doors along the bottom: HomeTabs.swift (HomeTabBar, TabTitle)
// plus the tab parts of StageView.swift (tab, selectTab, tabPage, tabBar,
// tabBarShown, barAway, menuButton, cleanDisplayButton).
//
// Home is the stage itself; Games, Party, Friends and Profile draw over it as
// pages and keep the bar. The floating row on Home (the menu disc, the faint
// clean-display eye, the Premium pill) lives here too, since clean display and
// the bar are one switch.
//
// API (ctx.tabs):
//   current                    'home' | 'games' | 'party' | 'friends' | 'profile'
//   select(name, { quiet })    open a tab (quiet: no click/haptic, as iOS `tab = .home`)
//   setAway(reason, on)        'clip' | 'confetti' | 'reveal' (the bar steps aside on Home)
//                              'keyboard' | 'focus' (the bar goes, as tabBarShown)
//   setTier(tier)              the level colour (the stage calls it; also read from game.difficulty)
//   onChange(fn) -> off        fn(tab, previous)
//   refresh()                  redraw the bar, the row and the open page's live bits
//   shown / away               state, for the toast's placement
//   height                     52, the bar's room the stage keeps
import { el, settings, TIER_COLOR } from './ui.js';
import { Haptics } from './haptics.js';
import { Friends } from './friends.js';

import { Season } from './season.js';
import { faceHTML, myIndex, parseChoice, variantOf } from './characters.js';
import { tabTitle as kitTabTitle } from './kit.js';

/** The season dressing the app now (Season.current, with the Seasonal theme switch on), or null. */
export function season() {
  const id = Season.current; if (!id) return null;
  return {
    id, christmas: id === 'christmas', suffix: Season.suffix, homeIcon: Season.homeIcon, dailyIcon: Season.dailyIcon,
    cardIcon: Season.cardIcon(), cardTitle: Season.cardTitle(), dailyCardTitle: Season.dailyCardTitle(),
    accent: Season.accent, glow: Season.glow, panel: Season.panel, genre: Season.genre(),
  };
}

/** A field that brings up a keyboard. */
const typing = t => !!t && (t.tagName === 'TEXTAREA' || t.isContentEditable || (t.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit|color|file)$/i.test(t.type)));

export const TABS = ['home', 'games', 'party', 'friends', 'profile'];
const TITLE = { home: 'HOME', games: 'GAMES', party: 'PARTY', friends: 'FRIENDS', profile: 'PROFILE' };
/** HomeTabBar.height / feather. */
export const BAR_H = 52;


const imgs = name => `/app/img/games/${name}.webp`;

export function mountTabs(ctx) {
  const { game, account, sound } = ctx;
  let tab = 'home', page = null, pageNode = null, gen = 0;
  const listeners = new Set();
  const away = new Set();             // clip, confetti, reveal (Home only)
  const gone = new Set();             // keyboard, focus
  let clipTimer = 0, clipOn = false;
  let tier = game.difficulty;

  // ---------- the pages, the bar, the menu row ----------
  const pages = el('<div class="tabpages" aria-live="off"></div>');
  const bar = el(`<nav class="tabbar" aria-label="Tabs">
    <div class="tb-bg" aria-hidden="true"><i class="tb-feather"></i><i class="tb-body"><i class="tb-hair"></i></i></div>
    <div class="tb-row" role="tablist">${TABS.map(t => `<button class="tb-cell" role="tab" data-tab="${t}" aria-label="${t[0].toUpperCase() + t.slice(1)}"><span class="tb-plate" aria-hidden="true"></span><span class="tb-icon" aria-hidden="true"></span><span class="tb-label">${TITLE[t]}</span></button>`).join('')}</div>
  </nav>`);
  const app = document.getElementById('app');
  app.after(pages); pages.after(bar);
  const cells = Object.fromEntries([...bar.querySelectorAll('.tb-cell')].map(b => [b.dataset.tab, b]));
  const icon = t => cells[t].querySelector('.tb-icon');

  // ---------- icons ----------
  /** The Home disc: the level's own play button; Easy in a season wears the season's. */
  const homeIconName = t => t === 'easy' ? (season()?.homeIcon || 'game-icon-play') : `game-icon-play-${t}`;
  let homeName = '';
  function paintHome() {
    const name = homeIconName(tier);
    if (name === homeName) return;
    const box = icon('home'), first = !homeName;
    homeName = name;
    const img = el(`<img src="${imgs(name)}" alt="" draggable="false" decoding="async">`);
    if (first) { box.appendChild(img); return; }
    // Cross-fades by .id(tier) with an opacity transition.
    img.classList.add('fade-in'); box.appendChild(img);
    requestAnimationFrame(() => requestAnimationFrame(() => img.classList.remove('fade-in')));
    const old = [...box.querySelectorAll('img')].filter(i => i !== img);
    setTimeout(() => old.forEach(o => o.remove()), 380);
  }
  icon('games').innerHTML = `<img src="${imgs('game-icon-mics')}" alt="" draggable="false">`;
  icon('party').innerHTML = `<img src="${imgs('game-icon-disco')}" alt="" draggable="false">`;
  /** CartoonFace: the character's portrait, filling its box (the box clips it). */
  const faceOf = (id, size, variant) => faceHTML(id, null, size, { square: true, variant: variant || undefined });
  function myFace() {
    let id = 46, variant = null;
    try { id = myIndex(account); } catch (e) {}
    try { const c = parseChoice(account.avatar); if (c) variant = variantOf(c, 'portrait'); } catch (e) {}
    return { id, variant };
  }
  let facesKey = '';
  function paintFaces() {
    const me = myFace(), key = `${me.id}|${me.variant}`;
    if (key === facesKey) return; facesKey = key;
    icon('friends').innerHTML = `<span class="tb-duo"><span class="tb-f a">${faceOf(16, 21)}</span><span class="tb-f b">${faceOf(31, 23)}</span></span><i class="tb-dot"></i>`;
    icon('profile').innerHTML = `<span class="tb-me">${faceOf(me.id, 27, me.variant)}</span>`;
  }

  // ---------- state ----------
  const S = (k, d) => settings.get(k, d);
  const clean = () => S('cleanDisplay', false);
  const drawerOpen = () => !!document.querySelector('.drawer-wrap');
  const loginUp = () => !!document.querySelector('.login');
  /** tabBarShown: the game is up, and no drawer, sign-in, keyboard, guess focus or clean display. */
  const isShown = () => !drawerOpen() && !loginUp() && !clean() && gone.size === 0 && !(ctx.ads && ctx.ads.showing);
  /** barAway: only ever on Home — the clip, the confetti, a lost round's card. */
  const isAway = () => tab === 'home' && away.size > 0;

  function paint() {
    // A focused field that was taken out of the page sends no focusout: drop what it left behind.
    if (gone.size && !typing(document.activeElement)) gone.clear();
    tier = game.difficulty || tier;
    const s = season();
    // Easy keeps the bar's own green (no season); the other levels use their accent.
    const green = tier === 'easy' && !s ? '#1ed760' : TIER_COLOR[tier];
    document.documentElement.style.setProperty('--bar', green);
    paintHome(); paintFaces();
    for (const t of TABS) { const on = t === tab; cells[t].classList.toggle('on', on); cells[t].setAttribute('aria-selected', on); }
    cells.friends.classList.toggle('dot', Friends.requests.length > 0);
    const shown = isShown(), aw = isAway();
    bar.classList.toggle('gone', !shown);
    bar.classList.toggle('away', shown && aw);
    bar.inert = !shown || aw;
    document.documentElement.classList.toggle('tabbar-room', shown);
    document.documentElement.classList.toggle('tabbar-up', shown && !aw);
    pages.classList.toggle('open', tab !== 'home');
  }

  // ---------- pages ----------
  const LOADERS = {
    games: async () => (await import('./games.js')).mountGames,
    party: async () => findExport(['./partyhome.js', './party-home.js', './party.js'], 'mountPartyHome', 'party'),
    friends: async () => findExport(['./friendsview.js'], 'mountFriendsTab', 'friends'),
    profile: async () => findExport(['./profile.js'], 'mountProfileTab', 'profile'),
  };
  async function findExport(paths, name, css) {
    for (const p of paths) {
      try { const m = await import(p); if (typeof m[name] === 'function') { ctx.loadCSS?.(css); return m[name]; } } catch (e) {}
    }
    return null;
  }
  /** Until the page's own module exists: the title and nothing else. */
  const placeholder = t => (container) => { container.innerHTML = `${tabTitle(TITLE[t])}`; return { destroy() {} }; };

  async function openPage(t) {
    const my = ++gen;
    const old = pageNode, oldPage = page;
    page = null; pageNode = null;
    if (old) {
      // Whatever was being typed on the page goes with it (and its keyboard).
      if (old.contains(document.activeElement)) document.activeElement.blur();
      old.classList.remove('in'); setTimeout(() => { try { oldPage?.destroy?.(); } catch (e) {} old.remove(); paint(); }, 180);
    }
    if (t === 'home') return;
    const node = el(`<section class="tabpage" data-tab="${t}" aria-label="${t[0].toUpperCase() + t.slice(1)}"></section>`);
    pages.appendChild(node); pageNode = node;
    let mount = null;
    try { mount = await LOADERS[t](); } catch (e) { console.warn('tab', t, e); }
    if (my !== gen) { node.remove(); return; }
    try { page = (mount || placeholder(t))(node, ctx) || null; } catch (e) { console.warn('tab', t, e); page = placeholder(t)(node, ctx); }
    requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('in')));
  }

  // ---------- selectTab ----------
  function select(t, { quiet = false } = {}) {
    if (!TABS.includes(t) || t === tab) return;
    const prev = tab;
    if (!quiet) { sound.click(); Haptics.select(); }
    // Leaving Home stops the clip and the playing look, and drops the guess field.
    if (t !== 'home') {
      ctx.stopStage();
      const f = document.querySelector('.stage input'); if (f && document.activeElement === f) f.blur();
    }
    tab = t;
    paint();
    openPage(t);
    listeners.forEach(fn => { try { fn(t, prev); } catch (e) {} });
  }

  bar.addEventListener('click', e => { const b = e.target.closest('.tb-cell'); if (b) select(b.dataset.tab); });
  // Press scale 0.9 (Pressable(scale: 0.9)).
  bar.addEventListener('pointerdown', e => { const b = e.target.closest('.tb-cell'); if (b) b.classList.add('down'); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => bar.addEventListener(ev, () => bar.querySelectorAll('.down').forEach(b => b.classList.remove('down')), true));

  // Clean display (the stage's faint eye, the menu's switch) takes the bar away.
  addEventListener('songspot:setting', e => { if (e.detail?.key === 'cleanDisplay') paint(); });

  // ---------- the bar stepping aside ----------
  function setAway(reason, on) {
    if (reason === 'keyboard' || reason === 'focus') { on ? gone.add(reason) : gone.delete(reason); return paint(); }
    if (reason === 'clip') {
      // Press play and the bar leaves at once; it is back 600 ms after the clip stops,
      // so a tenth-of-a-second clip doesn't make it blink.
      clipOn = !!on; clearTimeout(clipTimer);
      if (on) { away.add('clip'); return paint(); }
      clipTimer = setTimeout(() => { if (!clipOn) { away.delete('clip'); paint(); } }, 600);
      return;
    }
    // With motion off the bar never leaves for the win or the loss.
    if ((reason === 'confetti' || reason === 'reveal') && on && !S('motion', true)) return;
    on ? away.add(reason) : away.delete(reason);
    paint();
  }
  // Any keyboard (a profile's name, a friend search) on a touch screen: the bar would ride up on it.
  const coarse = () => matchMedia('(pointer: coarse)').matches;
  document.addEventListener('focusin', e => {
    if (!typing(e.target)) return;
    if (e.target.closest('.stage')) setAway('focus', true);
    if (coarse()) setAway('keyboard', true);
  });
  document.addEventListener('focusout', e => {
    if (!typing(e.target)) return;
    setTimeout(() => { if (!typing(document.activeElement)) { gone.delete('focus'); gone.delete('keyboard'); paint(); } else if (!document.activeElement.closest('.stage')) { gone.delete('focus'); paint(); } }, 0);
  });
  // The drawer, the sign-in gate and the ads come and go by themselves: watch for them.
  new MutationObserver(() => paint()).observe(document.body, { childList: true });
  account.onChange(() => {
    // Signed out or deleted: back to Home, as iOS sets tab = .home.
    if (!account.signedIn && wasSignedIn && tab !== 'home') select('home', { quiet: true });
    wasSignedIn = account.signedIn;
    paint(); page?.refresh?.();
  });
  let wasSignedIn = account.signedIn;
  // A friend request waiting: the dot on Friends (the toast is friends.js's, as StageView's onChange(of: friends.arrived)).
  Friends.onChange(() => paint());

  const api = {
    get current() { return tab; },
    get shown() { return isShown(); },
    get away() { return isAway(); },
    /** HomeTabBar.height: the stage keeps this much room for the bar. */
    height: BAR_H,
    select, setAway,
    setTier(t) { if (t) { tier = t; paint(); } },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    refresh() { paint(); page?.refresh?.(); },
  };
  paint();
  return api;
}

/** TabTitle: a page's title, 26 black italic, centred, over a hairline (kit.js). */
export const tabTitle = text => kitTabTitle(text);
