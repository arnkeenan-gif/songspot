// The profile — iOS Profile/ProfileView.swift as of 810f015 (8 Oct): "YOUR PROFILE" with the gear, your whole
// character idling on a pool of light beside the title card, Edit avatar · Edit profile, the PLAY STREAK
// calendar on the orange panel, the gold LEVEL card, and three picture tiles (Friends · Ranked · Stats). The
// Stats, Ranked and Settings pages open over it, built from the colour panels (kit.js). The album wall sits
// behind the header, the season backdrop behind everything.
//
//   mountProfile(ctx)               full-screen, with the close ×           → { close }
//   mountProfileTab(container, ctx) the Profile tab (iOS inTab: no close)   → { destroy() }
//                                   A guest sees the sign-in gate there (iOS signs everyone in at launch).
//   openProfilePage(ctx, 'stats'|'ranked'|'settings')  one page on its own
//
// Localhost knobs (README): ?open=profile, ?demoProfile=1 (account.js: a signed-in demo player with stats,
// &playerName=Liv &demoAvatar=58 &demoNamed=420 &premium=1), ?profilePage=stats|ranked|settings,
// ?creatorCodes=1 (show the Creator code row whatever app_config says), ?picker=1 (open Edit avatar).
import { el, esc, pushView, popView, openSheet, cap, mix, TIER_COLOR, TIERS } from './ui.js';
import { I, sf } from './icons.js';
import { Level, Streak, PlayStreak, localDay } from './account.js';
import { Ladder } from './ladder.js';
import { CoverWall } from './coverwall.js';
import { Haptics } from './haptics.js';
import { Friends } from './friends.js';
import { panel, group, dressAttr, PanelColours } from './kit.js';
import { mountBackdrop } from './season.js';
import { faceHTML, figureHTML, openCharacterPicker } from './characters.js';
import { config, supabase } from './supabase.js';

