// Ranked on the web: one song, two people, the faster right answer takes it.
// Five rounds, harder the higher you climb, rank points on a ladder of
// Bronze to Legend (ladder.js), each rank in its own colour. A port of
// Ranked/Ranked.swift, RankedGame.swift, RankedView.swift, Ladder.swift,
// Leaderboard(View).swift and EraReel.swift — same rules, same numbers, same
// screens, in front of the drifting album wall (coverwall.js). Until live matchmaking lands the opponent is a stand-in: rated
// near you, answering on its own clock, right about as often as that rating
// says (scaled by app_config.ranked_bot_skill). No hint: the app's ranked
// board has none (its hint key sits on the old typed-guess row, unused).
import { el, esc, art, alpha, face, hueColor, pushView, popView, openSheet, sleep, cap, TIER_COLOR, TIER_INK, PILL_FILL, PILL_INK, LevelTheme, settings as store } from './ui.js';
import { I } from './icons.js';
import { deal, toChoice, choiceGrid, updateChoiceGrid } from './choices.js';
import { eraOf } from './pool.js';
import { Haptics } from './haptics.js';
import { Ranked as Elo } from './account.js';
import { supabase, config } from './supabase.js';
import { confetti } from './confetti.js';
import { spring, bezier, CURVE, still } from './motion.js';
import { Ladder } from './ladder.js';
import { CoverWall } from './coverwall.js';

const TIERS = ['easy', 'medium', 'hard', 'expert', 'impossible'];
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const MEDALS = { 1: '#ffd166', 2: '#c9ced6', 3: '#d08b5b' };
const MUTED = '#a8a8a8', DIM = '#4a4a4a';

/** The rules of the ladder (Ranked.swift). */
export const RK = {
  startRating: 1000, rounds: 5, window: 15, resultHold: 3, perfectBonus: 500, defaultBotSkill: 0.7,
  names: ['Mia', 'Noah', 'Liv', 'Theo', 'Sofia', 'Eli', 'Aya', 'Max', 'Ida', 'Otto', 'Nora', 'Felix', 'Luca', 'Ruby', 'Ivan', 'Alma'],
  base: t => ({ easy: 500, medium: 600, hard: 700, expert: 850, impossible: 1000 })[t] || 500,
  /** A snap answer inside a second earns a quarter over the base, easing to 40% at the buzzer. */
  points(elapsed, tier, wrongGuesses = 0, window = RK.window) {
    const t = Math.min(Math.max(0, elapsed), window);
    const speed = t <= 1 ? 1.25 : 1 - 0.6 * Math.pow((t - 1) / (window - 1), 0.8);
    const penalty = Math.max(0.5, 1 - 0.1 * wrongGuesses);
    return Math.round(RK.base(tier) * speed * penalty);
  },
  opponentRating: mine => Math.max(600, mine + randInt(-80, 80)),
  opponentForm(rating) { const p = Math.min(0.78, Math.max(0.28, 0.5 + (rating - RK.startRating) / 900)); return Array.from({ length: 5 }, () => (Math.random() < p ? 1 : 0)); },
  /** How the stand-in plays one round: does it get it, and how long it takes. */
  opponentRound(rating, window, botSkill = RK.defaultBotSkill) {
    const k = Math.min(1.5, Math.max(0.2, botSkill));
    const accuracy = Math.min(0.9, (0.3 + (rating - 600) / 1400) * k);
    if (!(Math.random() < accuracy)) return { correct: false, at: window };
    const skill = clamp((rating - 600) / 1000);
    const best = window * (0.55 - 0.40 * skill), worst = window * (0.98 - 0.35 * skill);
    const raw = rand(Math.min(best, worst), Math.max(best, worst));
    const at = Math.min(window * 0.98, raw / Math.max(0.5, k));
    return { correct: true, at: Math.max(1.2, at) };
  },
  /** Harder songs the higher you are on the ladder (Ladder.roundTiers). */
  tierFor: (r, ladderIndex = 0) => { const t = Ladder.roundTiers(ladderIndex); return t[Math.min(Math.max(0, r), t.length - 1)]; },
  /** Leaderboard.points: what was scored, plus a bonus for taking it. */
  boardPoints: (score, outcome) => score + (outcome > 0.6 ? 300 : outcome > 0.4 ? 100 : 0),
};

// CoverEraReel (EraReel.swift): one simple record sleeve per decade in a
// coverflow row, racing and easing to a stop on the song's decade in 2.7 s.
const DECADES = ['80s', '90s', '2000s', '2010s', '2020s'];
const REEL = { laps: 4, duration: 2.7, side: 132, spacing: 104 };
/** The index of the sleeve the reel stops on. */
const reelTarget = era => { const d = DECADES.indexOf(era); return REEL.laps * DECADES.length + (d < 0 ? 2 : d); };
/** Where the reel is, in sleeves, `t` seconds in: fast, then a long ease into the stop. */
const reelPosition = (t, era) => reelTarget(era) * (1 - Math.pow(1 - clamp(t / REEL.duration), 3.2));
const decadeAt = i => DECADES[((i % DECADES.length) + DECADES.length) % DECADES.length];
/** DecadeSleeve's colours: the difficulty colours, 80s easy through 2020s impossible. */
const SLEEVE = { '80s': [TIER_COLOR.easy, '#0a7a3c'], '90s': [TIER_COLOR.medium, '#c27a00'], '2000s': [TIER_COLOR.hard, '#b4400a'], '2010s': [TIER_COLOR.expert, '#9e1830'], '2020s': [TIER_COLOR.impossible, '#5a1fb0'] };
/** A record sleeve for a decade: its gradient, the vinyl half out, the decade across the front. No album art. */
function sleeveHTML(era) {
  const [a, b] = SLEEVE[era] || SLEEVE['80s'];
  const rings = [40, 35, 30, 25].map(r => `<circle cx="92" cy="40" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width=".76"/>`).join('');
  return `<div class="rk-sleeve" style="background:linear-gradient(135deg, ${a}, ${b})"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="92" cy="40" r="45" fill="rgba(0,0,0,.85)"/>${rings}<circle cx="92" cy="40" r="12" fill="${a}"/><circle cx="92" cy="40" r="2" fill="#000"/></svg><b class="${era.length > 3 ? 'long' : ''}">${esc(era)}</b></div>`;
}

const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

/**
 * .contentTransition(.numericText()): only the characters that changed move —
 * the old one out, the new one in, sliding vertically with a blur and a fade
 * (up as a number grows, down when it counts down). `anim` is a spring() or
 * { ms, easing }.
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
    // The incoming glyph first, so the cell takes its baseline from it.
    const inn = document.createElement('span'), out = document.createElement('span');
    inn.textContent = c; out.textContent = o; out.className = 'nt-o';
    cell.append(inn); if (o) cell.append(out); node.append(cell);
    if (o) out.animate([{ transform: 'none', opacity: 1, filter: 'blur(0)' }, { transform: `translateY(${-dir * 45}%) scale(.8)`, opacity: 0, filter: 'blur(3px)' }], opt);
    if (c) inn.animate([{ transform: `translateY(${dir * 45}%) scale(.8)`, opacity: 0, filter: 'blur(3px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }], opt);
  }
}
/** An inserted view's .transition(.scale(scale: from).combined(with: .opacity)). */
function popIn(node, from, sp) {
  if (still()) return;
  node.animate([{ transform: `scale(${from})`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: sp.ms, easing: sp.easing });
}
// Glyphs the shared icon set does not carry.
const LIST = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><rect x="9" y="4.8" width="12" height="2.4" rx="1.2"/><rect x="9" y="10.8" width="12" height="2.4" rx="1.2"/><rect x="9" y="16.8" width="12" height="2.4" rx="1.2"/></g><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 4.6l1.3-.9v4.4"/><path d="M3.3 11.2a1.3 1.3 0 0 1 2.5.4c0 .9-2.5 2.2-2.5 2.6h2.6"/><path d="M3.4 16.6h2.3l-1.2 1.3a1.2 1.2 0 1 1-1.2 1.6"/></g></svg>';
const MARK = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.8l4.8 4.7L19.5 7"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
};

