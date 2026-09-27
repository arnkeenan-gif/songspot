// Party on the web: the iPhone app's PartyView screen for screen — the hub,
// the waiting room, the count, the round with its four answers, the answer
// and the board, the podium. The room, the rules and the wire live in
// partygame.js and speak the iPhone's own PartyMessage JSON, so a browser
// and an iPhone can sit in the same room. Sizes are the SwiftUI points.
import { PartyGame, MAX_PLAYERS, ROUND_OPTIONS, DIFFICULTIES, WINDOWS, YEARS, normaliseCode } from './partygame.js';
import { choiceGrid } from './choices.js';
import { confetti } from './confetti.js';
import { Haptics } from './haptics.js';
import { spring, still } from './motion.js';
import { I } from './icons.js';
import { el, pushView, popView, openSheet, hueColor, shareText, esc, art, cap, settings, TIER_COLOR, TIER_INK, PILL_FILL, PILL_INK } from './ui.js';

const SHAZAM_TAIL = 12;           // seconds a clip stays muted after the tab was away on the results screen
const STRIP_MAX = 10;
const RING_R = 98, RING_C = 2 * Math.PI * RING_R;
// SF Symbols the shared icon set lacks: cpu (Songbot's seat) and hourglass.
const CPU = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.4"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8" fill="currentColor" stroke="none"/><path d="M9.5 2.5v3M14.5 2.5v3M9.5 18.5v3M14.5 18.5v3M2.5 9.5h3M2.5 14.5h3M18.5 9.5h3M18.5 14.5h3"/></svg>';
const HOURGLASS = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/></svg>';

const dots = color => `<span class="pdots" style="color:${color}"><i></i><i></i><i></i></span>`;
/** Equalizer: five bars, bottom-aligned to each other, the group centred in an 18pt frame. */
const eq = () => '<span class="peq"><span><i></i><i></i><i></i><i></i><i></i></span></span>';
/** The app's Accent glow switch. Off unless turned on, as in Settings.swift. */
const glow = () => { try { return !!settings.get('glow', false); } catch (e) { return false; } };