// kit.css (the colour panels), once, if the page hasn't linked it yet.
if (!document.querySelector('link[href*="/app/css/kit.css"]') && !document.getElementById('css-kit')) {
  const l = document.createElement('link'); l.id = 'css-kit'; l.rel = 'stylesheet'; l.href = '/app/css/kit.css?v=1'; document.head.appendChild(l);
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const Q = new URLSearchParams(location.search);
const STAGES = [0.1, 0.5, 2, 8, 15];
const stageLabel = s => (s < 1 ? s.toFixed(1) + 's' : Math.round(s) + 's');
/** Int.formatted(): the reader's own grouping. */
const fmt = n => Number(n || 0).toLocaleString();
const EASE = 'cubic-bezier(.32,.72,0,1)';
const pct = s => Math.round((s.roundsPlayed ? s.roundsWon / s.roundsPlayed : 0) * 100);

// SF symbols icons.js doesn't carry.
const STAIRS = `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20h5v-5h5v-5h5V5h3"/></svg>`;
const PEOPLE3 = `<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="7.2" r="3.4"/><circle cx="5" cy="9" r="2.6"/><circle cx="19" cy="9" r="2.6"/><path d="M5.8 19.5c0-3.6 2.8-6.3 6.2-6.3s6.2 2.7 6.2 6.3z"/><path d="M.8 18.4c0-2.9 1.9-5 4.4-5 .9 0 1.7.3 2.4.7a8 8 0 0 0-2.8 4.9z"/><path d="M23.2 18.4c0-2.9-1.9-5-4.4-5-.9 0-1.7.3-2.4.7a8 8 0 0 1 2.8 4.9z"/></svg>`;
const CHECK_CIRCLE = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><mask id="pfcm"><rect width="24" height="24" fill="#fff"/><path d="M7.2 12.3l3.2 3.2 6.4-6.6" fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></mask><circle cx="12" cy="12" r="10.5" fill="currentColor" mask="url(#pfcm)"/></svg>`;
/** chart.bar.fill with the tile's gradient (accent at the foot, Impossible purple on top). */
const chartBars = (from, to) => `<svg class="pf-chart" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="pfcg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><g fill="url(#pfcg)"><rect x="1" y="12" width="6.6" height="10" rx="2"/><rect x="8.7" y="7.5" width="6.6" height="14.5" rx="2"/><rect x="16.4" y="3" width="6.6" height="19" rx="2"/></g></svg>`;
/** RankEmblem: the 3D emblem picture of a rank. */
const emblem = (tier, size) => `<img class="pf-emblem" src="/app/img/emblems/rank-${Math.min(6, Math.max(0, tier.index))}.webp" alt="${esc(tier.name)}" style="width:${size}px;height:${size}px" draggable="false">`;
const sym = (name, fallback = '') => sf(name) || fallback;

// ---------- creator codes (Profile/CreatorCode.swift) ----------
const CC = {
  get enabled() { try { return localStorage.getItem('songspot.creator.enabled') === 'true'; } catch (e) { return false; } },
  get code() { try { return localStorage.getItem('songspot.creator.code'); } catch (e) { return null; } },
  get name() { try { return localStorage.getItem('songspot.creator.name'); } catch (e) { return null; } },
  /** Settings shows the row: switched on in app_config (creator_codes = 1), or a code already set. */
  get shown() { return (LOCAL && Q.get('creatorCodes') === '1') || this.enabled || !!this.code; },
  keep(code, name) { try { localStorage.setItem('songspot.creator.code', code); localStorage.setItem('songspot.creator.name', name); } catch (e) {} },
  async mine() { const { data, error } = await supabase.rpc('my_creator_code'); if (error) throw error; return Array.isArray(data) ? data[0] : null; },
  /** The switch, and the code this account already has. */
  async refresh(account) {
    const v = await config.get('creator_codes', null);
    if (v != null) { try { localStorage.setItem('songspot.creator.enabled', String(Number(v) >= 1)); } catch (e) {} }
    if (!account.signedIn || account.demo) return;
    try { const r = await this.mine(); if (r && r.code) this.keep(r.code, r.name); } catch (e) {}
  },
  /** Saves a code for this account. Letters and digits only; case doesn't matter. → { name } | { error } */
  async apply(account, raw) {
    const typed = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!account.signedIn || account.demo) return { error: 'Sign in first, so the code stays with your account.' };
    if (typed.length < 3 || typed.length > 16) return { error: "That code doesn't exist. Check the spelling with the creator." };
    let res;
    try { res = await supabase.rpc('set_creator_code', { p_code: typed }); } catch (e) { return { error: "Couldn't reach Songspot. Check your connection and try again." }; }
    if (res.error) {
      if (!res.error.code && !res.error.message) return { error: "Couldn't reach Songspot. Check your connection and try again." };
      // Postgres raised: an account that already has a code says so through my_creator_code.
      try { const r = await this.mine(); if (r && r.code && r.code !== typed) { this.keep(r.code, r.name); return { error: `This account already supports ${r.name}. A code can't be changed.` }; } } catch (e) {}
      return { error: "That code doesn't exist. Check the spelling with the creator." };
    }
    const who = String(res.data || typed);
    this.keep(typed, who);
    return { name: who };
  },
};

/** CreatorCodeSheet: one field, one button; once a code is set it only says who you support. */
function openCreatorCode(ctx, onDone) {
  const { account } = ctx;
  const sh = openSheet('<div class="pf-cc"></div>', { label: 'Creator code', onClose: onDone });
  const box = sh.body.querySelector('.pf-cc');
  let typed = '', busy = false, failure = null;
  const paint = () => {
    const head = `<div class="pf-cchd"><h3>CREATOR CODE</h3><button class="pf-circ x" data-cc="close" data-press aria-label="Close">${sym('xmark', I.x)}</button></div>`;
    if (CC.code && CC.name) {
      box.innerHTML = `${head}<div${dressAttr(PanelColours.purple, { cls: 'pf-ccwho' })}><small>You support</small><b>${esc(CC.name)}</b><code>Code ${esc(CC.code)}</code></div>
        <p class="pf-ccnote">Thanks for backing them. Your purchases help them keep playing Songspot.</p>`;
      return;
    }
    box.innerHTML = `${head}<p class="pf-ccnote big">Found Songspot through a creator? Enter their code to support them. You can only add one, and it can't be changed.</p>
      <input class="pf-ccfield${failure ? ' bad' : ''}" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" enterkeyhint="done" aria-label="Creator code" value="${esc(typed)}">
      ${failure ? `<p class="pf-ccerr">${esc(failure)}</p>` : ''}
      <button class="pf-ccgo${typed.length >= 3 ? '' : ' off'}" data-cc="save" data-press ${busy || typed.length < 3 ? 'disabled' : ''}>${busy ? 'Checking…' : 'Add code'}</button>`;
    const f = box.querySelector('.pf-ccfield');
    f.addEventListener('input', () => {
      const c = f.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16); if (c !== f.value) f.value = c;
      typed = c; failure = null; f.classList.remove('bad'); box.querySelector('.pf-ccerr')?.remove();
      const go = box.querySelector('.pf-ccgo'); go.classList.toggle('off', c.length < 3); go.disabled = c.length < 3;
    });
    f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    setTimeout(() => f.focus(), 350);
  };
  async function save() {
    if (busy || typed.length < 3) return;
    busy = true; paint();
    const r = await CC.apply(account, typed);
    busy = false;
    if (r.error) { failure = r.error; Haptics.wrong(); } else Haptics.success();
    paint();
  }
  box.addEventListener('click', e => { const b = e.target.closest('[data-cc]'); if (!b || b.disabled) return; if (b.dataset.cc === 'close') sh.close(); else save(); });
  paint();
}

