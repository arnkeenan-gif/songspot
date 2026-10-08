// Ranked on the web: one song, two people, the faster right answer takes it.
// Five rounds, harder the higher you climb, rank points on a ladder of Bronze
// to Legend (ladder.js), each rank in its own colour. The screens of
// Ranked/RankedView.swift, LeaderboardView.swift and EraReel.swift (the live
// parts: CoverEraReel, DecadeMosaic, DecadeSleeve), in front of the drifting
// album wall (coverwall.js). The match itself is rankedgame.js: a real player
// found in the same rank's queue over Supabase Realtime (rankedline.js), the
// iPhone's own protocol, or a stand-in after 5 s when nobody is looking.
import { el, esc, alpha, pushView, popView, openSheet, sleep, cap, TIER_COLOR, TIER_INK, PILL_FILL, PILL_INK, LevelTheme, hueColor, mix, settings as store } from './ui.js';
import { I, sf } from './icons.js';
import { choiceGrid, updateChoiceGrid, deal as dealBoard, toChoice } from './choices.js';
import { Haptics } from './haptics.js';
import { supabase } from './supabase.js';
import { confetti } from './confetti.js';
import { spring, bezier, still } from './motion.js';
import { Ladder } from './ladder.js';
import { CoverWall } from './coverwall.js';
import { PanelColours, glossy, stageLight, roundBanner, countRing, popCount, capsLine, fit } from './kit.js';
import { faceHTML, figureHTML, myIndex, indexForKey, parseChoice, variantOf, hasPose, PlayerName, NameFilter, PoseMotion } from './characters.js';
import { mountBackdrop } from './season.js';
import { ShazamWatch, watchScene } from './shazamguard.js';
import { Connection } from './offline.js';
import { RankedGame, RK } from './rankedgame.js';
import { makeSeat, rankedLog, RankedTest } from './rankedline.js';

export { RK };
const MEDALS = { 1: '#ffd166', 2: '#c9ced6', 3: '#d08b5b' };
const MUTED = '#a8a8a8', DIM = '#4a4a4a', TEXT = '#f2f2f2';
const CROWN = '#ffd166';
const REF = 978307200; // Date.timeIntervalSinceReferenceDate's epoch, so the crown's jump runs on the figure's clock

function ensureCSS(name) {
  if (document.getElementById('css-' + name) || document.querySelector(`link[href*="/app/css/${name}.css"]`)) return;
  const l = document.createElement('link'); l.id = 'css-' + name; l.rel = 'stylesheet'; l.href = `/app/css/${name}.css?v=1`; document.head.appendChild(l);
}

// ---------- CoverEraReel (EraReel.swift) ----------
// Seven decades, two laps, 2.3 s: lands with a beat to spare before the 3 s count runs out.
const DECADES = ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'];
const REEL = { laps: 2, duration: 2.3, side: 168, spacing: 132, height: 230, mosaic: 16 };
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
/** The index of the card the reel stops on (an unknown decade lands on the 80s). */
const reelTarget = era => { const d = DECADES.indexOf(era); return REEL.laps * DECADES.length + (d < 0 ? 2 : d); };
/** Where the reel is, in cards, `t` seconds in: fast, then a long ease into the stop. */
const reelPosition = (t, era) => reelTarget(era) * (1 - Math.pow(1 - clamp(t / REEL.duration), 3.2));
const decadeIndex = i => ((i % DECADES.length) + DECADES.length) % DECADES.length;
/** DecadeSleeve.colours: the panel gradients the rest of the app uses, a decade each. */
const sleeveColours = era => ({ '60s': PanelColours.blue, '70s': PanelColours.pink, '80s': PanelColours.green, '90s': PanelColours.gold,
  '2000s': PanelColours.orange, '2010s': PanelColours.red, '2020s': PanelColours.purple })[era] || PanelColours.teal;