// PartyView's springs and curves, as CSS variables on the view (see party.css).
const MOTION = {
  '--sp-tile': spring(0.45, 0.6),     // players popping into the waiting room
  '--sp-ans': spring(0.36, 0.55),     // a face lighting up as it answers
  '--sp-count': spring(0.32, 0.55),   // the count slamming in
  '--sp-board': spring(0.75, 0.8),    // the board's bars and numbers
  '--sp-order': spring(0.6, 0.8),     // the board's rows finding their places
  '--sp-pod': spring(0.6, 0.6),       // the podium rising
  '--sp-win': spring(0.5, 0.55),      // "You win!"
  '--sp-vs': spring(0.4, 0.6),        // the 1v1 seats
  '--sp-pts': spring(0.4, 0.55),      // the locked-in points
  '--sp-num': spring(0.2, 0.85),      // .snappy(duration: .2): the ring's seconds
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

/** A face as the app draws it: the picture, the initial on the player's colour, or a person on grey. */
function avatar(name, pic, color, size) {
  const n = String(name || '').trim();
  const box = `width:${size}px;height:${size}px`;
  if (pic) return `<img class="pav" src="data:image/jpeg;base64,${esc(pic)}" alt="" style="${box}">`;
  if (!n) return `<span class="pav none" style="${box};font-size:${Math.round(size * 0.4)}px">${I.person}</span>`;
  return `<span class="pav" style="${box};background:${color};font-size:${(size * 0.44).toFixed(1)}px">${esc(n[0].toUpperCase())}</span>`;
}

export function mountParty(ctx, opts = {}) {
  const { pool, player, sound, account } = ctx;
  // Localhost-only knobs, the iPhone's DEBUG launch flags: ?demoParty (eight stand-ins, no network),
  // ?showJoining (the room loader), ?showDuel (a 1v1 with Songbot).
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const knob = k => local && new URLSearchParams(location.search).has(k);
  const game = new PartyGame(pool, { loopback: knob('demoParty') || knob('showDuel') || knob('showJoining'), standIns: knob('demoParty') });
  // The raw wire, for anyone checking it from the console.
  const wire = (window.__partyWire = []);
  game.transport.tap = (dir, m) => { wire.push({ dir, t: Date.now(), m: JSON.parse(JSON.stringify(m)) }); if (wire.length > 400) wire.shift(); };
  window.__party = game;

  const view = el('<div class="view party" role="dialog" aria-label="Party"><div class="screen pt"></div></div>');
  const scr = view.querySelector('.pt');
  let codeEntry = normaliseCode(opts.join || '');
  let key = '', raf = 0, closed = false;
  let clip = { round: -1, started: false, error: null, muted: false };
  let wentAwayAt = null, countN = -1, secsShown = -1;
  let scoresBefore = {}, revealed = false, recordedGame = false, podiumTimer = 0;
  let settingsSheet = null, songsSheet = null;
  // A friend's 1v1 (PartyLaunch on the iPhone): two seats, five rounds, the host's settings.
  const launch = opts.duel || (knob('showDuel') ? { name: 'Songbot', bot: true } : null);
  const isDuel = !!launch;
  let challengeNote = null;
  view.style.cssText = Object.entries(MOTION).map(([k, v]) => `${k}:${v.css}`).join(';');

  const tier = () => (['countdown', 'playing', 'result'].includes(game.phase) ? game.tier(game.round) : 'easy');
  const accent = () => TIER_COLOR[tier()];
  const ink = () => TIER_INK[tier()];
  const myColor = () => hueColor(game.me?.hue ?? 0);
  const pav = (p, size) => avatar(p.name, p.avatar, hueColor(p.hue), size);
  const name = () => (account.name || '').trim();
  const strip = () => { const ps = game.sortedByHue; return ps.length <= STRIP_MAX ? ps : ps.slice(0, STRIP_MAX - 1); };
  const overflow = (shown, size) => { const n = game.players.length; return n > shown ? `<span class="pover" style="width:${size}px;height:${size}px;font-size:${(size * 0.34).toFixed(1)}px">+${n - shown}</span>` : ''; };
  const xbtn = (size = 35) => `<button class="xbtn" data-press data-act="close" aria-label="Close" style="width:${size}px;height:${size}px">${I.x}</button>`;
  const bar = (title, premium = false) => `<div class="pbar"><h1>${esc(title)}</h1><div class="sp"></div>${premium && !ctx.premium ? `<button class="pcrown" data-press data-act="premium">${I.crown}<span>Premium</span></button>` : ''}${xbtn()}</div>`;
  const tierPill = () => `<span class="ptier" style="background:${PILL_FILL[tier()]};color:${PILL_INK}">${cap(tier())}</span>`;
  const roundHead = withClose => `<div class="pthead"><div class="rnd"><small>ROUND</small><div><b class="mono">${game.round + 1}</b><span class="mono">/ ${game.settings.rounds}</span></div></div><div class="sp"></div>${tierPill()}${withClose ? `<button class="xbtn sm" data-press data-act="close" aria-label="Leave">${I.x}</button>` : ''}</div>`;

  // ---------- screens ----------
  function entry() {
    const premium = ctx.premium, n = name();
    return `${bar('Party', true)}
      <h2 class="ptitle">Play with friends</h2>
      <p class="plead">Everyone hears the same clip at the same moment. The fastest right answer scores the most.</p>
      <button class="prow card" data-press data-act="profile">
        ${avatar(n, account.avatar, TIER_COLOR.easy, 46)}
        <span class="who"><small>PLAYING AS</small><b class="${n ? '' : 'none'}">${esc(n || 'Add your name')}</b></span>
        <span class="edit">${account.avatar ? 'Edit' : 'Add a photo'}</span><i class="chev">${I.chevron}</i>
      </button>
      <button class="phost ${premium ? 'on' : ''} ${premium && glow() ? 'glow' : ''}" data-press data-act="host">
        <span class="ic">${premium ? I.people : I.lock}</span>
        <span class="tx"><b>Host a party</b><small>${premium ? 'Get a code, play live with up to 50 people.' : 'Hosting is a premium perk. Joining a party is free for everyone.'}</small></span>
        ${premium ? `<i class="chev">${I.chevron}</i>` : '<span class="ptag">PREMIUM</span>'}
      </button>
      <div class="por"><i></i><span>or</span><i></i></div>
      <div class="pjoin">
        <input class="pcode ${codeEntry.length === 5 ? 'full' : ''}" value="${esc(codeEntry)}" placeholder="ROOM CODE" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="5" aria-label="Room code" enterkeyhint="go">
        <button class="pgo ${codeEntry.length === 5 ? 'on' : ''}" data-press data-act="join" ${codeEntry.length === 5 ? '' : 'disabled'}>Join</button>
      </div>
      <div class="flex"></div>`;
  }
  const opponentName = () => game.players.find(p => p.id !== game.myID)?.name || launch?.name || 'your friend';
  /** Opening or joining a room: your face in two counter-turning rings, a headline that says what is happening, a way out. */
  function connecting() {
    const title = isDuel ? 'Setting up your 1v1' : game.isHost ? 'Opening your room' : 'Joining the party';
    const c = normaliseCode(codeEntry);
    const sub = isDuel ? `with ${opponentName()}` : game.isHost ? 'Getting a code for your friends' : c ? `Room ${c}` : 'Connecting';
    const n = name(), C1 = 2 * Math.PI * 64, C2 = 2 * Math.PI * 77;
    return `${bar(isDuel ? '1v1' : 'Party')}
      <div class="flex"></div>
      <div class="ploader" style="color:${accent()}">
        <svg viewBox="0 0 170 170" aria-hidden="true">
          <circle cx="85" cy="85" r="64" class="trk"/>
          <circle cx="85" cy="85" r="64" class="a1" stroke-dasharray="${(C1 * 0.3).toFixed(2)} ${C1.toFixed(2)}"/>
          <circle cx="85" cy="85" r="77" class="a2" stroke-dasharray="${(C2 * 0.14).toFixed(2)} ${C2.toFixed(2)}"/>
        </svg>
        <span class="face">${avatar(n ? n[0].toUpperCase() : '', account.avatar, hueColor(0), 100)}</span>
      </div>
      <h2 class="pconn-t">${esc(title)}</h2>
      <p class="pconn-s ${sub.startsWith('Room') ? 'mono' : ''}">${esc(sub)}</p>
      <div class="pconn-eq" style="color:${accent()}">${eq()}</div>
      <div class="flex"></div>
      <button class="pcancel" data-press data-act="close">Cancel</button>`;
  }

  function lobby() {
    const n = game.players.length, empty = n < MAX_PLAYERS ? Math.max(1, 4 - n) : 0;
    const tiles = game.players.map(p => {
      const c = hueColor(p.hue), me = p.id === game.myID;
 return `<div class="ptile" data-k="${esc(p.id)}" data-enter data-exit><span class="ring" style="outline:${me ? 3 : 2}px solid ${c};outline-offset:${me ? 1.5 : 2}px">${pav(p, 60)}${p.isHost ? `<i class="crownb">${I.crown}</i>` : ''}</span>
        <b class="${me ? 'me' : ''}">${esc(p.name)}</b><small style="color:${me ? c : 'var(--dim)'}">${me ? 'you' : p.isHost ? 'host' : '&nbsp;'}</small></div>`;
    }).join('') + Array.from({ length: empty }, (_, i) => `<div class="ptile seat" data-k="seat-${i}" data-enter data-exit><span class="dash">${I.plus}</span><b>waiting</b>${dots('var(--dim)')}</div>`).join('');
    const s = game.settings;
    const row = (icon, text) => `<div class="srow"><i style="color:${accent()}">${icon}</i><span>${esc(text)}</span></div>`;
    const summary = `${game.isHost ? `<div class="shead"><small>GAME SETTINGS</small><div class="sp"></div><span style="color:${accent()}">Edit</span><i class="chev">${I.chevron}</i></div>` : ''}
      ${row(I.hash, `${s.rounds} rounds`)}${row(I.bars, s.difficulty === 'mixed' ? 'Easy to Impossible' : cap(s.difficulty))}
      ${row(I.timer, `${Math.round(s.guessWindow)} seconds a song`)}${row(I.calendar, s.era === 'all' ? 'Any year' : `The ${s.era}`)}
      ${row(I.search, s.easySearch ? 'Easy search' : 'Hard search')}${row(s.artist ? I.mic : I.genres, game.songsLabel)}`;
    const foot = game.isHost
      ? `<button class="pstart ${game.canStart ? 'on' : ''} ${glow() ? 'glow' : ''}" data-press data-act="start" ${!game.canStart || game.preparingSongs ? 'disabled' : ''}>${game.preparingSongs ? 'Getting the songs ready…' : game.canStart ? (isDuel ? 'Start the 1v1' : 'Start the party') : (isDuel ? `Waiting for ${esc(opponentName())}` : 'Waiting for players')}</button>`
      : `<div class="pwait">${dots('var(--muted)')}<span>Waiting for ${esc(game.hostName || 'the host')} to start</span></div>`;
    return `${bar('Waiting room')}
      <div class="pscroll">
        ${challengeNote ? `<div class="pnote" data-enter>${I.bolt}<span>${esc(challengeNote)}</span></div>` : ''}
        <div class="pcodeblock"><small>ROOM CODE</small><div class="big mono ${glow() ? 'glow' : ''}" style="color:${accent()}">${esc(game.code)}</div>
          <button class="pshare" data-press data-act="share">${I.share}<span>Share the code</span></button></div>
        <div class="pcount"><span><b class="mono">${n}</b> ${n === 1 ? 'player' : 'players'}</span><small>room for ${MAX_PLAYERS}</small></div>
        <div class="pgrid">${tiles}</div>
        ${game.isHost ? `<button class="psum card" data-press data-act="settings">${summary}</button>` : `<div class="psum card">${summary}</div>`}
      </div>
      ${foot}`;
  }

  /** The 1v1 room: the two of you face to face, the host's settings under you, one button. */
  function duelSeat(p, fallback) {
    const c = hueColor(p?.hue ?? 0), bot = !!p?.id?.startsWith('bot-');
    const face = p && !bot ? pav(p, 92) : `<span class="pav bot" style="width:92px;height:92px">${CPU}</span>`;
    const sub = p?.id === game.myID ? 'you' : p?.isHost ? 'host' : bot ? 'bot' : 'friend';
    return `<div class="dseat" ${p && p.id !== game.myID ? 'data-k="other" data-enter' : ''}><span class="ring ${glow() ? 'glow' : ''}" style="--c:${c}">${face}</span>
      <b>${esc(p?.name || fallback)}</b><small style="color:${p?.id === game.myID ? c : 'var(--dim)'}">${sub}</small></div>`;
  }
  function duelLobby() {
    const me = game.me, other = game.players.find(p => p.id !== game.myID);
    const s = game.settings;
    const row = (icon, text) => `<div class="srow"><i style="color:${accent()}">${icon}</i><span>${esc(text)}</span></div>`;
    const summary = `${game.isHost ? `<div class="shead"><small>GAME SETTINGS</small><div class="sp"></div><span style="color:${accent()}">Edit</span><i class="chev">${I.chevron}</i></div>` : ''}
      ${row(I.hash, `${s.rounds} rounds`)}${row(I.bars, s.difficulty === 'mixed' ? 'Easy to Impossible' : cap(s.difficulty))}
      ${row(I.timer, `${Math.round(s.guessWindow)} seconds a song`)}${row(I.calendar, s.era === 'all' ? 'Any year' : `The ${s.era}`)}
      ${row(s.artist ? I.mic : I.genres, game.songsLabel)}`;
    const note = challengeNote ? `<div class="pnote duel ${other ? '' : 'wait'}">${other ? I.bolt : HOURGLASS}<span>${esc(other ? `${other.name} is in. ${game.isHost ? 'Pick the settings and start.' : ''}` : challengeNote)}</span></div>` : '';
    const n = name();
    const empty = `<div class="dseat empty"><span class="dash">${dots('var(--muted)')}</span><b>${esc(opponentName())}</b><small>invited</small></div>`;
    const foot = game.isHost
      ? `<button class="pstart ${game.canStart ? 'on' : ''} ${glow() ? 'glow' : ''}" data-press data-act="start" ${!game.canStart || game.preparingSongs ? 'disabled' : ''}>${game.preparingSongs ? 'Getting the songs ready…' : game.canStart ? 'Start the 1v1' : `Waiting for ${esc(opponentName())}`}</button>`
      : `<div class="pwait">${dots('var(--muted)')}<span>Waiting for ${esc(game.hostName || 'the host')} to start</span></div>`;
    return `${bar('1v1')}
      <div class="pscroll">
        ${note}
        <div class="pduel ${other ? 'met' : ''}"><div class="seats">${duelSeat(me, n || 'You')}${other ? duelSeat(other, other.name) : empty}</div><b class="vs">VS</b></div>
        ${game.isHost ? `<button class="psum card duel" data-press data-act="settings">${summary}</button>` : `<div class="psum card duel">${summary}</div>`}
      </div>
      ${foot}`;
  }

  function countdown() {
    const size = game.players.length > 6 ? 28 : 36, shown = strip();
    return `${roundHead(false)}<div class="flex"></div>
      <div class="pcount-screen"><small>${game.round === 0 ? 'GET READY' : 'NEXT UP'}</small>
        <div class="num ${glow() ? 'glow' : ''}" style="color:${accent()}" data-keep><span class="n"></span></div>
        <p>${cap(tier())} · listen, then pick it</p></div>
      <div class="flex"></div>
      <div class="pstrip" style="gap:${game.players.length > 6 ? 6 : 10}px;padding-bottom:44px">${shown.map(p => pav(p, size)).join('')}${overflow(shown.length, size)}</div>`;
  }

  function playing() {
    const n = game.players.length, size = n > 6 ? 26 : 34, shown = strip();
    const answered = shown.map(p => {
      const done = game.answered.includes(p.id);
      return `<span class="pans ${done ? 'done' : ''}" data-k="${esc(p.id)}">${pav(p, size)}${done ? `<i class="ck" data-enter style="color:${hueColor(p.hue)}">${I.checkCircle}</i>` : ''}</span>`;
    }).join('');
    let bottom;
    if (game.currentChoices.length) {
      const cap2 = game.myPick == null ? 'One tap. Wrong loses the round.' : game.answered.length < n ? 'Locked in. Waiting for the others…' : "Everyone's in!";
      bottom = `<div class="pchoices"><p style="color:${game.myPick == null ? 'var(--muted)' : myColor()}">${cap2}</p>${choiceGrid(game.currentChoices, { picked: game.myPick })}</div>`;
    } else if (game.iAnswered) {
      bottom = `<div class="plocked" style="border-color:${myColor()}80"><span class="ic" style="background:${myColor()}29;color:${myColor()}">${I.check}</span>
        <span class="tx"><b>Locked in</b><small>${game.answered.length < n ? 'Waiting for the others…' : "Everyone's in!"}</small></span>
        ${game.myPoints != null ? `<b class="pts mono" data-enter style="color:${myColor()}">+${game.myPoints}</b>` : ''}</div>`;
    } else {
      bottom = `<div class="pguess"><div class="hits"></div><div class="row"><input class="gin" placeholder="Name that track" autocomplete="off" spellcheck="false" enterkeyhint="send"><button class="gbtn" data-press data-act="guess" style="background:${accent()};color:${ink()}">Guess</button></div></div>`;
    }
    return `${roundHead(true)}<div class="flex"></div>
      <button class="pring ${glow() ? 'glow' : ''}" data-act="replay" aria-label="Replay the clip" data-keep>
        <svg viewBox="0 0 196 196"><circle cx="98" cy="98" r="${RING_R}" class="trk"/><circle cx="98" cy="98" r="${RING_R}" class="arc" style="stroke:${accent()}" stroke-dasharray="${RING_C}" stroke-dashoffset="0" transform="rotate(-90 98 98)"/></svg>
        <span class="in"><span class="eqw" style="color:${accent()}">${eq()}</span><b class="secs"></b><small class="lbl"></small></span>
      </button>
      <div class="pstrip answered" style="gap:${n > 6 ? 6 : 10}px">${answered}${overflow(shown.length, size)}</div>
      <div class="flex"></div>
      ${bottom}
      ${game.isHost ? `<button class="pskip" data-press data-act="skip">${I.skip}<span>Skip this one</span></button>` : ''}`;
  }

  function result() {
    const a = game.lastAnswer, pts = game.lastGained[game.myID] || 0;
    const ranked = game.sortedPlayers, top = Math.max(1, ...ranked.map(p => p.score)), cut = 8;
    let visible = ranked.slice(0, cut).map((p, i) => [i, p]);
    const mi = ranked.findIndex(p => p.id === game.myID); if (mi >= cut) visible.push([mi, ranked[mi]]);
    const rows = visible.map(([i, p]) => {
      const shown = revealed ? p.score : (scoresBefore[p.id] || 0), gained = game.lastGained[p.id] || 0, c = hueColor(p.hue);
      return `<div class="sbrow" data-k="${esc(p.id)}"><span class="rk mono" style="color:${i === 0 ? 'var(--medium)' : 'var(--dim)'}">${i + 1}</span>${pav(p, 30)}
        <div class="mid"><div class="top"><b class="${p.id === game.myID ? 'me' : ''}">${esc(p.name)}</b><div class="sp"></div>${gained > 0 ? `<span class="gain mono" style="color:${c}">+${gained}</span>` : ''}<span class="sc mono" data-keep data-to="${p.score}">${shown}</span></div>
        <div class="trackbar"><i style="background:${c};width:max(6px, ${(100 * shown / top).toFixed(2)}%)"></i></div></div></div>`;
    }).join('');
    const last = game.round + 1 >= game.settings.rounds;
    const verdictCol = pts > 0 ? myColor() : 'var(--muted)';
    return `<div class="pthead"><small class="rof">ROUND ${game.round + 1} OF ${game.settings.rounds}</small><div class="sp"></div><button class="xbtn sm" data-press data-act="close" aria-label="Leave">${I.x}</button></div>
      ${a ? `<div class="phero">${a.artwork ? `<span class="cov">${glow() ? `<img class="bloom" src="${esc(art(a.artwork, 300))}" alt="">` : ''}<img class="art" src="${esc(art(a.artwork, 300))}" alt=""></span>` : ''}
        <span class="tx"><small style="color:${accent()}">IT WAS_</small><b>${esc(a.title)}</b><span>${esc(a.artist)}</span></span></div>` : ''}
      <div class="pverdict" style="color:${verdictCol};background:${pts > 0 ? myColor() + '1f' : 'rgba(168,168,168,.12)'}"><i>${pts > 0 ? I.bolt : I.x}</i><span>${pts > 0 ? 'You scored' : game.wrong.has(game.myID) ? 'Wrong answer' : 'Missed it'}</span><div class="sp"></div><b class="mono">+${pts}</b></div>
      <div class="pboard ${revealed ? 'rev' : ''}">${rows}${ranked.length > cut ? `<small class="more">+${ranked.length - cut} more</small>` : ''}</div>
      <div class="flex"></div>
      ${game.isHost ? `<button class="pnext" data-press data-act="next" style="background:${accent()};color:${ink()}">${last ? 'See the podium' : 'Next round'}</button>`
        : `<div class="pwait h54">${dots('var(--muted)')}<span>Waiting for the host</span></div>`}`;
  }

  function finished() {
    const ranked = game.sortedPlayers, first = ranked[0];
    const order = [1, 0, 2].filter(i => i < ranked.length), heights = [132, 96, 72], delays = [0.55, 0.3, 0.75].map(d => d + 0.15);
    const podium = order.map(i => {
      const p = ranked[i], c = hueColor(p.hue);
 return `<div class="pod" style="--d:${delays[i]}s"><span class="ring" style="outline:2.5px solid ${c};outline-offset:1.75px">${pav(p, i === 0 ? 56 : 44)}${i === 0 ? `<i class="crown">${I.crown}</i>` : ''}</span>
        <b>${esc(p.name)}</b><span class="sc mono" style="color:${c}">${p.score}</span>
        <div class="blk" style="--h:${heights[i]}px;background:linear-gradient(${c}e6, ${c}59)"><span>${i + 1}</span></div></div>`;
    }).join('');
    const rest = ranked.slice(3).map((p, i) => `<div class="restrow"><span class="rk mono">${i + 4}</span>${pav(p, 26)}<b>${esc(p.name)}</b><div class="sp"></div><span class="mono">${p.score}</span></div>`).join('');
    return `${bar('Results')}
      <h2 class="pwin">${first ? (first.id === game.myID ? 'You win!' : `${esc(first.name)} wins!`) : 'Game over'}</h2>
      <div class="podium">${podium}</div>
      ${rest ? `<div class="rest">${rest}</div>` : ''}
      <div class="flex"></div>
      ${game.isHost ? '<button class="pagain" data-press data-act="again">Play again</button>' : ''}
      <button class="pleave" data-act="close">Leave the party</button>`;
  }

  const errorCard = () => `<div class="flex"></div><div class="perr"><i>${I.wifi}</i><p>${esc(game.error || 'Something went wrong.')}</p><button data-press data-act="back">Back</button></div><div class="flex"></div>`;

  // ---------- drawing ----------
  function render(force = false) {
    if (closed) return;
    const k = [game.phase, game.round, game.players.length, force ? Math.random() : ''].join('|');
    const screens = { idle: isDuel ? connecting : entry, connecting, lobby: isDuel ? duelLobby : lobby, countdown, playing, result, finished, error: errorCard };
    const phaseChanged = !key.startsWith(game.phase + '|');
    // Keep a typed guess or code through a redraw.
    const typed = scr.querySelector('.gin')?.value;
    const html = (screens[game.phase] || entry)();
    if (phaseChanged || force) {
      // The screens cross-fade: .transition(.opacity) under .easeOut(duration: 0.28).
      if (phaseChanged && key && !still() && scr.childElementCount) crossfade();
      scr.className = 'screen pt ph-' + game.phase;
      scr.style.setProperty('--pa', accent()); scr.style.setProperty('--pa-ink', ink());
      scr.innerHTML = html;
      countN = -1; secsShown = -1;
    } else {
      const lists = [...scr.querySelectorAll('.pgrid > [data-k], .pboard > [data-k]')], before = rects(lists);
      scr.style.setProperty('--pa', accent()); scr.style.setProperty('--pa-ink', ink());
      morph(scr, html);
      flip(scr.querySelectorAll('.pgrid > [data-k]:not(.enter):not(.leaving)'), before, MOTION['--sp-tile']);
      flip(scr.querySelectorAll('.pboard > [data-k]'), before, MOTION['--sp-order']);
    }
    if (typed && scr.querySelector('.gin')) { scr.querySelector('.gin').value = typed; refreshHits(); }
    key = k;
    frame();
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

  function onPhase(prev) {
    const p = game.phase;
    if (p === 'countdown' || (p === 'playing' && prev !== 'countdown')) {
      clip = { round: game.round, started: false, error: null, muted: document.hidden };
      scoresBefore = Object.fromEntries(game.players.map(x => [x.id, x.score]));
      revealed = false;
      player.stop();
      songFor(game.current?.songID).then(s => { if (s?.preview) player.prepare(s.id, s.preview).catch(() => {}); });
    }
    if (p === 'playing') startClipIfDue();
    if (p === 'result') {
      player.stop(); sound.reveal();
      setTimeout(() => { if (game.phase !== 'result' || closed) return; revealed = true; revealBoard(); }, 650);
    }
    if (p === 'finished') {
      player.stop(); wentAwayAt = null;
      if (!recordedGame) {
        recordedGame = true;
        const mine = game.me?.score || 0, won = game.sortedPlayers[0]?.id === game.myID;
        try { account.recordParty(won, mine, game.myRoundsWon); } catch (e) {}
      }
      clearTimeout(podiumTimer);
      podiumTimer = setTimeout(() => {
        if (game.phase !== 'finished' || closed) return;
        Haptics.success();
        sound.reveal();
        const c = hueColor(game.sortedPlayers[0]?.hue ?? 0), r = view.getBoundingClientRect();
        confetti(r.left + r.width / 2, r.top + r.height * 0.34, [c, '#ffffff', c], 140);
        // PartyView's confetti layer sits over the whole screen; the shared canvas sits under #views by default.
        const cv = [...document.querySelectorAll('canvas.confetti')].pop(); if (cv) cv.style.zIndex = '40';
      }, 1050);
    }
    if (p === 'lobby') { wentAwayAt = null; recordedGame = false; }
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

  /** The clip, on the host's clock: a phone that arrives late hears it from where the room is. */
  async function startClipIfDue(replay = false) {
    if (game.phase !== 'playing' || !game.current) return;
    if (!replay) {
      if (clip.started && clip.round === game.round) return;
      clip.round = game.round; clip.started = true;
      // Away when the clip is due, or away on the results screen a moment ago: no sound this round.
      if (document.hidden || (wentAwayAt && (Date.now() - wentAwayAt) / 1000 < SHAZAM_TAIL)) clip.muted = true;
      wentAwayAt = null;
      if (clip.muted) return;
    }
    const round = game.round, s = await songFor(game.current.songID);
    if (closed || game.phase !== 'playing' || game.round !== round || clip.muted) return;
    if (!s?.preview) { clip.error = 'no sound'; return; }
    const offset = replay ? 0 : Math.max(0, game.now - game.roundStartedAt);
    const seconds = Math.max(0.5, game.roundSeconds - offset);
    clip.error = null;
    const ok = await player.play(s.id, s.preview, seconds, offset);
    if (!ok) clip.error = player.lastError || 'no sound';
    else if (player.ctx && player.ctx.state !== 'running') clip.error = 'blocked';
  }

  /** 60 fps: the count, the ring, the seconds, the ring's words. */
  function frame() {
    cancelAnimationFrame(raf);
    if (closed) return;
    if (game.phase === 'countdown') {
      const n = Math.ceil(Math.max(0, game.roundStartedAt - game.now));
      if (n !== countN) {
        countN = n;
        const box = scr.querySelector('.num');
        // .id(countdownNumber): a new number each tick, slamming in from 1.35× at 0.2 opacity.
        if (box) { box.innerHTML = `<span class="n ${n > 0 ? '' : 'go'}">${n > 0 ? n : 'GO'}</span>`; }
        if (n > 0) sound.tick();
      }
    } else if (game.phase === 'playing') {
      const elapsed = Math.max(0, game.now - game.roundStartedAt), win = Math.max(1, game.roundWindow);
      const progress = Math.min(1, elapsed / win), left = Math.max(0, Math.ceil(game.roundWindow - elapsed));
      const arc = scr.querySelector('.pring .arc');
      if (arc) arc.setAttribute('stroke-dashoffset', (RING_C * progress).toFixed(2));
      if (left !== secsShown) { const s = scr.querySelector('.pring .secs'); if (s) { if (secsShown < 0) s.textContent = left; else roll(s, left, MOTION['--sp-num'], true); } secsShown = left; }
      const lbl = scr.querySelector('.pring .lbl'), eqw = scr.querySelector('.pring .eqw');
      if (lbl) {
        const on = player.playing;
        const txt = on ? 'listening' : clip.muted ? 'muted this round' : clip.error ? 'no sound — tap to retry' : 'tap to replay';
        if (lbl.textContent !== txt) { lbl.textContent = txt; lbl.style.color = clip.muted ? 'var(--dim)' : clip.error ? 'var(--expert)' : on ? accent() : 'var(--dim)'; }
        eqw.classList.toggle('on', on);
      }
      if (!clip.started) startClipIfDue();
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
        let scope = null;
        if (game.settings.easySearch) {
          scope = pool.filter(game.tier(game.round), game.settings.era || 'all', game.settings.category || 'all');
          const c = game.current && pool.byId.get(game.current.songID); if (c && !scope.includes(c)) scope = scope.concat([c]);
        }
        hits = pool.search(t, 5, scope);
      }
    }
    box.innerHTML = hits.map(s => `<button class="hit" data-act="hit" data-id="${esc(s.id)}" data-title="${esc(s.title)}"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></button>`).join('');
    box.classList.toggle('on', hits.length > 0);
  }
  const normT = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
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
    const exact = normT(t) === normT(c.title) || normT(t) === normT(`${c.title} ${c.artist}`);
    const best = game.catalogue.length ? null : pool.search(t, 1)[0];
    if (exact || best?.id === c.songID) { inp.value = ''; refreshHits(); game.submit(c.songID, t); } else wrongShake();
  }

  // ---------- the host's settings ----------
  function pickerHTML(title, options, value, field) {
    return `<div class="ppick"><small>${esc(title.toUpperCase())}</small><div class="opts">${options.map(([v, l]) =>
      `<button data-field="${field}" data-v="${esc(v)}" class="${String(v) === String(value) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div></div>`;
  }
  function settingsBody() {
    const s = game.settings;
    return `<div class="grab"></div><div class="pshead"><h3>Game settings</h3><button class="done" data-press data-sact="done">Done</button></div>
      <div class="psettings card">
        ${pickerHTML('Rounds', ROUND_OPTIONS.map(r => [r, String(r)]), s.rounds, 'rounds')}
        ${pickerHTML('Difficulty', DIFFICULTIES, s.difficulty, 'difficulty')}
        ${pickerHTML('Time per song', WINDOWS.map(w => [w, w + 's']), Math.round(s.guessWindow), 'window')}
        ${pickerHTML('Years', YEARS, s.era, 'era')}
        ${pickerHTML('Search', [['easy', 'Easy'], ['hard', 'Hard']], s.easySearch ? 'easy' : 'hard', 'search')}
        <button class="psongs" data-press data-sact="songs"><i style="color:var(--easy)">${s.artist ? I.mic : I.genres}</i><span class="l">Songs</span><div class="sp"></div><b>${esc(game.songsLabel)}</b><i class="chev">${I.chevron}</i></button>
      </div>`;
  }
  function openSettings() {
    if (settingsSheet) return;
    settingsSheet = openSheet(settingsBody(), { cls: 'party-sheet', label: 'Game settings', onClose: () => { settingsSheet = null; } });
    settingsSheet.body.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.sact === 'done') { sound.click(); settingsSheet.close(); return; }
      if (b.dataset.sact === 'songs') { sound.click(); openSongs(); return; }
      const f = b.dataset.field; if (!f) return;
      sound.click();
      const v = b.dataset.v, s = game.settings;
      if (f === 'rounds') s.rounds = parseInt(v, 10) || 10;
      if (f === 'difficulty') s.difficulty = v;
      if (f === 'window') { s.guessWindow = parseInt(v, 10) || 20; s.clipSeconds = s.guessWindow; }
      if (f === 'era') s.era = v;
      if (f === 'search') s.easySearch = v === 'easy';
      morph(settingsSheet.body, settingsBody());
      game.pushSettings(); render();
    });
  }
  function openSongs() {
    if (songsSheet) return;
    let tab = game.settings.artist ? 1 : 0, q = '';
    const draw = () => {
      const s = game.settings, typed = q.trim().toLowerCase();
      let list;
      if (tab === 0) {
        const hits = typed ? pool.categoryCounts.filter(c => c.name.toLowerCase().includes(typed)) : pool.categoryCounts;
        const rowG = (label, count, k) => { const on = !s.artist && s.category === k; return `<button class="gr ${on ? 'on' : ''}" data-genre="${esc(k)}"><span>${esc(label)}</span>${count != null ? `<small class="mono">${count}</small>` : ''}</button>`; };
        list = (typed ? '' : rowG('All genres', null, 'all')) + hits.map(c => rowG(c.name, c.count, c.name)).join('');
      } else {
        const hits = pool.artists.filter(a => a.count >= 4 && (!typed || a.name.toLowerCase().includes(typed))).sort((a, b) => b.count - a.count).slice(0, 60);
        list = (s.artist && !typed ? `<p class="playing">${I.checkCircle}<span>Playing ${esc(s.artist)} — ${game.catalogue.length} song${game.catalogue.length === 1 ? '' : 's'}</span></p>` : '')
          + (hits.length ? '<small class="sec">IN THE GAME · PLAYS INSTANTLY</small>' : '')
          + hits.map(a => `<button class="ar ${s.artist === a.name ? 'on' : ''}" data-artist="${esc(a.name)}"><span class="t"><b>${esc(a.name)}</b><small>${a.count} ready</small></span><i style="color:var(--easy)">${I.bolt}</i></button>`).join('');
      }
      return `<div class="grab"></div><div class="pshead"><h3 class="big">Songs</h3><button class="done" data-press data-sact="done">Done</button></div>
        <div class="ptabs">${['Genre', 'Artist'].map((t, i) => `<button data-tab="${i}" class="${tab === i ? 'on' : ''}">${t}</button>`).join('')}</div>
        <label class="ptsearch">${I.search}<input value="${esc(q)}" placeholder="${tab === 0 ? 'Search genres' : esc(s.artist || 'Search any artist')}" autocomplete="off" spellcheck="false"></label>
        <div class="ptlist">${list}</div>`;
    };
    songsSheet = openSheet(draw(), { cls: 'party-sheet tall', label: 'Songs', onClose: () => { songsSheet = null; } });
    const body = songsSheet.body;
    const redraw = () => { const had = document.activeElement?.tagName === 'INPUT'; body.innerHTML = draw(); if (had) { const i = body.querySelector('input'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
    body.addEventListener('input', e => { if (e.target.tagName === 'INPUT') { q = e.target.value; redraw(); } });
    body.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.sact === 'done') { sound.click(); songsSheet.close(); return; }
      if (b.dataset.tab != null) { sound.click(); tab = +b.dataset.tab; q = ''; redraw(); return; }
      if (b.dataset.genre != null) { sound.click(); await game.setCategory(b.dataset.genre); redraw(); refreshSettings(); return; }
      if (b.dataset.artist != null) {
        sound.click();
        const a = b.dataset.artist, songs = pool.songs.filter(s => s.artist === a && s.preview);
        await game.setArtist(a, songs); refreshSettings();
        songsSheet.close();
      }
    });
  }
  const refreshSettings = () => { if (settingsSheet) morph(settingsSheet.body, settingsBody()); render(); };

  // ---------- actions ----------
  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf); clearTimeout(podiumTimer);
    player.stop();
    settingsSheet?.close(); songsSheet?.close();
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('keydown', onKey);
    off();
    game.leave().catch(() => {}).finally(() => player.stop());
    popView(view);
  }
  function host() {
    if (!ctx.premium) { ctx.openPremium('host'); return; }
    player.ensure();
    game.host(account.displayName, account.avatar);
  }
  function join() {
    if (codeEntry.length !== 5) return;
    player.ensure();
    game.join(codeEntry, account.displayName, account.avatar);
  }
  /** A challenge: host a 5-round room for two and seat the friend (Songbot answers from here). */
  async function startFromLaunch() {
    if (game.phase !== 'idle') return;
    game.seatLimit = 2;
    player.ensure();
    await game.host(account.displayName, account.avatar);
    if (game.phase !== 'lobby' || closed) return;
    game.settings.rounds = 5;
    await game.pushSettings();
    if (launch.bot) { await game.addBot(launch.name); challengeNote = `${launch.name} accepted. Start when you're ready.`; }
    else challengeNote = `Invited ${launch.name}. Waiting for them…`;
    render();
  }
  function share() {
    const c = game.code;
    shareText(`Join my Songspot party — open Songspot, tap Party and enter the code ${c}. Or play in your browser: https://songspotapp.com/?party=${c}`, 'Copied. Send it to your friends.');
  }

  view.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-choice]'); if (!b || b.disabled) return;
    const choice = b.dataset.choice;
    if (choice != null) { sound.click(); Haptics.press(0.7); game.pick(choice); return; }
    const act = b.dataset.act;
    if (act !== 'replay') sound.click();
    switch (act) {
      case 'close': close(); break;
      case 'premium': ctx.openPremium('host'); break;
      case 'profile': ctx.openProfile ? ctx.openProfile() : null; break;
      case 'host': host(); break;
      case 'join': join(); break;
      case 'share': share(); break;
      case 'settings': openSettings(); break;
      case 'start': game.start(); break;
      case 'skip': game.skipRound(); break;
      case 'next': game.nextRound(); break;
      case 'again': game.playAgain(); break;
      case 'back': game.leave(); break;
      case 'guess': submitTyped(); break;
      case 'hit': {
        const c = game.current; if (!c) break;
        if (b.dataset.id === c.songID) { game.submit(c.songID, b.dataset.title); scr.querySelector('.gin').value = ''; refreshHits(); } else wrongShake();
        break;
      }
      case 'replay':
        player.ensure();
        if (game.phase === 'playing' && !player.playing && !clip.muted) { sound.click(); startClipIfDue(true); }
        break;
    }
  });
  view.addEventListener('input', e => {
    if (e.target.classList.contains('pcode')) {
      const n = normaliseCode(e.target.value);
      if (n !== e.target.value) e.target.value = n;
      codeEntry = n;
      e.target.classList.toggle('full', n.length === 5);
      const go = scr.querySelector('.pgo'); go.disabled = n.length !== 5; go.classList.toggle('on', n.length === 5);
    }
    if (e.target.classList.contains('gin')) refreshHits();
  });
  view.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.classList.contains('pcode')) join();
    if (e.target.classList.contains('gin')) submitTyped();
  });
  const onKey = e => { if (e.key === 'Escape' && !settingsSheet && !songsSheet && document.querySelector('#views > .view:last-child') === view) close(); };
  document.addEventListener('keydown', onKey);
  // Leaving the tab silences the clip for the rest of the round (a phone's Shazam lives one swipe away).
  const onVis = () => {
    if (!document.hidden) { if (wentAwayAt) wentAwayAt = Date.now(); return; }
    if (game.phase === 'countdown' || game.phase === 'playing') { player.stop(); clip.muted = true; wentAwayAt = Date.now(); render(); }
    else if (game.phase === 'result' || game.phase === 'finished') wentAwayAt = Date.now();
  };
  document.addEventListener('visibilitychange', onVis);

  let lastPhase = game.phase;
  const offGame = game.onChange(() => {
    const prev = lastPhase; lastPhase = game.phase;
    if (prev !== game.phase) onPhase(prev);
    render();
  });
  const offAccount = account.onChange ? account.onChange(() => { if (game.phase === 'idle') render(); }) : () => {};
  const off = () => { offGame(); offAccount(); };

  pushView(view);
  render();
  // A party link: straight into the room.
  if (opts.join && codeEntry.length === 5) setTimeout(join, 0);
  if (knob('showJoining')) { codeEntry = 'BCDFG'; setTimeout(join, 0); }
  if (launch) setTimeout(startFromLaunch, 0);
  return view;
}