/** The grow-in animations: on first show from 0 to their value; later renders land at once. */
function grow(root, animate) {
  const ns = [...root.querySelectorAll('[data-grow]')];
  const land = n => {
    const v = n.dataset.min ? `max(${n.dataset.min}, ${n.dataset.to})` : n.dataset.to;
    if (n.dataset.grow === 'w') n.style.width = v; else if (n.dataset.grow === 'h') n.style.height = v; else n.style.strokeDashoffset = n.dataset.to;
  };
  if (!animate) { ns.forEach(n => { n.style.transition = 'none'; land(n); }); return; }
  ns.forEach(n => {
    const prop = n.dataset.grow === 'w' ? 'width' : n.dataset.grow === 'h' ? 'height' : 'stroke-dashoffset';
    n.style.transition = n.dataset.spring ? `${prop} .75s cubic-bezier(.3,1.08,.45,1)` : `${prop} ${n.dataset.dur || 0.7}s ${EASE}`;
    n.style.transitionDelay = `${n.dataset.delay || 0}s`;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => ns.forEach(land)));
}
/** lineLimit(1).minimumScaleFactor(0.6): shrink a line that doesn't fit its box. */
function fitAll(root) {
  requestAnimationFrame(() => root.querySelectorAll('[data-fit]').forEach(n => {
    n.style.fontSize = ''; n.style.letterSpacing = '';
    const w = n.clientWidth; if (!w || n.scrollWidth <= w) return;
    const base = parseFloat(getComputedStyle(n).fontSize);
    n.style.letterSpacing = '0';
    n.style.fontSize = (base * Math.max(0.6, w / n.scrollWidth)).toFixed(2) + 'px';
  }));
}

