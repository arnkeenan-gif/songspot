// Party on the web: the iPhone app's PartyView (Party/PartyView.swift, iOS
// 810f015) screen for screen — the loader, the waiting room in colour panels,
// the host's settings, the count on its glossy band, the round with its dark
// clock, the answer and the board, the podium with the characters on their
// blocks, and a friend's 1v1 with the fighters face to face. The room, the
// rules and the wire live in partygame.js and speak the iPhone's own
// PartyMessage JSON, so a browser and an iPhone sit in the same room. There is
// no entry page any more: the Party tab (partyhome.js) opens a room or joins
// one, and this view is the room. Sizes are SwiftUI points (1 pt = 1 px).
//
// mountParty(ctx, opts): opts = { host: true } | { join: 'CODE' } | { duel: launch } | { songbot: true }
//   launch (Friends): { name, bot, friendId } hosts and invites (.challenge) · { join: code, name } answers one (.join)
import { PartyGame, MAX_PLAYERS, normaliseCode, TEAM_MODES, teamName, teamColor, teamModeLabel, lobbyTeams, teamStandings, BOT_LEVELS, setNameHelpers, firstName, namesSong } from './partygame.js';
import { choiceGrid } from './choices.js';
import { confetti } from './confetti.js';
import { Haptics } from './haptics.js';
import { spring, still } from './motion.js';
import { I, sf } from './icons.js';
import { el, pushView, popView, openSheet, hueColor, shareText, esc, art, cap, settings, TIER_COLOR, TIER_INK, PILL_FILL, PILL_INK, LevelTheme, mix } from './ui.js';
import { CoverWall } from './coverwall.js';
import { Friends } from './friends.js';
import * as K from './kit.js';
import * as C from './characters.js';
import { Season, mountBackdrop } from './season.js';
import { ShazamWatch, watchScene, scenePhase, OwnPrompt, TAIL } from './shazamguard.js';

// The kit's stylesheet, once (index.html may already link it).
if (!document.querySelector('link[href*="/app/css/kit.css"]') && !document.getElementById('css-kit')) {
  const l = document.createElement('link'); l.id = 'css-kit'; l.rel = 'stylesheet'; l.href = '/app/css/kit.css?v=1'; document.head.appendChild(l);
}
// The room's name and face rules, the iPhone's: NameFilter.shown, PlayerName.first.
setNameHelpers({ first: n => C.PlayerName.first(n), shown: n => C.NameFilter.shown(n) });

const STRIP_MAX = 10;
const RING_R = 93, RING_C = 2 * Math.PI * RING_R;
const CPU = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.4"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8" fill="currentColor" stroke="none"/><path d="M9.5 2.5v3M14.5 2.5v3M9.5 18.5v3M14.5 18.5v3M2.5 9.5h3M2.5 14.5h3M18.5 9.5h3M18.5 14.5h3"/></svg>';
const PERSON_X = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9.5" cy="7.5" r="3.6" fill="currentColor" stroke="none"/><path d="M2.8 20c0-3.6 3-6 6.7-6s6.7 2.4 6.7 6z" fill="currentColor" stroke="none"/><path d="M17.5 8.5l4 4M21.5 8.5l-4 4"/></svg>';
const SHUFFLE = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h3.5c2 0 3.2.9 4.3 2.6l2.4 6.8c1.1 1.7 2.3 2.6 4.3 2.6H21M3 18h3.5c2 0 3.2-.9 4.3-2.6M13.2 8.6c1.1-1.7 2.3-2.6 4.3-2.6H21M18.5 3.5 21 6l-2.5 2.5M18.5 15.5 21 18l-2.5 2.5"/></svg>';
const ARROW_R = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M13 8.5 16.5 12 13 15.5"/></svg>';
const UPDOWN = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 9 12 4.5 16.5 9M7.5 15l4.5 4.5 4.5-4.5"/></svg>';
const DOWN_CIRCLE = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v8.5M8.5 12.5 12 16l3.5-3.5"/></svg>';
const FORWARD_END = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 5.6c0-.8.9-1.3 1.6-.8l9.2 6.4c.6.4.6 1.3 0 1.7l-9.2 6.4c-.7.5-1.6 0-1.6-.8zM17 5h2.6v14H17z"/></svg>';
const PLUS = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st (NumberFormatter .ordinal). */
const ordinal = n => { const t = n % 100, u = n % 10; return n + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'); };
/** Dots: three dots breathing in turn (5 pt, 4 apart). */
const dots = color => `<span class="pdots" style="color:${color}"><i></i><i></i><i></i></span>`;
/** Equalizer: five bars bouncing while a clip sounds. */
const eq = () => '<span class="peq"><span><i></i><i></i><i></i><i></i><i></i></span></span>';
/** The app's Accent glow switch. Off unless turned on, as in Settings.swift. */
const glow = () => { try { return !!settings.get('glow', false); } catch (e) { return false; } };
/** A name with single spaces, so it sits centred under its figure (tidy). */
const tidy = n => String(n || '').split(/\s+/).filter(Boolean).join(' ');
const rgbOf = h => { h = String(h).replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(','); };

// PartyView's springs and curves, as CSS variables on the view (see party.css).
const MOTION = {
  '--sp-tile': spring(0.45, 0.6),     // players popping into the waiting room
  '--sp-team': spring(0.45, 0.78),    // a seat moving team
  '--sp-ans': spring(0.36, 0.55),     // a face lighting up as it answers
  '--sp-board': spring(0.75, 0.8),    // the board's bars and numbers
  '--sp-order': spring(0.6, 0.8),     // the board's rows finding their places
  '--sp-pod': spring(0.6, 0.6),       // the podium rising
  '--sp-win': spring(0.5, 0.55),      // "You win!"
  '--sp-vs': spring(0.4, 0.6),        // the 1v1 seats and the VS
  '--sp-pts': spring(0.4, 0.55),      // the locked-in points
  '--sp-num': spring(0.2, 0.85),      // .snappy(duration: .2): the ring's seconds
  '--sp-dhead': spring(0.5, 0.6),     // 1v1 result: the verdict
  '--sp-dscore': spring(0.5, 0.78),   // 1v1 result: the two of you sliding in
  '--sp-dcard': spring(0.5, 0.85),    // 1v1 result: the round-by-round panel rising
  '--sp-drow': spring(0.4, 0.8),      // 1v1 result: round by round
};

// ---------- a small DOM patcher ----------
// SwiftUI animates what changes; a fresh innerHTML animates nothing. Within a
// screen the new markup is patched onto the old, so a class that flips runs
// its CSS transition, and only nodes that are really new run their entrance
// (they get .enter when they carry data-enter). Keyed children: data-k.
// data-keep: left alone (the per-frame parts). data-exit: fades out first.
function morph(root, html) {
  const t = document.createElement('template'); t.innerHTML = html;
  patchKids(root, t.content);
}
const isEl = n => n.nodeType === 1;
const keyOf = n => (isEl(n) ? n.getAttribute('data-k') : null);
const leaving = n => isEl(n) && n.classList.contains('leaving');
function patchKids(a, b) {
  const olds = [...a.childNodes].filter(n => !leaving(n)), news = [...b.childNodes];
  const keyed = new Map(); olds.forEach(n => { const k = keyOf(n); if (k != null) keyed.set(k, n); });
  const used = new Set(), out = [];
  let i = 0;
  for (const nb of news) {
    const k = keyOf(nb); let m = null;
    if (k != null) { m = keyed.get(k) || null; if (m && m.nodeName !== nb.nodeName) m = null; }
    else {
      while (i < olds.length && (used.has(olds[i]) || keyOf(olds[i]) != null)) i++;
      if (i < olds.length && olds[i].nodeType === nb.nodeType && olds[i].nodeName === nb.nodeName) m = olds[i++];
    }
    if (m) { used.add(m); patchNode(m, nb); out.push(m); } else { markEnter(nb); out.push(nb); }
  }
  for (const o of olds) if (!used.has(o)) {
    if (isEl(o) && o.hasAttribute('data-exit') && !still()) { o.classList.add('leaving'); const d = () => o.remove(); o.addEventListener('animationend', d, { once: true }); setTimeout(d, 1200); }
    else o.remove();
  }
  let cur = a.firstChild;
  for (const n of out) {
    while (cur && leaving(cur)) cur = cur.nextSibling;
    if (n === cur) cur = cur.nextSibling; else a.insertBefore(n, cur);
  }
}
function markEnter(n) {
  if (!isEl(n)) return;
  if (n.hasAttribute('data-enter')) n.classList.add('enter');
  n.querySelectorAll('[data-enter]').forEach(x => x.classList.add('enter'));
}
function patchNode(a, b) {
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  if (a.hasAttribute('data-keep')) return;
  const entering = a.classList.contains('enter');
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && !(name === 'class' && entering)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) {
    if (name === 'value' && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) continue;
    let v = value;
    if (name === 'class' && entering) v += ' enter';
    if (a.getAttribute(name) !== v) a.setAttribute(name, v);
  }
  if ('disabled' in a) a.disabled = b.hasAttribute('disabled');
  patchKids(a, b);
}
/** Rows that change place glide there (the FLIP trick), on the given spring. */
function flip(nodes, before, sp) {
  if (still()) return;
  for (const n of nodes) {
    const r0 = before.get(n.getAttribute('data-k')); if (!r0 || !n.isConnected) continue;
    const r1 = n.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    n.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: sp.ms, easing: sp.easing });
  }
}
const rects = nodes => new Map([...nodes].map(n => [n.getAttribute('data-k'), n.getBoundingClientRect()]));
/**
 * .contentTransition(.numericText()): the digits that change roll, the new one
 * in from below (from above when counting down), the old one out, each with a blur.
 */