const grad = cs => `linear-gradient(to bottom right, ${cs.join(', ')})`;
/** DecadeMosaic: a 4×4 grid of that decade's albums, edge to edge, the decade across the foot. */
function mosaicHTML(era, covers) {
  const cells = Array.from({ length: 16 }, (_, k) => `<img src="${esc(covers[k % covers.length])}" alt="" decoding="async" draggable="false">`).join('');
  return `<div class="rk-mosaic" style="background:${grad(sleeveColours(era))}"><div class="rk-mgrid">${cells}</div><i class="rk-mshade"></i><b class="${era.length > 3 ? 'long' : ''}">${esc(era)}</b></div>`;
}
/** DecadeSleeve (no covers): the decade's gradient, grooves ringing a vinyl in the corner, a sheen, the decade. */
function sleeveHTML(era) {
  const cs = sleeveColours(era), cx = 70, cy = 33, disc = 46;
  let rings = '';
  for (let r = disc * 0.5 + 5; r < 150; r += 7.5) rings += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="0.8"/>`;
  const grooves = [1, 2, 3].map(k => `<circle cx="${cx}" cy="${cy}" r="${(disc / 2 - disc * 0.07 * k).toFixed(2)}" fill="none" stroke="rgba(255,255,255,.09)" stroke-width=".5"/>`).join('');
  return `<div class="rk-sleeve" style="background:${grad(cs)}"><svg viewBox="0 0 100 100" aria-hidden="true">${rings}<circle cx="${cx}" cy="${cy}" r="${disc / 2}" fill="#0b0d0c"/>${grooves}<circle cx="${cx}" cy="${cy}" r="${disc * 0.18}" fill="${cs[0]}"/><circle cx="${cx}" cy="${cy}" r="${disc * 0.035}" fill="#0b0d0c"/></svg><i class="rk-ssheen"></i><b class="${era.length > 3 ? 'long' : ''}">${esc(era)}</b></div>`;
}
/** CoverWall.decadeMosaics: for each decade, its easy and medium songs shuffled, each album once, 17 covers at 150 px. */
function decadeMosaics(pool) {
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return DECADES.map(era => {
    const seen = new Set(), out = [];
    for (const s of shuffle(pool.filter('easy', era).concat(pool.filter('medium', era)))) {
      if (out.length >= REEL.mosaic + 1) break;
      const k = ((s.album || s.title) + '').toLowerCase() + '|' + (s.artist || '').toLowerCase();
      if (seen.has(k) || !s.artwork) continue;
      seen.add(k);
      const url = s.artwork.replace('{w}x{h}', '150x150');
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ id: s.id, url });
    }
    return out;
  });
}

const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

/**
 * .contentTransition(.numericText()): only the characters that changed move — the old one out, the new
 * one in, sliding vertically with a blur and a fade (up as a number grows, down when it counts down).
 */
function numText(node, value, anim, down = false) {
  if (!node) return;
  const next = String(value), prev = node.dataset.v ?? node.textContent;
  node.dataset.v = next;
  if (prev === next) return;
  if (still() || !node.isConnected) { node.textContent = next; return; }
  const a = [...prev], b = [...next], n = Math.max(a.length, b.length), pa = n - a.length, pb = n - b.length;
  const dir = down ? -1 : 1, opt = { duration: anim.ms, easing: anim.easing, fill: 'both' };
  node.textContent = '';
  for (let i = 0; i < n; i++) {
    const o = i >= pa ? a[i - pa] : '', c = i >= pb ? b[i - pb] : '';
    if (o === c) { node.append(c); continue; }
    const cell = document.createElement('span'); cell.className = 'nt';
    const inn = document.createElement('span'), out = document.createElement('span');
    inn.textContent = c; out.textContent = o; out.className = 'nt-o';
    cell.append(inn); if (o) cell.append(out); node.append(cell);
    if (o) out.animate([{ transform: 'none', opacity: 1, filter: 'blur(0)' }, { transform: `translateY(${-dir * 45}%) scale(.8)`, opacity: 0, filter: 'blur(3px)' }], opt);
    if (c) inn.animate([{ transform: `translateY(${dir * 45}%) scale(.8)`, opacity: 0, filter: 'blur(3px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }], opt);
  }
}
/** An inserted view's .transition(.scale(scale: from).combined(with: .opacity)). */
function popIn(node, from, sp) {
  if (still() || !node) return;
  node.animate([{ transform: `scale(${from})`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: sp.ms, easing: sp.easing });
}
// Glyphs: list.number, and the form/score marks (checkmark, xmark, minus at weight .black, the delta triangles).
const LIST = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><rect x="9" y="4.8" width="12" height="2.4" rx="1.2"/><rect x="9" y="10.8" width="12" height="2.4" rx="1.2"/><rect x="9" y="16.8" width="12" height="2.4" rx="1.2"/></g><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 4.6l1.3-.9v4.4"/><path d="M3.3 11.2a1.3 1.3 0 0 1 2.5.4c0 .9-2.5 2.2-2.5 2.6h2.6"/><path d="M3.4 16.6h2.3l-1.2 1.3a1.2 1.2 0 1 1-1.2 1.6"/></g></svg>';
const MARK = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.8l4.8 4.7L19.5 7"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 4.5l9 14.5H3z"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 19.5L3 5h18z"/></svg>',
};
/** RankEmblem: the glossy crest of a rank (Emblems/rank-0…6), its name as the label. */
const emblem = (tier, size) => `<img class="rk-emblem" src="/app/img/emblems/rank-${Math.min(6, Math.max(0, tier.index))}.webp" alt="${esc(tier.name)}" width="${size}" height="${size}" style="width:${size}px;height:${size}px" draggable="false">`;
const eqBars = (cls = '') => `<span class="rk-eq ${cls}"><i></i><i></i><i></i><i></i><i></i></span>`;

export function mountRanked(ctx) {
  const { pool, player, sound, account } = ctx;
  ensureCSS('kit');
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const Q = local ? new URLSearchParams(location.search) : new URLSearchParams();
  const demo = Q.get('rankedDemo');
  const glowOn = () => store.get('glow', false);
  const artOn = () => store.get('artwork', true);

  const game = new RankedGame(pool);
  game.nameFilter = n => NameFilter.shown(n);
  // ?rankedDemo=play: a whole match against the stand-in that banks nothing.
  const practice = demo === 'play';
  let frozen = false;   // a held demo screen: nothing banked, nothing posted

  // The album wall behind the waiting screens: one of its ten cover sets, picked each time ranked opens.
  const wallCovers = CoverWall.covers(pool, { preset: CoverWall.randomPreset() });
  const view = el(`<div class="view ranked" role="dialog" aria-modal="true" aria-label="Ranked">
    <div class="rk-backdrop"></div>
    ${CoverWall.html(wallCovers, 0.84, 'fixed')}
    <div class="rk-light">${stageLight('#19df70')}</div><div class="rk-light">${stageLight('#19df70')}</div>
    <i class="rk-pool"></i>
    <div class="screen rk-screen"></div>
  </div>`);
  const backdrop = (() => { try { return mountBackdrop(view.querySelector('.rk-backdrop')); } catch (e) { return null; } })();
  const wall = view.querySelector('.cwall');
  const lights = view.querySelectorAll('.rk-light');
  const poolLight = view.querySelector('.rk-pool');
  let screen = view.querySelector('.rk-screen');
  for (const [k, r, d] of [['card', 0.4, 0.6], ['vs', 0.34, 0.5], ['title', 0.45, 0.82], ['reel', 0.5, 0.72], ['side', 0.4, 0.6], ['verdict', 0.5, 0.55],
    ['badge', 0.55, 0.7], ['plate', 0.45, 0.8], ['pop', 0.3, 0.45], ['tally', 0.5, 0.65], ['reach', 0.4, 0.7], ['pip', 0.3, 0.55]]) view.style.setProperty('--sp-' + k, spring(r, d).css);

  let closed = false, confirmOpen = false, boardOpen = false;
  let anim = 0;
  const wait = async (ms, token) => { await sleep(ms); return !closed && token === anim; };

  const inRound = () => ['countdown', 'playing', 'roundResult'].includes(game.phase);
  /** Inside a round, the round's difficulty; outside, Easy (only the page uses it — the colour out of a round is the rank's). */
  const tier = () => (inRound() ? game.tier(game.round) : 'easy');
  const place = () => Ladder.place(account.stats.rp || 0);
  const accent = () => (inRound() ? TIER_COLOR[tier()] : place().tier.color);
  const accentInk = () => (inRound() ? TIER_INK[tier()] : place().tier.ink);
  const myColour = hueColor(0);
  const theirColour = () => hueColor(game.opponentHue);
  /** First names on the match screens: two full names side by side do not fit. Display only. */
  const myShownName = () => PlayerName.first((account.name || '').trim() ? account.name : 'You');
  const theirShownName = () => PlayerName.first(game.opponentName);
  const myCartoon = () => myIndex(account);
  /** A person sends their own character; a stand-in has only a name, so the name is the key. */
  const theirCartoon = () => (game.opponentFace != null ? game.opponentFace : indexForKey(game.opponentName));
  const myVariant = pose => variantOf(parseChoice(account.avatar), pose);
  /** Ranked is premium, with one free match for a new player (StageView.rankedOpen). */
  const canPlay = () => !!ctx.premium || (account.stats.rankedPlayed || 0) === 0;
  const freeMatch = () => !ctx.premium && (account.stats.rankedPlayed || 0) === 0;
  /** Out of free matches: close ranked and show premium. */
  function locked() { quit(); setTimeout(() => ctx.openPremium('ranked'), 450); }
  /** One round picture, or its owner's character, on a circle of `colour` at .9. */
  const face = (cartoon, colour, size) => faceHTML(cartoon, '', size, { style: `background:${alpha(colour, 0.9)}`, cls: 'rk-face' });

  // ---------- the decade cards: new albums every match, never the round's own song ----------
  let mosaics = [], reelCovers = null;
  function reshuffleDecadeCovers() {
    mosaics = decadeMosaics(pool);
    // CoverCache.prefetch: the covers load while the search runs.
    for (const d of mosaics) for (const c of d) { const im = new Image(); im.decoding = 'async'; im.src = c.url; }
  }
  const decadeCovers = () => mosaics.map(d => d.filter(c => c.id !== game.current?.id).map(c => c.url).slice(0, REEL.mosaic));

  async function playable(s) {
    if (!s?.preview) return false;
    try { await Promise.race([player.prepare(s.id, s.preview), sleep(8000).then(() => { throw new Error('slow'); })]); return true; } catch (e) { return false; }
  }
  /** Me, as the other player will see me. The id is new for every search. */
  const mySeat = () => makeSeat({ name: (account.name || '').trim() || 'Player', rating: account.stats.rating, rp: account.stats.rp || 0,
    face: myCartoon(), form: (account.stats.recentRanked || []).slice(-5) });

  function findMatch() {
    if (!canPlay()) { locked(); return; }
    player.ensure();
    reshuffleDecadeCovers();
    if (Q.has('fakeResult')) { frozen = true; game.demoFinish(account.stats.rating, true); game.demoRP(account.stats.rp || 0); return; }
    frozen = false;
    game.practice = practice;
    game.start(mySeat(), playable);
  }

  // ---------- the clip and the anti-Shazam rule (ShazamWatch) ----------
  let clipStarted = false, roundMuted = false, clipError = null, heldBySlip = false, wentAwayAt = 0, backgroundAt = 0;
  const shazam = new ShazamWatch();
  const awayJustBefore = () => wentAwayAt && (performance.now() - wentAwayAt) / 1000 < ShazamWatch.TAIL;
  async function playClip() {
    const c = game.current;
    if (game.phase !== 'playing' || !c || player.playing || roundMuted) return;
    const ok = await player.play(c.id, c.preview, RK.window);
    if (!ok && game.current === c && game.phase === 'playing') clipError = player.lastError || "Couldn't load the clip.";
  }
  function startClip() {
    if (clipStarted || !game.current) return;
    clipStarted = true;
    if (document.hidden || awayJustBefore()) roundMuted = true;
    wentAwayAt = 0;                       // the tail is spent on this clip
    if (roundMuted || frozen) return;
    // Due under an overlay: it starts when the overlay goes, if that was only a slip.
    if (shazam.covered) { heldBySlip = true; return; }
    playClip();
  }
  function replay() {
    if (game.phase !== 'playing' || player.playing || roundMuted) return;
    sound.click(); Haptics.press(0.8);
    clipError = null;
    playClip();
  }
  const unwatch = watchScene(shazam, v => {
    switch (v) {
      case 'covered': if (game.phase === 'playing' && player.playing) { player.stop(); heldBySlip = true; } break;
      case 'slip': if (heldBySlip) { heldBySlip = false; playClip(); } break;
      case 'left':
        player.stop(); heldBySlip = false;
        // From the card to the last round. A switch away between matches or during the search is waiting.
        wentAwayAt = ['idle', 'searching', 'finished', 'error'].includes(game.phase) ? 0 : performance.now();
        if (game.phase === 'playing') roundMuted = true;
        break;
      case 'returned': if (wentAwayAt) wentAwayAt = performance.now(); break;
    }
  });
  // Background > 6 s in a real match: the other player has been given the win by now. Agree with them.
  function onVis() {
    if (document.hidden) { if (game.inMatch) backgroundAt = Date.now(); return; }
    if (!backgroundAt) return;
    const away = Date.now() - backgroundAt; backgroundAt = 0;
    if (game.real && game.inMatch && away > 6000) game.forfeit();
  }
  document.addEventListener('visibilitychange', onVis);
  // The offline cover hides the board, so a stand-in match waits under it and picks up once back online.
  const offConn = Connection.onChange(up => { if (up) { game.resume(); return; } if (!game.real) player.stop(); game.suspend(); });

  // ---------- phases → screens ----------
  let renderedPhase = null;
  let reelStartedAt = null, reelSlot = -1, reelLanded = false, secondsShown = -1, lastSecs = -1, shown = false;
  let searchStarted = 0, searchSecs = -1, holdStop = null;
  game.onChange = () => {
    if (closed) return;
    const p = game.phase;
    if (p !== renderedPhase) { renderedPhase = p; phaseChanged(p); return; }
    switch (p) {
      case 'searching': updateSearchLabel(); break;
      case 'found': patchFound(); break;
      case 'countdown': updateCountdown(); break;
      case 'playing': updatePlaying(); break;
    }
  };

  // Every phase is its own view, cross-faded: .transition(.opacity) under .animation(.easeOut(duration: 0.28), value: phaseKey).
  function swap(p) {
    const old = screen;
    screen = document.createElement('div');
    screen.className = 'screen rk-screen rk-' + p;
    old.after(screen);
    if (!old.childElementCount || still()) { old.remove(); return; }
    old.classList.add('rk-leaving');
    old.style.opacity = '0';
    screen.style.opacity = '0';
    requestAnimationFrame(() => { screen.style.opacity = ''; });
    setTimeout(() => old.remove(), 300);
  }
  /** How dark the veil is over the album wall on each screen (CoverWall(veil:)); no wall while a song plays. */
  const VEIL = { idle: 0.84, searching: 0.7, found: 0.84, countdown: 0.86, roundResult: 0.84, finished: 0.84 };
  function paintTheme() {
    LevelTheme.setOverride(tier());
    view.style.setProperty('--rk-accent', accent());
    view.style.setProperty('--rk-ink', accentInk());
    view.classList.toggle('glow', glowOn());
    view.classList.toggle('artless', !artOn());
  }
  function setLight(i, colour, opacity) {
    const l = lights[i], sl = l.querySelector('.k-stagelight');
    if (colour) { const h = colour.replace('#', ''); sl.style.setProperty('--a', [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16)).join(',')); }
    l.style.opacity = String(opacity);
  }
  function phaseChanged(p) {
    anim++;
    paintTheme();
    // Friends.shared.inParty = game.inMatch: no challenge banners over a live match (friends.js can read .rk-inmatch).
    view.classList.toggle('rk-inmatch', game.inMatch);
    wall.classList.toggle('off', !(p in VEIL));
    if (p in VEIL) wall.style.setProperty('--veil', VEIL[p]);
    // The fight card's light, and the result's (it takes the verdict's colour once the tally is done).
    setLight(0, accent(), p === 'found' ? 0.7 : p === 'finished' ? 0.4 : 0);
    setLight(1, null, 0);
    poolLight.classList.toggle('on', p === 'idle');
    if (holdStop) { holdStop(); holdStop = null; }
    swap(p);
    switch (p) {
      case 'idle': screen.innerHTML = entryHTML(); if (!shown) { shown = true; screen.querySelector('.rk-entry-all').classList.add('fadein'); } break;
      case 'searching':
        // A match that ended without a round result left the reel landed; a real opponent gone in round one leaves its clip playing.
        reelStartedAt = null; reelSlot = -1; reelLanded = false;
        player.stop();
        searchStarted = performance.now(); searchSecs = -1; screen.innerHTML = searchHTML(); tickSearch(searchStarted);
        break;
      case 'found': screen.innerHTML = foundHTML(); runCard(); break;
      case 'countdown':
        clipStarted = false; roundMuted = false; clipError = null; heldBySlip = false; reelCovers = null;
        // One spin per round, started the moment the countdown opens (-showIntro holds it landed; &introRoll rolls it).
        if (reelStartedAt == null) { reelStartedAt = performance.now(); reelSlot = -1; reelLanded = false; }
        if (demo === 'intro') { reelStartedAt = null; if (Q.has('introRoll')) setTimeout(() => { reelStartedAt = performance.now(); reelSlot = -1; reelLanded = false; }, 400); }
        Haptics.press(0.8);
        if (game.current && !frozen) player.prepare(game.current.id, game.current.preview).catch(() => {});
        screen.innerHTML = countdownHTML();
        secondsShown = -1; updateCountdown(); drawReel(performance.now());
        // introIn: the title card slides in a beat after the screen appears.
        setTimeout(() => screen.classList.add('in'), 40);
        break;
      case 'playing':
        lastSecs = -1; screen.innerHTML = playingHTML(); tickPlaying(performance.now());
        if (Q.has('autoAnswer') && game.current) {
          // -autoAnswer: a tap 2–7 s in, right three times in four, so two pages can play a whole match.
          const r = game.round, c = game.current;
          setTimeout(() => {
            if (game.phase !== 'playing' || game.round !== r) return;
            const wrong = game.currentChoices.find(x => x.id !== c.id)?.id;
            pick(Math.floor(Math.random() * 4) === 0 ? (wrong ?? c.id) : c.id);
          }, (2 + Math.random() * 5) * 1000);
        }
        break;
      case 'roundResult':
        player.stop(); sound.reveal();
        screen.innerHTML = resultHTML(); runHold();
        // Cleared here so the next round's reel starts from nil and spins again.
        reelStartedAt = null;
        break;
      case 'finished': player.stop(); screen.innerHTML = finishedHTML(); runEnd(); break;
      case 'error': screen.innerHTML = errorHTML(); break;
    }
    if (p === 'found' && Q.has('stopAtFound')) setTimeout(() => { if (game.phase === 'found') game.leave(); }, 1000);
    try { fit(screen); } catch (e) {}
    view.scrollTop = 0;
  }

  const bar = (title = 'Ranked') => `<div class="rk-bar"><h1>${esc(title)}</h1><button class="rk-xbtn" data-press data-act="quit" aria-label="Close">${I.x}</button></div>`;

  /** Your own character inside a ring that fills as your rank does. The ring's colour is the rank. */
  function rankBadge(rp, size) {
    const p = Ladder.place(rp), c = p.tier.color, ring = Math.max(3, size * 0.055), r = size / 2, frac = Math.max(0.03, p.fraction);
    return `<div class="rk-badge" style="width:${size}px;height:${size}px;--glow:${alpha(c, 0.35)}">
      <svg viewBox="0 0 ${size} ${size}" overflow="visible" aria-hidden="true"><circle cx="${r}" cy="${r}" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="${ring}"/>
      <circle cx="${r}" cy="${r}" r="${r}" fill="none" stroke="${c}" stroke-width="${ring}" stroke-linecap="round" pathLength="1" stroke-dasharray="${frac} 1" transform="rotate(-90 ${r} ${r})"/></svg>
      ${face(myCartoon(), c, Math.round(size - ring * 3.2))}</div>`;
  }
  /** Recent form: the last five, oldest first. A tick, a cross, a dash where there is no game yet. */
  function formRow(form) {
    const last = (form || []).slice(-5), padded = Array(Math.max(0, 5 - last.length)).fill(-1).concat(last);
    const m = r => (r === 1 ? [MARK.check, TIER_COLOR.easy] : r === 0 ? [MARK.x, TIER_COLOR.expert] : r === 2 ? [MARK.minus, MUTED] : [MARK.minus, DIM]);
    return `<div class="rk-form">${padded.map(r => { const [icon, c] = m(r); return `<span style="color:${c};background:${alpha(c, r < 0 ? 0.08 : 0.18)}">${icon}</span>`; }).join('')}</div>`;
  }

  // ---------- entry: the ranked home, the first version's look, nothing in a box ----------
  function entryHTML() {
    const s = account.stats, p = place(), tint = p.tier.color, rp = s.rp || 0;
    poolLight.style.setProperty('--tint', tint);
    const best = Ladder.place(s.bestRP || 0).tier;
    const streak = (s.winStreak || 0) >= 2 ? `<span>·</span><span class="rk-hot">${sf('flame.fill')}<b>${s.winStreak} win streak</b></span>` : '';
    const record = (label, value, colour = TEXT, word = false) => `<div><b class="${word ? 'word' : ''}" style="color:${colour}" data-fit="0.7">${esc(value)}</b><span>${esc(label)}</span></div>`;
    const title = canPlay() ? (freeMatch() ? 'Play your free match' : 'Find a match') : 'Unlock ranked with Premium';
    return `<div class="rk-entry-all" style="--tint:${tint}">${bar()}<div class="rk-fill"></div>
      <div class="rk-hbadge">${rankBadge(rp, 148)}<span class="rk-hemb">${emblem(p.tier, 62)}</span></div>
      <div class="rk-rankname" data-fit="0.7">${esc(p.name)}</div>
      <div class="rk-rp">${rp} RP</div>
      ${rankProgress(rp)}
      <div class="rk-record">${record('Played', String(s.rankedPlayed || 0))}<i></i>${record('Won', String(s.rankedWon || 0))}<i></i>${record('Best', best.name, (s.bestRP || 0) > 0 ? best.color : TEXT, true)}</div>
      <div class="rk-season">${sf('calendar')}<span>${esc(Ladder.seasonCountdown())}</span>${streak}</div>
      <div class="rk-fill"></div>
      <button class="rk-lb" data-press data-act="board">${LIST}<span>Leaderboard</span><i>${sf('chevron.right')}</i></button>
      <div class="rk-gowrap">${glossy({ title, colours: canPlay() ? PanelColours.green : PanelColours.gold, height: 58, key: 'find', attrs: 'data-act="find"' })}</div>
      </div>`;
  }
  function rankProgress(rp) {
    const p = Ladder.place(rp);
    return `<div class="rk-progress"><div class="rk-track"><i style="width:max(6px, ${p.fraction * 100}%);background:${p.tier.color}"></i></div>
      <div class="rk-to">${p.nextAt != null ? `<b>${p.nextAt - rp} RP</b> to ${esc(Ladder.place(p.nextAt).name)}` : 'Top rank'}</div></div>`;
  }

  // ---------- the search: one line, your rank, the seconds beside an equaliser. No avatar. ----------
  const searchLabel = () => (game.preparing ? 'Getting the songs ready' : 'Finding an opponent');
  function updateSearchLabel() {
    const l = screen.querySelector('.rk-find'); if (!l || l.dataset.v === searchLabel()) return;
    l.dataset.v = searchLabel();
    // .contentTransition(.opacity)
    if (still()) { l.textContent = searchLabel(); return; }
    l.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-out' }).finished.then(() => { l.textContent = l.dataset.v; l.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' }); }, () => {});
  }
  function searchHTML() {
    const p = place();
    return `${bar()}<div class="rk-fill"></div>
      <div class="rk-find" data-v="${searchLabel()}">${searchLabel()}</div>
      <div class="rk-findsub" style="color:${p.tier.color}">${esc(p.name)} · ${account.stats.rp || 0} RP</div>
      <div class="rk-clock" style="--rk-accent:${p.tier.color}">${eqBars('on rk-eq14')}<b class="rk-clockt">0:00</b></div>
      ${RankedTest.on ? `<div class="rk-testq">test queue "${esc(RankedTest.prefix.slice(0, -1))}"</div>` : ''}
      <div class="rk-fill"></div>
      <button class="rk-cancel" data-press data-act="cancel">Cancel</button>`;
  }
  function tickSearch(now) {
    const secs = Math.max(0, Math.floor((now - searchStarted) / 1000));
    if (secs === searchSecs) return;
    searchSecs = secs;
    const t = screen.querySelector('.rk-clockt'); if (!t) return;
    numText(t, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, spring(0.55, 0.825));
  }

  // ---------- the fight card ----------
  /** One side: the player standing full-body in their fight stance, in their own light, then name, rank, RP, form. */
  function fighter({ name, cartoon, rp, hue, form, mirrored, variant }) {
    const c = hueColor(hue), p = Ladder.place(rp);
    return `<div class="rk-fighter ${mirrored ? 'them' : 'me'}" style="--c:${c};--glow:${alpha(c, 0.4)}">
      <div class="rk-ffig${mirrored ? ' mirror' : ''}">${figureHTML(cartoon, 'fight', { variant, floor: c, calm: true })}</div>
      <div class="rk-fname">${esc(name)}</div>
      <div class="rk-fplate">${emblem(p.tier, 30)}<span class="rk-pill" style="background:${p.tier.color};color:${p.tier.ink}">${esc(p.name.toUpperCase())}</span></div>
      <div class="rk-frating" data-v="${rp} RP">${rp} RP</div>
      <div class="rk-fform">${formRow(form)}</div>
    </div>`;
  }
  function foundHTML() {
    const hardest = Ladder.roundTiers(game.ladderIndex).slice(-1)[0] || 'hard';
    return `${bar()}<div class="rk-fill"></div>
      <div class="rk-mf">MATCH FOUND</div>
      <div class="rk-versus">
        ${fighter({ name: myShownName(), cartoon: myCartoon(), rp: game.myRP, hue: 0, form: account.stats.recentRanked, mirrored: false, variant: myVariant('fight') })}
        ${fighter({ name: theirShownName(), cartoon: theirCartoon(), rp: game.opponentRP, hue: game.opponentHue, form: game.opponentForm, mirrored: true, variant: 1 })}
        <div class="rk-vs">VS</div>
      </div>
      <div class="rk-terms"><div><b>${RK.rounds}</b><span>rounds</span></div><i></i><div><b>${RK.window}s</b><span>a song</span></div><i></i><div><b>${cap(hardest)}</b><span>hardest song</span></div></div>
      <div class="rk-fill"></div>
      <div class="rk-cardfoot"><div class="rk-coming">${eqBars('on rk-eq14')}<span>First song coming up</span></div></div>`;
  }
  /** -setRP on the card moves the RP figures in place (.numericText). */
  function patchFound() {
    const r = screen.querySelectorAll('.rk-frating'), plates = screen.querySelectorAll('.rk-fplate');
    [game.myRP, game.opponentRP].forEach((rp, i) => {
      if (r[i]) numText(r[i], `${rp} RP`, spring(0.55, 0.825));
      const p = Ladder.place(rp);
      if (plates[i]) plates[i].innerHTML = `${emblem(p.tier, 30)}<span class="rk-pill" style="background:${p.tier.color};color:${p.tier.ink}">${esc(p.name.toUpperCase())}</span>`;
    });
    const hard = screen.querySelector('.rk-terms div:last-child b');
    if (hard) hard.textContent = cap(Ladder.roundTiers(game.ladderIndex).slice(-1)[0] || 'hard');
  }
  /** runCardAnimation: spring(.4,.6) in, +420 ms the VS on spring(.34,.5), +380 ms the form and footer on easeOut .3. */
  async function runCard() {
    const token = anim, s = screen;
    Haptics.press(0.9);
    await frame(); if (token !== anim) return;
    s.classList.add('s1');
    if (!(await wait(420, token))) return;
    Haptics.success(); sound.reveal();
    s.classList.add('s2');
    if (!(await wait(380, token))) return;
    s.classList.add('s3');
  }

  // ---------- the round bar ----------
  function roundBar() {
    const t = tier();
    const era = game.phase === 'playing' && game.currentEra !== 'all' ? `<span class="rk-era">${esc(game.currentEra)}</span>` : '';
    return `<div class="rk-roundbar"><div class="rk-rno"><span>ROUND</span><div><b>${game.round + 1}</b><em>/ ${RK.rounds}</em></div></div>
      <div class="rk-fill"></div>${era}<span class="rk-tier" style="background:${PILL_FILL[t]};color:${PILL_INK}">${cap(t)}</span>
      <button class="rk-rx" data-press data-act="roundx" aria-label="${game.inMatch ? 'Leave the match' : 'Close'}">${I.x}</button></div>`;
  }

  // ---------- the round intro: ROUND n and its level slide in, the decade reel rolls, one number pops ----------
  function countdownHTML() {
    const n = game.round + 1, t = tier();
    const cards = Array.from({ length: 9 }, () => '<div class="rk-cv"><div class="rk-cvin"></div><i class="rk-cvshade"></i></div>').join('');
    return `${roundBar()}<div class="rk-fill"></div>
      <div class="rk-title"><b>${n === RK.rounds ? 'FINAL' : `ROUND ${n}`}</b><span>${t.toUpperCase()}</span></div>
      <div class="rk-fill"></div>
      <div class="rk-reelwrap">${capsLine('This song is from the')}
        <div class="rk-cf" role="img" aria-label="This song is from the ${esc(game.currentEra === 'all' ? 'Any era' : game.currentEra)}">${cards}</div></div>
      <div class="rk-fill"></div>
      <div class="rk-cnum-slot"><div class="rk-cnum"></div></div>`;
  }
  /** The count, one number that pops each second (spring .32/.55 from 1.4× at .3); a tick and a select haptic each. */
  function updateCountdown() {
    const n = game.secondsLeft;
    if (n === secondsShown) return;
    secondsShown = n;
    const node = screen.querySelector('.rk-cnum'); if (!node) return;
    node.textContent = n > 0 ? String(n) : 'GO';
    if (!still()) { const sp = spring(0.32, 0.55); node.animate([{ transform: 'scale(1.4)', opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: sp.ms, easing: sp.easing }); }
    if (n > 0) { sound.tick(); Haptics.select(); }
  }
  /**
   * CoverEraReel: nine cards in a coverflow row, the one in the middle large and the ones beside it turned
   * away in 3D, racing and easing onto the song's decade. Each card keeps its node while it is on screen
   * (index mod 9), so a frame is only transforms and opacities; a card is redrawn only as it wraps.
   */
  function drawReel(now) {
    const host = screen.querySelector('.rk-cf'); if (!host) return;
    if (!reelCovers) reelCovers = decadeCovers();
    const t = reelStartedAt == null ? 99 : Math.max(0, (now - reelStartedAt) / 1000);
    const p = reelPosition(t, game.currentEra), landed = t >= REEL.duration;
    const settle = landed ? Math.min(1, (t - REEL.duration) / 0.35) : 0, pulse = Math.sin(settle * Math.PI);
    const centre = Math.round(p), nodes = host.children;
    for (let i = centre - 4; i <= centre + 4; i++) {
      const node = nodes[((i % 9) + 9) % 9], d = i - p, a = Math.min(1, Math.abs(d));
      if (node.dataset.i !== String(i)) {
        node.dataset.i = String(i);
        const di = decadeIndex(i), era = DECADES[di], grid = reelCovers[di] || [];
        const kind = grid.length ? 'm' : 's';
        if (node.dataset.era !== era || node.dataset.kind !== kind) {
          node.dataset.era = era; node.dataset.kind = kind;
          node.firstElementChild.innerHTML = grid.length ? mosaicHTML(era, grid) : sleeveHTML(era);
          node.classList.toggle('sleeve', !grid.length);
        }
      }
      const lit = landed && i === centre;
      const angle = Math.max(-50, Math.min(50, -d * 38));
      const scale = 1.15 - 0.35 * a + (lit ? 0.06 * pulse : 0);
      // Neighbours sit a little further out, so the big one stays clear.
      const push = Math.abs(d) < 1 ? d * 0.25 : d < 0 ? -0.25 : 0.25;
      node.style.transform = `translateX(${((d + push) * REEL.spacing).toFixed(2)}px) scale(${scale.toFixed(4)}) perspective(${Math.round(REEL.side / 0.6)}px) rotateY(${angle.toFixed(2)}deg)`;
      node.style.opacity = (1 - Math.min(0.9, Math.abs(d) * 0.22)).toFixed(3);
      node.style.zIndex = String(100 - Math.round(Math.abs(d) * 10));
      // .brightness(-0.35 a): a black wash over the card.
      node.lastElementChild.style.opacity = (0.35 * a).toFixed(3);
      if (node.classList.contains('lit') !== lit) node.classList.toggle('lit', lit);
    }
    // A select haptic per card passed, a press when it lands.
    if (reelStartedAt != null) {
      if (centre !== reelSlot) { if (reelSlot >= 0) Haptics.select(); reelSlot = centre; }
      if (landed && !reelLanded) { reelLanded = true; Haptics.press(0.9); }
    }
  }

  // ---------- playing ----------
  function sideScore({ name, score, answered, colour, leading, missed, key }) {
    const mark = answered ? `<i class="rk-ok" style="color:${missed ? TIER_COLOR.expert : colour}">${missed ? I.xCircle : I.checkCircle}</i>` : '';
    // Your own total shows; the opponent's stays hidden until full time — only whether they have answered.
    const value = leading ? `<b class="rk-sscore">${score}</b>` : `<b class="rk-sstate" style="color:${answered ? colour : DIM}">${answered ? 'Answered' : 'Listening'}</b>`;
    return `<div class="rk-side ${leading ? 'lead' : 'trail'}" data-side="${key}" style="background:${alpha(colour, answered ? 0.14 : 0.06)}">
      <div class="rk-sname">${leading ? mark : ''}<span>${esc(name)}</span>${leading ? '' : mark}</div>${value}</div>`;
  }
  const sides = () => [
    { key: 'me', name: myShownName(), score: game.myScore, answered: game.iAnswered, colour: accent(), leading: true, missed: game.myPick != null && !game.pickedRight },
    { key: 'them', name: theirShownName(), score: game.theirScore, answered: game.theyAnswered, colour: theirColour(), leading: false, missed: false },
  ];
  const scoreLine = () => `<div class="rk-scores">${sides().map(sideScore).join('')}</div>`;
  function patchScores() {
    for (const s of sides()) {
      const node = screen.querySelector(`.rk-side[data-side="${s.key}"]`); if (!node) continue;
      node.style.background = alpha(s.colour, s.answered ? 0.14 : 0.06);
      const had = node.querySelector('.rk-ok');
      if (s.answered && !had) {
        const i = el(`<i class="rk-ok" style="color:${s.missed ? TIER_COLOR.expert : s.colour}">${s.missed ? I.xCircle : I.checkCircle}</i>`);
        const nm = node.querySelector('.rk-sname');
        if (s.leading) nm.prepend(i); else nm.append(i);
        popIn(i, 0, spring(0.4, 0.6));
      }
      if (s.leading) numText(node.querySelector('.rk-sscore'), s.score, spring(0.3, 0.85));
      else { const st = node.querySelector('.rk-sstate'), t = s.answered ? 'Answered' : 'Listening'; if (st && st.textContent !== t) { st.textContent = t; st.style.color = s.answered ? s.colour : DIM; } }
    }
  }
  function statusHTML() {
    const pts = game.myPoints;
    if (pts == null) return '<span class="rk-hint">One tap. Wrong loses the round.</span>';
    if (pts > 0) return `<span class="rk-got">${MARK.check}<b>+${pts}</b>${game.theyAnswered ? '' : `<em>Waiting for ${esc(theirShownName())}…</em>`}</span>`;
    return `<span class="rk-got bad">${MARK.x}<b>Wrong. No points this round.</b></span>`;
  }
  const gridState = () => ({ picked: game.myPick, reveal: game.myPick == null ? null : game.current?.id, hidden: game.hiddenChoices });
  const boardHTML = () => choiceGrid(game.currentChoices, gridState());
  function playingHTML() {
    return `<div class="rk-play">${roundBar()}${scoreLine()}<div class="rk-fill"></div>
      <button class="rk-ring" data-act="replay" aria-label="Replay the clip">
        <svg viewBox="0 0 196 196" overflow="visible" aria-hidden="true"><circle cx="98" cy="98" r="98" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="10"/>
        <circle class="arc" cx="98" cy="98" r="98" fill="none" stroke="var(--rk-accent)" stroke-width="10" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" transform="rotate(-90 98 98)"/></svg>
        <span class="rk-ring-in">${eqBars()}<b class="rk-secs">${RK.window}</b><span class="rk-state"></span><span class="rk-why"></span></span>
      </button><div class="rk-fill"></div>
      <div class="rk-choices"><div class="rk-status" data-k="${statusKey()}">${statusHTML()}</div><div class="rk-grid">${boardHTML()}</div></div></div>`;
  }
  const statusKey = () => (game.myPoints == null ? 'none' : `${game.myPoints}|${game.theyAnswered}`);
  function updatePlaying() {
    if (game.phase !== 'playing') return;
    patchScores();
    const st = screen.querySelector('.rk-status');
    if (st && st.dataset.k !== statusKey()) {
      const wasNone = st.dataset.k === 'none';
      st.dataset.k = statusKey();
      const sp = spring(0.35, 0.7);
      const old = st.firstElementChild;
      st.insertAdjacentHTML('beforeend', statusHTML());
      const nu = st.lastElementChild;
      if (old && !still()) { old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: sp.ms, easing: sp.easing, fill: 'forwards' }).finished.then(() => old.remove(), () => {}); }
      else old?.remove();
      if (wasNone) popIn(nu, 0.6, sp);
    }
    const gr = screen.querySelector('.rk-grid');
    if (gr && !updateChoiceGrid(gr, game.currentChoices, gridState())) gr.innerHTML = boardHTML();
  }
  function tickPlaying() {
    const ring = screen.querySelector('.rk-ring'); if (!ring) return;
    const elapsed = frozen ? 4.2 : (Date.now() - game.roundStartedAt) / 1000, progress = Math.min(1, elapsed / RK.window);
    ring.querySelector('.arc').setAttribute('stroke-dasharray', `${Math.max(0, 1 - progress).toFixed(4)} 1`);
    const left = Math.max(0, Math.ceil(RK.window - elapsed - 1e-9));
    if (left !== lastSecs) { const first = lastSecs < 0; lastSecs = left; const s = ring.querySelector('.rk-secs'); if (first) { s.textContent = left; s.dataset.v = String(left); } else numText(s, left, spring(0.2, 0.85), true); }
    const st = clipError ? ['no sound — tap for why', 'bad'] : roundMuted ? ['no sound this round', 'bad'] : player.playing ? ['listening', 'on'] : ['tap to replay', ''];
    ring.classList.toggle('playing', player.playing);
    const s = ring.querySelector('.rk-state');
    if (s.textContent !== st[0]) { s.textContent = st[0]; s.className = 'rk-state ' + st[1]; }
    const why = ring.querySelector('.rk-why'), w = clipError || '';
    if (why.textContent !== w) why.textContent = w;
    if (!clipStarted) startClip();
  }
  /** Shake: .easeInOut(duration: 0.42) over the piecewise offsets of WinSequence's Shake. */
  function shake() {
    const p = screen.querySelector('.rk-play'); if (!p || still()) return;
    const f = x => (x < 0.2 ? -7 * x / 0.2 : x < 0.4 ? -7 + 13 * (x - 0.2) / 0.2 : x < 0.6 ? 6 - 10 * (x - 0.4) / 0.2 : x < 0.8 ? -4 + 7 * (x - 0.6) / 0.2 : 3 * (1 - (x - 0.8) / 0.2));
    const ease = bezier(0.42, 0, 0.58, 1), frames = [];
    for (let i = 0; i <= 30; i++) frames.push({ offset: i / 30, transform: `translateX(${f(ease(i / 30)).toFixed(2)}px)` });
    frames[30].transform = 'none';
    p.animate(frames, { duration: 420, easing: 'linear' });
  }
  /** A tap on an answer. Only a tap the match took (inside the song's 15 s) clicks and buzzes. */
  function pick(id) {
    game.pick(id);
    if (game.myPick !== id) return;       // after the buzzer: not taken
    sound.click();
    if (id === game.current?.id) Haptics.success(); else { Haptics.wrong(); shake(); }
  }

  // ---------- between rounds: the song it was, what each of you took from it, the count ----------
  /** `late`: the right answer, but it reached the host after its buzzer. */
  function gained(faceMarkup, points, colour, wrong = false, late = false) {
    const v = wrong ? 'Wrong' : late ? 'Too late' : points != null ? `+${points}` : 'No answer';
    const c = wrong ? TIER_COLOR.expert : points == null ? DIM : colour;
    const edge = wrong ? alpha(TIER_COLOR.expert, 0.35) : points == null ? 'rgba(255,255,255,.08)' : alpha(colour, 0.35);
    return `<div class="rk-gain" style="border-color:${edge}">${faceMarkup}<b class="${wrong || points == null ? 'sm' : ''}" style="color:${c}">${v}</b></div>`;
  }
  function resultHTML() {
    const a = game.lastAnswer || {}, last = game.round + 1 >= RK.rounds;
    const cover = artOn() && a.artwork ? `<div class="rk-bigart"><img class="glow" src="${esc(a.artwork)}" alt=""><img class="cov" src="${esc(a.artwork)}" alt=""></div>` : '';
    return `${roundBar()}<div class="rk-fill"></div>
      <div class="rk-answer">${cover}<span class="rk-itwas">IT WAS</span><b>${esc(a.title || '')}</b><em>${esc(a.artist || '')}</em></div>
      <div class="rk-gains">${gained(face(myCartoon(), myColour, 26), game.myPoints, myColour, game.myPick != null && !game.pickedRight, game.pickedRight && game.myPoints == null)}${gained(face(theirCartoon(), theirColour(), 26), game.theirPoints, theirColour(), !!game.theyWereWrong)}</div>
      <div class="rk-fill"></div>
      <div class="rk-next">${capsLine(last ? 'Full time in' : 'Next round in')}${countRing({ number: RK.resultHold, accent: accent(), size: 88 })}</div>`;
  }
  /** holdSeconds: 3, 2, 1, a second at a time, each one popping. */
  function runHold() {
    const node = screen.querySelector('.rk-next .k-count');
    popCount(node, RK.resultHold);
    let n = RK.resultHold, timer = 0;
    const step = () => { n--; if (n < 1 || game.phase !== 'roundResult') return; popCount(node, n); timer = setTimeout(step, 1000); };
    timer = setTimeout(step, 1000);
    holdStop = () => clearTimeout(timer);
  }

  // ---------- the end: who won, standing full-body, the pips, the rank plate, one button ----------
  function standingHTML(side, { winner, loser }) {
    const mine = side === 'me', cartoon = mine ? myCartoon() : theirCartoon(), colour = mine ? myColour : theirColour();
    const losePose = loser && hasPose(cartoon, 'lose');
    const pose = winner ? 'win' : losePose ? 'lose' : 'fight';
    const variant = mine ? (winner ? myVariant('win') : loser ? myVariant('lose') : myVariant('fight')) : 1;
    const mirrored = !mine && !winner;
    const h = winner ? 204 : loser ? 168 : 190;
    const cls = [winner && 'winner', loser && 'loser', loser && !losePose && 'grey', loser && losePose && 'slump'].filter(Boolean).join(' ');
    return `<div class="rk-stfig ${cls}" style="height:${h}px">
      <div class="rk-stin${mirrored ? ' mirror' : ''}">${figureHTML(cartoon, pose, { variant, floor: winner ? colour : '#000000', calm: true })}</div>
      ${winner ? `<i class="rk-crown" style="color:${CROWN}">${sf('crown.fill')}</i>` : ''}</div>`;
  }
  function standing(side) {
    const mine = side === 'me', colour = mine ? myColour : theirColour();
    return `<div class="rk-stand ${side}" style="--c:${colour};--cw:${mix(colour, '#ffffff', 0.3)};--cg:${alpha(colour, 0.5)};--ce:${alpha(colour, 0.45)};--cl:${alpha(colour, 0.18)}">
      <div class="rk-stslot">${standingHTML(side, { winner: false, loser: false })}</div>
      <span class="rk-stname">${esc(mine ? myShownName() : theirShownName())}</span>
      <b class="rk-plate2">0</b></div>`;
  }
  function finishedHTML() {
    const won = game.iWon, drew = game.drawn;
    const sub = game.didForfeit ? `You left the match · ${theirShownName()} wins`
      : game.opponentLeft ? `${theirShownName()} left the match · you win`
      : won ? `${theirShownName()} couldn't keep up` : drew ? 'Dead level after five' : `${theirShownName()} took it this time`;
    const pips = game.history.map(r => {
      const m = r.mine ?? 0, t = r.theirs ?? 0, c = m > t ? myColour : t > m ? theirColour() : DIM;
      return `<i class="${m !== t ? 'lit' : ''}" style="background:${c};--pc:${alpha(c, 0.7)}"></i>`;
    }).join('');
    return `${bar()}
      <div class="rk-verdict"><div class="rk-ft">FULL TIME</div>
        <div class="rk-vd">${roundBanner({ title: drew ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT', tier: won ? 'easy' : 'expert', shown: false, colours: drew ? PanelColours.slate : null, compact: true })}<span>${esc(sub)}</span></div></div>
      <div class="rk-final">${standing('me')}<span class="rk-fvs">VS</span>${standing('them')}</div>
      <div class="rk-pips" aria-hidden="true">${pips}</div>
      <div class="rk-plate">
        <div class="rk-ptop"><div class="rk-emb"></div>
          <div class="rk-pt"><small>YOUR RANK</small><b></b><span></span></div><div class="rk-fill"></div>
          <span class="rk-chip"><i></i><b></b></span></div>
        <div class="rk-pbar"><i></i></div>
        <div class="rk-parts"></div>
      </div>
      <div class="rk-fill rk-endgap"></div>
      <div class="rk-endbtns"><div class="rk-again">${glossy({ title: canPlay() ? 'Play again' : 'Unlock ranked with Premium', colours: canPlay() ? PanelColours.green : PanelColours.gold, height: 54, key: 'again', attrs: 'data-act="again"' })}</div>
        <button class="rk-leave" data-press data-act="quit">Leave</button></div>`;
  }
  /** The rank plate at `shown` RP: the emblem, PROMOTED / YOUR RANK, the name in its colour, the RP, the bar. */
  let plateTier = -1;
  function setPlate(plate, shownRP, rpBefore, rpAfter) {
    const p = Ladder.place(shownRP), c = p.tier.color, before = Ladder.place(rpBefore), after = Ladder.place(rpAfter);
    const up = rpAfter > rpBefore && after.name !== before.name, reached = shownRP === rpAfter;
    plate.style.setProperty('--pc', c);
    plate.style.setProperty('--pcw', mix(c, '#ffffff', 0.25));
    plate.style.setProperty('--pci', p.tier.ink);
    plate.classList.toggle('promoted', reached && up);
    plate.classList.toggle('reached', reached);
    plate.querySelector('.rk-pt small').textContent = reached && up ? 'PROMOTED' : 'YOUR RANK';
    const name = plate.querySelector('.rk-pt b');
    if (name.dataset.v == null) { name.textContent = p.name; name.dataset.v = p.name; } else numText(name, p.name, { ms: 40, easing: 'linear' });
    numText(plate.querySelector('.rk-pt span'), `${shownRP} RP`, { ms: 40, easing: 'linear' });
    plate.querySelector('.rk-pbar i').style.width = `max(8px, ${(p.fraction * 100).toFixed(2)}%)`;
    if (plateTier !== p.tier.index) {
      // .id(shown.tier.index) + .transition(.scale(scale: 0.6).combined(with: .opacity))
      const box = plate.querySelector('.rk-emb'), first = plateTier < 0;
      plateTier = p.tier.index;
      box.innerHTML = emblem(p.tier, 64);
      if (!first) popIn(box.firstElementChild, 0.6, spring(0.4, 0.7));
    }
  }
  /** Bank the result once, then let the screen tell it a beat at a time (runEndSequence). */
  async function runEnd() {
    const token = anim;
    const outcome = game.outcome, earned = RK.boardPoints(game.myScore, outcome);
    // What the ladder makes of it: the parts are worked out as recordRanked will, then the real before and after.
    const pre = account.stats;
    const streakNext = outcome > 0.6 ? (pre.winStreak || 0) + 1 : outcome < 0.4 ? 0 : (pre.winStreak || 0);
    const parts = Ladder.change(outcome, pre.rating, game.opponentRating, streakNext, game.perfect).parts.slice();
    const raw = parts.reduce((a, p) => a + p[1], 0);
    const rpBefore = pre.rp || 0;
    let rpAfter;
    if (!frozen && !practice) {
      account.recordRanked(outcome, game.opponentRating, game.myScore, game.perfect);
      RK.clearPending();
      // A match on a private test queue (localhost ?rankedQueue=) never reaches the real boards.
      if (!RankedTest.on) post(earned);
      rpAfter = account.stats.rp || 0;
    } else {
      RK.clearPending();
      rpAfter = Math.max(Ladder.tierFloor(rpBefore), rpBefore + raw);
    }
    // A loss at the start of a tier is caught by its floor: say so, so the parts add up to the chip.
    const applied = rpAfter - rpBefore;
    if (applied !== raw) parts.push(['Tier protection', applied - raw]);
    // Out of the match the colour is the rank's: Play again wears where you are now.
    const now = Ladder.place(rpAfter);
    LevelTheme.setOverride('easy');
    view.style.setProperty('--rk-accent', now.tier.color); view.style.setProperty('--rk-ink', now.tier.ink);

    const s = screen, plate = s.querySelector('.rk-plate');
    const me = s.querySelector('.rk-stand.me .rk-plate2'), them = s.querySelector('.rk-stand.them .rk-plate2');
    const delta = rpAfter - rpBefore, chip = plate.querySelector('.rk-chip');
    chip.classList.add(delta > 0 ? 'up' : delta < 0 ? 'down' : 'level');
    chip.querySelector('i').innerHTML = delta > 0 ? MARK.up : delta < 0 ? MARK.down : MARK.minus;
    chip.querySelector('b').textContent = Math.abs(delta);
    plate.querySelector('.rk-parts').innerHTML = parts.map(([n, v]) => `<span style="color:${v >= 0 ? 'var(--pc)' : TIER_COLOR.expert}">${esc(`${n} ${v >= 0 ? '+' : ''}${v}`)}</span>`).join('');
    plateTier = -1;
    setPlate(plate, rpBefore, rpBefore, rpAfter);
    if (!(await wait(450, token))) return;
    // Full time: both scores count up together, ticking as they go. Nothing to count: skip it.
    const steps = game.myScore === 0 && game.theirScore === 0 ? 0 : 24, lin = { ms: 50, easing: 'linear' };
    for (let i = 1; i <= steps; i++) {
      const e = 1 - Math.pow(1 - i / steps, 2.2);
      numText(me, Math.round(game.myScore * e), lin); numText(them, Math.round(game.theirScore * e), lin);
      if (i % 4 === 0) { sound.tick(); Haptics.press(0.35); }
      if (!(await wait(55, token))) return;
    }
    numText(me, game.myScore, lin); numText(them, game.theirScore, lin);
    // The match, a dot a round, in the colour of whoever took it.
    const pips = s.querySelectorAll('.rk-pips i');
    for (const p of pips) { if (!(await wait(90, token))) return; p.classList.add('in'); Haptics.tap(); }
    if (steps > 0 || pips.length) { if (!(await wait(280, token))) return; }
    // The verdict: tallyDone + bannerPop.
    const won = game.iWon, theyWon = !won && !game.drawn;
    s.classList.add('tally');
    s.querySelector('.k-banner')?.classList.remove('off');
    restand(s, 'me', { winner: won, loser: theyWon });
    restand(s, 'them', { winner: theyWon, loser: won });
    setLight(0, null, 0);
    setLight(1, won ? TIER_COLOR.easy : game.drawn ? MUTED : TIER_COLOR.expert, 0.95);
    Haptics.success(); sound.reveal();
    if (won) confetti(innerWidth / 2, innerHeight * 0.30, [TIER_COLOR.easy, '#ffffff', accent()], 150);
    // Where it leaves you on the ladder: the RP counts across (only when it moved), and a new division lands with a pop.
    if (!(await wait(650, token))) return;
    s.classList.add('s2');
    if (!(await wait(350, token))) return;
    const from = rpBefore, to = rpAfter, n = from === to ? 0 : 22;
    let lastName = Ladder.place(from).name;
    for (let i = 1; i <= n; i++) {
      const k = 1 - Math.pow(1 - i / n, 2), shownRP = from + Math.round((to - from) * k);
      setPlate(plate, shownRP, rpBefore, rpAfter);
      const nowName = Ladder.place(shownRP).name;
      if (nowName !== lastName) {
        lastName = nowName;
        if (to > from) {
          Haptics.success(); sound.reveal();
          const emb = plate.querySelector('.rk-emb');
          emb.classList.add('pop');
          const c = Ladder.place(shownRP).tier.color;
          confetti(innerWidth / 2, innerHeight * 0.30, [c, '#ffffff', c], 90);
          if (!(await wait(260, token))) return;
          emb.classList.remove('pop');
        } else Haptics.wrong();
      } else if (i % 5 === 0) Haptics.press(0.3);
      if (!(await wait(45, token))) return;
    }
    setPlate(plate, to, rpBefore, rpAfter);
    // Then the way on.
    if (!(await wait(450, token))) return;
    s.classList.add('s3');
  }
  /** A standing figure changes pose (.id keyed by cartoon-winner-loser): the new one scales in from the feet. */
  function restand(s, side, state) {
    const slot = s.querySelector(`.rk-stand.${side} .rk-stslot`); if (!slot) return;
    const stand = slot.parentElement;
    stand.classList.toggle('winner', state.winner); stand.classList.toggle('loser', state.loser);
    if (!state.winner && !state.loser) return;          // a draw: both keep standing as they were
    const old = slot.firstElementChild;
    slot.insertAdjacentHTML('beforeend', standingHTML(side, state));
    const nu = slot.lastElementChild, sp = spring(0.5, 0.65);
    if (old) {
      old.classList.add('out');
      if (still()) old.remove(); else old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.85)' }], { duration: 220, fill: 'forwards' }).finished.then(() => old.remove(), () => old.remove());
    }
    if (!still()) nu.animate([{ transform: 'scale(.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: sp.ms, easing: sp.easing });
    const crown = nu.querySelector('.rk-crown');
    if (crown) {
      if (!still()) crown.animate([{ translate: '0 -40px', opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: sp.ms, easing: sp.easing });
      // The crown rides the victory jump, on the figure's clock, so it never lands on the forehead.
      const cartoon = side === 'me' ? myCartoon() : theirCartoon(), rideToken = anim;
      const ride = () => {
        if (closed || rideToken !== anim || !crown.isConnected) return;
        const f = still() ? { dy: 0 } : PoseMotion.frame('win', Date.now() / 1000 - REF + cartoon * 0.37);
        crown.style.transform = `translate(-50%, ${(-24 + f.dy * 204 / 240).toFixed(2)}px)`;
        requestAnimationFrame(ride);
      };
      ride();
    }
  }

  /** Bank a finished match on the boards. Fire and forget: the result screen never waits on it. */
  async function post(points) {
    try {
      const u = await account.ensureUser();
      const { error } = await supabase.from('ranked_results').insert({ user_id: u.id, points, score: game.myScore, won: game.iWon, display_name: ((account.name || '').trim() || 'Player').slice(0, 20), avatar: account.avatar || null });
      if (error) console.warn('ranked_results', error.message);
    } catch (e) { console.warn('ranked_results', e); }
  }

  const errorHTML = () => `<div class="rk-fill"></div><div class="rk-error"><p>${esc(game.error)}</p><button data-press data-act="quit">Back</button></div><div class="rk-fill"></div>`;

  // ---------- the leaderboard (LeaderboardView.swift) ----------
  function openBoard() {
    sound.click();
    boardOpen = true;
    const rt = place().tier;
    let bd = null;
    const sh = openSheet(`<div class="rk-lbv" style="--rk-accent:${rt.color};--rk-ink:${rt.ink}"><div class="rk-lbbd"></div>
      <div class="rk-lbhead"><h1>Leaderboard</h1><button class="rk-xbtn" data-press data-close aria-label="Close">${I.x}</button></div>
      <div class="rk-period"><button data-press data-p="1" class="on">Today</button><button data-press data-p="7">This week</button></div>
      <div class="rk-lbbody"></div><div class="rk-lbmine"></div></div>`, { cls: 'tall rk-board', label: 'Leaderboard', onClose: () => { boardOpen = false; bd?.destroy?.(); } });
    try { bd = mountBackdrop(sh.body.querySelector('.rk-lbbd')); } catch (e) {}
    const body = sh.body.querySelector('.rk-lbbody'), mineHost = sh.body.querySelector('.rk-lbmine');
    let days = 1, loadToken = 0;
    sh.body.querySelector('[data-close]').addEventListener('click', () => sh.close());
    sh.body.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
      const d = Number(b.dataset.p); if (d === days) return;
      days = d; sh.body.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b)); load();
    }));
    const message = t => `<div class="rk-lbmsg">${esc(t)}</div>`;
    const shownName = r => { const n = (r.display_name || '').trim(); return n ? NameFilter.shown(n) : 'Someone'; };
    // The top three wear a medal colour; everyone else wears their place.
    const row = (r, at, isMe) => {
      const medal = MEDALS[at];
      const seed = [...String(r.user_id)].reduce((a, ch) => ((a * 31 + ch.codePointAt(0)) & 0xffff), 0);
      const colour = medal || hueColor(seed);
      const m = r.matches > 0 ? `<em>${r.matches} ${r.matches === 1 ? 'match' : 'matches'}</em>` : '';
      const avg = r.matches > 0 ? Math.round(r.points / r.matches) : null;
      return `<div class="rk-lbrow${isMe ? ' me' : ''}"><b class="pl" style="${medal ? `color:${medal}` : ''}">${at}</b>
        ${faceHTML(r.avatar, String(r.user_id), 34, { style: `background:${alpha(colour, 0.9)}` })}
        <span class="nm">${esc(shownName(r))}</span>${isMe ? '<span class="you">YOU</span>' : ''}<span class="rk-fill"></span>
        <span class="col mt">${r.matches > 0 ? r.matches : '—'}</span><span class="col av">${avg ?? '—'}</span>
        <span class="pts"><b style="${medal ? `color:${medal}` : ''}">${r.points}</b>${m}</span></div>`;
    };
    const skeleton = () => `<div class="rk-skel">${Array.from({ length: 7 }, () => '<div><i></i><i></i><i></i></div>').join('')}</div>`;
    async function load() {
      // A switch of period starts another load while this one may be out: whichever answers last must not paint the other's rows.
      const token = ++loadToken;
      body.innerHTML = skeleton(); mineHost.innerHTML = '';
      let rows = null, me = null, mine = null;
      try {
        if (demo === 'board') {
          await sleep(300);
          rows = ['Liv', 'Noah', 'Sofia', 'Ella', 'Theo', 'Aya', 'Max', 'Ida'].map((n, i) => ({ user_id: 'sample-' + i, display_name: n, avatar: null, points: 9400 - i * 1130, matches: 12 - i, place: i + 1 }));
          mine = { rank: 14, row: rows[3] }; me = '-';
        } else {
          const u = await account.ensureUser(); me = String(u?.id || '').toLowerCase();
          // The board by the player's own day and week, with their own place even below the top 100; the old board while the new one is missing.
          let tz = 'UTC'; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) {}
          let r = await supabase.rpc('ranked_board2', { window_days: days, tz });
          if (r.status === 404 || r.error?.code === 'PGRST202') r = await supabase.rpc('ranked_board', { window_days: days });
          if (r.error) throw r.error;
          const decoded = r.data || [];
          rows = decoded.filter((x, i) => (x.place ?? i + 1) <= 100);
          const i = decoded.findIndex(x => String(x.user_id).toLowerCase() === me);
          mine = i >= 0 ? { rank: decoded[i].place ?? i + 1, row: decoded[i] } : null;
        }
      } catch (e) { console.warn('ranked_board', e); rows = null; mine = null; }
      if (token !== loadToken || !sh.node.isConnected) return;
      if (rows == null) { body.innerHTML = message("The board couldn't load. Check your connection."); return; }
      if (!rows.length) body.innerHTML = message(days === 1 ? 'Nobody has played today yet. Be the first.' : 'No matches this week yet. Be the first.');
      else body.innerHTML = `<div class="rk-lblist"><div class="rk-lbcols" aria-hidden="true"><span class="pl">#</span><span class="nm">Player</span><span class="rk-fill"></span><span class="col">Matches</span><span class="col">Per match</span><span class="pts">Points</span></div>${rows.map((r, i) => row(r, i + 1, String(r.user_id).toLowerCase() === me)).join('')}</div>`;
      // Off the bottom of the list: your own line, pinned under it.
      if (mine && mine.rank > rows.length) mineHost.innerHTML = row(mine.row, mine.rank, true);
    }
    load();
  }

  // ---------- "Leave the match?" (the app's confirmationDialog) ----------
  function confirmLeave() {
    if (confirmOpen) return;
    confirmOpen = true;
    const node = el(`<div class="view sheet rk-confirm" role="alertdialog" aria-label="Leave the match?"><div class="scrim"></div>
      <div class="stackup"><div class="cardc"><div class="lead"><b>Leave the match?</b><div>Walking out counts as a loss, the same as losing the match.</div></div>
      <button class="act" data-press>Leave and take the loss</button></div><div class="cardc"><button class="cancel" data-press>Keep playing</button></div></div></div>`);
    node.style.setProperty('--rk-accent', view.style.getPropertyValue('--rk-accent'));
    const end = ok => { if (!confirmOpen) return; confirmOpen = false; document.removeEventListener('keydown', onEsc, true); popView(node); if (ok) game.forfeit(); };
    const onEsc = e => { if (e.key === 'Escape') { e.stopPropagation(); end(false); } };
    node.querySelector('.scrim').addEventListener('click', () => end(false));
    node.querySelector('.cancel').addEventListener('click', () => end(false));
    node.querySelector('.act').addEventListener('click', () => end(true));
    document.addEventListener('keydown', onEsc, true);
    pushView(node);
  }

  // ---------- plumbing ----------
  function close() {
    if (closed) return;
    closed = true; anim++;
    player.stop();
    // Closed from outside: stop the match rather than leave it running unseen.
    game.onChange = null; game.leave();
    if (holdStop) holdStop();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    unwatch(); offConn();
    cancelAnimationFrame(raf);
    backdrop?.destroy?.();
    LevelTheme.setOverride(null);
    popView(view);
  }
  function quit() { player.stop(); close(); }

  view.addEventListener('click', e => {
    const c = e.target.closest('[data-choice]');
    if (c) { if (!c.disabled) pick(c.dataset.choice); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    switch (b.dataset.act) {
      case 'quit': sound.click(); quit(); break;
      // Mid-match the X costs the match, so it asks first. Before the first clip it is a free exit.
      case 'roundx': sound.click(); game.inMatch && !frozen ? confirmLeave() : quit(); break;
      case 'board': openBoard(); break;
      case 'find': case 'again': sound.click(); findMatch(); break;
      case 'cancel': sound.click(); game.leave(); break;
      case 'replay': replay(); break;
    }
  });
  function onKey(e) {
    if (closed || confirmOpen || boardOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); game.inMatch && !frozen ? confirmLeave() : quit(); return; }
    // 1–4 answer from a keyboard, top to bottom.
    if (game.phase === 'playing' && /^[1-4]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) { const c = game.currentChoices[Number(e.key) - 1]; if (c) pick(c.id); }
  }
  document.addEventListener('keydown', onKey);

  // The ticker: 30 times a second in the app, every frame here.
  let raf = 0;
  const loop = now => {
    if (closed) return;
    raf = requestAnimationFrame(loop);
    if (game.phase === 'countdown') drawReel(now);
    else if (game.phase === 'searching') tickSearch(now);
    else if (game.phase === 'playing') tickPlaying();
  };
  raf = requestAnimationFrame(loop);

  // .onAppear housekeeping: the season, a walk-out from last time, the decade albums.
  account.rolloverSeasonIfNeeded();
  RK.settlePending(account);
  reshuffleDecadeCovers();
  // -setRP: ?setRP=640 puts this browser at that many rank points (localhost only).
  const setRP = parseInt(Q.get('setRP') ?? '', 10);
  if (Number.isFinite(setRP) && setRP >= 0) account.record(s => { s.rp = setRP; s.bestRP = Math.max(s.bestRP || 0, setRP); });
  pushView(view);
  renderedPhase = 'idle'; phaseChanged('idle');
  if (demo) runDemo(demo);
  if (Q.has('autoFind')) setTimeout(() => { if (!closed && game.phase === 'idle') findMatch(); }, 3000);

  // ---------- localhost-only knobs, mirroring the app's DEBUG flags ----------
  // ?setRP=N (-setRP) · ?rankedDemo=search (-showSearch) | versus (-showVersus) | intro (-showIntro; &introRoll rolls the reel)
  //   | round (a round being played, held at 4.2 s) | result (-showRoundResult) | finished (-showFinished)
  //   | final (-fakeResult: a demo win) | lose (-showDefeat) | board (-fakeBoard) | play (a whole stand-in match, nothing banked)
  // ?fakeResult=1 (Find a match goes to a demo win) · ?autoFind=1 · ?autoAnswer=1 · ?stopAtFound=1
  // ?rankedQueue=test (a private test queue) · ?queueWait=N · ?rankedLog=1 (see rankedline.js)
  function runDemo(kind) {
    if (kind === 'play') return;
    const rating = account.stats.rating, rp = account.stats.rp || 0;
    frozen = true;
    game.myRP = rp;
    if (kind === 'board') { openBoard(); return; }
    if (kind === 'search') { game.demoSearching(rating); return; }
    if (kind === 'versus') { game.demoFound(rating); game.demoRP(rp); return; }
    if (kind === 'intro') { game.demoIntro(rating); return; }
    if (kind === 'result') { game.demoRoundResult(rating); return; }
    if (kind === 'finished') { game.demoFinished(rating); return; }
    if (kind === 'final' || kind === 'lose') { game.demoFinish(rating, kind === 'final'); return; }
    if (kind === 'round') {
      game.demoIntro(rating);
      const s = pool.pick('easy', 'all', 'all');
      game.queue = [s, s, s, s, s];
      game.current = { id: s.id, title: s.title, artist: s.artist, artwork: null, preview: s.preview, song: s };
      game.currentChoices = dealBoard(s, 'easy', pool).map(toChoice);
      game.myScore = 1046; game.theirScore = 780;
      game.roundStartedAt = Date.now() - 4200;
      clipStarted = true;
      game.setPhase('playing');
    }
  }
  rankedLog(() => `ranked opened${RankedTest.on ? ` (test queue "${RankedTest.prefix}")` : ''}`);
  return { close };
}