// ---------- the profile ----------
function build(ctx, { inTab = false, host = null } = {}) {
  const { account } = ctx;
  let editing = false, draft = '', refused = false, first = true, closed = false;
  const pages = new Set();
  const accent = () => ctx.accent;

  const node = el(`<div class="${inTab ? 'pf-tab' : 'view'} profile" role="${inTab ? 'region' : 'dialog'}" ${inTab ? '' : 'aria-modal="true"'} aria-label="Profile">
    <div class="pf-backdrop"></div>
    <div class="pf-wall">${CoverWall.html(CoverWall.covers(ctx.pool), 0.72)}</div>
    <div class="pf-bar"><div class="pf-barin">
      <button class="pf-circ gear" data-act="settings" data-press aria-label="Settings">${sym('gearshape.fill')}</button>
      <h1>YOUR PROFILE</h1>
      ${inTab ? '<span class="pf-circ blank"></span>' : `<button class="pf-circ x" data-act="close" data-press aria-label="Close">${sym('xmark', I.x)}</button>`}
    </div></div>
    <div class="pf-scroll"><div class="pf-col"><div class="pf-body"></div></div></div>
  </div>`);
  const body = node.querySelector('.pf-body');
  let backdrop = null;
  try { backdrop = mountBackdrop(node.querySelector('.pf-backdrop')); } catch (e) {}

  function heroHTML(s) {
    const lv = Level.at(s.roundsWon || 0);
    const since = account.memberSince ? `<span class="pf-since">Since ${esc(account.memberSince.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }))}</span>` : '';
    const nameLine = editing
      ? `<div class="pf-editbox"><input class="pf-field${refused ? ' bad' : ''}" maxlength="20" placeholder="Your name" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" aria-label="Your name" value="${esc(draft)}">${refused ? `<p class="pf-refused">That name isn't allowed. Pick another one.</p>` : ''}</div>`
      : `<b class="pf-name${account.name ? '' : ' empty'}" data-fit>${esc(account.name || 'Your name')}</b>`;
    return `<div class="pf-hero">
      <button class="pf-fig" data-act="picker" aria-label="Edit avatar">${figureHTML(account.faceIndex, 'fight', { height: 210, variant: account.variant('fight'), floor: accent(), calm: true, clip: false })}</button>
      <div class="pf-card">
        <em class="pf-lvl" data-fit>${esc(lv.title.toUpperCase())}</em>
        ${nameLine}
        <span class="pf-named"><i>${sym('music.note', I.note)}</i><b>${fmt(s.roundsWon)}</b></span>
        <span class="pf-meta">${ctx.premium ? '<span class="pf-prem">PREMIUM</span>' : ''}${since}</span>
      </div></div>`;
  }
  const pill = (act, title, filled = false) => `<button class="pf-pill${filled ? ' filled' : ''}" data-act="${act}" data-press>${esc(title)}${sym('chevron.right', I.chevron)}</button>`;
  const pillsHTML = () => `<div class="pf-pills">${pill('picker', 'Edit avatar')}${editing ? pill('done', 'Done', true) : pill('edit', 'Edit profile')}</div>`;

  /** The play streak: the count on the desk calendar, then this week Monday to Sunday, ticked where it ran. */
  function streakHTML(s) {
    const streak = PlayStreak.live(s), today = localDay();
    const playedToday = (s.lastPlayDay || 0) >= today;
    const end = playedToday ? today : today - 1;
    const firstDay = account.memberSince ? localDay(account.memberSince) : today;      // no crosses before they were here
    const now = new Date(), wd = (now.getDay() + 6) % 7;                               // 0 = Monday
    const ink = PanelColours.orange[2];
    const days = Array.from({ length: 7 }, (_, k) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (k - wd));
      const day = today + (k - wd), isToday = k === wd;
      const lit = streak > 0 && day <= end && day > end - streak;
      const missed = !lit && day < today && day >= firstDay;
      const inner = lit ? `<span class="pf-tick" style="color:${ink}">${sym('checkmark', I.check)}</span>` : missed ? `<span class="pf-miss">${sym('xmark', I.x)}</span>` : `<span class="pf-dnum">${date.getDate()}</span>`;
      return `<div class="pf-wday${isToday ? ' today' : ''}"><small>${esc(date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase().slice(0, 3))}</small><span class="pf-box${lit ? ' lit' : ''}">${inner}</span></div>`;
    }).join('');
    const line = playedToday ? 'Played today · back tomorrow' : streak > 0 ? 'Play any mode today to keep it' : 'Play any mode to start a streak';
    return `<div class="pf-label">PLAY STREAK</div>
      <div${dressAttr(PanelColours.orange, { cls: 'pf-streak' })}>
        <div class="pf-sttop"><div class="pf-cal"><img src="/app/img/games/game-icon-calendar.webp" alt="" draggable="false"><span class="pf-calnum"><b>${streak}</b><small>${streak === 1 ? 'DAY' : 'DAYS'}</small></span></div>
          <i class="pf-vline"></i><div class="pf-week">${days}</div></div>
        <i class="pf-hline"></i>
        <div class="pf-stfoot"><span data-fit>${line}</span>${s.bestPlayStreak > 0 ? `<b style="color:${ink}">BEST ${s.bestPlayStreak}</b>` : ''}</div>
      </div>`;
  }

  function levelHTML(s) {
    const n = s.roundsWon || 0, lv = Level.at(n);
    return `<div${dressAttr(PanelColours.gold, { cls: 'pf-level' })}>
      <div class="pf-lvmain"><div class="pf-lvtop"><b data-fit>LEVEL · ${esc(lv.title.toUpperCase())}</b><span>${lv.next ? `${n} / ${lv.next.at}` : 'MAX'}</span></div>
        <div class="pf-lvbar"><i data-grow="w" data-to="${(lv.frac * 100).toFixed(3)}%" data-min="14px" data-delay=".15" data-dur=".7"></i></div></div>
      <img class="pf-lvmic" src="/app/img/games/game-icon-mic.webp" alt="" draggable="false"></div>`;
  }

  function tilesHTML(s) {
    const dot = (Friends.onlineCount || 0) > 0 || (Friends.requests || []).length > 0;
    const faces = [7, 31, 22].map(c => faceHTML(c, '', 44, { cls: 'pf-tf' })).join('');
    const tile = (act, title, icon, d = false) => `<button class="pf-tile" data-act="${act}" data-press><span class="pf-ticon">${icon}</span><span class="pf-ttitle">${d ? '<i class="pf-dot"></i>' : ''}${esc(title)}</span></button>`;
    return `<div class="pf-tiles">${tile('friends', 'Friends', `<span class="pf-faces">${faces}</span>`, dot)}${tile('ranked', 'Ranked', emblem(Ladder.place(s.rp).tier, 66))}${tile('stats', 'Stats', chartBars(accent(), TIER_COLOR.impossible))}</div>`;
  }

  function render() {
    if (closed) return;
    const f0 = body.querySelector('.pf-field');
    if (f0) draft = f0.value;
    const caret = f0 ? f0.selectionStart : null;
    const s = account.stats;
    node.style.setProperty('--pf-accent', accent());
    body.innerHTML = heroHTML(s) + pillsHTML() + streakHTML(s) + levelHTML(s) + tilesHTML(s);
    const f = body.querySelector('.pf-field');
    if (f) {
      f.focus({ preventScroll: true });
      const at = caret ?? f.value.length; try { f.setSelectionRange(at, at); } catch (e) {}
      f.addEventListener('input', () => {
        if (f.value.length > 20) f.value = f.value.slice(0, 20);
        draft = f.value;
        if (refused) { refused = false; f.classList.remove('bad'); body.querySelector('.pf-refused')?.remove(); }
      });
      f.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commitName(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); editing = false; refused = false; render(); }
      });
    }
    fitAll(body);
    grow(body, first);
    if (first) { first = false; body.classList.add('pf-rise'); }
  }

  function commitName() {
    if (!account.setName(draft)) { refused = true; Haptics.wrong(); render(); return; }   // refused: the field stays open
    refused = false; editing = false; render();
  }
  function startEdit() { draft = account.name; editing = true; refused = false; render(); }
  function openPage(kind) {
    const p = mountPage(ctx, kind, { onClosed: () => pages.delete(p), onEditName: startEdit, onSignedOut: () => { if (!inTab) close(); } });
    pages.add(p);
  }

  node.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case 'close': return close();
      case 'settings': Haptics.select(); return openPage('settings');
      case 'picker': Haptics.select(); return openCharacterPicker(ctx);
      case 'edit': Haptics.select(); return startEdit();
      case 'done': Haptics.select(); return commitName();
      case 'friends': Haptics.select(); return ctx.openFriends();
      case 'ranked': Haptics.select(); return openPage('ranked');
      case 'stats': Haptics.select(); return openPage('stats');
    }
  });

  const onKey = e => {
    if (e.key !== 'Escape' || inTab || pages.size || document.querySelector('.cpick, .view.sheet')) return;
    if (editing) { e.preventDefault(); editing = false; refused = false; render(); return; }
    close();
  };
  const offAccount = account.onChange(() => render());
  let friendsKey = '';
  const offFriends = typeof Friends.onChange === 'function' ? Friends.onChange(() => {
    const k = `${Friends.onlineCount}|${(Friends.requests || []).length}`; if (k === friendsKey) return; friendsKey = k;
    const t = body.querySelector('.pf-tiles'); if (t) t.replaceWith(el(tilesHTML(account.stats)));
  }) : null;
  function teardown() {
    if (closed) return; closed = true;
    offAccount(); if (typeof offFriends === 'function') offFriends();
    document.removeEventListener('keydown', onKey);
    pages.forEach(p => p.close());
    try { backdrop && backdrop.destroy && backdrop.destroy(); } catch (e) {}
  }
  function close() { if (closed) return; teardown(); popView(node); }

  document.addEventListener('keydown', onKey);
  render();
  if (inTab) host.appendChild(node); else pushView(node);
  if (account.signedIn && !account.demo) Friends.refresh?.();
  CC.refresh(account).catch(() => {});
  if (LOCAL) {
    const pg = Q.get('profilePage'); if (['stats', 'ranked', 'settings'].includes(pg)) setTimeout(() => openPage(pg), 50);
    if (Q.get('picker') === '1') setTimeout(() => openCharacterPicker(ctx), 60);
  }
  return { close, teardown, node };
}