function roll(el, to, sp, down = false) {
  const from = el.textContent; to = String(to);
  if (from === to) return;
  if (still() || !from) { el.textContent = to; return; }
  const n = Math.max(from.length, to.length), f = from.padStart(n, ' '), t = to.padStart(n, ' '), dir = down ? -1 : 1;
  el.textContent = '';
  for (let i = 0; i < n; i++) {
    if (t[i] === ' ' && f[i] === ' ') continue;
    const d = document.createElement('span'); d.className = 'dg'; d.textContent = t[i] === ' ' ? '' : t[i];
    el.append(d);
    if (f[i] === t[i]) continue;
    const o = { duration: sp.ms, easing: sp.easing };
    if (t[i] !== ' ') d.animate([{ transform: `translateY(${dir * 0.6}em)`, opacity: 0, filter: 'blur(4px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }], o);
    if (f[i] !== ' ') {
      const g = document.createElement('span'); g.className = 'dg old'; g.textContent = f[i]; d.append(g);
      g.animate([{ transform: 'none', opacity: 1, filter: 'blur(0)' }, { transform: `translateY(${-dir * 0.6}em)`, opacity: 0, filter: 'blur(4px)' }], { ...o, fill: 'forwards' }).onfinish = () => g.remove();
    }
  }
}

export function mountParty(ctx, opts = {}) {
  const { pool, player, sound, account } = ctx;
  // Localhost-only knobs, the iPhone's DEBUG launch flags (see README/report): ?demoParty, ?demoTeams, ?showHostSettings,
  // ?showSongsAlbum, ?demoPartyAlbum, ?showJoining, ?showDuel, ?demoDuelCountdown, ?demoDuelResult, ?demoRoomCountdown
  // (+ ?demoFirstRound), ?demoRoomRound, ?demoTeamRound, ?demoTeamResult, ?demoSoloResult, ?roomCode=XXXXX, ?autoStart,
  // ?demoError=<text>, ?demoConfirmEnd. ?demo=<name> works for each demo* knob too.
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const qs = new URLSearchParams(location.search);
  const knob = k => local && (qs.has(k) || (qs.get('demo') || '').toLowerCase() === k.toLowerCase().replace(/^demo/, ''));
  const staged = ['demoDuelResult', 'demoSoloResult', 'demoTeamResult', 'demoTeamRound', 'demoRoomCountdown', 'demoRoomRound', 'demoDuelCountdown', 'demoError'].find(knob) || null;
  const offline = knob('demoParty') || knob('demoTeams') || knob('showDuel') || knob('showJoining') || !!staged;
  const game = new PartyGame(pool, { loopback: offline, standIns: knob('demoParty') || knob('demoTeams') });
  if (local && qs.get('roomCode')) game.fixedCode = qs.get('roomCode');
  setNameHelpers({ myFace: () => C.myIndex(account) });
  // The raw wire, for anyone checking it from the console.
  const wire = (window.__partyWire = []);
  game.transport.tap = (dir, m) => { wire.push({ dir, t: Date.now(), m: JSON.parse(JSON.stringify(m)) }); if (wire.length > 400) wire.shift(); };
  window.__party = game;

  // PartyLaunch: .host, .enter(code), .challenge(friend), .join(code, from). isDuel only for the last two.
  let launch = opts.duel ? { kind: opts.duel.join ? 'join' : 'challenge', ...opts.duel }
    : opts.songbot ? { kind: 'challenge', name: 'Songbot', bot: true }
    : opts.join ? { kind: 'enter', code: normaliseCode(opts.join) }
    : opts.host ? { kind: 'host' } : null;
  if (!launch && (knob('showDuel') || knob('demoDuelResult') || knob('demoDuelCountdown'))) launch = { kind: 'challenge', name: 'Songbot', bot: true };
  if (!launch && knob('showJoining')) launch = { kind: 'enter', code: 'BCDFG' };
  // ?duelOpen: a 1v1 room of your own with nobody invited (for two local pages: the other opens it with ?duelJoin=CODE).
  if (!launch && knob('duelOpen')) launch = { kind: 'challenge', name: 'your friend', open: true };
  if (!launch && local && qs.get('duelJoin')) launch = { kind: 'join', join: normaliseCode(qs.get('duelJoin')), name: qs.get('duelFrom') || 'Host' };
  if (!launch) launch = { kind: 'host' };
  const isDuel = launch.kind === 'challenge' || launch.kind === 'join';
  // Premium doors, as StageView: hosting a room (.host) and Songbot's practice 1v1 (.songbot).
  if (!ctx.premium && !staged && !knob('showJoining') && !(local && qs.get('duelJoin'))) {
    if (launch.kind === 'host') { ctx.openPremium('host'); return null; }
    if (launch.kind === 'challenge' && launch.bot) { ctx.openPremium('songbot'); return null; }
  }

  const view = el(`<div class="view party" role="dialog" aria-label="Party"><div class="screen pt"></div></div>`);
  const scr = view.querySelector('.pt');
  let codeEntry = launch.kind === 'enter' || launch.kind === 'join' ? normaliseCode(launch.code || launch.join) : '';
  let key = '', raf = 0, closed = false;
  // the live round (PartyView @State)
  let clip = { round: -1, started: false, error: null };
  let roundMuted = false, heldBySlip = false, wentAwayAt = null, sharing = false;
  let countN = -1, secsShown = -1, connectStarted = Date.now();
  let scoresBefore = {}, revealed = false, podiumUp = false, podiumTimers = [], introIn = false;
  let settingsSheet = null, songsSheet = null, kickMenu = null, confirmSheet = null, pressTimer = 0, pressAt = null;
  let recordedGame = !!staged;
  let challengeNote = null, challengeID = null;
  const shazam = new ShazamWatch();
  // The album wall: one of its ten cover sets, picked each time the room opens, from the room's genre or artist.
  const wallPreset = CoverWall.randomPreset();
  view.style.cssText = Object.entries(MOTION).map(([k, v]) => `${k}:${v.css}`).join(';');
  // SeasonBackdrop behind everything.
  let backdrop = null;
  try { backdrop = mountBackdrop(view); if (backdrop?.node) { backdrop.node.classList.add('pbackdrop'); view.prepend(backdrop.node); } } catch (e) {}

  const tier = () => (['countdown', 'playing', 'result'].includes(game.phase) ? game.tier(game.round) : 'easy');
  const accent = () => TIER_COLOR[tier()];
  const ink = () => TIER_INK[tier()];
  const myColor = () => hueColor(game.me?.hue ?? 0);
  const name = () => (account.name || '').trim();
  const me = () => game.players.find(p => p.id === game.myID) || null;
  const other = () => game.players.find(p => p.id !== game.myID) || null;
  const finalOther = () => game.finalPlayers.find(p => p.id !== game.myID) || null;
  /** A player's character: their PartyPlayer.face, then their avatar, then their id's (DefaultAvatar.index(of:)); mine as I chose it. */
  const faceIndex = p => (p && p.id === game.myID ? C.myIndex(account) : C.indexOfPlayer(p || {}));
  const myChoice = () => C.parseChoice(account.avatar);
  const variantFor = (p, pose) => (p && p.id === game.myID ? C.variantOf(myChoice(), pose) : 1);
  /** CartoonFace in a circle (PartyView.playerAvatar). tint: a team game's thin ring inside (PartyFace). */
  const pav = (p, size, tint = null) => C.faceHTML(faceIndex(p), p?.id || '', size, { variant: variantFor(p, 'portrait'), cls: 'pface' + (tint ? ' tinted' : ''), style: tint ? `--tint:${tint};--tw:${Math.max(1.5, size * 0.06).toFixed(2)}px` : '' });
  const strip = () => { const ps = game.sortedByHue; return ps.length <= STRIP_MAX ? ps : ps.slice(0, STRIP_MAX - 1); };
  const overflow = (shown, size) => { const n = game.players.length; return n > shown ? `<span class="pover" style="width:${size}px;height:${size}px;font-size:${(size * 0.34).toFixed(1)}px">+${n - shown}</span>` : ''; };
  const duelName = n => (isDuel ? firstName(n) : n);
  /** The other player's first name: a 1v1 has two names side by side and full ones don't fit. */
  const duelOpponentName = () => { const o = other(); if (o) return firstName(o.name); if (launch.name) return firstName(launch.name); return 'your friend'; };
  const xbtn = () => `<button class="xbtn" data-press data-act="close" aria-label="Close">${sf('xmark')}</button>`;
  const bar = title => `<div class="pbar"><h1>${esc(title)}</h1><div class="sp"></div>${xbtn()}</div>`;
  const tierPill = () => `<span class="ptier ${glow() ? 'glow' : ''}" style="--pf:${PILL_FILL[tier()]};background:${PILL_FILL[tier()]};color:${PILL_INK}">${cap(tier())}</span>`;
  const roundHead = withClose => `<div class="pthead"><div class="rnd"><small>ROUND</small><div><b class="mono">${game.round + 1}</b><span class="mono">/ ${game.settings.rounds}</span></div></div><div class="sp"></div>${tierPill()}${withClose ? `<button class="xbtn sm" data-press data-act="close" aria-label="Leave">${sf('xmark')}</button>` : ''}</div>`;
  /** The Songs row's icon: an album, an artist, or the pool. */
  const songsIcon = () => (game.isAlbum ? 'ui-icon-album' : game.settings.artist == null ? 'ui-icon-songs' : 'ui-icon-artist');
  const difficultyLabel = d => (d === 'mixed' ? 'Easy → Impossible' : cap(d));
  const teamLabelText = mode => (TEAM_MODES.find(([k]) => k === mode) || [null, 'Teams'])[1];
  /** A plain mark for a waiting-room panel's corner: one white glyph on a soft disc. */
  const panelGlyph = svg => `<span class="pglyph" aria-hidden="true">${svg}</span>`;

  // ---------- screens ----------
  /** Opening or joining a room: what is happening in one line and the seconds counting beside an equaliser. No avatar. */
  function connecting() {
    const title = isDuel ? 'Setting up your 1v1' : game.isHost ? 'Opening your room' : 'Joining the party';
    const c = normaliseCode(codeEntry);
    const sub = isDuel ? `with ${duelOpponentName()}` : game.isHost ? 'Getting a code for your friends' : c ? `Room ${c}` : 'Connecting';
    return `${bar(isDuel ? '1v1' : 'Party')}
      <div class="flex"></div>
      <h2 class="pconn-t">${esc(title)}</h2>
      <p class="pconn-s ${sub.startsWith('Room') ? 'mono' : ''}" style="color:${accent()}">${esc(sub)}</p>
      <div class="pconn-clock"><span class="eqw on" style="color:${accent()}">${eq()}</span><b class="mono el" data-keep>${elapsedText()}</b></div>
      <div class="flex"></div>
      <button class="pcancel" data-press data-act="cancel">Cancel</button>`;
  }
  const elapsedText = () => { const s = Math.max(0, Math.floor((Date.now() - connectStarted) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  /** A line across the top of a room — who is in, who you're waiting on — green once it's on, slate while waiting. */
  const roomBanner = (text, icon, live) => `<div class="pbanner ${live ? 'live' : 'wait'}" data-k="banner"><i>${icon}</i><span>${esc(text)}</span></div>`;

  function codeBlock() {
    const ink = K.PanelColours.green[2];
    return `<div${K.dressAttr(K.PanelColours.green, { cls: 'k-subtle-self ppanel pcodeblock' })}>
      <div class="phead"><div class="pht"><b>ROOM CODE</b><small>Friends join from the Party tab</small></div>${panelGlyph(I.hash)}</div>
      <div class="big mono">${esc(game.code)}</div>
      <button class="pwhite" data-press data-act="share" style="color:${ink}">${sf('square.and.arrow.up')}<span>SHARE THE CODE</span></button></div>`;
  }
  function playersHeader() {
    const n = game.players.length, ink = K.PanelColours.pink[2];
    const right = game.isHost && game.teamsOn
      ? `<button class="pwhite sm" data-press data-act="shuffle" style="color:${ink}">${SHUFFLE}<span>SHUFFLE</span></button>`
      : panelGlyph(sf('person.2.fill'));
    return `<div class="phead"><div class="pht"><b class="mono-num">${n} ${n === 1 ? 'PLAYER' : 'PLAYERS'}</b><small>${esc(game.teamsOn ? teamLabelText(game.settings.teams) : `Up to ${MAX_PLAYERS} can join`)}</small></div>${right}</div>
      ${game.isHost && game.teamsOn ? '<p class="phint">Tap a player to switch team. Hold for more.</p>' : ''}`;
  }
  function playerTile(p) {
    const meP = p.id === game.myID, team = game.teamsOn;
    const c = team ? teamColor(p.team ?? 0) : hueColor(p.hue);
    // The host holds a player down (or right-clicks them) for the menu: the teams to move to, and Kick.
    const menu = game.isHost && (!meP || team) ? ` data-kick="${esc(p.id)}"` : '';
    return `<div class="ptile${team && game.isHost ? ' mv' : ''}" data-k="${esc(p.id)}"${menu} data-enter data-exit><span class="ring" style="--rc:${c};--rw:${meP ? 3 : 2}px">${pav(p, 60, team ? c : null)}${p.isHost ? `<i class="crownb">${sf('crown.fill')}</i>` : ''}</span>
      <b class="${meP ? 'me' : ''}">${esc(p.name)}</b><small>${meP ? 'you' : p.isHost ? 'host' : '&nbsp;'}</small></div>`;
  }
  const emptySeat = i => `<div class="ptile seat" data-k="seat-${i}" data-enter data-exit><span class="dash">${PLUS}</span><b>waiting</b>${dots('rgba(255,255,255,.6)')}</div>`;
  const openSeat = c => `<div class="ptile open"><span class="dash" style="--oc:${c}">${PLUS}</span><b>Open seat</b><small>&nbsp;</small></div>`;
  function teamSections() {
    return `<div class="pteams">${lobbyTeams(game.players, game.settings.teams).map(t => {
      const c = teamColor(t.team);
      return `<div class="pteam" data-k="team-${t.team}" style="--tc:${c};--tcrgb:${rgbOf(c)}">
        <div class="th"><b>${esc(teamName(t.team).toUpperCase())}</b><div class="sp"></div><span class="cnt">${t.members.length === 1 ? '1 player' : `${t.members.length} players`}</span></div>
        <div class="pgrid">${t.members.map(playerTile).join('')}${t.members.length ? '' : openSeat(c)}</div></div>`;
    }).join('')}</div>`;
  }
  function settingsSummary(editable) {
    const s = game.settings;
    const rows = [[songsIcon(), 'Songs', game.songsLabel]];
    if (game.teamsOn) rows.push(['ui-icon-teams', 'Teams', teamLabelText(s.teams)]);
    rows.push(['ui-icon-rounds', 'Rounds', String(s.rounds)], ['ui-icon-difficulty', 'Difficulty', difficultyLabel(s.difficulty)],
      ['ui-icon-time', 'Time per song', `${Math.round(s.guessWindow)}s`], ['ui-icon-years', 'Years', s.era === 'all' ? 'Any' : `The ${s.era}`],
      ['ui-icon-antishazam', 'Anti-Shazam', game.antiShazam ? 'On' : 'Off']);
    const ink = K.PanelColours.purple[2];
    const tag = editable ? 'button' : 'div';
    return `<${tag}${K.dressAttr(K.PanelColours.purple, { cls: 'k-subtle-self ppanel psum' })}${editable ? ' data-press data-scale="0.98" data-act="settings"' : ''}>
      <div class="phead"><div class="pht"><b>GAME SETTINGS</b></div>${editable ? `<span class="pwhite xs" style="color:${ink}">EDIT${sf('chevron.right')}</span>` : ''}</div>
      ${K.group(rows.map(([icon, label, value]) => `<div class="srow">${K.iconTile(icon, { size: 28 })}<span class="l">${esc(label)}</span><span class="sp"></span><b class="v">${esc(value)}</b></div>`))}</${tag}>`;
  }
  function startButton() {
    const ready = game.canStart && !game.preparingSongs;
    const title = game.preparingSongs ? 'Getting the songs ready…'
      : game.canStart ? (isDuel ? 'Start the 1v1' : 'Start the party') : (isDuel ? `Waiting for ${duelOpponentName()}` : 'Waiting for players');
    return `<div class="pstartbox">${game.startNote && !game.preparingSongs ? `<p class="pnote-start">${esc(game.startNote)}</p>` : ''}
      <button class="pstart ${ready ? 'on' : ''}" data-press data-act="start" ${!game.canStart || game.preparingSongs ? 'disabled' : ''}>${game.preparingSongs ? '<i class="spin"></i>' : ''}<span>${esc(title.toUpperCase())}</span></button></div>`;
  }
  const waitingLine = () => { const h = game.players.find(p => p.isHost); return `<div class="pwait">${dots('var(--muted)')}<span>Waiting for ${esc(h ? duelName(h.name) : 'the host')} to start</span></div>`; };

  function lobby() {
    const n = game.players.length, empty = n < MAX_PLAYERS ? Math.max(1, 4 - n) : 0;
    const seats = game.teamsOn ? teamSections() : `<div class="pgrid">${game.players.map(playerTile).join('')}${Array.from({ length: empty }, (_, i) => emptySeat(i)).join('')}</div>`;
    return `${bar('Waiting room')}
      <div class="pscroll"><div class="plob">
        ${challengeNote ? roomBanner(challengeNote, sf('bolt.fill'), true) : ''}
        ${codeBlock()}
        <div${K.dressAttr(K.PanelColours.pink, { cls: 'k-subtle-self ppanel pplayers' })}>${playersHeader()}${seats}</div>
        ${settingsSummary(game.isHost)}
      </div></div>
      ${game.isHost ? startButton() : waitingLine()}`;
  }

  /** One side of the 1v1: the player full-body in their fight stance on a pool of their colour, name, and a tag. */
  function duelSeat(p, fallback, mirrored) {
    const c = hueColor(p?.hue ?? 0), bot = !!p?.id?.startsWith('bot-'), mine = p?.id === game.myID;
    const idx = p ? faceIndex(p) : C.myIndex(account);
    const tag = mine ? 'YOU' : p?.isHost ? 'HOST' : bot ? 'BOT' : 'FRIEND';
    return `<div class="dseat${mirrored ? ' mirror' : ''}" data-k="seat-${esc(p?.id || 'me')}" ${!mine ? 'data-enter' : ''}>
      <div class="fig">${C.figureHTML(idx, 'fight', { height: 188, variant: mine ? C.variantOf(myChoice(), 'fight') : 1, floor: c, calm: true })}</div>
      <b>${esc(firstName(p?.name || fallback))}</b><span class="tag" style="background:${c}">${tag}</span></div>`;
  }
  function botLevelPicker() {
    return `<div class="pbotlvl"><small>SONGBOT LEVEL</small><div class="row">${BOT_LEVELS.map(l => {
      const on = game.botLevel === l.key, c = PILL_FILL[l.tier];
      return `<button data-press data-act="botlevel" data-v="${l.key}" class="${on ? 'on' : ''} ${on && glow() ? 'glow' : ''}" aria-pressed="${on}" aria-label="Songbot level ${l.title}" style="--c:${c};${on ? `background:${c};color:${PILL_INK}` : `background:${mix('#0d0d0d', c, 0.13)};color:${c}`}">${l.title}</button>`;
    }).join('')}</div></div>`;
  }
  /** The 1v1 room: the two of you face to face, the host's settings under you, one button. No code, no grid. */
  function duelLobby() {
    const meP = me(), o = other();
    const note = challengeNote ? roomBanner(o ? `${firstName(o.name)} is in. ${game.isHost ? 'Pick the settings and start.' : ''}`.trim() : challengeNote, o ? sf('bolt.fill') : sf('hourglass'), !!o) : '';
    const waitingSeat = `<div class="dseat empty" data-k="seat-empty"><div class="fig"><span class="dash">${dots('rgba(255,255,255,.6)')}</span></div><b>${esc(duelOpponentName())}</b><span class="tag inv">INVITED</span></div>`;
    return `${bar('1v1')}
      <div class="pscroll"><div class="plob duel">
        ${note}
        <div class="pduel ${o ? 'met' : ''}"><div class="seats">${duelSeat(meP, name() || 'You', false)}${o ? duelSeat(o, o.name, true) : waitingSeat}</div><b class="vs" aria-hidden="true">VS</b></div>
        ${game.isHost && o?.id?.startsWith('bot-') ? botLevelPicker() : ''}
        <div class="pduelsum">${settingsSummary(game.isHost)}</div>
      </div></div>
      ${game.isHost ? startButton() : waitingLine()}`;
  }

  /** One of the game's terms on the first count: its settings icon and value. */
  const termChip = (icon, text, shrink = false) => `<span class="pterm${shrink ? ' shrink' : ''}">${K.iconTile(icon, { size: 22 })}<span data-fit="0.75">${esc(text)}</span></span>`;
  /**
   * Its own screen between rounds: the round slams in on a band of its colour, the count pops each second, and the
   * room stands along the bottom: a 1v1 as two names with their scores, a bigger room as faces with the leader crowned.
   */
  function countdown() {
    const n = game.round + 1;
    let terms = '';
    if (!isDuel && game.round === 0) terms = termChip('ui-icon-rounds', `${game.settings.rounds} rounds`) + termChip('ui-icon-time', `${Math.round(game.settings.guessWindow)}s a song`) + termChip(songsIcon(), game.songsLabel, true);
    let bottom;
    if (game.teamsOn) bottom = teamLine();
    else if (game.players.length === 2) bottom = duelLineup();
    else bottom = faceStrip();
    return `${K.stageLight(accent())}${roundHead(false)}<div class="flex"></div>
      <div class="pbanner-wrap">${K.roundBanner({ title: n === game.settings.rounds ? 'FINAL' : `ROUND ${n}`, tier: tier(), subtitle: tier().toUpperCase(), shown: introIn, key: 'band-' + game.round })}</div>
      <div class="flex"></div>
      <div class="pcountbox" data-keep>${K.countRing({ number: Math.max(0, countN), accent: accent() })}</div>
      <div class="pterms ${introIn ? 'in' : ''}">${terms}</div>
      <div class="flex"></div>
      <div class="pcbottom ${game.players.length === 2 && !game.teamsOn ? 'duo' : ''}">${bottom}</div>`;
  }
  /** Whoever is ahead once a round has been scored. */
  const leader = () => { const top = game.players.reduce((a, p) => (!a || p.score > a.score ? p : a), null); return top && top.score > 0 ? top : null; };
  function faceStrip() {
    const size = game.players.length > 6 ? 28 : 38, shown = strip(), crowned = game.round > 0 ? leader()?.id : null;
    return `<div class="pstrip" style="gap:${game.players.length > 6 ? 6 : 10}px">${shown.map(p => `<span class="pfs" style="--rc:${hueColor(p.hue)}">${pav(p, size)}${p.id === crowned ? `<i class="crown">${sf('crown.fill')}</i>` : ''}</span>`).join('')}${overflow(shown.length, size)}</div>`;
  }
  /** A 1v1 between rounds: both first names over the score so far, me on the left. No characters: the count is the point. */
  function duelLineup() {
    const seat = p => `<div class="iseat"><b>${esc(firstName(p.name))}</b><span class="mono" style="color:${hueColor(p.hue)}">${p.score}</span></div>`;
    const m = me(), o = other();
    return `<div class="pduo">${m ? seat(m) : ''}<b class="vs">VS</b>${o ? seat(o) : ''}</div>`;
  }
  /** The teams as they stand, in one line under the count. */
  function teamLine() {
    const st = teamStandings(game.players, game.settings.teams).slice(0, 4), mine = game.myTeam;
    return `<div class="pteamline">${mine != null ? `<p style="color:${teamColor(mine)}">You're on ${esc(teamName(mine))}</p>` : ''}
      <div>${st.map(t => `<span><i style="background:${t.color}"></i><b>${esc(t.name)}</b><em class="mono">${t.score}</em></span>`).join('')}</div></div>`;
  }

  function playing() {
    const n = game.players.length, size = n > 6 ? 26 : 34, shown = strip();
    const answered = shown.map(p => {
      const done = game.answered.includes(p.id), c = hueColor(p.hue);
      return `<span class="pans ${done ? 'done' : ''}" data-k="${esc(p.id)}" style="--rc:${c}">${pav(p, size)}${done ? `<i class="ck" data-enter style="--c:${c}">${I.checkCircle}</i>` : ''}</span>`;
    }).join('');
    let bottom;
    if (game.currentChoices.length) {
      const capT = game.myPick == null ? 'One tap · wrong loses the round' : game.answered.length < n ? 'Locked in · waiting for the others' : "Everyone's in!";
      // A friend's 1v1 says nothing here until you have answered.
      bottom = `<div class="pchoices"><div class="pcap ${isDuel && game.myPick == null ? 'hid' : ''}">${K.capsLine(capT, game.myPick == null ? '#a8a8a8' : myColor())}</div>${choiceGrid(game.currentChoices, { picked: game.myPick })}</div>`;
    } else if (game.iAnswered) {
      bottom = `<div class="plocked" style="--mc:${myColor()}"><span class="ic">${sf('checkmark')}</span>
        <span class="tx"><b>Locked in</b><small>${game.answered.length < n ? 'Waiting for the others…' : "Everyone's in!"}</small></span>
        ${game.myPoints != null ? `<b class="pts mono" data-enter>+${game.myPoints}</b>` : ''}</div>`;
    } else {
      bottom = `<div class="pguess"><div class="hits"></div><div class="row"><input class="gin" placeholder="Name that track" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"><button class="gbtn" data-press data-act="guess" style="background:${accent()};color:${ink()}">Guess</button></div></div>`;
    }
    return `<div class="pstagelight">${K.stageLight(accent())}</div>${roundHead(true)}<div class="flex"></div>
      <button class="pring ${glow() ? 'glow' : ''}" data-act="replay" aria-label="Replay the clip" data-keep style="--a:${accent()};--argb:${rgbOf(accent())}">
        <i class="back"></i>
        <svg viewBox="0 0 196 196"><circle cx="98" cy="98" r="98" class="disc"/><circle cx="98" cy="98" r="${RING_R}" class="trk"/><circle cx="98" cy="98" r="${RING_R}" class="arc" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="0" transform="rotate(-90 98 98)"/></svg>
        <span class="in"><span class="eqw">${eq()}</span><b class="secs"></b><small class="lbl"></small></span>
      </button>
      <div class="pstrip answered" style="gap:${n > 6 ? 6 : 10}px">${answered}${overflow(shown.length, size)}</div>
      <div class="flex"></div>
      ${bottom}
      ${game.isHost ? `<button class="pskip" data-press data-act="skip">${FORWARD_END}<span>Skip this one</span></button>` : ''}`;
  }

  /** The round result in a team game: each team as a card, the bars growing from last round's to this round's. */
  function teamBoard() {
    const gained = game.lastGained, mode = game.settings.teams, mt = game.myTeam;
    const now = teamStandings(game.players, mode, gained);
    const old = new Map(teamStandings(game.players.map(p => ({ ...p, score: scoresBefore[p.id] || 0 })), mode).map(t => [t.id, t.score]));
    const top = Math.max(1, now[0]?.score || 1), cut = 5;
    const visible = now.slice(0, cut).map((t, i) => [i, t]);
    const mi = now.findIndex(t => t.id === mt); if (mi >= cut) visible.push([mi, now[mi]]);
    const rows = visible.map(([i, t]) => {
      const shown = revealed ? t.score : (old.get(t.id) || 0), mine = t.id === mt, lead = i === 0 && now.length > 1 && t.score > 0;
      return `<div class="tcard ${mine ? 'mine' : ''}" data-k="t${t.id}" style="--tc:${t.color};--tcrgb:${rgbOf(t.color)}">
        <span class="place ${i === 0 ? 'first' : ''}">${lead ? sf('crown.fill') : i + 1}</span>
        <div class="mid"><div class="top"><b>${esc(t.name.toUpperCase())}</b>${mine ? '<small class="you">YOU</small>' : ''}<div class="sp"></div>${faceStack(t.members, 22, 4)}</div>
        <div class="bot"><div class="trackbar"><i style="width:max(8px, ${(100 * shown / top).toFixed(2)}%)"></i></div>${t.gained > 0 && revealed ? `<span class="gain mono" data-k="gain">+${t.gained}</span>` : ''}<span class="sc" data-k="sc" data-keep data-to="${t.score}">${shown}</span></div></div></div>`;
    }).join('');
    return `<div class="pboard teams ${revealed ? 'rev' : ''}"><small class="cap">TEAMS</small>${rows}<small class="note">Team score is the average of its players</small></div>`;
  }
  /** Faces overlapping left to right, each cut out of the page, with a count for the rest (FaceStack). */
  const faceStack = (ps, size = 22, limit = 5) => {
    const shown = ps.slice(0, limit);
    return `<span class="fstack" style="--s:${size}px">${shown.map(p => pav(p, size, p.team != null ? teamColor(p.team) : null)).join('')}${ps.length > shown.length ? `<span class="fmore mono" style="width:${size}px;height:${size}px;font-size:${(size * 0.38).toFixed(1)}px">+${ps.length - shown.length}</span>` : ''}</span>`;
  };

  function result() {
    const a = game.lastAnswer, pts = game.lastGained[game.myID] || 0;
    const ranked = game.sortedPlayers, top = Math.max(1, ...ranked.map(p => p.score)), cut = 5;
    const visible = ranked.slice(0, cut).map((p, i) => [i, p]);
    const mi = ranked.findIndex(p => p.id === game.myID); if (mi >= cut) visible.push([mi, ranked[mi]]);
    const rows = visible.map(([i, p]) => {
      const shown = revealed ? p.score : (scoresBefore[p.id] || 0), gained = game.lastGained[p.id] || 0, c = hueColor(p.hue);
      return `<div class="sbrow" data-k="${esc(p.id)}"><span class="rk mono" style="color:${i === 0 ? 'var(--medium)' : 'var(--dim)'}">${i + 1}</span>${pav(p, 30)}
        <div class="mid"><div class="top"><b class="${p.id === game.myID ? 'me' : ''}">${esc(duelName(p.name))}</b><div class="sp"></div>${gained > 0 && revealed ? `<span class="gain mono" data-k="gain" style="color:${c}">+${gained}</span>` : ''}<span class="sc mono" data-k="sc" data-keep data-to="${p.score}">${shown}</span></div>
        <div class="trackbar"><i style="background:${c};width:max(6px, ${(100 * shown / top).toFixed(2)}%)"></i></div></div></div>`;
    }).join('');
    const last = game.round + 1 >= game.settings.rounds;
    const vc = pts > 0 ? myColor() : 'var(--muted)';
    const showArt = settings.get('artwork', true) !== false;
    return `<div class="pthead"><small class="rof">ROUND ${game.round + 1} OF ${game.settings.rounds}</small><div class="sp"></div><button class="xbtn sm" data-press data-act="close" aria-label="Leave">${sf('xmark')}</button></div>
      ${a ? `<div class="phero">${showArt && a.artwork ? `<span class="cov">${glow() ? `<img class="bloom" src="${esc(art(a.artwork, 300))}" alt="">` : ''}<img class="art" src="${esc(art(a.artwork, 300))}" alt=""></span>` : ''}
        <span class="tx"><small style="color:${accent()}">IT WAS_</small><b>${esc(a.title)}</b><span>${esc(a.artist)}</span></span></div>` : ''}
      <div class="pverdict" style="color:${vc};background:${pts > 0 ? `rgba(${rgbOf(myColor())},.12)` : 'rgba(168,168,168,.12)'}"><i>${pts > 0 ? sf('bolt.fill') : sf('xmark')}</i><span>${pts > 0 ? 'You scored' : game.wrong.has(game.myID) ? 'Wrong answer' : 'Missed it'}</span><div class="sp"></div><b class="mono">+${pts}</b></div>
      ${game.teamsOn ? teamBoard() : `<div class="pboard ${revealed ? 'rev' : ''}">${rows}${ranked.length > cut + (visible.length > cut ? 1 : 0) ? `<small class="more">+${ranked.length - visible.length} more</small>` : ''}</div>`}
      <div class="flex"></div>
      ${game.isHost ? `<button class="pnext" data-press data-act="next" style="background:${accent()};color:${ink()}">${last ? 'See the podium' : 'Next round'}</button>`
        : `<div class="pwait h54">${dots('var(--muted)')}<span>Waiting for the host</span></div>`}`;
  }

  /** The top three standing on their blocks: the winner jumping for joy on the tallest, second and third dancing. */
  function podium(ranked) {
    const order = [1, 0, 2].filter(i => i < ranked.length), heights = [138, 108, 88], figures = [150, 120, 112], delays = [0.55, 0.3, 0.75];
    return `<div class="podium ${podiumUp ? 'up' : ''}">${order.map(i => {
      const p = ranked[i], c = hueColor(p.hue), first = p.score === ranked[0].score && p.score > 0, pose = first ? 'win' : 'dance';
      return `<div class="pod" style="--d:${delays[i]}s;--h:${heights[i]}px;--fh:${figures[i]}px;--c:${c};--crgb:${rgbOf(c)};--top:${mix(c, '#ffffff', 0.22)};--bot:${mix(c, '#000000', 0.4)}">
        <div class="fig">${C.figureHTML(faceIndex(p), pose, { height: figures[i], variant: variantFor(p, pose), calm: true })}${first ? `<i class="crown">${sf('crown.fill')}</i>` : ''}</div>
        <div class="blk"><span class="pl">${i + 1}</span><b data-fit="0.7">${esc(p.name)}</b><span class="mono">${p.score}</span></div></div>`;
    }).join('')}</div>`;
  }
  function soloFinal(ranked) {
    const tied = ranked.length > 1 && ranked[0].score > 0 && ranked[1].score === ranked[0].score;
    const title = (ranked[0]?.score || 0) === 0 ? 'No one scored' : tied ? "It's a tie!" : ranked[0] ? (ranked[0].id === game.myID ? 'You win!' : `${ranked[0].name} wins!`) : 'Game over';
    const mc = myColor();
    const rest = ranked.slice(3, 10).map((p, i) => { const mine = p.id === game.myID;
      return `<div class="restrow ${mine ? 'mine' : ''}" style="--i:${i};--mc:${mc};--mcrgb:${rgbOf(mc)}"><span class="rk">${i + 4}</span>${pav(p, 30)}<b>${esc(tidy(p.name))}</b><div class="sp"></div><span class="mono">${p.score}</span></div>`; }).join('');
    const place = ranked.findIndex(p => p.id === game.myID);
    return `<h2 class="pwin ${podiumUp ? 'up' : ''}">${esc(title)}</h2>${podium(ranked)}
      ${ranked.length > 3 ? `<div class="rest ${podiumUp ? 'up' : ''}">${rest}</div>` : ''}
      ${place >= 10 ? `<div class="pplace" style="color:${mc};background:rgba(${rgbOf(mc)},.12)">You came ${ordinal(place + 1)} of ${ranked.length} · ${ranked[place].score} points</div>` : ''}`;
  }
  function finished() {
    const ranked = game.finalPlayers.length ? game.finalPlayers : game.sortedPlayers;
    const body = game.teamsOn ? `<div class="pfinal teams">${teamFinal(ranked)}</div><div class="flex"></div>`
      : `<div class="pscroll fade"><div class="pfinal">${soloFinal(ranked)}</div></div>`;
    return `${bar('Results')}${body}
      ${game.isHost ? K.glossy({ title: 'Play again', key: 'again', attrs: 'data-act="again"' }) : ''}
      <button class="pleave" data-act="close">Leave the party</button>`;
  }
  /** A team game's final: the winning team named, the teams on a podium with their players on top, MVP and your place. */
  function teamFinal(players) {
    const ranked = teamStandings(players, game.settings.teams), meP = players.find(p => p.id === game.myID);
    const winners = ranked.filter(t => t.score === ranked[0]?.score);
    const title = !ranked.length ? 'Game over' : winners.length > 1 ? "It's a tie!" : ranked[0].id === meP?.team ? 'Your team wins!' : `Team ${ranked[0].name} wins!`;
    const top = ranked.slice(0, 3), order = top.length === 2 ? [0, 1] : [1, 0, 2].filter(i => i < top.length);
    const heights = [124, 88, 64], delays = [0.3, 0.55, 0.75];
    const pod = order.map(i => { const t = top[i];
      return `<div class="tpod" style="--d:${delays[i]}s;--h:${heights[i]}px;--c:${t.color}">${faceStack(t.members, i === 0 ? 30 : 24, 3)}<b>${esc(t.name)}</b><span class="sc mono">${t.score}</span>
        <div class="blk" style="opacity:${i === 0 ? 0.9 : 0.62}"></div><span class="pl">${i + 1}</span></div>`; }).join('');
    const sorted = players.slice().sort((a, b) => (a.score === b.score ? a.hue - b.hue : b.score - a.score)), mvp = sorted[0], place = sorted.findIndex(p => p.id === game.myID);
    const tl = (t, size) => `<span class="tlabel" style="--t:${teamColor(t)};font-size:${size}px"><i style="height:${size + 3}px"></i>${esc(teamName(t).toUpperCase())}</span>`;
    const row = (rank, label, detail, value) => `<div class="rrow"><small class="mono">${rank}</small>${label}<div class="sp"></div>${detail}<span class="mono v">${value}</span></div>`;
    const rows = ranked.slice(3, 5).map((t, i) => row(i + 4, tl(t.id, 10.5), faceStack(t.members, 18, 4), t.score)).join('')
      + (mvp ? row('MVP', `<span class="mvp">${pav(mvp, 20, mvp.team != null ? teamColor(mvp.team) : null)}<b>${esc(mvp.name)}</b></span>`, mvp.team != null ? tl(mvp.team, 9) : '', mvp.score) : '')
      + (meP && place >= 0 && sorted[0]?.id !== game.myID ? row('YOU', `<b>${ordinal(place + 1)} of ${sorted.length}</b>`, '', meP.score) : '');
    return `<div class="twin ${podiumUp ? 'up' : ''}">${ranked.length && winners.length === 1 ? tl(ranked[0].id, 11) : ''}<h2 class="pwin up">${esc(title)}</h2></div>
      <div class="tpodium ${podiumUp ? 'up' : ''}">${pod}</div>
      <div class="treceipt ${podiumUp ? 'up' : ''}">${rows}<i class="hr"></i></div>`;
  }

  /** A friend's 1v1 ends like ranked: the verdict, the two of you as figures with your scores, round by round, a rematch. */
  function duelFinished() {
    const meP = game.finalPlayers.find(p => p.id === game.myID) || me(), o = finalOther() || other();
    const mine = meP?.score || 0, theirs = o?.score || 0, won = mine > theirs, drew = mine === theirs;
    const unplayed = !game.history.length && mine === 0 && theirs === 0;
    const them = firstName(o?.name || 'They');
    const verdict = unplayed ? 'Ended early' : drew ? 'Draw' : won ? 'Victory' : 'Defeat';
    const sub = unplayed ? 'No rounds were played' : won ? `${them} couldn't keep up` : drew ? 'Dead level' : `${them} took it this time`;
    const score = (p, sc, winner, loser, mirrored) => {
      const c = hueColor(p?.hue ?? 0), idx = p ? faceIndex(p) : C.myIndex(account);
      const slump = loser && C.hasPose(idx, 'lose'), pose = winner ? 'win' : slump ? 'lose' : 'fight';
      return `<div class="dsc ${mirrored ? 'r' : 'l'} ${winner ? 'win' : ''} ${loser ? 'lose' : ''} ${loser && !slump ? 'grey' : ''} ${mirrored && !winner ? 'mirror' : ''}">
        <div class="fig" style="height:${winner ? 206 : 170}px">${C.figureHTML(idx, pose, { height: (winner ? 206 : 170) - 12, variant: variantFor(p, pose), floor: winner ? c : '#000000', calm: true })}</div>
        <b>${esc(firstName(p?.name || '—'))}</b><span class="n mono" style="${winner ? `color:${c}` : ''}">${sc}</span></div>`;
    };
    const cell = (pts, took, c) => `<span class="dcell"><span class="${took ? 'took' : ''}" style="${took ? `background:${c}` : ''}">${pts > 0 ? `<b class="mono">${pts}</b>` : pts === 0 ? `<i>${sf('xmark')}</i>` : '<em>—</em>'}</span></span>`;
    const coverOf = r => { if (r.artwork) return art(r.artwork, 120); const s = pool.songs.find(x => x.title === r.title && x.artist === r.artist); return s?.artwork ? art(s.artwork, 120) : ''; };
    const mc = hueColor(meP?.hue ?? 0), oc = hueColor(o?.hue ?? 1);
    const rows = game.history.map((r, k) => {
      const a = meP ? r.gained[meP.id] : undefined, b = o ? r.gained[o.id] : undefined, cv = coverOf(r);
      return `<div class="drow" style="--d:${(0.8 + k * 0.09).toFixed(2)}s">${cv ? `<img src="${esc(cv)}" alt="">` : '<span class="ph"></span>'}
        <span class="t"><b>${esc(r.title)}</b><small>${esc(r.artist)}</small></span>${cell(a, (a || 0) > (b || 0), mc)}${cell(b, (b || 0) > (a || 0), oc)}</div>`;
    });
    return `${bar('1v1')}
      <div class="pscroll fade28 dres ${podiumUp ? 'up' : ''}">
        <div class="dverdict"><h2 style="${won ? 'color:var(--easy)' : ''}">${esc(verdict)}</h2><p>${esc(sub)}</p></div>
        <div class="dscores">${score(meP, mine, won, !won && !drew, false)}${score(o, theirs, !won && !drew, won, true)}</div>
        ${game.history.length ? `<div${K.dressAttr(K.PanelColours.blue, { cls: 'k-subtle-self ppanel drounds' })}><div class="phead"><div class="pht"><b class="sm" data-fit="0.7">ROUND BY ROUND</b></div>${meP ? `<span class="c">${pav(meP, 24)}</span>` : ''}${o ? `<span class="c">${pav(o, 24)}</span>` : ''}</div>${K.group(rows)}</div>` : ''}
      </div>
      <div class="pdfoot ${podiumUp ? 'up' : ''}">${game.isHost ? K.glossy({ title: 'Rematch', key: 'again', attrs: 'data-act="again"' }) : `<div class="pwait dw">${dots('var(--muted)')}<span>Waiting for ${esc(firstName(game.hostName || '') || 'the host')} to start</span></div>`}
        <button class="dleave" data-press data-act="close">LEAVE</button></div>`;
  }

  /** Something went wrong (a wrong code, a lost room): the message on a red panel with the question bubble, and the way back. */
  function errorCard() {
    const ink = K.PanelColours.red[2];
    return `<div class="flex"></div><div class="perr">${K.panel({ title: 'Oops', note: game.error || 'Something went wrong.', icon: 'ui-icon-help', colours: K.PanelColours.red, subtle: true,
      body: `<button class="pback" data-press data-act="back" style="color:${ink}">BACK</button>` })}</div><div class="flex"></div>`;
  }

  // ---------- drawing ----------
  function render(force = false) {
    if (closed) return;
    const k = [game.phase, game.round, game.players.length, force ? Math.random() : ''].join('|');
    const screens = { idle: connecting, connecting, lobby: isDuel ? duelLobby : lobby, countdown, playing, result, finished: isDuel ? duelFinished : finished, error: errorCard };
    const phaseChanged = !key.startsWith(game.phase + '|');
    // LevelTheme: the page takes the round's colour (.onChange(of: tier)).
    LevelTheme.setOverride(tier());
    const typed = scr.querySelector('.gin')?.value;
    const html = (screens[game.phase] || connecting)();
    if (phaseChanged || force) {
      // The screens cross-fade: .transition(.opacity) under .easeOut(duration: 0.28).
      if (phaseChanged && key && !still() && scr.childElementCount) crossfade();
      scr.className = 'screen pt ph-' + game.phase + (isDuel ? ' duel' : '');
      scr.innerHTML = html;
      secsShown = -1;
    } else {
      const lists = [...scr.querySelectorAll('.pgrid > [data-k], .pboard > [data-k]')], before = rects(lists);
      morph(scr, html);
      flip(scr.querySelectorAll('.pgrid > [data-k]:not(.enter):not(.leaving)'), before, MOTION[game.teamsOn ? '--sp-team' : '--sp-tile']);
      flip(scr.querySelectorAll('.pboard > [data-k]'), before, MOTION['--sp-order']);
    }
    if (typed && scr.querySelector('.gin')) { scr.querySelector('.gin').value = typed; refreshHits(); }
    key = k;
    K.fit(scr);
    drawWall();
    frame();
  }

  /** The album wall behind the loader, the waiting room (veil .86) and the count (veil .84). Not behind a 1v1's room. */
  function drawWall() {
    const p = game.phase;
    const loader = p === 'connecting' || p === 'idle', room = p === 'lobby' && !isDuel;
    const on = loader || room || p === 'countdown';
    let w = view.querySelector(':scope > .cwall');
    if (on) {
      // An album's covers aren't the artist's: the wall ignores the artist for an album.
      const covers = CoverWall.covers(pool, { preset: wallPreset, category: game.settings.category, artist: game.isAlbum ? null : game.settings.artist });
      w = CoverWall.mount(view, covers, room ? 0.86 : p === 'countdown' ? 0.84 : 0.7, 'fixed');
      if (backdrop?.node && w.previousElementSibling !== backdrop.node) view.insertBefore(backdrop.node, w);
    }
    w?.classList.toggle('off', !on);
  }

  /** The old screen, lifted off and faded out over the new one as it fades in. */
  function crossfade() {
    const g = document.createElement('div');
    g.className = scr.className + ' ghost'; g.setAttribute('aria-hidden', 'true');
    g.style.cssText = scr.style.cssText + `;position:absolute;left:${scr.offsetLeft}px;top:${scr.offsetTop}px;width:${scr.offsetWidth}px;height:${scr.offsetHeight}px;margin:0;pointer-events:none`;
    while (scr.firstChild) g.appendChild(scr.firstChild);
    view.appendChild(g);
    const o = { duration: 280, easing: 'cubic-bezier(0,0,.58,1)' };
    g.animate([{ opacity: 1 }, { opacity: 0 }], { ...o, fill: 'forwards' }).onfinish = () => g.remove();
    scr.animate([{ opacity: 0 }, { opacity: 1 }], o);
  }

  const awayJustBefore = () => wentAwayAt != null && (Date.now() - wentAwayAt) / 1000 < TAIL;
  const later = (fn, ms) => { const t = setTimeout(() => { podiumTimers = podiumTimers.filter(x => x !== t); fn(); }, ms); podiumTimers.push(t); };
  function onPhase(prev) {
    const p = game.phase;
    if (p !== 'lobby') closeKickMenu();
    if (p !== 'lobby') { settingsSheet?.close(); songsSheet?.close(); }
    if (p !== 'lobby' && p !== 'countdown' && p !== 'playing' && p !== 'result') confirmSheet?.close();
    if (p === 'countdown' || (p === 'playing' && prev !== 'countdown')) {
      clip = { round: game.round, started: false, error: null };
      // The count shows the right number from its first frame.
      countN = Math.ceil(Math.max(0, game.roundStartedAt - game.now));
      // A fresh round starts unmuted, unless the page is away right now.
      roundMuted = game.antiShazam && scenePhase() === 'background';
      heldBySlip = false;
      scoresBefore = Object.fromEntries(game.players.map(x => [x.id, x.score]));
      revealed = false;
      // Forget the last song before buffering this one.
      player.stop();
      songFor(game.current?.songID).then(s => { if (s?.preview) player.prepare(s.id, s.preview).catch(() => {}); });
      if (p === 'countdown') { introIn = false; setTimeout(() => { introIn = true; K.setBannerShown(scr.querySelector('.k-banner'), true); scr.querySelector('.pterms')?.classList.add('in'); }, 40); }
    }
    if (p === 'playing') startClipIfDue();
    if (p === 'result') {
      player.stop(); sound.reveal();
      later(() => { if (game.phase !== 'result' || closed) return; revealed = true; revealBoard(); }, 650);
    }
    if (p === 'finished') {
      player.stop(); wentAwayAt = null; podiumUp = false;
      const mine = game.me?.score || 0;
      // Ended before a single round was scored: nothing to record or celebrate.
      const unplayed = !game.history.length && game.finalPlayers.every(x => x.score === 0);
      const st = teamStandings(game.players, game.settings.teams);
      const won = game.teamsOn && game.myTeam != null && st.length
        ? st[0].score > 0 && st.find(t => t.id === game.myTeam)?.score === st[0].score
        : mine > 0 && mine === (game.sortedPlayers[0]?.score || 0);
      if (!recordedGame && !unplayed) { recordedGame = true; try { account.recordParty(won, mine, game.myRoundsWon); } catch (e) {} }
      // Every step is guarded: a quick Play again has left the podium, so no confetti over the lobby.
      later(() => {
        if (game.phase !== 'finished' || closed) return;
        podiumUp = true; render(true);
        if (unplayed) return;
        later(() => {
          if (game.phase !== 'finished' || closed) return;
          Haptics.success(); sound.reveal();
          const c = game.teamsOn ? (st[0]?.color || teamColor(0)) : hueColor(game.finalPlayers[0]?.hue ?? 0), r = view.getBoundingClientRect();
          confetti(r.left + r.width / 2, r.top + r.height * 0.34, [c, '#ffffff', c], 140);
          const cv = [...document.querySelectorAll('canvas.confetti')].pop(); if (cv) cv.style.zIndex = '40';
        }, 900);
      }, 150);
    }
    if (p === 'lobby') { wentAwayAt = null; podiumUp = false; recordedGame = false; }
    if (p === 'connecting') connectStarted = Date.now();
    if (p === 'error' || p === 'idle') player.stop();
  }

  /** The board, 650 ms in: bars grow from last round's totals to this round's and the numbers roll, on spring(.75, .8). */
  function revealBoard() {
    render();
    scr.querySelectorAll('.pboard .sc[data-to]').forEach(s => roll(s, s.dataset.to, MOTION['--sp-board']));
  }

  async function songFor(id) {
    if (!id) return null;
    const s = pool.byId.get(String(id));
    if (s) return s;
    try { return await ctx.lookupSong(id); } catch (e) { return null; }
  }

  /** The clip on the room's shared start, so every phone sounds together (Music.play(id:seconds:due:)). */
  async function playShared() {
    const c = game.current; if (!c) return;
    const round = game.round, start = game.roundStartedAt, s = await songFor(c.songID);
    if (closed || game.phase !== 'playing' || game.round !== round || roundMuted) return;
    if (!s?.preview) { clip.error = 'no sound'; return; }
    clip.error = null;
    const due = () => start - game.now;
    const ok = player.playDue ? await player.playDue(s.id, s.preview, game.roundSeconds, due)
      : await player.play(s.id, s.preview, Math.max(0.5, game.roundSeconds + Math.min(0, due())), Math.max(0, -due()));
    if (ok === false) clip.error = player.lastError || 'no sound';
    else if (player.ctx && player.ctx.state !== 'running') clip.error = 'blocked';
  }
  function startClipIfDue() {
    if (game.phase !== 'playing' || !game.current) return;
    if (clip.started && clip.round === game.round) return;
    clip.round = game.round; clip.started = true;
    // Away when the clip is due, or away a moment ago (results screen): no sound this round.
    if (game.antiShazam && (scenePhase() === 'background' || awayJustBefore())) roundMuted = true;
    wentAwayAt = null;
    if (roundMuted) return;
    // Due under an overlay: it starts when the overlay goes, if that was only a slip.
    if (game.antiShazam && shazam.covered) { heldBySlip = true; return; }
    playShared();
  }
  /** Tap to replay, and the clip back after a slip: in step with the room, not from the top (bdc14ef). */
  function replayClip() {
    if (game.phase !== 'playing' || !game.current || player.playing || roundMuted) return;
    sound.click(); player.ensure(); clip.error = null;
    playShared();
  }
  function resumeClip() { if (game.phase === 'playing' && !roundMuted && !player.playing) playShared(); }

  /** 60 fps: the count, the ring, the seconds, the ring's words, the loader's clock. */
  function frame() {
    cancelAnimationFrame(raf);
    if (closed) return;
    if (game.phase === 'countdown') {
      const left = Math.max(0, game.roundStartedAt - game.now), n = Math.ceil(left);
      const box = scr.querySelector('.pcountbox .k-count');
      if (n !== countN || (box && box.dataset.n !== String(n))) {
        if (n !== countN && n > 0) { sound.tick(); Haptics.select(); }
        countN = n;
        if (box) { box.dataset.n = String(n); K.popCount(box, n); }
      }
      if (left <= 0) game.startIfDue();
    } else if (game.phase === 'playing') {
      if (!clip.started) startClipIfDue();
      const elapsed = Math.max(0, game.now - game.roundStartedAt), win = Math.max(1, game.roundWindow);
      const progress = Math.min(1, elapsed / win), left = Math.max(0, Math.ceil(game.roundWindow - elapsed));
      const arc = scr.querySelector('.pring .arc');
      if (arc) arc.setAttribute('stroke-dashoffset', (RING_C * progress).toFixed(2));
      if (left !== secsShown) { const s = scr.querySelector('.pring .secs'); if (s) { if (secsShown < 0) s.textContent = left; else roll(s, left, MOTION['--sp-num'], true); } secsShown = left; }
      const lbl = scr.querySelector('.pring .lbl'), eqw = scr.querySelector('.pring .eqw');
      if (lbl) {
        const on = player.playing && (!player.ctx || player.ctx.currentTime >= (player.ctxStart || 0));
        const txt = on ? 'listening' : roundMuted ? 'muted this round' : clip.error ? 'no sound — tap to retry' : 'tap to replay';
        if (lbl.textContent !== txt) { lbl.textContent = txt; lbl.style.color = roundMuted ? 'var(--dim)' : clip.error ? 'var(--expert)' : on ? accent() : 'var(--dim)'; }
        eqw.classList.toggle('on', on);
      }
    } else if (game.phase === 'connecting' || game.phase === 'idle') {
      const e = scr.querySelector('.pconn-clock .el'), t = elapsedText();
      if (e && e.textContent !== t) e.textContent = t;
    }
    raf = requestAnimationFrame(frame);
  }

  // ---------- the typed guess (only for an older host that sends no answers) ----------
  function refreshHits() {
    const inp = scr.querySelector('.gin'), box = scr.querySelector('.pguess .hits'); if (!inp || !box) return;
    const t = inp.value.trim();
    let hits = [];
    if (t) {
      if (game.catalogue.length) { const q = t.toLowerCase(); hits = game.catalogue.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)).slice(0, 5); }
      else {
        let scope = null, ok = true;
        if (game.settings.easySearch) {
          // As on Home: easy search waits for a second letter.
          if (t.length < 2) ok = false;
          scope = pool.filter(game.tier(game.round), game.settings.era || 'all', game.settings.category || 'all');
          const c = game.current && pool.byId.get(game.current.songID); if (c && !scope.includes(c)) scope = scope.concat([c]);
        }
        hits = ok ? pool.search(t, 5, scope) : [];
      }
    }
    // Suggestions show the byline: the artist line with featured credits.
    box.innerHTML = hits.map(s => `<button class="hit" data-act="hit" data-id="${esc(s.id)}" data-title="${esc(s.title)}"><b>${esc(s.title)}</b><span>${esc(s.credit || s.artist)}</span></button>`).join('');
    box.classList.toggle('on', hits.length > 0);
  }
  function wrongShake() {
    if (!still()) scr.animate([{ translate: '0' }, { translate: '-7px', offset: 0.2 }, { translate: '6px', offset: 0.4 }, { translate: '-4px', offset: 0.6 }, { translate: '3px', offset: 0.8 }, { translate: '0' }], { duration: 420, easing: 'cubic-bezier(.42,0,.58,1)' });
    Haptics.wrong();
    const i = scr.querySelector('.gin'); if (i) i.value = ''; refreshHits();
  }
  function submitTyped() {
    const inp = scr.querySelector('.gin'); if (!inp || !game.current) return;
    const t = inp.value.trim(); if (!t) return;
    sound.click();
    const c = game.current;
    // Judged as the solo search judges: namesSong, then the best match (artistBrowse off). The host confirms by id.
    const exact = namesSong(t, c.title, c.artist);
    const best = game.catalogue.length ? game.catalogue.find(s => namesSong(t, s.title, s.artist)) : pool.search(t, 1, null, false)[0];
    if (exact || best?.id === c.songID) { Haptics.success(); inp.value = ''; refreshHits(); game.submit(c.songID, t); } else wrongShake();
  }

  // ---------- the host's settings: one simple list, a tap drops the choices down (d7792c8) ----------
  const settingLine = (icon, title, value, chevron, attrs) => `<button class="psline" ${attrs}>${K.iconTile(icon, { size: 32 })}<span class="t">${esc(title)}</span><span class="sp"></span><span class="v">${esc(value)}</span><i class="ch">${chevron}</i></button>`;
  const DROPS = () => {
    const s = game.settings, on = game.teamsOn;
    const levels = [['mixed', 'Mixed'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['expert', 'Expert'], ['impossible', 'Impossible']];
    return {
      teams: { icon: 'ui-icon-teams', title: 'Teams', value: on ? teamLabelText(s.teams) : 'Solo', options: TEAM_MODES, selected: on ? s.teams : 'solo', pick: v => game.setTeams(v === 'solo' ? null : v) },
      rounds: { icon: 'ui-icon-rounds', title: 'Rounds', value: String(s.rounds), options: [5, 10, 15, 20].map(r => [String(r), `${r} rounds`]), selected: String(s.rounds), pick: v => { s.rounds = parseInt(v, 10) || 10; } },
      difficulty: { icon: 'ui-icon-difficulty', title: 'Difficulty', value: difficultyLabel(s.difficulty), options: levels, selected: s.difficulty, pick: v => { s.difficulty = v; } },
      time: { icon: 'ui-icon-time', title: 'Time per song', value: `${Math.round(s.guessWindow)}s`, options: [10, 20, 30, 45, 60].map(w => [String(w), `${w} seconds`]), selected: String(Math.round(s.guessWindow)),
        pick: v => { s.guessWindow = parseInt(v, 10) || 20; s.clipSeconds = s.guessWindow; } },    // the song plays the whole window
      years: { icon: 'ui-icon-years', title: 'Years', value: s.era === 'all' ? 'Any' : `The ${s.era}`, options: [['all', 'Any decade'], ['80s', 'The 80s'], ['90s', 'The 90s'], ['2000s', 'The 2000s'], ['2010s', 'The 2010s'], ['2020s', 'The 2020s']], selected: s.era, pick: v => { s.era = v; } },
      antishazam: { icon: 'ui-icon-antishazam', title: 'Anti-Shazam', value: game.antiShazam ? 'On' : 'Off', options: [['on', 'On'], ['off', 'Off']], selected: game.antiShazam ? 'on' : 'off', pick: v => { s.antiShazam = v === 'on'; } },
    };
  };
  function teamsSection() {
    const all = lobbyTeams(game.players, game.settings.teams), teams = all.slice(0, 6), more = all.length - teams.length;
    const card = t => {
      const c = teamColor(t.team), ms = t.members, shown = ms.slice(0, ms.length > 6 ? 5 : 6);
      return `<div class="tset" data-k="ts-${t.team}" style="--tc:${c};--tcrgb:${rgbOf(c)}"><div class="h"><b data-fit="0.7">${esc(teamName(t.team).toUpperCase())}</b><span>${ms.length === 1 ? '1 player' : `${ms.length} players`}</span></div>
        <div class="fs">${shown.map(p => `<span class="f">${pav(p, 36)}<small>${esc(firstName(p.name))}</small></span>`).join('')}${ms.length > shown.length ? `<span class="f"><span class="plus">+${ms.length - shown.length}</span></span>` : ''}${ms.length ? '' : `<span class="f open"><span class="dash">${PLUS}</span><small>Open seat</small></span>`}</div></div>`;
    };
    return `<div class="tsec"><div class="tsh"><small>TEAMS</small><div class="sp"></div><button class="tshuf" data-press data-sact="shuffle">${SHUFFLE}<span>Shuffle</span></button></div>
      ${teams.map(card).join('')}${more > 0 ? `<small class="tmore">+${more} more teams</small>` : ''}
      <small class="tnote">Team score is the average of its players, so uneven teams stay fair.</small></div>`;
  }
  function settingsBody() {
    const s = game.settings, d = DROPS();
    const minutes = Math.max(1, Math.round(s.rounds * (s.guessWindow + 9) / 60));
    const keys = (isDuel ? [] : ['teams']).concat(['rounds', 'difficulty', 'time', 'years', 'antishazam']);
    const rows = [settingLine(songsIcon(), 'Songs', game.songsLabel, sf('chevron.right'), 'data-sact="songs"')]
      .concat(keys.map(k => settingLine(d[k].icon, d[k].title, d[k].value, UPDOWN, `data-drop="${k}"`)));
    return `<i class="grab"></i>${K.settingsTitle({ text: 'GAME SETTINGS', done: true, key: 'done' })}
      <div class="psettings"><div class="pslist">${rows.join('<i class="hl"></i>')}</div>
      <p class="psmin">About ${minutes} min of play · faster answers score more</p>
      ${game.teamsOn ? teamsSection() : ''}</div>`;
  }
  /** Apply a settings change: a tick, a tap of the phone, and the room told. */
  function choose(change) { sound.click(); Haptics.select(); change(); game.pushSettings(); refreshSettings(); }
  let dropMenu = null;
  function openDrop(row, k) {
    closeDrop();
    const d = DROPS()[k]; if (!d) return;
    const r = row.getBoundingClientRect();
    const box = el(`<div class="pdrop"><div class="scrim"></div><div class="menu" role="menu">${d.options.map(([v, l]) => `<button role="menuitemradio" aria-checked="${v === d.selected}" data-v="${esc(v)}"><i class="tick">${v === d.selected ? sf('checkmark') : ''}</i><span>${esc(l)}</span></button>`).join('')}</div></div>`);
    document.body.appendChild(box);
    const m = box.querySelector('.menu'), w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.min(Math.max(12, r.right - w - 8), window.innerWidth - w - 12) + 'px';
    m.style.top = (r.bottom + 4 + h > window.innerHeight - 12 ? Math.max(12, r.top - h - 4) : r.bottom + 4) + 'px';
    box.addEventListener('click', e => {
      const b = e.target.closest('button[data-v]');
      if (b && b.dataset.v !== d.selected) choose(() => d.pick(b.dataset.v));
      closeDrop();
    });
    dropMenu = box;
  }
  function closeDrop() { dropMenu?.remove(); dropMenu = null; }
  function openSettings() {
    if (settingsSheet || !game.isHost) return;
    settingsSheet = openSheet(settingsBody(), { cls: 'party-sheet full', label: 'Game settings', onClose: () => { settingsSheet = null; closeDrop(); } });
    const body = settingsSheet.body;
    K.fit(body);
    body.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.key === 'done') { settingsSheet.close(); return; }
      if (b.dataset.sact === 'songs') { sound.click(); openSongs(); return; }
      if (b.dataset.sact === 'shuffle') { sound.click(); Haptics.select(); game.shuffleTeams(); game.pushSettings(); refreshSettings(); return; }
      if (b.dataset.drop) openDrop(b, b.dataset.drop);
    });
  }
  const refreshSettings = () => { if (settingsSheet) { morph(settingsSheet.body, settingsBody()); K.fit(settingsSheet.body); } render(); };

  // ---------- songs: genre, one artist or one album ----------
  const NOT_AN_ALBUM = /greatest|best of|\bhits\b|essential|\bgold\b|collection|anthology|legend|#1|number ones|\bsingles?\b|- ep\b|\bep\b|very best|playlist|now that|soundtrack|\blive\b|remixes/i;
  /** An album's name without its edition (albumDisplayName). */
  const albumDisplayName = raw => { let s = String(raw || ''); const ed = /\s*[\(\[][^\)\]]*(deluxe|remaster|edition|expanded|bonus|version|anniversary|reloaded)[^\)\]]*[\)\]]\s*$/i; while (ed.test(s)) s = s.replace(ed, ''); return s || raw; };
  let albumCache = null;
  /** Well-known albums from the bundled pool (AlbumCatalog.suggestedAlbums): 3+ songs, one of them famous, two an artist. */
  function suggestedAlbums() {
    if (albumCache) return albumCache;
    const groups = new Map();
    for (const s of pool.songs) { if (s.sceneOnly === true || !s.album) continue; const k = `${s.album}|${s.artist}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
    const out = [];
    for (const rows of groups.values()) {
      if (rows.length < 3 || !rows.some(s => s.fame === 1) || NOT_AN_ALBUM.test(rows[0].album)) continue;
      let score = rows.reduce((a, s) => a + (s.fame === 1 ? 8 : s.fame === 2 ? 3 : 0.5), 0);
      if (rows.some(s => s.artistRank === 0)) score += 10;
      const lead = rows.slice().sort((a, b) => ((a.fame ?? 9) - (b.fame ?? 9)) || ((a.artistRank ?? 1e9) - (b.artistRank ?? 1e9)))[0];
      const years = rows.map(s => s.year).filter(Boolean);
      out.push({ name: rows[0].album, artist: rows[0].artist, year: years.length ? Math.min(...years) : null, count: rows.length, artwork: lead.artwork, songs: rows, score });
    }
    out.sort((a, b) => (a.score === b.score ? (a.name < b.name ? -1 : 1) : b.score - a.score));
    const per = {};
    albumCache = out.filter(a => (per[a.artist] = (per[a.artist] || 0) + 1) <= 2);
    return albumCache;
  }
  const albumOn = (n, artist) => game.isAlbum && game.settings.artist === albumDisplayName(n) && (game.albumArtist || '').toLowerCase() === String(artist).toLowerCase();
  function openSongs() {
    if (songsSheet) return;
    let tab = game.isAlbum ? 2 : game.settings.artist ? 1 : 0, q = '', loading = null, error = null, strangers = [], searching = false, searchT = 0;
    if (knob('showSongsAlbum')) tab = 2;
    const sec = t => `<small class="sec">${esc(t)}</small>`;
    const row = (nm, detail, artwork, icon, attrs, dim = false) => `<button class="ar${dim ? ' dim' : ''}" ${attrs}>${artwork ? `<img src="${esc(art(artwork, 120))}" alt="" loading="lazy">` : '<span class="ph"></span>'}<span class="t"><b>${esc(nm)}</b><small>${esc(detail)}</small></span><i style="color:${accent()}">${icon}</i></button>`;
    const searchBox = (ph, clear) => `<label class="ptsearch">${sf('magnifyingglass')}<input value="${esc(q)}" placeholder="${esc(ph)}" autocomplete="off" autocorrect="off" spellcheck="false">${clear ? `<button class="clr" data-sact="clear" aria-label="Clear search">${sf('xmark')}</button>` : ''}</label>`;
    const notes = () => `${loading ? `<p class="pload"><i class="spin"></i><span>${esc(loading)}</span></p>` : ''}${error ? `<p class="perrline">${esc(error)}</p>` : ''}`;
    const draw = () => {
      const s = game.settings, typed = q.trim(), low = typed.toLowerCase();
      let head = '', list = '';
      if (tab === 0) {
        // The season's genre first while the season is on (19ecb8f).
        const seasonal = Season.current ? [{ name: Season.genre(), count: Object.values(pool.counts('all', Season.genre())).reduce((a, b) => a + b, 0) }] : [];
        const all = seasonal.concat(pool.categoryCounts.filter(c => !seasonal.some(x => x.name === c.name)));
        const hits = low ? all.filter(c => c.name.toLowerCase().includes(low)) : all;
        const rowG = (label, count, k) => { const on = !s.artist && s.category === k; return `<button class="gr ${on ? 'on' : ''}" data-genre="${esc(k)}" style="${on ? `background:${accent()}` : ''}"><span>${esc(label)}</span>${count != null ? `<small class="mono">${count}</small>` : ''}</button>`; };
        head = searchBox('Search genres', !!q);
        list = (low ? '' : rowG('All genres', null, 'all')) + hits.map(c => rowG(c.name, c.count, c.name)).join('');
      } else if (tab === 1) {
        const local = pool.artists.filter(a => a.count >= 4 && (!low || a.name.toLowerCase().includes(low))).sort((a, b) => b.count - a.count).slice(0, 60);
        head = searchBox(game.isArtist ? game.songsLabel : 'Search any artist', game.isArtist || !!q)
          + (game.isArtist && !typed ? `<p class="playing">${sf('checkmark')}<span>Playing ${esc(s.artist)} — ${game.catalogue.length} song${game.catalogue.length === 1 ? '' : 's'}</span></p>` : '') + notes();
        const coverOf = n => pool.songs.find(x => x.artist === n && x.artwork)?.artwork;
        list = (local.length ? sec('IN THE GAME · PLAYS INSTANTLY') : '')
          + local.map(a => row(a.name, `${a.count} ready`, coverOf(a.name), sf('bolt.fill'), `data-artist="${esc(a.name)}"`)).join('')
          + (searching && !strangers.length ? '<p class="pload"><i class="spin"></i><span>Searching Apple Music…</span></p>' : '')
          + (strangers.length ? sec('EVERYONE ON APPLE MUSIC') : '')
          + strangers.map(m => row(m.name, ['Full catalogue', m.genre].filter(Boolean).join(' · '), m.artwork, DOWN_CIRCLE, `data-stranger="${esc(m.id)}" data-name="${esc(m.name)}"`)).join('');
      } else {
        const sug = suggestedAlbums(), found = low ? sug.filter(a => a.name.toLowerCase().includes(low) || a.artist.toLowerCase().includes(low)) : [];
        head = searchBox(game.isAlbum ? game.songsLabel : 'Search any album', game.isAlbum || !!q)
          + (game.isAlbum && !typed ? `<p class="playing">${sf('checkmark')}<span>Playing ${esc(s.artist)}${game.albumArtist ? ` by ${esc(game.albumArtist)}` : ''} — ${game.catalogue.length} song${game.catalogue.length === 1 ? '' : 's'}</span></p>` : '') + notes();
        const albumRow = a => row(albumDisplayName(a.name), [a.artist, a.year].filter(Boolean).join(' · '), a.artwork, albumOn(a.name, a.artist) ? sf('checkmark') : DOWN_CIRCLE, `data-album="${esc(a.name)}" data-by="${esc(a.artist)}"`);
        if (!typed) list = (sug.length ? sec('WELL KNOWN · IN THE GAME') : '') + sug.map(albumRow).join('');
        else list = found.length ? sec('WELL KNOWN · IN THE GAME') + found.map(albumRow).join('') : typed.length >= 2 ? '<p class="pnone">No album by that name.</p>' : '';
      }
      return `<i class="grab"></i><div class="pshead"><h3 class="big">Songs</h3><button class="done" data-press data-sact="done" style="color:${accent()}">Done</button></div>
        <div class="ptabs">${['Genre', 'Artist', 'Album'].map((t, i) => `<button data-tab="${i}" class="${tab === i ? 'on' : ''}" style="${tab === i ? `background:${accent()}` : ''}">${t}</button>`).join('')}</div>
        <div class="ptsearchwrap">${head}</div><div class="ptlist">${list}</div>`;
    };
    songsSheet = openSheet(draw(), { cls: 'party-sheet tall songs', label: 'Songs', onClose: () => { songsSheet = null; clearTimeout(searchT); } });
    const body = songsSheet.body;
    const redraw = () => { const had = document.activeElement?.tagName === 'INPUT' && body.contains(document.activeElement); const top = body.querySelector('.ptlist')?.scrollTop || 0; body.innerHTML = draw(); const l = body.querySelector('.ptlist'); if (l) l.scrollTop = top; if (had) { const i = body.querySelector('input'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
    /** Apple Music's artists for what was typed (api/itunes, on the deployed site). */
    const searchApple = () => {
      clearTimeout(searchT);
      const t = q.trim(); strangers = []; searching = false;
      if (tab !== 1 || t.length < 2) return;
      searching = true;
      searchT = setTimeout(async () => {
        try { const r = await fetch('/api/itunes?term=' + encodeURIComponent(t)); const d = r.ok ? await r.json() : null; if (q.trim() !== t) return; const mine = new Set(pool.artists.map(a => a.name.toLowerCase())); strangers = (d?.artists || []).filter(a => !mine.has(a.name.toLowerCase())); }
        catch (e) { strangers = []; }
        searching = false; if (songsSheet) redraw();
      }, 300);
    };
    body.addEventListener('input', e => { if (e.target.tagName === 'INPUT') { q = e.target.value; searchApple(); redraw(); } });
    body.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.sact === 'done') { songsSheet.close(); return; }
      if (b.dataset.tab != null) { sound.click(); tab = +b.dataset.tab; q = ''; error = null; strangers = []; redraw(); return; }
      if (b.dataset.sact === 'clear') {
        sound.click();
        // Only a chosen artist or album goes back to all genres; just typing in the box keeps the genre.
        const wasPick = (tab === 1 && game.isArtist) || (tab === 2 && game.isAlbum);
        q = ''; strangers = [];
        if (wasPick && !q) await game.setCategory('all');
        redraw(); refreshSettings(); return;
      }
      if (b.dataset.genre != null) { sound.click(); await game.setCategory(b.dataset.genre); redraw(); refreshSettings(); return; }
      if (loading) return;
      if (b.dataset.artist != null) {
        sound.click();
        const a = b.dataset.artist, songs = pool.songs.filter(s => s.artist === a && s.preview);
        q = ''; error = null;
        await game.setArtist(a, songs); refreshSettings(); songsSheet?.close(); return;
      }
      if (b.dataset.stranger != null) {
        sound.click();
        const nm = b.dataset.name; q = ''; error = null; loading = `Loading ${nm}'s songs…`; redraw();
        let songs = [];
        try { const r = await fetch('/api/itunes?artistId=' + encodeURIComponent(b.dataset.stranger)); const d = r.ok ? await r.json() : null; songs = (d?.songs || []).filter(s => s.preview); } catch (e) {}
        loading = null;
        if (songs.length < 5) { error = `Not enough playable songs found for ${nm}.`; if (songsSheet) redraw(); return; }
        await game.setArtist(nm, songs); refreshSettings(); songsSheet?.close(); return;
      }
      if (b.dataset.album != null) {
        sound.click();
        const a = suggestedAlbums().find(x => x.name === b.dataset.album && x.artist === b.dataset.by); if (!a) return;
        const shown = albumDisplayName(a.name);
        q = ''; error = null; loading = `Loading ${shown}…`; redraw();
        const songs = a.songs.filter(s => s.preview);
        loading = null;
        if (songs.length < 5) { error = songs.length ? `Only ${songs.length} playable songs on ${shown}. Try another album.` : `No playable songs found on ${shown}.`; redraw(); return; }
        await game.setAlbum(shown, a.artist, songs); refreshSettings(); songsSheet?.close();
      }
    });
  }

  // ---------- the host's hold menu: the teams to move to, and Kick ----------
  function openKickMenu(tile) {
    const id = tile.dataset.kick, p = game.players.find(x => x.id === id);
    if (!game.isHost || !p || kickMenu || (id === game.myID && !game.teamsOn)) return;
    Haptics.press(0.6);
    const r = tile.getBoundingClientRect();
    const moves = game.teamsOn ? lobbyTeams(game.players, game.settings.teams).map(t => t.team).filter(t => t !== p.team)
      .map(t => `<button role="menuitem" class="mv" data-kact="move" data-team="${t}">${ARROW_R}<span>Move to ${esc(teamName(t))}</span></button>`).join('') : '';
    const kick = id !== game.myID ? `<button role="menuitem" data-kact="kick">${PERSON_X}<span>Kick ${esc(p.name)}</span></button>` : '';
    const box = el(`<div class="pkick"><div class="scrim" data-kact="dismiss"></div><div class="menu" role="menu">${moves}${kick}</div></div>`);
    const menu = box.querySelector('.menu');
    view.appendChild(box);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12) + 'px';
    menu.style.top = (r.bottom + 8 + h > window.innerHeight - 12 ? Math.max(12, r.top - h - 8) : r.bottom + 8) + 'px';
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-kact]'); if (!b) return;
      if (b.dataset.kact === 'kick') { Haptics.press(0.8); game.kick(id); }
      if (b.dataset.kact === 'move') { Haptics.select(); game.moveToTeam(id, +b.dataset.team); game.pushSettings(); }
      closeKickMenu();
    });
    kickMenu = box;
  }
  function closeKickMenu() { if (kickMenu) { kickMenu.remove(); kickMenu = null; } }
  const cancelPress = () => { clearTimeout(pressTimer); pressTimer = 0; pressAt = null; };
  view.addEventListener('contextmenu', e => {
    const t = e.target.closest('.ptile[data-kick]'); if (!t || !game.isHost) return;
    e.preventDefault(); cancelPress(); openKickMenu(t);
  });
  view.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    const t = e.target.closest('.ptile[data-kick]'); if (!t || !game.isHost) return;
    cancelPress(); pressAt = { x: e.clientX, y: e.clientY };
    pressTimer = setTimeout(() => { pressTimer = 0; pressAt = null; openKickMenu(t); }, 500);
  });
  view.addEventListener('pointermove', e => { if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) cancelPress(); });
  view.addEventListener('pointerup', cancelPress);
  view.addEventListener('pointercancel', cancelPress);

  // ---------- actions ----------
  /** The host leaving ends the room for everyone in it, so while people are waiting or playing, the X asks first. */
  const endsRoomForOthers = () => game.isHost && game.players.some(p => p.id !== game.myID && !p.id.startsWith('bot-')) && ['lobby', 'countdown', 'playing', 'result'].includes(game.phase);
  function close() { if (endsRoomForOthers()) confirmEnd(); else closeNow(); }
  /** .confirmationDialog: the title and one destructive button (and Cancel). */
  function confirmEnd() {
    if (confirmSheet) return;
    confirmSheet = openSheet(`<div class="pconfirm"><p>${isDuel ? 'End the 1v1?' : 'End the party for everyone?'}</p><button class="end" data-press data-cact="end">${isDuel ? 'End the 1v1' : 'End the party'}</button><button class="no" data-press data-cact="cancel">Cancel</button></div>`,
      { cls: 'party-confirm', label: 'End', onClose: () => { confirmSheet = null; } });
    confirmSheet.body.addEventListener('click', e => {
      const b = e.target.closest('[data-cact]'); if (!b) return;
      const s = confirmSheet; s?.close();
      if (b.dataset.cact === 'end') closeNow();
    });
  }
  /** Out at once. The goodbye goes on its own, so a dead line can't hold the screen on the way out. */
  function closeNow() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf); podiumTimers.forEach(clearTimeout); cancelPress(); closeKickMenu(); closeDrop();
    LevelTheme.setOverride(null);
    player.stop();
    settingsSheet?.close(); songsSheet?.close(); confirmSheet?.close();
    document.removeEventListener('keydown', onKey);
    offScene(); off();
    if (challengeID != null) { Friends.cancel(challengeID, launch.friendId || null); challengeID = null; }
    try { backdrop?.destroy?.(); } catch (e) {}
    game.leave().catch(() => {}).finally(() => player.stop());
    popView(view);
  }
  /** No name yet: the profile first (iOS showProfile); the room carries on once there is one. */
  const needName = () => {
    if (name() || offline) return false;
    waitingForName = true;
    if (ctx.openProfile) ctx.openProfile();
    return true;
  };
  let waitingForName = false;
  function host() {
    if (needName()) return;
    player.ensure();
    game.host((name() || (offline ? 'Leo' : account.displayName)), account.avatar);
  }
  function join() {
    if (needName()) return;
    player.ensure();
    game.join(codeEntry, (name() || (offline ? 'Leo' : account.displayName)), account.avatar);
  }
  /** startFromLaunch: .host → host(), .enter → join(), .join → a friend's room, .challenge → host a 1v1 and invite. */
  async function startFromLaunch() {
    if (game.phase !== 'idle' || staged) return;
    switch (launch.kind) {
      case 'host': host(); return;
      case 'enter':
        // ?showJoining: the loader held on screen (no room behind it, nothing joined).
        if (knob('showJoining')) { game.code = codeEntry; game.phase = 'connecting'; game.emit(); return; }
        join(); return;
      case 'join':
        game.seatLimit = 2;
        challengeNote = `${firstName(launch.name || '')}'s 1v1`;
        join(); return;
    }
    // .challenge
    if (needName()) return;
    game.seatLimit = 2;
    player.ensure();
    await game.host((name() || (offline ? 'Leo' : account.displayName)), account.avatar);
    if (game.phase !== 'lobby' || closed) return;
    game.settings.rounds = 5;
    // A 1v1 has no teams; a friend's starts on a genre, whatever the last party did (the host may then pick again).
    game.setTeams(null);
    if (!launch.bot && game.settings.artist != null) await game.setCategory('all');
    await game.pushSettings();
    const f = firstName(launch.name || '');
    if (launch.open) { render(); return; }
    if (launch.bot || !launch.friendId) { await game.addBot(launch.name || 'Songbot'); challengeNote = `${f} accepted. Start when you're ready.`; render(); return; }
    const say = t => { if (!closed) { challengeNote = t; render(); } };
    say(`Invited ${f}. Waiting for them…`);
    const id = await Friends.challenge(launch.friendId, game.code);
    if (closed) { if (id != null) Friends.cancel(id, launch.friendId); return; }
    if (id == null) return say(`Couldn't reach ${f}. Try again from Friends.`);
    challengeID = id;
    // Watch for an answer for up to two minutes: the friend's phone rings ours when they answer; else every three seconds.
    const until = Date.now() + 120000;
    while (Date.now() < until) {
      if (Friends.waitForRing) await Friends.waitForRing(3); else await new Promise(r => setTimeout(r, 3000));
      if (closed || challengeID !== id) return;
      const st = await Friends.status(id);
      if (closed || challengeID !== id) return;
      if (st === 'declined') { challengeID = null; return say(`${f} can't play right now.`); }
      if (st === 'accepted' && challengeNote !== `${f} is on the way…`) say(`${f} is on the way…`);
    }
    if (challengeID === id) { challengeID = null; say(`${f} didn't answer.`); }
  }
  /** The share sheet doesn't count as leaving for anti-Shazam (sharing). The iPhone's text, then the web link. */
  function share() {
    const c = game.code;
    sharing = true;
    OwnPrompt.during(() => shareText(`Join my Songspot party — open Songspot, tap Party and enter the code ${c}. Or play in your browser: https://songspotapp.com/?party=${c}`, 'Copied. Send it to your friends.'))
      .finally(() => setTimeout(() => { sharing = false; }, 600));
  }

  view.addEventListener('click', e => {
    // The host taps a player across to the next team.
    const mv = e.target.closest('.ptile.mv');
    if (mv && game.isHost && game.teamsOn && game.phase === 'lobby') {
      sound.click(); Haptics.select();
      game.moveToTeam(mv.dataset.k, game.nextTeam(mv.dataset.k)); game.pushSettings();
      return;
    }
    const b = e.target.closest('[data-act],[data-choice]'); if (!b || b.disabled) return;
    const choice = b.dataset.choice;
    if (choice != null) { sound.click(); Haptics.press(0.7); game.pick(choice); return; }
    const act = b.dataset.act;
    // The bar's X and the Leave buttons close without a click (Button(action: close)); everything else clicks.
    if (!['replay', 'close'].includes(act)) sound.click();
    switch (act) {
      case 'close': close(); break;
      case 'cancel': close(); break;
      case 'share': share(); break;
      case 'settings': openSettings(); break;
      case 'shuffle': Haptics.select(); game.shuffleTeams(); game.pushSettings(); break;
      case 'start': game.start(); break;
      case 'skip': game.skipRound(); break;
      case 'next': game.nextRound(); break;
      case 'again': game.playAgain(); break;
      // Back is back to the Party tab: there is no entry page behind this one.
      case 'back': closeNow(); break;
      case 'botlevel': Haptics.select(); game.setBotLevel(b.dataset.v); break;
      case 'guess': submitTyped(); break;
      case 'hit': {
        const c = game.current; if (!c) break;
        if (b.dataset.id === c.songID) { Haptics.success(); game.submit(c.songID, b.dataset.title); scr.querySelector('.gin').value = ''; refreshHits(); } else wrongShake();
        break;
      }
      case 'replay': replayClip(); break;
    }
  });
  view.addEventListener('input', e => { if (e.target.classList.contains('gin')) refreshHits(); });
  view.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('gin')) submitTyped(); });
  const onKey = e => {
    if (e.key !== 'Escape') return;
    if (dropMenu) { closeDrop(); return; }
    if (kickMenu) { closeKickMenu(); return; }
    if (!settingsSheet && !songsSheet && !confirmSheet && document.querySelector('#views > .view:last-child') === view) close();
  };
  document.addEventListener('keydown', onKey);

  // The anti-Shazam rule (ShazamWatch), when the host has it on. Our own share sheet never counts.
  const offScene = watchScene(shazam, v => {
    if (!game.antiShazam) return;
    if (v === 'covered') { if (game.phase === 'playing' && player.playing) { player.stop(); heldBySlip = true; } }
    else if (v === 'slip') { if (heldBySlip) { heldBySlip = false; resumeClip(); } }
    else if (v === 'left') {
      // Gone, or an overlay held long enough to tap Shazam: no more sound this round. Guessing stays open.
      player.stop(); heldBySlip = false;
      const p = game.phase;
      if (p === 'countdown' || p === 'playing') { roundMuted = true; wentAwayAt = Date.now(); }
      else if (p === 'result' || p === 'finished') wentAwayAt = Date.now();
      // Switching away while waiting isn't where Shazam gets armed; an overlay held open is.
      else if (p === 'lobby') wentAwayAt = scenePhase() === 'background' ? null : Date.now();
    } else if (v === 'returned') { if (wentAwayAt != null) wentAwayAt = Date.now(); }
  }, { own: () => sharing });

  let lastPhase = game.phase;
  const offGame = game.onChange(() => {
    const prev = lastPhase; lastPhase = game.phase;
    if (prev !== game.phase) onPhase(prev);
    // The friend walked in: the invitation has done its job.
    if (challengeID != null && game.players.length >= 2) { challengeID = null; challengeNote = null; }
    render();
    if (settingsSheet && game.phase === 'lobby') { morph(settingsSheet.body, settingsBody()); K.fit(settingsSheet.body); }
  });
  // A room that stopped for a name carries on once there is one.
  const offAccount = account.onChange ? account.onChange(() => { if (waitingForName && name() && game.phase === 'idle') { waitingForName = false; startFromLaunch(); } }) : () => {};
  const off = () => { offGame(); offAccount(); };

  pushView(view);
  render();
  const me0 = name() || 'Leo';
  if (staged) {
    setTimeout(() => {
      if (knob('demoDuelResult')) game.demoDuelFinish(me0);
      else if (knob('demoSoloResult')) game.demoSoloFinish(me0);
      else if (knob('demoTeamResult')) game.demoTeams(me0, 'finished');
      else if (knob('demoTeamRound')) game.demoTeams(me0, 'round');
      else if (knob('demoDuelCountdown')) game.demoDuelCountdown(me0);
      else if (knob('demoRoomCountdown')) game.demoRoomCountdown(me0, knob('demoFirstRound'));
      else if (knob('demoRoomRound')) game.demoRoomRound(me0);
      else if (knob('demoError')) { game.phase = 'error'; game.error = qs.get('demoError') || 'No answer from that code. Check it, and that the host has Songspot open.'; game.emit(); }
    }, 0);
  } else setTimeout(startFromLaunch, 0);
  // ?demoTeams: the hosted demo room split into two teams. ?showHostSettings / ?showSongsAlbum / ?demoPartyAlbum once the room is open.
  // ?autoStart: a two-round game as soon as someone else is in (two pages playing a whole party). ?demoConfirmEnd: the leave dialog.
  if (!staged && (knob('demoTeams') || knob('showHostSettings') || knob('showSongsAlbum') || knob('demoPartyAlbum') || knob('autoStart') || knob('demoConfirmEnd') || (local && qs.get('teamMode')))) {
    (async () => {
      for (let i = 0; i < 80 && game.phase !== 'lobby'; i++) await new Promise(r => setTimeout(r, 250));
      if (game.phase !== 'lobby' || closed) return;
      if (knob('demoTeams')) { game.setTeams('two'); await game.pushSettings(); }
      // ?teamMode=two|three|pairs|trios: a real room in teams (the new seats go to the smallest team).
      if (local && qs.get('teamMode')) { game.setTeams(qs.get('teamMode')); await game.pushSettings(); }
      if (knob('demoPartyAlbum')) { const a = suggestedAlbums()[0]; if (a) await game.setAlbum(albumDisplayName(a.name), a.artist, a.songs.filter(s => s.preview)); }
      if (knob('showHostSettings') || knob('showSongsAlbum')) openSettings();
      if (knob('showSongsAlbum')) setTimeout(openSongs, 700);
      if (knob('demoConfirmEnd')) setTimeout(close, 400);
      if (knob('autoStart')) {
        for (let i = 0; i < 240 && game.players.length < 2 && !closed; i++) await new Promise(r => setTimeout(r, 500));
        if (game.players.length < 2 || closed) return;
        game.settings.rounds = +(qs.get('rounds') || 2); await game.pushSettings();
        await new Promise(r => setTimeout(r, 600));
        await game.start();
      }
    })();
  }
  return view;
}