export function mountRanked(ctx) {
  const { pool, player, sound, account } = ctx;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const demo = local ? new URLSearchParams(location.search).get('rankedDemo') : null;
  // Glow is off unless switched on (Settings.glow).
  const glowOn = () => store.get('glow', false);
  const artOn = () => store.get('artwork', true);

  // The album wall behind the waiting screens: one of its ten cover sets, picked each time ranked opens.
  const wallCovers = CoverWall.covers(pool, { preset: CoverWall.randomPreset() });
  const view = el(`<div class="view ranked" role="dialog" aria-modal="true" aria-label="Ranked">
    ${CoverWall.html(wallCovers, 0.8, 'fixed')}
    <div class="screen rk-screen"></div>
  </div>`);
  const wall = view.querySelector('.cwall');
  let screen = view.querySelector('.rk-screen');
  // The springs this file animates with, as CSS (motion.js turns each SwiftUI spring into a linear() curve).
  for (const [k, r, d] of [['card', 0.4, 0.6], ['vs', 0.34, 0.5], ['intro', 0.45, 0.72], ['side', 0.4, 0.6], ['verdict', 0.5, 0.55],
    ['face', 0.45, 0.6], ['rating', 0.4, 0.7], ['badge', 0.55, 0.7], ['plate', 0.45, 0.8], ['pop', 0.3, 0.45]]) view.style.setProperty('--sp-' + k, spring(r, d).css);

  // ---------- the match (RankedGame.swift) ----------
  const g = {
    phase: 'idle', n: 0, error: '', round: 0, queue: [], choices: [], plan: [], cur: null, era: 'all', board: [],
    startedAt: 0, my: 0, their: 0, myPts: null, theirPts: null, iAns: false, theyAns: false, myPick: null,
    myCorrect: 0, perfect: false, history: [], last: null, preparing: false, forfeited: false, practice: false,
    opp: { name: 'Mia', rating: RK.startRating, rp: 0, hue: 1, form: [] }, myRating: RK.startRating, before: 0, after: 0, token: 0, frozen: false,
    // The ladder: RP at the start of the match, the tier it is played at (it sets how hard the songs are), and what it did.
    myRP: 0, ladderIndex: 0, rpBefore: 0, rpAfter: 0,
  };
  let closed = false, confirmOpen = false, boardOpen = false;
  const timers = new Set();
  const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); if (!closed) fn(); }, ms); timers.add(id); return id; };
  const cancelTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  /** Screen animations run on their own clock and stop when the screen changes. */
  let anim = 0;
  const wait = async (ms, token) => { await sleep(ms); return !closed && token === anim; };

  /** Round r's difficulty at the tier this match is played at. */
  const roundTier = r => RK.tierFor(r, g.ladderIndex);
  const inRound = () => ['countdown', 'playing', 'roundResult'].includes(g.phase);
  /** Inside a round, the round's difficulty; outside, Easy (only the page colour uses it — the colour out of a round is the rank's). */
  const tier = () => (inRound() ? roundTier(g.round) : 'easy');
  /** Where the player stands on the ladder right now. */
  const place = () => Ladder.place(account.stats.rp);
  const accent = () => (inRound() ? TIER_COLOR[tier()] : place().tier.color);
  const accentInk = () => (inRound() ? TIER_INK[tier()] : place().tier.ink);
  const iWon = () => !g.forfeited && g.my > g.their;
  const drawn = () => !g.forfeited && g.my === g.their;
  const outcome = () => (g.forfeited ? 0 : g.my > g.their ? 1 : g.my === g.their ? 0.5 : 0);
  const inMatch = () => g.phase === 'playing' || g.phase === 'roundResult' || (g.phase === 'countdown' && g.round > 0);
  const pickedRight = () => g.myPick != null && g.myPick === g.cur?.id;
  const myName = () => (account.name || '').trim() || 'You';
  /** Ranked is premium, with one free match for a new player (StageView.rankedOpen). */
  const rankedOpen = () => ctx.premium || (account.stats.rankedPlayed || 0) === 0;
  const freeMatch = () => !ctx.premium && (account.stats.rankedPlayed || 0) === 0;
  /** Out of free matches: close ranked and show premium. */
  function locked() { quit(); setTimeout(() => ctx.openPremium('ranked'), 450); }

  // Walking out by closing the tab counts as a loss, once (Ranked.markPending / settlePending).
  const markPending = () => store.set('ranked.pending', g.opp.rating);
  const clearPending = () => store.del('ranked.pending');
  function settlePending() {
    const opp = store.get('ranked.pending', null);
    if (opp == null) return;
    clearPending();
    account.recordRanked(0, Number(opp) || RK.startRating, 0);
  }

  async function playable(s) {
    if (!s?.preview) return false;
    try { await Promise.race([player.prepare(s.id, s.preview), sleep(8000).then(() => { throw new Error('slow'); })]); return true; } catch (e) { return false; }
  }
  async function botSkill() {
    const v = await Promise.race([config.get('ranked_bot_skill', RK.defaultBotSkill), sleep(3000).then(() => RK.defaultBotSkill)]).catch(() => RK.defaultBotSkill);
    const n = Number(v); return Number.isFinite(n) ? n : RK.defaultBotSkill;
  }

  async function start() {
    cancelTimers();
    const token = ++g.token, live = () => token === g.token && !closed;
    const rp = account.stats.rp || 0;
    Object.assign(g, { myRating: account.stats.rating, before: account.stats.rating, myRP: rp, ladderIndex: Ladder.place(rp).tier.index, my: 0, their: 0, round: 0, forfeited: false, myCorrect: 0, perfect: false, history: [], frozen: false });
    g.opp = { rating: RK.opponentRating(g.myRating), name: RK.names[randInt(0, RK.names.length - 1)], hue: randInt(1, 6) };
    g.opp.rp = Ladder.opponentRP(rp, g.myRating, g.opp.rating);
    g.opp.form = RK.opponentForm(g.opp.rating);
    setPhase('searching');
    const skillP = botSkill();
    await sleep(900);
    const skill = await skillP;
    if (!live()) return;
    g.plan = Array.from({ length: RK.rounds }, () => RK.opponentRound(g.opp.rating, RK.window, skill));

    g.preparing = true; updateSearchLabel();
    const picked = [], seen = new Set();
    for (let r = 0; r < RK.rounds; r++) {
      const t = roundTier(r);
      for (let i = 0; i < 40 && picked.length === r; i++) {
        const s = pool.pick(t, 'all', 'all');
        if (!s || seen.has(s.id)) continue;
        seen.add(s.id);
        if (await playable(s)) picked.push(s);
        if (!live()) { g.preparing = false; return; }
      }
    }
    g.preparing = false;
    if (picked.length !== RK.rounds) { g.error = 'Not enough songs are available here right now.'; setPhase('error'); return; }
    g.queue = picked;
    g.choices = picked.map((s, r) => deal(s, roundTier(r), pool).map(toChoice));
    setPhase('found');
    await sleep(3200);
    if (!live() || g.phase !== 'found') return;
    openRound();
  }

  function openRound() {
    if (g.round >= g.queue.length) return finish();
    const s = g.queue[g.round];
    Object.assign(g, { cur: s, era: eraOf(s.year), myPts: null, theirPts: null, iAns: false, theyAns: false, myPick: null, board: g.choices[g.round] || [] });
    clip = { started: false, muted: false, error: null };
    reelStartedAt = performance.now();
    player.prepare(s.id, s.preview).catch(() => {});
    const plan = g.plan[g.round];
    const step = n => {
      if (n > 0) { setPhase('countdown', n); later(1000, () => step(n - 1)); return; }
      // From the first clip the match counts; closing the tab now is a loss.
      if (g.round === 0 && !g.practice) markPending();
      g.startedAt = performance.now();
      setPhase('playing');
      if (plan.correct) later(plan.at * 1000, () => {
        if (g.phase !== 'playing' || g.theyAns) return;
        g.theyAns = true;
        const pts = RK.points(plan.at, roundTier(g.round));
        g.theirPts = pts; g.their += pts;
        updatePlaying();
        if (g.iAns) closeRound();
      });
      later((RK.window + 0.4) * 1000, () => { if (g.phase === 'playing') closeRound(); });
    };
    step(3);
  }

  /** A tap on one of the four answers. Right scores on the speed curve; wrong loses the round. */
  function pick(id) {
    if (g.phase !== 'playing' || g.iAns || g.myPick != null || g.round >= g.queue.length) return;
    sound.click();
    const right = id === g.queue[g.round].id;
    if (right) Haptics.success(); else { Haptics.wrong(); shake(); }
    g.myPick = id;
    g.iAns = true;
    if (right) {
      g.myCorrect++;
      const pts = RK.points((performance.now() - g.startedAt) / 1000, roundTier(g.round), 0);
      g.myPts = pts; g.my += pts;
    } else g.myPts = 0;
    updatePlaying();
    if (g.theyAns || !g.plan[g.round]?.correct) closeSoon();
  }
  /** Hold the board a beat so the tile goes green or red before the answer card. */
  function closeSoon() { const r = g.round; later(900, () => { if (r === g.round) closeRound(); }); }

  function closeRound() {
    if (g.phase !== 'playing') return;
    cancelTimers();
    const c = g.cur;
    if (c) {
      g.last = { title: c.title, artist: c.artist, artwork: c.artwork ? art(c.artwork, 300) : null };
      if (!g.history.some(h => h.id === g.round)) g.history.push({ id: g.round, title: c.title, artist: c.artist, artwork: c.artwork ? art(c.artwork, 120) : null, mine: g.myPts > 0 ? g.myPts : null, theirs: g.theirPts, myWrong: g.myPick != null && !pickedRight() });
    }
    setPhase('roundResult');
    // No button: the next round starts by itself after a short count.
    if (!g.frozen) later(RK.resultHold * 1000, () => { if (g.phase === 'roundResult') next(); });
  }
  function next() { cancelTimers(); g.round++; if (g.round >= g.queue.length) finish(); else openRound(); }
  function finish() {
    cancelTimers();
    if (!g.forfeited && g.myCorrect === RK.rounds) { g.perfect = true; g.my += RK.perfectBonus; }
    g.after = Elo.newRating(g.before, g.opp.rating, outcome());
    setPhase('finished');
  }
  /** Walk out of a match in progress: a loss, banked through the normal end of the match. */
  function forfeit() { if (!inMatch()) return; g.forfeited = true; finish(); }
  function leave() { g.token++; cancelTimers(); g.phase = 'idle'; }

  // ---------- screens ----------
  let clip = { started: false, muted: false, error: null };
  let reelStartedAt = null, reelSlot = -1, reelLanded = false, wentAwayAt = 0, lastSecs = -1, shown = false;
  let searchStarted = 0, searchSecs = -1;

  // Every phase is its own view, cross-faded: .transition(.opacity) under
  // .animation(.easeOut(duration: 0.28), value: phaseKey).
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
    // The old view is gone for good: stop its animations along with it.
    setTimeout(() => old.remove(), 300);
  }

  /** How dark the veil is over the album wall on each screen; no wall while a song plays. */
  const VEIL = { idle: 0.8, searching: 0.7, found: 0.84, countdown: 0.86, roundResult: 0.84, finished: 0.76 };
  function setPhase(p, n = 0) {
    const same = g.phase === p;
    g.phase = p; g.n = n;
    if (same && p === 'countdown') return updateCountdown();
    anim++;
    // RankedView .onChange(of: tier): the page wears a whisper of this round's colour.
    LevelTheme.setOverride(tier());
    view.style.setProperty('--rk-accent', accent());
    view.style.setProperty('--rk-ink', accentInk());
    view.classList.toggle('glow', glowOn());
    view.classList.toggle('artless', !artOn());
    wall.classList.toggle('off', !(p in VEIL));
    if (p in VEIL) wall.style.setProperty('--veil', VEIL[p]);
    swap(p);
    switch (p) {
      case 'idle': screen.innerHTML = entryHTML(); if (!shown) { shown = true; screen.querySelector('.rk-entry-all').classList.add('fadein'); } break;
      case 'searching': searchStarted = performance.now(); searchSecs = -1; screen.innerHTML = searchHTML(); tickSearch(searchStarted); break;
      case 'found': screen.innerHTML = foundHTML(); runCard(); break;
      case 'countdown':
        screen.innerHTML = countdownHTML();
        reelSlot = -1; reelLanded = false;
        lastCount = null; updateCountdown(); drawReel(performance.now());
        Haptics.press(0.8);
        // withAnimation(.spring(response: 0.45, dampingFraction: 0.72)) { introIn = true }
        requestAnimationFrame(() => requestAnimationFrame(() => screen.classList.add('in')));
        break;
      case 'playing': lastSecs = -1; screen.innerHTML = playingHTML(); tickPlaying(performance.now()); startClip(); break;
      case 'roundResult': player.stop(); sound.reveal(); screen.innerHTML = resultHTML(); runHold(); reelStartedAt = null; break;
      case 'finished': player.stop(); screen.innerHTML = finishedHTML(); runEnd(); break;
      case 'error': screen.innerHTML = errorHTML(); break;
    }
    view.scrollTop = 0;
  }

  const bar = (title = 'Ranked') => `<div class="rk-bar"><h1>${esc(title)}</h1><button class="xbtn rk-x" data-press data-act="quit" aria-label="Close">${I.x}</button></div>`;
  const myFace = size => face(account.initial || 'Y', account.avatar, alpha(hueColor(0), 0.9), size, PILL_INK);
  const theirFace = size => face(g.opp.name, null, alpha(hueColor(g.opp.hue), 0.9), size, PILL_INK);

  /** Your own face inside a ring that fills as your rank does. The ring's colour is the rank. */
  function badge(rp, size) {
    const p = Ladder.place(rp), c = p.tier.color, ring = Math.max(3, size * 0.055), r = size / 2, frac = Math.max(0.03, p.fraction);
    const inner = size - ring * 3.2;
    return `<div class="rk-badge" style="width:${size}px;height:${size}px;--glow:${alpha(c, 0.35)}">
      <svg viewBox="0 0 ${size} ${size}" overflow="visible" aria-hidden="true"><circle cx="${r}" cy="${r}" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="${ring}"/>
      <circle cx="${r}" cy="${r}" r="${r}" fill="none" stroke="${c}" stroke-width="${ring}" stroke-linecap="round" pathLength="1" stroke-dasharray="${frac} 1" transform="rotate(-90 ${r} ${r})"/></svg>
      ${face(account.initial || '?', account.avatar, alpha(c, 0.9), Math.round(inner), PILL_INK)}</div>`;
  }
  /** Recent form: the last five, oldest first. A tick, a cross, a dash where there is no game yet. */
  function formRow(form) {
    const last = (form || []).slice(-5), padded = Array(Math.max(0, 5 - last.length)).fill(-1).concat(last);
    const m = r => (r === 1 ? [MARK.check, TIER_COLOR.easy] : r === 0 ? [MARK.x, TIER_COLOR.expert] : r === 2 ? [MARK.minus, MUTED] : [MARK.minus, DIM]);
    return `<div class="rk-form">${padded.map(r => { const [icon, c] = m(r); return `<span style="color:${c};background:${alpha(c, r < 0 ? 0.08 : 0.18)}">${icon}</span>`; }).join('')}</div>`;
  }
  const eqBars = () => '<span class="rk-eq on"><i></i><i></i><i></i><i></i><i></i></span>';

  // entry — the ranked home: your rank in its colour in front of the album wall, the season
  // and your record on glass, and one big button. Fades in once, .easeOut(duration: 0.4).
  function entryHTML() {
    const s = account.stats, p = place(), tint = p.tier.color;
    const streak = (s.winStreak || 0) >= 2 ? `<span class="rk-hot">${I.flame}<b>${s.winStreak} win streak</b></span>` : '';
    return `<div class="rk-entry-all">${bar()}<div class="rk-fill"></div>
      <div class="rk-entry" style="--tint:${tint}">
        <div class="rk-hbadge">${badge(s.rp, 136)}</div>
        <div class="rk-rankname">${esc(p.name)}</div>
        <div class="rk-rp">${s.rp || 0} RP</div>
        ${rankProgress(s.rp || 0)}
        <div class="rk-glass">
          <div class="rk-gtop">${I.calendar}<span>${esc(Ladder.seasonCountdown())}</span><div class="rk-fill"></div>${streak}</div>
          <div class="rk-record">${[['Played', s.rankedPlayed || 0], ['Won', s.rankedWon || 0], ['Best', Ladder.place(s.bestRP || 0).tier.name]].map(([l, v]) => `<div><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>
          ${formRow(s.recentRanked)}
        </div>
      </div>
      <div class="rk-fill"></div>
      <button class="rk-btn2 rk-lb rk-glassbtn" data-press data-act="board">${LIST}<span>Leaderboard</span></button>
      <button class="rk-go" data-press data-act="find">${rankedOpen() ? (freeMatch() ? 'Play your free match' : 'Find a match') : 'Unlock ranked with Premium'}</button></div>`;
  }
  function rankProgress(rp) {
    const p = Ladder.place(rp);
    return `<div class="rk-progress"><div class="rk-track"><i style="width:max(4px, ${p.fraction * 100}%)"></i></div>
      <div class="rk-to">${p.nextAt != null ? `${p.nextAt - rp} RP to ${esc(Ladder.place(p.nextAt).name)}` : 'Top rank'}</div></div>`;
  }

  // matchmaking: you, in your rank's ring, in front of the wall, with the clock running
  const searchLabel = () => (g.preparing ? 'Getting the songs ready' : 'Finding an opponent');
  function updateSearchLabel() { const l = screen.querySelector('.rk-find'); if (l && l.textContent !== searchLabel()) l.textContent = searchLabel(); }
  function searchHTML() {
    const p = place();
    return `${bar()}<div class="rk-fill"></div>
      <div class="rk-hbadge breathe">${badge(account.stats.rp, 118)}</div>
      <div class="rk-find">${searchLabel()}</div>
      <div class="rk-findsub" style="color:${p.tier.color}">${esc(p.name)} · ${account.stats.rp || 0} RP</div>
      <div class="rk-clock" style="--rk-accent:${p.tier.color}">${eqBars()}<b class="rk-clockt">0:00</b></div>
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

  // the fight card
  function fighter({ name, rp, avatar, hue, form, me }) {
    const c = hueColor(hue), p = Ladder.place(rp);
    return `<div class="rk-fighter ${me ? 'me' : 'them'}" style="--c:${c};--glow:${alpha(c, 0.45)}">
      <div class="rk-fface">${face(name, avatar, alpha(c, 0.9), 96, PILL_INK)}</div>
      <div class="rk-fname">${esc(name)}</div>
      <div class="rk-pill" style="background:${p.tier.color};color:${p.tier.ink}">${esc(p.name.toUpperCase())}</div>
      <div class="rk-frating">${rp} RP</div>
      <div class="rk-fform">${formRow(form)}</div>
    </div>`;
  }
  function foundHTML() {
    const hardest = Ladder.roundTiers(g.ladderIndex).slice(-1)[0] || 'hard';
    return `${bar()}<div class="rk-fill"></div>
      <div class="rk-mf">MATCH FOUND</div>
      <div class="rk-versus">
        ${fighter({ name: myName(), rp: g.myRP, avatar: account.avatar, hue: 0, form: account.stats.recentRanked, me: true })}
        ${fighter({ name: g.opp.name, rp: g.opp.rp, avatar: null, hue: g.opp.hue, form: g.opp.form })}
        <div class="rk-vs">VS</div>
      </div>
      <div class="rk-terms"><div><b>${RK.rounds}</b><span>rounds</span></div><i></i><div><b>${RK.window}s</b><span>a song</span></div><i></i><div><b>${cap(hardest)}</b><span>hardest song</span></div></div>
      <div class="rk-fill"></div>
      <div class="rk-coming">First song coming up</div>`;
  }
  /** runCardAnimation: spring(.4,.6) in, +420 ms the VS on spring(.34,.5), +380 ms the terms on easeOut .3. */
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

  // the round bar: ROUND n / 5, the tier, the X
  function roundBar() {
    const t = roundTier(g.round);
    const era = g.phase === 'playing' && g.era !== 'all' ? `<span class="rk-era">${esc(g.era)}</span>` : '';
    return `<div class="rk-roundbar"><div class="rk-rno"><span>ROUND</span><div><b>${g.round + 1}</b><em>/ ${RK.rounds}</em></div></div>
      <div class="rk-fill"></div>${era}<span class="rk-tier" style="background:${PILL_FILL[t]}">${cap(t)}</span>
      <button class="rk-rx" data-press data-act="roundx" aria-label="Leave the match">${I.x}</button></div>`;
  }
  // the round intro: the round and its level slam in, the decade reel races to the song's decade, one number pops
  function countdownHTML() {
    const n = g.round + 1, t = roundTier(g.round);
    const sleeves = Array.from({ length: 9 }, () => '<div class="rk-cv"><div class="rk-cvin"></div><i class="rk-cvshade"></i></div>').join('');
    return `${roundBar()}<div class="rk-fill"></div>
      <div class="rk-title"><b>${n === RK.rounds ? 'FINAL' : `ROUND ${n}`}</b><span>${t.toUpperCase()}</span></div>
      <div class="rk-fill"></div>
      <div class="rk-reelwrap"><span>THIS SONG IS FROM THE</span>
        <div class="rk-cf" role="img" aria-label="This song is from the ${esc(g.era)}">${sleeves}</div></div>
      <div class="rk-fill"></div>
      <div class="rk-cnum-slot"></div>`;
  }
  /** One number that pops each second (.id(secondsLeft), spring(.32,.55) from 1.4× at 0.3), then GO. */
  let lastCount = null;
  function updateCountdown() {
    const slot = screen.querySelector('.rk-cnum-slot'); if (!slot) return;
    const n = g.n;
    if (n === lastCount) return;
    lastCount = n;
    slot.innerHTML = `<div class="rk-cnum">${n > 0 ? n : 'GO'}</div>`;
    if (!still()) { const sp = spring(0.32, 0.55); slot.firstChild.animate([{ transform: 'scale(1.4)', opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: sp.ms, easing: sp.easing }); }
    if (n > 0) sound.tick();
  }
  /**
   * CoverEraReel: nine sleeves in a coverflow row, the one in the middle large and
   * the ones beside it turned away, racing and easing onto the song's decade. Each
   * sleeve keeps its node while it is on screen (index mod 9), so a frame is only
   * transforms and opacities; a sleeve is redrawn only as it wraps round the ends.
   */
  function drawReel(now) {
    const host = screen.querySelector('.rk-cf'); if (!host) return;
    const t = reelStartedAt == null ? 99 : Math.max(0, (now - reelStartedAt) / 1000);
    const p = reelPosition(t, g.era), landed = t >= REEL.duration;
    const settle = landed ? Math.min(1, (t - REEL.duration) / 0.35) : 0, pulse = Math.sin(settle * Math.PI);
    const centre = Math.round(p), nodes = host.children;
    for (let i = centre - 4; i <= centre + 4; i++) {
      const node = nodes[((i % 9) + 9) % 9], d = i - p, a = Math.min(1, Math.abs(d));
      if (node.dataset.i !== String(i)) {
        node.dataset.i = String(i);
        const era = decadeAt(i);
        if (node.dataset.era !== era) { node.dataset.era = era; node.firstElementChild.innerHTML = sleeveHTML(era); }
      }
      const lit = landed && i === centre;
      const angle = Math.max(-50, Math.min(50, d * 38));
      const scale = 1.15 - 0.35 * a + (lit ? 0.06 * pulse : 0);
      // Neighbours sit a little further out than the rest, clear of the big one.
      const push = Math.abs(d) < 1 ? d * 0.25 : d < 0 ? -0.25 : 0.25;
      node.style.transform = `translateX(${((d + push) * REEL.spacing).toFixed(2)}px) scale(${scale.toFixed(4)}) perspective(${Math.round(REEL.side / 0.6)}px) rotateY(${angle.toFixed(2)}deg)`;
      node.style.opacity = (1 - Math.min(0.9, Math.abs(d) * 0.22)).toFixed(3);
      node.style.zIndex = String(100 - Math.round(Math.abs(d) * 10));
      node.lastElementChild.style.opacity = (0.35 * a).toFixed(3);
      if (node.classList.contains('lit') !== lit) node.classList.toggle('lit', lit);
    }
    // Haptics: a click per sleeve, a thump on landing.
    if (reelStartedAt != null) {
      if (centre !== reelSlot) { if (reelSlot >= 0) Haptics.select(); reelSlot = centre; }
      if (landed && !reelLanded) { reelLanded = true; Haptics.press(0.9); }
    }
  }

  // playing
  function sideScore({ name, score, answered, colour, leading, missed, key }) {
    const mark = answered ? `<i class="rk-ok" style="color:${missed ? TIER_COLOR.expert : colour}">${missed ? I.xCircle : I.checkCircle}</i>` : '';
    // Your own total shows; the opponent's stays hidden until full time — only whether they have answered.
    const value = leading ? `<b class="rk-sscore">${score}</b>` : `<b class="rk-sstate" style="color:${answered ? colour : DIM}">${answered ? 'Answered' : 'Listening'}</b>`;
    return `<div class="rk-side ${leading ? 'lead' : 'trail'}" data-side="${key}" style="background:${alpha(colour, answered ? 0.14 : 0.06)}">
      <div class="rk-sname">${leading ? mark : ''}<span>${esc(name)}</span>${leading ? '' : mark}</div>${value}</div>`;
  }
  const sides = () => [
    { key: 'me', name: myName(), score: g.my, answered: g.iAns, colour: TIER_COLOR[tier()], leading: true, missed: g.myPick != null && !pickedRight() },
    { key: 'them', name: g.opp.name, score: g.their, answered: g.theyAns, colour: hueColor(g.opp.hue), leading: false, missed: false },
  ];
  /** Both scores, side by side, so the race is always on screen. */
  const scoreLine = () => `<div class="rk-scores">${sides().map(sideScore).join('')}</div>`;
  /** In place, so the tint eases (spring .4/.6), the tick pops in and the score rolls (.snappy(duration: .3)). */
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
    if (g.myPts == null) return '<span class="rk-hint">One tap. Wrong loses the round.</span>';
    if (g.myPts > 0) return `<span class="rk-got">${MARK.check}<b>+${g.myPts}</b>${g.theyAns ? '' : `<em>Waiting for ${esc(g.opp.name)}…</em>`}</span>`;
    return `<span class="rk-got bad">${MARK.x}<b>Wrong. No points this round.</b></span>`;
  }
  const boardHTML = () => choiceGrid(g.board, { picked: g.myPick, reveal: g.myPick == null ? null : g.cur?.id });
  function playingHTML() {
    return `<div class="rk-play">${roundBar()}${scoreLine()}<div class="rk-fill"></div>
      <button class="rk-ring" data-act="replay" aria-label="Replay the clip">
        <svg viewBox="0 0 196 196" overflow="visible" aria-hidden="true"><circle cx="98" cy="98" r="98" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="10"/>
        <circle class="arc" cx="98" cy="98" r="98" fill="none" stroke="var(--rk-accent)" stroke-width="10" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" transform="rotate(-90 98 98)"/></svg>
        <span class="rk-ring-in"><span class="rk-eq"><i></i><i></i><i></i><i></i><i></i></span><b class="rk-secs">${RK.window}</b><span class="rk-state"></span><span class="rk-why"></span></span>
      </button><div class="rk-fill"></div>
      <div class="rk-choices"><div class="rk-status" data-k="${statusKey()}">${statusHTML()}</div><div class="rk-grid">${boardHTML()}</div></div></div>`;
  }
  const statusKey = () => (g.myPts == null ? 'none' : `${g.myPts}|${g.theyAns}`);
  function updatePlaying() {
    if (g.phase !== 'playing') return;
    patchScores();
    const st = screen.querySelector('.rk-status');
    if (st && st.dataset.k !== statusKey()) {
      const wasNone = st.dataset.k === 'none';
      st.dataset.k = statusKey();
      const sp = spring(0.35, 0.7);
      // .transition(.scale(scale: 0.6).combined(with: .opacity)) in, the hint fades out.
      const old = st.firstElementChild;
      st.insertAdjacentHTML('beforeend', statusHTML());
      const nu = st.lastElementChild;
      if (old && !still()) { old.classList.add('out'); old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: sp.ms, easing: sp.easing, fill: 'forwards' }).finished.then(() => old.remove(), () => {}); }
      else old?.remove();
      if (wasNone) popIn(nu, 0.6, sp);
    }
    // In place, so the pick (spring .3/.75) and the reveal (.25 s easeOut) animate.
    const gr = screen.querySelector('.rk-grid');
    if (gr && !updateChoiceGrid(gr, g.board, { picked: g.myPick, reveal: g.myPick == null ? null : g.cur?.id })) gr.innerHTML = boardHTML();
  }
  function tickPlaying(now) {
    const ring = screen.querySelector('.rk-ring'); if (!ring) return;
    const elapsed = (now - g.startedAt) / 1000, progress = Math.min(1, elapsed / RK.window);
    ring.querySelector('.arc').setAttribute('stroke-dasharray', `${Math.max(0, 1 - progress).toFixed(4)} 1`);
    const left = Math.max(0, Math.ceil(RK.window - elapsed - 1e-9));
    if (left !== lastSecs) { const first = lastSecs < 0; lastSecs = left; const s = ring.querySelector('.rk-secs'); if (first) { s.textContent = left; s.dataset.v = String(left); } else numText(s, left, spring(0.2, 0.85), true); }
    const st = clip.error ? ['no sound — tap for why', 'bad'] : clip.muted ? ['no sound this round', 'bad'] : player.playing ? ['listening', 'on'] : ['tap to replay', ''];
    ring.classList.toggle('playing', player.playing);
    const s = ring.querySelector('.rk-state');
    if (s.textContent !== st[0]) { s.textContent = st[0]; s.className = 'rk-state ' + st[1]; }
    const why = ring.querySelector('.rk-why'), w = clip.error || '';
    if (why.textContent !== w) why.textContent = w;
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

  // The Shazam guard: away when the clip is due (or in the 12 s before) and the round is silent.
  async function startClip() {
    if (clip.started || !g.cur) return;
    clip.started = true;
    if (document.hidden || (wentAwayAt && performance.now() - wentAwayAt < 12000)) clip.muted = true;
    wentAwayAt = 0;
    if (clip.muted || g.frozen) return;
    const c = g.cur;
    const ok = await player.play(c.id, c.preview, RK.window);
    if (!ok && g.cur === c && g.phase === 'playing') clip.error = player.lastError || "Couldn't load the clip.";
  }
  async function replay() {
    if (g.phase !== 'playing' || !g.cur || player.playing || clip.muted) return;
    sound.click(); Haptics.press(0.8);
    const c = g.cur;
    const ok = await player.play(c.id, c.preview, RK.window);
    if (ok) clip.error = null; else if (g.cur === c) clip.error = player.lastError || "Couldn't load the clip.";
  }

  // between rounds: the song it was, big, over the album wall; what each of you took from it
  // (no running totals); and the count to the next round.
  function gained(faceHTML, points, colour, wrong = false) {
    const v = wrong ? 'Wrong' : points != null ? `+${points}` : 'No answer';
    const c = wrong ? TIER_COLOR.expert : points == null ? DIM : colour;
    const edge = wrong ? alpha(TIER_COLOR.expert, 0.35) : points == null ? 'rgba(255,255,255,.08)' : alpha(colour, 0.35);
    return `<div class="rk-gain" style="border-color:${edge}">${faceHTML}<b class="${wrong || points == null ? 'sm' : ''}" style="color:${c}">${v}</b></div>`;
  }
  function resultHTML() {
    const a = g.last || {};
    const cover = artOn() && a.artwork ? `<div class="rk-bigart"><img class="glow" src="${esc(a.artwork)}" alt=""><img class="cov" src="${esc(a.artwork)}" alt=""></div>` : '';
    return `${roundBar()}<div class="rk-fill"></div>
      <div class="rk-answer">${cover}<span class="rk-itwas">IT WAS</span><b>${esc(a.title || '')}</b><em>${esc(a.artist || '')}</em></div>
      <div class="rk-gains">${gained(myFace(26), g.myPts, hueColor(0), g.myPick != null && !pickedRight())}${gained(theirFace(26), g.theirPts, hueColor(g.opp.hue))}</div>
      <div class="rk-fill"></div>
      <div class="rk-next"><span>${g.round + 1 >= RK.rounds ? 'FULL TIME IN' : 'NEXT ROUND IN'}</span><b class="n">${RK.resultHold}</b></div>`;
  }
  /** The count falls a second at a time, rolling down (.numericText(countsDown: true)). */
  async function runHold() {
    const token = anim, total = RK.resultHold;
    const num = screen.querySelector('.rk-next .n');
    if (g.frozen) return;
    for (let i = 1; i < total; i++) { if (!(await wait(1000, token))) return; numText(num, total - i, spring(0.55, 0.825), true); }
  }

  // the end: the result, and nothing else — who won, the score, what it did to your rank, one button
  const myColour = hueColor(0);
  function scoreSide(side) {
    const mine = side === 'me';
    const name = mine ? myName() : g.opp.name, c = mine ? myColour : hueColor(g.opp.hue);
    return `<div class="rk-sside ${side}" style="--c:${c}"><div class="rk-sface">${mine ? myFace(44) : theirFace(44)}</div><span>${esc(name)}</span></div>`;
  }
  function finishedHTML() {
    const won = iWon(), drew = drawn();
    const colour = won ? TIER_COLOR.easy : drew ? MUTED : TIER_COLOR.expert;
    const sub = g.forfeited ? `You left the match · ${g.opp.name} wins` : won ? `${g.opp.name} couldn't keep up` : drew ? 'Dead level after five' : `${g.opp.name} took it this time`;
    return `<i class="rk-bloom" style="background:${alpha(colour, won ? 0.22 : 0.1)}"></i>${bar()}
      <div class="rk-fill"></div>
      <div class="rk-end">
        <div class="rk-verdict ${won ? 'won' : ''}" style="--c:${colour};--glow:${alpha(colour, 0.45)}">
          <div class="rk-ft">FULL TIME</div>
          <div class="rk-vd"><b>${drew ? 'Draw' : won ? 'Victory' : 'Defeat'}</b><span>${esc(sub)}</span></div>
        </div>
        <div class="rk-final">${scoreSide('me')}<div class="rk-fscore"><b class="m">0</b><i>–</i><b class="t">0</b></div>${scoreSide('them')}</div>
        <div class="rk-plate">
          <div class="rk-ptop"><div class="rk-emb"><svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="26" class="bg"/><circle cx="28" cy="28" r="26" class="trk"/><circle cx="28" cy="28" r="26" class="arc" pathLength="1" stroke-dasharray="0.03 1" transform="rotate(-90 28 28)"/></svg><i>${I.crown}</i></div>
            <div class="rk-pt"><small>YOUR RANK</small><b></b><span></span></div><div class="rk-fill"></div>
            <span class="rk-chip"><i></i><b></b></span></div>
          <div class="rk-pbar"><i></i></div>
        </div>
      </div>
      <div class="rk-fill"></div>
      <div class="rk-endbtns"><button class="rk-go" data-press data-act="again">Play again</button>
        <button class="rk-leave" data-press data-act="quit">Leave</button></div>`;
  }
  /** The rank plate at `shown` RP: the emblem ring, the name in its colour, the RP, the bar. */
  function setPlate(plate, shown) {
    const p = Ladder.place(shown), c = p.tier.color, before = Ladder.place(g.rpBefore), after = Ladder.place(g.rpAfter);
    const up = g.rpAfter > g.rpBefore && after.name !== before.name, reached = shown === g.rpAfter;
    plate.style.setProperty('--pc', c);
    plate.classList.toggle('promoted', reached && up);
    plate.querySelector('.rk-pt small').textContent = reached && up ? 'PROMOTED' : 'YOUR RANK';
    const name = plate.querySelector('.rk-pt b');
    if (name.textContent !== p.name) name.textContent = p.name;
    numText(plate.querySelector('.rk-pt span'), `${shown} RP`, { ms: 40, easing: 'linear' });
    plate.querySelector('.arc').setAttribute('stroke-dasharray', `${Math.max(0.03, p.fraction).toFixed(4)} 1`);
    plate.querySelector('.rk-pbar i').style.width = `max(6px, ${(p.fraction * 100).toFixed(2)}%)`;
  }
  /** Bank the result once, then let the screen tell it a beat at a time (runEndSequence). */
  async function runEnd() {
    const token = anim;
    const earned = RK.boardPoints(g.my, outcome());
    // What the ladder makes of it: the real before and after, read around recordRanked.
    g.rpBefore = account.stats.rp || 0;
    if (!g.frozen && !g.practice) {
      account.recordRanked(outcome(), g.opp.rating, g.my, g.perfect);
      clearPending();
      post(earned);
      g.rpAfter = account.stats.rp || 0;
    } else {
      const s = account.stats, next = outcome() > 0.6 ? (s.winStreak || 0) + 1 : outcome() < 0.4 ? 0 : (s.winStreak || 0);
      g.rpAfter = Math.max(Ladder.tierFloor(g.rpBefore), g.rpBefore + Ladder.change(outcome(), s.rating, g.opp.rating, next, g.perfect).delta);
    }
    // Out of the match the colour is the rank's: Play again wears where you are now.
    const now = Ladder.place(g.rpAfter);
    LevelTheme.setOverride('easy');
    view.style.setProperty('--rk-accent', now.tier.color); view.style.setProperty('--rk-ink', now.tier.ink);
    const s = screen, end = s.querySelector('.rk-end'), plate = s.querySelector('.rk-plate');
    const me = s.querySelector('.rk-fscore .m'), them = s.querySelector('.rk-fscore .t');
    const delta = g.rpAfter - g.rpBefore, chip = plate.querySelector('.rk-chip');
    chip.classList.toggle('down', delta < 0);
    chip.querySelector('i').innerHTML = delta >= 0 ? '▲' : '▼';
    chip.querySelector('b').textContent = Math.abs(delta);
    setPlate(plate, g.rpBefore);
    if (!(await wait(450, token))) return;
    // Full time: both scores count up together, ticking as they go (.linear(duration: 0.05) a step).
    const steps = 24, lin = { ms: 50, easing: 'linear' };
    for (let i = 1; i <= steps; i++) {
      const e = 1 - Math.pow(1 - i / steps, 2.2);
      numText(me, Math.round(g.my * e), lin); numText(them, Math.round(g.their * e), lin);
      if (i % 4 === 0) { sound.tick(); Haptics.press(0.35); }
      if (!(await wait(55, token))) return;
    }
    numText(me, g.my, lin); numText(them, g.their, lin);
    if (!(await wait(250, token))) return;
    // The verdict: tallyDone + bannerPop.
    const won = iWon(), theyWon = !won && !drawn();
    end.classList.add('pop');
    s.querySelector('.rk-bloom').classList.add('on');
    s.querySelector('.rk-sside.me').classList.add(won ? 'winner' : theyWon ? 'loser' : 'even');
    s.querySelector('.rk-sside.them').classList.add(theyWon ? 'winner' : won ? 'loser' : 'even');
    Haptics.success(); sound.reveal();
    if (won) confetti(innerWidth / 2, innerHeight * 0.30, [TIER_COLOR.easy, '#ffffff', TIER_COLOR[roundTier(RK.rounds - 1)]], 150);
    // Where it leaves you on the ladder: the plate on spring(.45,.8), then the RP counts across and a new division lands with a pop.
    if (!(await wait(650, token))) return;
    end.classList.add('s2');
    if (!(await wait(350, token))) return;
    const from = g.rpBefore, to = g.rpAfter, n = 22;
    let lastName = Ladder.place(from).name;
    for (let i = 1; i <= n; i++) {
      const k = 1 - Math.pow(1 - i / n, 2), shown = from + Math.round((to - from) * k);
      setPlate(plate, shown);
      const nowName = Ladder.place(shown).name;
      if (nowName !== lastName) {
        lastName = nowName;
        if (to > from) {
          Haptics.success(); sound.reveal();
          const emb = plate.querySelector('.rk-emb');
          emb.classList.add('pop');
          const c = Ladder.place(shown).tier.color, r = emb.getBoundingClientRect();
          confetti(r.left + r.width / 2, r.top + r.height / 2, [c, '#ffffff', c], 90);
          if (!(await wait(260, token))) return;
          emb.classList.remove('pop');
        } else Haptics.wrong();
      } else if (i % 5 === 0) Haptics.press(0.3);
      if (!(await wait(45, token))) return;
    }
    setPlate(plate, to);
    // The buttons.
    if (!(await wait(450, token))) return;
    end.classList.add('s3'); s.querySelector('.rk-endbtns').classList.add('in');
    Haptics.tap();
  }

  /** Bank a finished match on the boards. Fire and forget: the result screen never waits on it. */
  async function post(points) {
    try {
      const u = await account.ensureUser();
      const { error } = await supabase.from('ranked_results').insert({ user_id: u.id, display_name: ((account.name || '').trim() || 'Player').slice(0, 20), avatar: account.avatar || null, points, score: g.my, won: iWon() });
      if (error) console.warn('ranked_results', error.message);
    } catch (e) { console.warn('ranked_results', e); }
  }

  const errorHTML = () => `<div class="rk-fill"></div><div class="rk-error"><p>${esc(g.error)}</p><button data-press data-act="quit">Back</button></div><div class="rk-fill"></div>`;

  // ---------- the leaderboard (LeaderboardView.swift) ----------
  function openBoard() {
    sound.click();
    boardOpen = true;
    const rt = place().tier;
    const sh = openSheet(`<div class="rk-lbv" style="--rk-accent:${rt.color};--rk-ink:${rt.ink}">
      <div class="rk-lbhead"><h1>Leaderboard</h1><button class="xbtn" data-press data-close aria-label="Close">${I.x}</button></div>
      <div class="rk-period"><button data-press data-p="1" class="on">Today</button><button data-press data-p="7">This week</button></div>
      <div class="rk-lbbody"></div><div class="rk-lbmine"></div></div>`, { cls: 'tall rk-board', label: 'Leaderboard', onClose: () => { boardOpen = false; } });
    const body = sh.body.querySelector('.rk-lbbody'), mineHost = sh.body.querySelector('.rk-lbmine');
    let days = 1, loadToken = 0;
    sh.body.querySelector('[data-close]').addEventListener('click', () => sh.close());
    sh.body.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
      const d = Number(b.dataset.p); if (d === days) return;
      days = d; sh.body.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b)); load();
    }));
    const message = t => `<div class="rk-lbmsg">${esc(t)}</div>`;
    // The top three wear a medal colour; everyone else wears their place.
    const row = (r, place, isMe) => {
      const medal = MEDALS[place];
      const seed = [...String(r.user_id)].reduce((a, ch) => ((a * 31 + ch.codePointAt(0)) & 0xffff), 0);
      const colour = medal || hueColor(seed);
      const name = (r.display_name || '').trim() || 'Someone';
      const m = r.matches > 0 ? `<em>${r.matches} ${r.matches === 1 ? 'match' : 'matches'}</em>` : '';
      return `<div class="rk-lbrow${isMe ? ' me' : ''}"><b class="pl" style="${medal ? `color:${medal}` : ''}">${place}</b>
        ${face(name, r.avatar, alpha(colour, 0.9), 34, PILL_INK)}
        <span class="nm">${esc(isMe ? `${name} (you)` : name)}</span><span class="rk-fill"></span>
        <span class="pts"><b style="${medal ? `color:${medal}` : ''}">${r.points}</b>${m}</span></div>`;
    };
    async function load() {
      const token = ++loadToken;
      body.innerHTML = '<div class="rk-pulse"><i></i><b></b></div>'; mineHost.innerHTML = '';
      let rows = null, me = null;
      try {
        if (demo === 'board') { await sleep(300); rows = ['Liv', 'Noah', 'Sofia', 'Ella', 'Theo', 'Aya', 'Max', 'Ida'].map((n, i) => ({ user_id: 'sample-' + i, display_name: n, avatar: null, points: 9400 - i * 1130, matches: 12 - i })); me = 'sample-3'; }
        else {
          const u = await account.ensureUser(); me = u?.id;
          const { data, error } = await supabase.rpc('ranked_board', { window_days: days });
          if (error) throw error;
          rows = data || [];
        }
      } catch (e) { console.warn('ranked_board', e); rows = null; }
      if (token !== loadToken || !sh.node.isConnected) return;
      if (rows == null) { body.innerHTML = message("The board couldn't load. Check your connection."); return; }
      if (!rows.length) { body.innerHTML = message(days === 1 ? 'Nobody has played today yet. Be the first.' : 'No matches this week yet. Be the first.'); return; }
      body.innerHTML = `<div class="rk-lblist">${rows.map((r, i) => row(r, i + 1, r.user_id === me)).join('')}</div>`;
      const i = rows.findIndex(r => r.user_id === me);
      if (i >= 10) mineHost.innerHTML = row(rows[i], i + 1, true);
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
    const end = ok => { if (!confirmOpen) return; confirmOpen = false; document.removeEventListener('keydown', onEsc, true); popView(node); if (ok) forfeit(); };
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
    closed = true; g.token++; anim++;
    cancelTimers(); player.stop();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    cancelAnimationFrame(raf);
    // .onDisappear: the page goes back to the stage's level colour.
    LevelTheme.setOverride(null);
    popView(view);
  }
  function quit() { player.stop(); leave(); close(); }

  view.addEventListener('click', e => {
    const c = e.target.closest('[data-choice]');
    if (c) { if (!c.disabled) pick(c.dataset.choice); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    switch (b.dataset.act) {
      case 'quit': sound.click(); quit(); break;
      // Mid-match the X costs the match, so it asks first. Before the first clip it is a free exit.
      case 'roundx': sound.click(); inMatch() ? confirmLeave() : quit(); break;
      case 'board': openBoard(); break;
      case 'find': case 'again': sound.click(); if (!rankedOpen()) { locked(); break; } player.ensure(); start(); break;
      case 'cancel': sound.click(); leave(); setPhase('idle'); break;
      case 'replay': replay(); break;
    }
  });
  function onKey(e) {
    if (closed || confirmOpen || boardOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); inMatch() ? confirmLeave() : quit(); return; }
    // 1–4 answer from a keyboard, top to bottom.
    if (g.phase === 'playing' && /^[1-4]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) { const c = g.board[Number(e.key) - 1]; if (c) pick(c.id); }
  }
  function onVis() {
    if (!document.hidden) return;
    player.stop(); wentAwayAt = performance.now();
    if (g.phase === 'playing') clip.muted = true;
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);

  let raf = 0;
  const loop = now => {
    if (closed) return;
    raf = requestAnimationFrame(loop);
    if (g.phase === 'countdown') drawReel(now);
    else if (g.phase === 'searching') tickSearch(now);
    else if (g.phase === 'playing' && !g.frozen) tickPlaying(now);
  };
  raf = requestAnimationFrame(loop);

  account.rolloverSeasonIfNeeded();
  settlePending();
  // -setRP: ?setRP=640 puts this browser at that many rank points (localhost only).
  const setRP = local ? parseInt(new URLSearchParams(location.search).get('setRP') ?? '', 10) : NaN;
  if (Number.isFinite(setRP) && setRP >= 0) account.record(s => { s.rp = setRP; s.bestRP = Math.max(s.bestRP || 0, setRP); });
  pushView(view);
  setPhase('idle');
  if (demo) runDemo(demo);

  // ---------- localhost-only test knobs, mirroring the app's DEBUG flags ----------
  // ?setRP=N sets your rank points first (-setRP), so every rank's colours can be seen.
  // ?rankedDemo=search (-showSearch) | versus (-showVersus) | intro (-showIntro: the round-2 intro held on 2)
  //   | round | result | final (-fakeResult) | lose | board (-fakeBoard)
  //   | play: a whole match against the stand-in that banks nothing (no rating, no board post).
  function demoQueue() {
    const picked = [];
    for (let r = 0; r < RK.rounds; r++) { let s; for (let i = 0; i < 40; i++) { s = pool.pick(roundTier(r), 'all', 'all'); if (s?.preview && s.artwork) break; } picked.push(s); }
    g.queue = picked; g.choices = picked.map((s, r) => deal(s, roundTier(r), pool).map(toChoice));
  }
  function runDemo(kind) {
    if (kind === 'play') { g.practice = true; return; }
    g.frozen = true; g.token++;
    const rp = account.stats.rp || 0;
    Object.assign(g, { myRating: account.stats.rating, before: account.stats.rating, myRP: rp, ladderIndex: Ladder.place(rp).tier.index });
    g.opp = { name: 'Mia', rating: RK.opponentRating(g.myRating), hue: 3, form: [1, 1, 0, 1, 1] };
    g.opp.rp = Ladder.opponentRP(rp, g.myRating, g.opp.rating);
    if (kind === 'search') { setPhase('searching'); return; }
    if (kind === 'versus') { setPhase('found'); return; }
    if (kind === 'board') { openBoard(); return; }
    demoQueue();
    if (kind === 'intro' || kind === 'countdown') {
      // game.demoIntro: round 2 of 5, 912–780, a Medium song from the nineties.
      g.round = 1; g.my = 912; g.their = 780;
      g.history = [{ id: 0, title: 'Blinding Lights', artist: 'The Weeknd', artwork: null, mine: 912, theirs: 780, myWrong: false }];
      const s = pool.pick('medium', '90s', 'all') || g.queue[1]; g.cur = s; g.era = eraOf(s.year);
      reelStartedAt = performance.now(); setPhase('countdown', 2); return;
    }
    if (kind === 'round' || kind === 'result') {
      g.round = 1; g.my = 1046; g.their = 780;
      const s = g.queue[1];
      Object.assign(g, { cur: s, era: eraOf(s.year), board: g.choices[1], myPts: null, theirPts: null, iAns: false, theyAns: false, myPick: null });
      clip = { started: true, muted: false, error: null };
      g.startedAt = performance.now() - 4200;
      setPhase('playing');
      tickPlaying(performance.now());
      if (kind === 'result') {
        g.myPick = s.id; g.iAns = true; g.myPts = 1012; g.my += 1012; g.theyAns = true; g.theirPts = 842; g.their += 842;
        closeRound();
      }
      return;
    }
    if (kind === 'final' || kind === 'lose') {
      // game.demoFinish(won:)
      const won = kind === 'final';
      g.my = won ? 3840 : 2110; g.their = won ? 2960 : 4120;
      const pts = [[912, 780, false], [null, 840, true], [1046, null, false], [902, 1340, false], [980, null, false]];
      g.history = g.queue.map((s, i) => ({ id: i, title: s.title, artist: s.artist, artwork: s.artwork ? art(s.artwork, 120) : null, mine: pts[i][0], theirs: pts[i][1], myWrong: pts[i][2] }));
      g.round = RK.rounds; g.after = Elo.newRating(g.before, g.opp.rating, won ? 1 : 0);
      setPhase('finished');
    }
  }
  return { close };
}