// ---------- the pages behind the tiles and the gear ----------
const TITLES = { stats: 'STATS', ranked: 'RANKED', settings: 'SETTINGS' };

function mountPage(ctx, kind, { onClosed, onEditName, onSignedOut } = {}) {
  const { account } = ctx;
  let closed = false, signingOut = false, deleting = false, deleteError = null, first = true, editAfter = false;
  const node = el(`<div class="view pf-page profile" role="dialog" aria-modal="true" aria-label="${cap(kind)}">
    <div class="pf-backdrop"></div>
    <div class="pf-bar"><div class="pf-barin">
      <button class="pf-circ back" data-act="back" data-press aria-label="Back">${sym('chevron.left', I.back)}</button>
      <h1 class="sub">${TITLES[kind]}</h1><span class="pf-circ blank"></span>
    </div></div>
    <div class="pf-scroll"><div class="pf-col"><div class="pf-body pf-pbody"></div></div></div></div>`);
  const body = node.querySelector('.pf-body');
  let backdrop = null;
  try { backdrop = mountBackdrop(node.querySelector('.pf-backdrop')); } catch (e) {}
  const accent = () => ctx.accent;
  const section = (title, note, icon, colours, inner) => `<div class="pf-sec">${panel({ title, note, icon, colours, body: inner })}</div>`;

  // ----- Stats -----
  const statCard = (value, name, icon, tint) => `<div class="pf-stat"><span class="pf-stile" style="background:${mix(tint, '#000000', 0.1)}">${icon}</span><span class="pf-sv"><b class="${value === '—' ? 'dim' : ''}" data-fit>${esc(value)}</b><small>${esc(name)}</small></span></div>`;
  const chip = (value, lbl) => `<div class="pf-chip"><b class="${value === '—' ? 'dim' : ''}" data-fit>${esc(value)}</b><small data-fit>${esc(lbl.toUpperCase())}</small></div>`;

  /** Songs named, big, inside a ring of the win rate; the level and the rounds under it. */
  function statsHero(s) {
    const rate = s.roundsPlayed ? s.roundsWon / s.roundsPlayed : 0, C = 2 * Math.PI * 85;
    return `<div${dressAttr(PanelColours.green, { cls: 'pf-shero' })}>
      <img class="pf-shmic" src="/app/img/games/game-icon-mic.webp" alt="" draggable="false">
      <div class="pf-ring"><svg viewBox="0 0 170 170" aria-hidden="true"><circle cx="85" cy="85" r="85" class="trk"/><circle cx="85" cy="85" r="85" class="arc" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" data-grow="ring" data-to="${(C * (1 - rate)).toFixed(2)}" data-delay=".2" data-dur=".9"/></svg>
        <span class="pf-ringin"><b data-fit>${fmt(s.roundsWon)}</b><small>SONGS NAMED</small></span></div>
      <p class="pf-shline">${s.roundsPlayed === 0 ? 'Play a round to start your record' : `${pct(s)}% of ${fmt(s.roundsPlayed)} rounds`}</p>
      <span class="pf-shlvl">${esc(Level.at(s.roundsWon || 0).title.toUpperCase())}</span></div>`;
  }
  function speedChart(s, total) {
    const counts = STAGES.map((_, i) => (s.wonByStage && s.wonByStage[i]) || 0), top = Math.max(1, ...counts);
    let usual = null; if (total > 0) { usual = 0; counts.forEach((c, i) => { if (c > counts[usual]) usual = i; }); }
    const cols = counts.map((c, i) => {
      const on = usual === i, fill = total === 0 ? 'rgba(255,255,255,.18)' : on ? '#fff' : 'rgba(255,255,255,.35)';
      return `<div class="pf-scol${on ? ' on' : ''}"><b>${total === 0 ? '' : c}</b><span class="pf-cbar" style="background:${fill};height:8px" data-grow="h" data-to="${Math.max(8, 96 * c / top).toFixed(2)}px" data-spring="1" data-delay="${(0.05 * i).toFixed(2)}"></span><small>${stageLabel(STAGES[i])}</small></div>`;
    }).join('');
    const foot = total === 0 ? 'Name songs and this fills in with how early you get them.' : `You usually name it at ${stageLabel(STAGES[usual])}.`;
    return `<div class="pf-glass pf-speed"><div class="pf-cols${total === 0 ? ' empty' : ''}">${cols}</div><p>${esc(foot)}</p></div>`;
  }
  const difficultyStrip = s => `<div class="pf-tiers">${TIERS.map(t => {
    const n = (s.winsByTier && s.winsByTier[t]) || 0, c = TIER_COLOR[t];
    return `<div class="pf-tier"><i style="background:${c}"></i><b style="color:${n === 0 ? 'rgba(255,255,255,.5)' : mix(c, '#ffffff', 0.2)}" data-fit>${n}</b><small>${t === 'impossible' ? 'Imposs.' : cap(t)}</small></div>`;
  }).join('')}</div>`;
  const careerRows = s => [
    [s.partiesPlayed ? `${s.partiesWon} of ${s.partiesPlayed}` : '', 'Parties won', PEOPLE3, TIER_COLOR.impossible],
    [s.bestPartyScore ? fmt(s.bestPartyScore) : '', 'Best party score', sym('star.fill'), TIER_COLOR.expert],
    [s.partyPoints ? fmt(s.partyPoints) : '', 'Party points', sym('sparkles', I.sparkles), '#4cc9f0'],
  ].filter(r => r[0]);
  const careerList = rows => `<div class="pf-glass pf-clist">${rows.map(([v, n, icon, c], i) => `${i ? '<i class="pf-cdiv"></i>' : ''}<div class="pf-crow"><span class="pf-ctile" style="background:${mix(c, '#000000', 0.1)}">${icon}</span><span class="pf-cn">${esc(n)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;

  function statsPage(s) {
    const total = (s.wonByStage || []).slice(0, 5).reduce((a, b) => a + (b || 0), 0);
    const rows = careerRows(s);
    return `<div class="pf-top20">${statsHero(s)}</div>`
      + section('Your record', null, 'set-icon-gauge', PanelColours.blue, `<div class="pf-grid">${statCard(String(s.streak || 0), 'Streak', sym('flame.fill', I.flame), TIER_COLOR.hard)}${statCard(String(s.bestStreak || 0), 'Best streak', sym('trophy.fill', I.trophy), TIER_COLOR.medium)}${statCard(fmt((s.wonByStage || [])[0]), 'Named at 0.1s', sym('bolt.fill', I.bolt), TIER_COLOR.impossible)}${statCard(fmt(s.laddersClimbed), 'Ladders', STAIRS, accent())}</div>`)
      + section('How fast you name them', total > 0 ? `${fmt(total)} named` : null, 'set-icon-stopwatch', PanelColours.teal, `<div class="pf-stack">${speedChart(s, total)}${total > 0 ? difficultyStrip(s) : ''}</div>`)
      + section('Daily challenge', (s.dailyPlayed || 0) === 0 ? 'One song a day, one go' : null, 'game-icon-calendar', PanelColours.orange, `<div class="pf-chips">${chip(String(Streak.live(s)), 'Streak')}${chip(fmt(s.dailyPlayed), 'Played')}${chip(fmt(s.dailyWon), 'Named')}${chip(String(s.dailyBest || 0), 'Best')}</div>`)
      + (rows.length ? section('Party', null, 'game-icon-disco', PanelColours.purple, careerList(rows)) : '');
  }

  // ----- Ranked -----
  const rankColours = c => [mix(c, '#ffffff', 0.15), mix(c, '#000000', 0.3), mix(c, '#000000', 0.62)];
  const rankStart = i => (i <= 5 ? i * Ladder.perTier : Ladder.legendAt);
  /** Your rank, big: the emblem on a glow, the name, the RP and the road to the next division. */
  function rankHero(s) {
    const p = Ladder.place(s.rp || 0);
    return `<div${dressAttr(rankColours(p.tier.color), { cls: 'pf-rhero' })}>
      <span class="pf-rem">${emblem(p.tier, 150)}</span>
      <b class="pf-rname" data-fit>${esc(p.name.toUpperCase())}</b>
      <span class="pf-rrp">${fmt(s.rp || 0)} RP</span>
      <div class="pf-rline"><div class="pf-rbar"><i data-grow="w" data-to="${(p.fraction * 100).toFixed(3)}%" data-min="12px" data-delay=".2" data-dur=".7"></i></div>
        <small>${esc(p.nextAt != null ? `${p.nextAt - (s.rp || 0)} RP to ${Ladder.place(p.nextAt).name}` : 'Top of the ladder')}</small></div></div>`;
  }
  function rankedRecord(s) {
    const played = s.rankedPlayed || 0, lost = Math.max(0, played - (s.rankedWon || 0) - (s.rankedDrawn || 0));
    const form = s.recentRanked || [];
    const pips = form.map(r => `<span class="pf-pip ${r === 1 ? 'w' : r === 2 ? 'd' : 'l'}">${r === 1 ? 'W' : r === 2 ? 'D' : 'L'}</span>`).join('');
    const said = form.map(r => (r === 1 ? 'won' : r === 2 ? 'drew' : 'lost')).join(', ');
    return `<div class="pf-stack"><div class="pf-chips">${chip(fmt(played), 'Played')}${chip(fmt(s.rankedWon), 'Won')}${chip(fmt(lost), 'Lost')}${chip(played === 0 ? '—' : `${Math.round((s.rankedWon || 0) / played * 100)}%`, 'Win rate')}</div>
      <div class="pf-chips">${chip(fmt(s.winStreak), 'Win streak')}${chip(Ladder.place(s.bestRP || 0).name, 'Best rank')}</div>
      ${form.length ? `<div class="pf-form" role="img" aria-label="Last ${form.length} matches: ${said}"><small>LAST ${form.length}</small><span class="pf-sp"></span>${pips}</div>` : ''}</div>`;
  }
  function seasonBlock(s) {
    const next = Ladder.place(Ladder.seasonDrop(s.rp || 0));
    const badges = (s.badges || []).slice().reverse().map(b => {
      const i = b.indexOf(':'), key = i < 0 ? '' : b.slice(0, i), name = i < 0 ? b : b.slice(i + 1);
      const tier = Ladder.tiers.find(t => name.startsWith(t.name));
      return `<span class="pf-badge">${tier ? emblem(tier, 22) : ''}${esc(`${Ladder.seasonName(key)} · ${name}`)}</span>`;
    }).join('');
    return `<div class="pf-stack"><div class="pf-next">${emblem(next.tier, 40)}<span><small>Next season you start at</small><b>${esc(next.name)}</b></span></div>${badges ? `<div class="pf-badges">${badges}</div>` : ''}</div>`;
  }
  /** The seven ranks as a road from Legend down to Bronze. */
  function ladderRoad(s) {
    const mine = Ladder.place(s.rp || 0).tier.index, tiers = Ladder.tiers.slice().reverse();
    return `<div class="pf-road">${tiers.map((r, i) => {
      const here = r.index === mine, passed = r.index < mine, reached = r.index <= mine;
      const end = here ? '<span class="pf-you">YOU</span>' : passed ? `<span class="pf-passed">${CHECK_CIRCLE}</span>` : `<span class="pf-togo">${fmt(rankStart(r.index) - (s.rp || 0))} RP to go</span>`;
      const row = `<div class="pf-rung${here ? ' here' : ''}${reached ? '' : ' ahead'}" style="--rc:${r.color}"><span class="pf-rungem">${emblem(r, here ? 52 : 42)}</span><span class="pf-rungt"><b>${esc(r.name.toUpperCase())}</b><small>From ${fmt(rankStart(r.index))} RP</small></span><span class="pf-sp"></span>${end}</div>`;
      return row + (i < tiers.length - 1 && !here && tiers[i + 1].index !== mine ? '<i class="pf-rdiv"></i>' : '');
    }).join('')}</div>`;
  }
  function rankedPage(s) {
    return `<div class="pf-top20">${rankHero(s)}</div>`
      + section('Record', (s.rankedPlayed || 0) === 0 ? 'Your first match starts it' : null, 'game-icon-mics', PanelColours.pink, rankedRecord(s))
      + section('This season', `${Ladder.seasonName(Ladder.seasonKey())} · ${Ladder.seasonCountdown()}`, 'set-icon-flag', PanelColours.purple, seasonBlock(s))
      + section('The ladder', 'Win matches to climb', 'set-icon-crown', PanelColours.blue, ladderRoad(s));
  }

  // ----- Settings -----
  const setting = (act, lbl, value, { tint = null, chevron = false, disabled = false } = {}) => {
    const inner = `<span class="pf-sl">${esc(lbl)}</span><span class="pf-sp"></span><b${tint ? ` style="color:${tint}"` : ''}>${esc(value)}</b>${chevron ? `<span class="pf-schev">${sym('chevron.right', I.chevron)}</span>` : ''}`;
    return act ? `<button class="pf-set" data-act="${act}" data-press ${disabled ? 'disabled' : ''}>${inner}</button>` : `<div class="pf-set">${inner}</div>`;
  };
  function settingsPage() {
    const rows = [];
    rows.push(setting('name', 'Name', account.name || 'Add a name', { tint: account.name ? '#fff' : 'rgba(255,255,255,.6)', chevron: true }));
    rows.push(setting('character', 'Character', 'Change', { chevron: true }));
    // Off until app_config 'creator_codes' is 1; a code already set always shows.
    if (CC.shown) rows.push(setting('creator', 'Creator code', CC.code || 'Add', { chevron: true }));
    // iOS: a subscriber gets "Premium · Manage"; lifetime is plain "Premium" (no subscription to manage).
    if (ctx.premium && account.premiumForever) rows.push(setting(null, 'Plan', 'Premium', { tint: '#ffe27a' }));
    else if (ctx.premium) rows.push(setting('manage', 'Plan', 'Premium · Manage', { tint: '#ffe27a', chevron: true }));
    else rows.push(setting('premium', 'Plan', 'Free · Go premium', { tint: '#ffe27a', chevron: true }));
    if (account.signedIn) {
      rows.push(setting('signout', 'Sign out', signingOut ? 'Saving…' : '', { chevron: !signingOut, disabled: signingOut }));
      rows.push(`<button class="pf-set pf-del" data-act="delete" data-press ${deleting ? 'disabled' : ''}><span>${deleting ? 'Deleting…' : 'Delete account'}</span></button>`);
    }
    return section('Account', 'Name, character and plan', 'set-icon-crown', PanelColours.green, group(`<div class="pf-acct">${rows.join('<i class="pf-adiv"></i>')}</div>`))
      + (deleteError ? `<p class="pf-err">${esc(deleteError)}</p>` : '');
  }

  function render() {
    if (closed) return;
    const s = account.stats;
    node.style.setProperty('--pf-accent', accent());
    body.innerHTML = kind === 'stats' ? statsPage(s) : kind === 'ranked' ? rankedPage(s) : settingsPage();
    fitAll(body);
    grow(body, first);
    if (first) { first = false; body.classList.add('pf-rise'); }
  }

  function confirm({ title, message, action, cancel = 'Cancel', run }) {
    const sh = openSheet(`<div class="pf-confirm"><h3>${esc(title)}</h3><p>${esc(message)}</p>
      <button class="btn pf-danger" data-go data-press>${esc(action)}</button>
      <button class="btn surface" data-no data-press>${esc(cancel)}</button></div>`, { label: title });
    sh.body.querySelector('[data-no]').addEventListener('click', sh.close);
    sh.body.querySelector('[data-go]').addEventListener('click', () => { sh.close(); run(); });
  }
  /** Signs out once the server has everything; when it can't be reached, asks first. */
  async function signOut() {
    signingOut = true; render();
    const saved = await account.saveBeforeSignOut();
    signingOut = false; render();
    const out = async () => { await account.signOut(); ctx.toast('Signed out.'); close(); onSignedOut && onSignedOut(); };
    if (saved) return out();
    await new Promise(r => setTimeout(r, 400));      // the first sheet finishes closing before the second opens
    confirm({ title: "Your latest rounds aren't saved yet", message: "Songspot couldn't reach the server. Sign out now and they're lost; stay signed in and they save when you're back online.", action: 'Sign out anyway', cancel: 'Stay signed in', run: out });
  }
  /** A subscriber's way to their subscription: the money module's route if it has one, else Stripe's portal. */
  async function manage() {
    if (typeof ctx.openManage === 'function') return ctx.openManage();
    try {
      const token = await (await import('./supabase.js')).auth.token();
      if (!token) throw new Error('no session');
      const r = await fetch('/api/portal', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('portal ' + r.status);
      const { url } = await r.json(); if (!url) throw new Error('no url');
      location.href = url;
    } catch (e) { ctx.toast("Couldn't open billing right now."); }
  }

  node.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case 'back': return close();
      // One name field only, the header's: this page closes first, then it opens.
      case 'name': editAfter = true; return close();
      case 'character': return openCharacterPicker(ctx);
      case 'creator': return openCreatorCode(ctx, () => render());
      case 'manage': return manage();
      case 'premium': return ctx.openPremium(null);
      case 'signout': return confirm({ title: 'Sign out of Songspot?', message: 'Your stats stay on your account. Sign in again any time to pick them up.', action: 'Sign out', run: signOut });
      case 'delete': return confirm({ title: 'Delete your account?', message: 'Your name, picture and every stat are erased from Songspot for good. This cannot be undone.', action: 'Delete account',
        run: async () => {
          deleting = true; deleteError = null; render();
          try { await account.deleteAccount(); deleting = false; ctx.toast('Your account is deleted.'); close(); onSignedOut && onSignedOut(); }
          catch (err) { deleting = false; deleteError = 'Could not delete the account right now. Check your connection and try again.'; render(); }
        } });
    }
  });
  const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.cpick, .view.sheet')) close(); };
  const off = account.onChange(() => render());
  function close() {
    if (closed) return; closed = true;
    off(); document.removeEventListener('keydown', onKey);
    popView(node);
    setTimeout(() => { try { backdrop && backdrop.destroy && backdrop.destroy(); } catch (e) {} }, 500);
    onClosed && onClosed();
    if (editAfter) setTimeout(() => onEditName && onEditName(), 320);
  }
  document.addEventListener('keydown', onKey);
  render();
  pushView(node);
  return { close };
}

/** The profile, full-screen over whatever is open (ProfileView as a fullScreenCover). */
export function mountProfile(ctx) {
  const p = build(ctx, { inTab: false });
  return { close: p.close };
}

/** The Profile tab (ProfileView(inTab: true)). A guest gets the sign-in gate. */
export function mountProfileTab(container, ctx) {
  let cur = null, gate = null, mode = null, dead = false;
  async function show() {
    if (dead) return;
    const want = ctx.account.signedIn ? 'profile' : 'gate';
    if (want === mode) return; mode = want;
    if (cur) { cur.teardown(); cur.node.remove(); cur = null; }
    if (gate) { gate.destroy(); gate = null; }
    if (want === 'profile') { cur = build(ctx, { inTab: true, host: container }); return; }
    const m = await import('./login.js');
    if (dead || mode !== 'gate') return;
    gate = m.mountLoginGate(container, ctx);
  }
  const off = ctx.account.onChange(() => { if (ctx.account.signedIn !== (mode === 'profile')) show(); });
  show();
  return { destroy() { dead = true; off(); if (cur) { cur.teardown(); cur.node.remove(); } if (gate) gate.destroy(); } };
}

/** One page (Stats, Ranked or Settings) on its own. */
export function openProfilePage(ctx, kind) { return mountPage(ctx, kind, {}); }
