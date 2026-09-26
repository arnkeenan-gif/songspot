// Ranked on the web: one song, two people, the faster right answer takes it.
// Five rounds up the tiers, a rating that moves, a badge that wears the tier
// colours. A port of Ranked/Ranked.swift, RankedGame.swift, RankedView.swift,
// Leaderboard(View).swift and EraReel.swift — same rules, same numbers, same
// screens. Until live matchmaking lands the opponent is a stand-in: rated
// near you, answering on its own clock, right about as often as that rating
// says (scaled by app_config.ranked_bot_skill). No hint: the app's ranked
// board has none (its hint key sits on the old typed-guess row, unused).
import { el, esc, art, alpha, face, hueColor, pushView, popView, openSheet, sleep, cap, TIER_COLOR, TIER_INK, PILL_FILL, PILL_INK, settings as store } from './ui.js';
import { I } from './icons.js';
import { deal, toChoice, choiceGrid } from './choices.js';
import { eraOf } from './pool.js';
import { Haptics } from './haptics.js';
import { Ranked as Elo } from './account.js';
import { supabase, config } from './supabase.js';
import { confetti } from './confetti.js';

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
  rank: r => (r < 1100 ? 'easy' : r < 1300 ? 'medium' : r < 1500 ? 'hard' : r < 1700 ? 'expert' : 'impossible'),
  rankName: r => cap(RK.rank(r)),
  progress(r) {
    for (const [lo, hi] of [[900, 1100], [1100, 1300], [1300, 1500], [1500, 1700]]) if (r < hi) return { next: hi, fraction: clamp((r - lo) / (hi - lo)) };
    return { next: null, fraction: 1 };
  },
  /** The Monday this season ends on, local time. */
  seasonEnd(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + 7 - ((x.getDay() + 6) % 7)); return x; },
  seasonCountdown(d = new Date()) {
    const left = (RK.seasonEnd(d) - d) / 1000;
    if (left <= 0) return 'Resetting now';
    const hours = Math.floor(left / 3600);
    if (hours < 24) return hours <= 1 ? 'Resets within the hour' : `Resets in ${hours} hours`;
    const days = Math.ceil(left / 86400);
    return days <= 1 ? 'Resets tomorrow' : `Resets in ${days} days`;
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
  /** Climbs like a party: Easy first, Impossible last. */
  tierFor: r => TIERS[Math.min(Math.floor(r * TIERS.length / Math.max(1, RK.rounds)), TIERS.length - 1)],
  /** Leaderboard.points: what was scored, plus a bonus for taking it. */
  boardPoints: (score, outcome) => score + (outcome > 0.6 ? 300 : outcome > 0.4 ? 100 : 0),
};

// The EraReel's slots and motion (EraReel.swift, WinSequence.reelPosition/reelBlur).
const SLOTS = ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'];
const SLOT_W = 58, REEL_W = 230;
const reelDuration = steps => Math.min(2.9, 0.380 * steps);
const reelPosition = (t, steps) => steps * (1 - Math.pow(1 - Math.min(1, t / reelDuration(steps)), 3));
const reelBlur = (t, steps) => { const d = reelDuration(steps), f = Math.min(1, t / d); return Math.min(2.6, steps * 3 * Math.pow(1 - f, 2) / d * 0.055); };

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
  const glowOn = () => store.get('glow', true);
  const artOn = () => store.get('artwork', true);

  const view = el(`<div class="view ranked" role="dialog" aria-modal="true" aria-label="Ranked">
    <div class="rk-lit"><i class="l"></i><i class="r"></i></div>
    <div class="screen rk-screen"></div>
  </div>`);
  const screen = view.querySelector('.rk-screen');

  // ---------- the match (RankedGame.swift) ----------
  const g = {
    phase: 'idle', n: 0, error: '', round: 0, queue: [], choices: [], plan: [], cur: null, era: 'all', board: [],
    startedAt: 0, my: 0, their: 0, myPts: null, theirPts: null, iAns: false, theyAns: false, myPick: null,
    myCorrect: 0, perfect: false, history: [], last: null, preparing: false, forfeited: false,
    opp: { name: 'Mia', rating: RK.startRating, hue: 1, form: [] }, myRating: RK.startRating, before: 0, after: 0, token: 0, frozen: false,
  };
  let closed = false, confirmOpen = false, boardOpen = false;
  const timers = new Set();
  const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); if (!closed) fn(); }, ms); timers.add(id); return id; };
  const cancelTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  /** Screen animations run on their own clock and stop when the screen changes. */
  let anim = 0;
  const wait = async (ms, token) => { await sleep(ms); return !closed && token === anim; };

  const tier = () => (['countdown', 'playing', 'roundResult'].includes(g.phase) ? RK.tierFor(g.round) : RK.rank(account.stats.rating));
  const iWon = () => !g.forfeited && g.my > g.their;
  const drawn = () => !g.forfeited && g.my === g.their;
  const outcome = () => (g.forfeited ? 0 : g.my > g.their ? 1 : g.my === g.their ? 0.5 : 0);
  const inMatch = () => g.phase === 'playing' || g.phase === 'roundResult' || (g.phase === 'countdown' && g.round > 0);
  const pickedRight = () => g.myPick != null && g.myPick === g.cur?.id;
  const myName = () => (account.name || '').trim() || 'You';

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
    Object.assign(g, { myRating: account.stats.rating, before: account.stats.rating, my: 0, their: 0, round: 0, forfeited: false, myCorrect: 0, perfect: false, history: [], frozen: false });
    g.opp = { rating: RK.opponentRating(g.myRating), name: RK.names[randInt(0, RK.names.length - 1)], hue: randInt(1, 6) };
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
      const t = RK.tierFor(r);
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
    g.choices = picked.map((s, r) => deal(s, RK.tierFor(r), pool).map(toChoice));
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
      if (g.round === 0) markPending();
      g.startedAt = performance.now();
      setPhase('playing');
      if (plan.correct) later(plan.at * 1000, () => {
        if (g.phase !== 'playing' || g.theyAns) return;
        g.theyAns = true;
        const pts = RK.points(plan.at, RK.tierFor(g.round));
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
      const pts = RK.points((performance.now() - g.startedAt) / 1000, RK.tierFor(g.round), 0);
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
  let reelStartedAt = null, wentAwayAt = 0, lastSecs = -1;
  let search = { started: 0, roll: 0, secs: -1 };

  function setPhase(p, n = 0) {
    const same = g.phase === p;
    g.phase = p; g.n = n;
    if (same && p === 'countdown') return updateCountdown();
    anim++;
    const t = tier();
    view.style.setProperty('--rk-accent', TIER_COLOR[t]);
    view.style.setProperty('--rk-ink', TIER_INK[t]);
    view.classList.toggle('glow', glowOn());
    lit(p === 'searching' || p === 'found');
    screen.className = 'screen rk-screen rk-' + p;
    switch (p) {
      case 'idle': screen.innerHTML = entryHTML(); break;
      case 'searching': search = { started: performance.now(), roll: 0, secs: -1 }; screen.innerHTML = matchHTML(); break;
      case 'found': screen.innerHTML = matchHTML(); runCard(); break;
      case 'countdown': screen.innerHTML = countdownHTML(); updateCountdown(); break;
      case 'playing': lastSecs = -1; screen.innerHTML = playingHTML(); startClip(); break;
      case 'roundResult': player.stop(); sound.reveal(); screen.innerHTML = resultHTML(); runHold(); reelStartedAt = null; break;
      case 'finished': player.stop(); screen.innerHTML = finishedHTML(); runEnd(); break;
      case 'error': screen.innerHTML = errorHTML(); break;
    }
    view.scrollTop = 0;
  }

  const bar = (title = 'Ranked') => `<div class="rk-bar"><h1>${esc(title)}</h1><button class="xbtn rk-x" data-press data-act="quit" aria-label="Close">${I.x}</button></div>`;

  /** Your own face inside a ring that fills as your rank does. The ring's colour is the rank. */
  function badge(rating, size) {
    const t = RK.rank(rating), ring = Math.max(3, size * 0.055), r = size / 2, frac = Math.max(0.03, RK.progress(rating).fraction);
    const inner = size - ring * 3.2;
    return `<div class="rk-badge" style="width:${size}px;height:${size}px;--glow:${alpha(TIER_COLOR[t], 0.35)}">
      <svg viewBox="0 0 ${size} ${size}" overflow="visible" aria-hidden="true"><circle cx="${r}" cy="${r}" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="${ring}"/>
      <circle cx="${r}" cy="${r}" r="${r}" fill="none" stroke="${TIER_COLOR[t]}" stroke-width="${ring}" stroke-linecap="round" pathLength="1" stroke-dasharray="${frac} 1" transform="rotate(-90 ${r} ${r})"/></svg>
      ${face(account.initial || '?', account.avatar, alpha(TIER_COLOR[t], 0.9), Math.round(inner), PILL_INK)}</div>`;
  }
  /** Recent form: the last five, oldest first. A tick, a cross, a dash where there is no game yet. */
  function formRow(form) {
    const last = (form || []).slice(-5), padded = Array(Math.max(0, 5 - last.length)).fill(-1).concat(last);
    const m = r => (r === 1 ? [MARK.check, TIER_COLOR.easy] : r === 0 ? [MARK.x, TIER_COLOR.expert] : r === 2 ? [MARK.minus, MUTED] : [MARK.minus, DIM]);
    return `<div class="rk-form">${padded.map(r => { const [icon, c] = m(r); return `<span style="color:${c};background:${alpha(c, r < 0 ? 0.08 : 0.18)}">${icon}</span>`; }).join('')}</div>`;
  }

  // entry
  function entryHTML() {
    const s = account.stats, p = RK.progress(s.rating);
    return `${bar()}<div class="rk-fill"></div>
      <div class="rk-entry">
        ${badge(s.rating, 128)}
        <div class="rk-rankname">${RK.rankName(s.rating)}</div>
        <div class="rk-rating">${s.rating}</div>
        <div class="rk-progress"><div class="rk-track"><i style="width:max(4px, ${p.fraction * 100}%)"></i></div>
          <div class="rk-to">${p.next ? `${p.next - s.rating} to ${RK.rankName(p.next)}` : 'Top rank'}</div></div>
        <div class="rk-season">${RK.seasonCountdown()}</div>
        <div class="rk-record">${[['Played', s.rankedPlayed], ['Won', s.rankedWon], ['Points', s.rankedPoints]].map(([l, v]) => `<div><b>${v || 0}</b><span>${l}</span></div>`).join('')}</div>
        ${formRow(s.recentRanked)}
      </div>
      <div class="rk-fill"></div>
      <button class="rk-btn2 rk-lb" data-press data-act="board">${LIST}<span>Leaderboard</span></button>
      <button class="rk-go" data-press data-act="find">Find a match</button>`;
  }

  // matchmaking and the fight card: one screen, you on the left from the first frame
  function lit(on) {
    const l = view.querySelector('.rk-lit');
    l.classList.toggle('on', on);
    if (!on) return;
    const found = g.phase === 'found';
    const theirs = found ? hueColor(g.opp.hue) : hueColor(search.roll % 7);
    l.style.setProperty('--mine', alpha(hueColor(0), 0.2));
    l.style.setProperty('--theirs', alpha(theirs, found ? 0.22 : 0.07));
  }
  function fighter({ name, rating, avatar, hue, form, me }) {
    const c = hueColor(hue), rk = RK.rank(rating);
    return `<div class="rk-fighter ${me ? 'me' : 'them'}" style="--c:${c};--glow:${alpha(c, 0.45)}">
      <div class="rk-fface">${face(name, avatar, alpha(c, 0.9), 96, PILL_INK)}</div>
      <div class="rk-fname">${esc(name)}</div>
      <div class="rk-pill" style="background:${PILL_FILL[rk]}">${RK.rankName(rating).toUpperCase()}</div>
      <div class="rk-frating">${rating}</div>
      <div class="rk-fform">${formRow(form)}</div>
    </div>`;
  }
  function mysteryHTML() {
    const i = Math.max(0, search.roll), c = hueColor(i % 7), name = RK.names[i % RK.names.length];
    return `<div class="rk-fighter mystery" style="--c18:${alpha(c, 0.18)};--c50:${alpha(c, 0.5)};--c80:${alpha(c, 0.8)}">
      <div class="rk-fface"><span class="rk-myst">${esc(name[0])}</span><i class="rk-dash" style="transform:rotate(${i * 9}deg)"></i></div>
      <div class="rk-fname">${esc(name)}</div>
      <div class="rk-pill q">? ? ?</div>
      <div class="rk-frating">${g.myRating - 60 + (i * 37) % 120}</div>
    </div>`;
  }
  const searchLabel = () => (g.phase === 'found' ? 'MATCH FOUND' : g.preparing ? 'GETTING THE SONGS READY' : 'FINDING AN OPPONENT');
  function updateSearchLabel() { const l = screen.querySelector('.rk-mlabel'); if (l) l.textContent = searchLabel(); }
  function matchHTML() {
    const found = g.phase === 'found';
    return `${bar()}<div class="rk-fill"></div>
      <div class="rk-match ${found ? 'found' : 'searching'}" data-step="0">
        <div class="rk-mlabel">${searchLabel()}</div>
        <div class="rk-versus">
          ${fighter({ name: myName(), rating: g.myRating, avatar: account.avatar, hue: 0, form: account.stats.recentRanked, me: true })}
          ${found ? fighter({ name: g.opp.name, rating: g.opp.rating, avatar: null, hue: g.opp.hue, form: g.opp.form }) : mysteryHTML()}
          <div class="rk-vs">VS</div>
        </div>
        <div class="rk-terms-slot">${found
          ? `<div class="rk-terms"><div><b>${RK.rounds}</b><span>rounds</span></div><i></i><div><b>4</b><span>answers</span></div><i></i><div><b>${RK.window}s</b><span>a song</span></div></div>`
          : '<div class="rk-clock">0:00</div>'}</div>
      </div>
      <div class="rk-fill"></div>
      ${found ? '<div class="rk-coming">First song coming up</div>' : '<button class="rk-btn2 rk-cancel" data-press data-act="cancel">Cancel</button>'}`;
  }
  function tickSearch(now) {
    const roll = Math.max(0, Math.floor((now - search.started) / 100));
    if (roll !== search.roll) {
      search.roll = roll;
      const seat = screen.querySelector('.rk-fighter.mystery');
      if (seat) seat.outerHTML = mysteryHTML();
      lit(true);
    }
    const secs = Math.max(0, Math.floor((now - search.started) / 1000));
    if (secs !== search.secs) { search.secs = secs; const c = screen.querySelector('.rk-clock'); if (c) c.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`; }
  }
  async function runCard() {
    const token = anim, m = screen.querySelector('.rk-match');
    Haptics.press(0.9);
    await sleep(30); if (token !== anim) return;
    m.dataset.step = '1';
    if (!(await wait(420, token))) return;
    Haptics.success(); sound.reveal();
    m.dataset.step = '2';
    if (!(await wait(380, token))) return;
    m.dataset.step = '3';
  }

  // the round
  function roundBar() {
    const t = RK.tierFor(g.round);
    const era = g.phase === 'playing' && g.era !== 'all' ? `<span class="rk-era">${esc(g.era)}</span>` : '';
    return `<div class="rk-roundbar"><div class="rk-rno"><span>ROUND</span><div><b>${g.round + 1}</b><em>/ ${RK.rounds}</em></div></div>
      <div class="rk-fill"></div>${era}<span class="rk-tier" style="background:${PILL_FILL[t]}">${cap(t)}</span>
      <button class="rk-rx" data-press data-act="roundx" aria-label="Leave the match">${I.x}</button></div>`;
  }
  function countdownHTML() {
    return `${roundBar()}<div class="rk-fill"></div>
      <div class="rk-count"><div class="rk-ready">${g.round === 0 ? 'GET READY' : 'NEXT UP'}</div>
        <div class="rk-num-slot"></div>
        <div class="rk-listen">${cap(RK.tierFor(g.round))} · listen, then pick it</div>
        <div class="rk-reel" aria-label="Finding the decade"><i class="rk-caret">${I.caretDown}</i><div class="rk-reel-mask"><div class="rk-reel-in"></div></div></div></div>
      <div class="rk-fill"></div>`;
  }
  function updateCountdown() {
    const slot = screen.querySelector('.rk-num-slot'); if (!slot) return;
    slot.innerHTML = `<div class="rk-num${g.n > 0 ? '' : ' go'}">${g.n > 0 ? g.n : 'GO'}</div>`;
    if (g.n > 0) sound.tick();
  }
  /** Nine slots around the moving position, shifted by the fraction so the labels glide. */
  function drawReel(now) {
    const host = screen.querySelector('.rk-reel-in'); if (!host) return;
    const n = SLOTS.length, target = Math.max(0, SLOTS.indexOf(g.era));
    const from = (target + 1 + (Math.abs(g.round) % (n - 1))) % n;
    const steps = n * 2 + ((target - from + n) % n);
    const t = reelStartedAt == null ? 99 : (now - reelStartedAt) / 1000;
    const pos = reelPosition(t, steps), base = Math.floor(pos), frac = pos - base;
    let html = '';
    for (let o = -4; o <= 4; o++) {
      const i = (((from + base + o) % n) + n) % n, d = Math.min(1, Math.abs(o - frac));
      html += `<span style="color:rgba(255,255,255,${(0.22 + 0.5 * (1 - d)).toFixed(3)})">${SLOTS[i]}</span>`;
    }
    host.innerHTML = html;
    host.style.transform = `translateX(${(-frac * SLOT_W - 4 * SLOT_W + (REEL_W - SLOT_W) / 2).toFixed(2)}px)`;
    host.style.filter = `blur(${reelBlur(t, steps).toFixed(2)}px)`;
  }

  function sideScore({ name, score, answered, colour, leading, missed }) {
    const mark = answered ? `<i class="rk-ok" style="color:${missed ? TIER_COLOR.expert : colour}">${missed ? I.xCircle : I.checkCircle}</i>` : '';
    return `<div class="rk-side ${leading ? 'lead' : 'trail'}" style="background:${alpha(colour, answered ? 0.14 : 0.06)}">
      <div class="rk-sname">${leading ? mark : ''}<span>${esc(name)}</span>${leading ? '' : mark}</div><b>${score}</b></div>`;
  }
  /** Both scores, side by side, so the race is always on screen. */
  const scoreLine = () => `<div class="rk-scores">${sideScore({ name: myName(), score: g.my, answered: g.iAns, colour: TIER_COLOR[tier()], leading: true, missed: g.myPick != null && !pickedRight() })}${sideScore({ name: g.opp.name, score: g.their, answered: g.theyAns, colour: hueColor(g.opp.hue), leading: false })}</div>`;
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
      <div class="rk-choices"><div class="rk-status">${statusHTML()}</div><div class="rk-grid">${boardHTML()}</div></div></div>`;
  }
  function updatePlaying() {
    if (g.phase !== 'playing') return;
    const sc = screen.querySelector('.rk-scores'); if (sc) sc.outerHTML = scoreLine();
    const st = screen.querySelector('.rk-status'); if (st) st.innerHTML = statusHTML();
    const gr = screen.querySelector('.rk-grid'); if (gr) gr.innerHTML = boardHTML();
  }
  function tickPlaying(now) {
    const ring = screen.querySelector('.rk-ring'); if (!ring) return;
    const elapsed = (now - g.startedAt) / 1000, progress = Math.min(1, elapsed / RK.window);
    ring.querySelector('.arc').setAttribute('stroke-dasharray', `${Math.max(0, 1 - progress).toFixed(4)} 1`);
    const left = Math.max(0, Math.ceil(RK.window - elapsed - 1e-9));
    if (left !== lastSecs) { lastSecs = left; ring.querySelector('.rk-secs').textContent = left; }
    const st = clip.error ? ['no sound — tap for why', 'bad'] : clip.muted ? ['no sound this round', 'bad'] : player.playing ? ['listening', 'on'] : ['tap to replay', ''];
    ring.classList.toggle('playing', player.playing);
    const s = ring.querySelector('.rk-state');
    if (s.textContent !== st[0]) { s.textContent = st[0]; s.className = 'rk-state ' + st[1]; }
    const why = ring.querySelector('.rk-why'), w = clip.error || '';
    if (why.textContent !== w) why.textContent = w;
  }
  function shake() { const p = screen.querySelector('.rk-play'); if (!p) return; p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); }

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

  // between rounds
  function gained(name, points, colour, wrong = false) {
    const v = wrong ? 'Wrong' : points != null ? `+${points}` : '—';
    const c = wrong ? TIER_COLOR.expert : points == null ? DIM : colour;
    return `<div class="rk-gain" style="background:${alpha(points == null ? MUTED : colour, 0.10)}"><span>${esc(name)}</span><b style="color:${c}">${v}</b></div>`;
  }
  function resultHTML() {
    const a = g.last || {}, acc = TIER_COLOR[tier()];
    const cover = artOn() && a.artwork ? `<div class="rk-hero-art">${glowOn() ? `<img class="bloom" src="${esc(a.artwork)}" alt="">` : ''}<img class="cov" src="${esc(a.artwork)}" alt=""></div>` : '';
    return `${roundBar()}
      <div class="rk-hero">${cover}<div class="rk-hero-t"><span>IT WAS_</span><b>${esc(a.title || '')}</b><em>${esc(a.artist || '')}</em></div></div>
      <div class="rk-gains">${gained(myName(), g.myPts, acc, g.myPick != null && !pickedRight())}${gained(g.opp.name, g.theirPts, hueColor(g.opp.hue))}</div>
      ${scoreLine()}<div class="rk-fill"></div>
      <div class="rk-hold"><div class="rk-hold-t"></div><div class="rk-track h6"><i></i></div></div>`;
  }
  async function runHold() {
    const token = anim, total = RK.resultHold;
    const t = screen.querySelector('.rk-hold-t'), fill = screen.querySelector('.rk-hold i');
    const label = n => (g.round + 1 >= RK.rounds ? `Full time in ${n}` : `Next round in ${n}`);
    t.textContent = label(total);
    if (g.frozen) { fill.style.width = '55%'; return; }
    fill.style.width = '100%';
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.transition = `width ${total}s linear`; fill.style.width = '0%'; }));
    for (let i = 1; i < total; i++) { if (!(await wait(1000, token))) return; t.textContent = label(total - i); }
  }

  // the end
  const myColour = hueColor(0);
  function resultFace(side) {
    const mine = side === 'me';
    const name = mine ? myName() : g.opp.name, initial = mine ? (account.initial || 'Y') : g.opp.name[0].toUpperCase();
    const c = mine ? myColour : hueColor(g.opp.hue);
    return `<div class="rk-rface ${side}" style="--c:${c};--glow:${alpha(c, 0.5)}">
      <div class="rk-rpic"><i class="rk-crown">${I.crown}</i>${face(initial, mine ? account.avatar : null, alpha(c, 0.9), 78, PILL_INK)}</div>
      <div class="rk-rname">${esc(name)}</div><b class="rk-rscore">0</b></div>`;
  }
  function pointsCell(pts, took, wrong, colour) {
    const inner = wrong ? `<i class="x">${MARK.x}</i>` : pts != null ? `<b>${pts}</b>` : '<em>—</em>';
    return `<span class="rk-cell"><span class="${took ? 'took' : ''}" style="${took ? `background:${colour}` : ''}">${inner}</span></span>`;
  }
  function roundRow(r) {
    const mine = r.mine || 0, theirs = r.theirs || 0;
    const artwork = r.artwork || (() => { const s = pool.songs.find(x => x.title === r.title && x.artist === r.artist); return s?.artwork ? art(s.artwork, 120) : null; })();
    return `<div class="rk-rrow"><span class="rk-rart">${artwork ? `<img src="${esc(artwork)}" alt="">` : ''}</span>
      <span class="rk-rt"><b>${esc(r.title)}</b><em>${esc(r.artist)}</em></span>
      ${pointsCell(r.mine, mine > theirs, r.myWrong, myColour)}${pointsCell(r.theirs, theirs > mine, false, hueColor(g.opp.hue))}</div>`;
  }
  function finishedHTML() {
    const won = iWon(), drew = drawn();
    const colour = won ? TIER_COLOR.easy : drew ? MUTED : TIER_COLOR.expert;
    const sub = won ? `${g.opp.name} couldn't keep up` : drew ? 'Dead level after five' : `${g.opp.name} took it this time`;
    return `<i class="rk-bloom" style="background:${alpha(colour, won ? 0.3 : 0.12)}"></i>${bar()}
      <div class="rk-endscroll"><div class="rk-end" data-step="0">
        <div class="rk-verdict ${won ? 'won' : ''}" style="--c:${colour};--glow:${alpha(colour, 0.45)}">
          <div class="rk-ft">FULL TIME</div>
          <div class="rk-vd"><b>${drew ? 'Draw' : won ? 'Victory' : 'Defeat'}</b><span>${esc(sub)}</span></div>
        </div>
        <div class="rk-faceoff">${resultFace('me')}<span class="rk-sep">–</span>${resultFace('them')}</div>
        <div class="rk-rounds rk-card">
          <div class="rk-rhead"><span>ROUND BY ROUND</span><div class="rk-fill"></div>
            <span class="rk-mini">${face(account.initial || 'Y', account.avatar, alpha(myColour, 0.9), 22, PILL_INK)}</span>
            <span class="rk-mini">${face(g.opp.name, null, alpha(hueColor(g.opp.hue), 0.9), 22, PILL_INK)}</span></div>
          ${g.history.map(r => `<div class="rk-rline"><i class="rk-div"></i>${roundRow(r)}</div>`).join('')}
        </div>
        <div class="rk-ratingcard rk-card"></div>
      </div></div>
      <div class="rk-endbtns"><button class="rk-go green" data-press data-act="again">Play again</button>
        <div class="rk-row2"><button class="rk-btn2" data-press data-act="board">${LIST}<span>Leaderboard</span></button><button class="rk-btn2 muted" data-press data-act="quit">Leave</button></div></div>`;
  }
  /** Where the rating landed, on one line so it does not compete with the points above it. */
  function ratingCard(shown, points) {
    const delta = g.after - g.before;
    const promoted = RK.rank(g.after) !== RK.rank(g.before);
    const t = RK.rank(shown), p = RK.progress(shown);
    const line = promoted ? (g.after > g.before ? `Promoted to ${RK.rankName(g.after)}` : `Down to ${RK.rankName(g.after)}`) : (p.next ? `${p.next - shown} to ${RK.rankName(p.next)}` : 'Top rank');
    return `<div class="rk-rtop"><b style="color:${TIER_COLOR[t]}">${RK.rankName(shown)}</b><span>${shown}</span><div class="rk-fill"></div><strong class="rk-delta" style="color:${delta >= 0 ? TIER_COLOR.easy : TIER_COLOR.expert}">${delta >= 0 ? '+' + delta : delta}</strong></div>
      <div class="rk-track"><i style="width:max(5px, ${p.fraction * 100}%);background:${TIER_COLOR[t]}"></i></div>
      <div class="rk-banked">+${points} ranked points</div>
      <div class="rk-promo${promoted ? ' up' : ''}" style="${promoted ? `color:${TIER_COLOR[RK.rank(g.after)]}` : ''}">${line}</div>`;
  }
  /** Bank the result once, then let the screen tell it a beat at a time. */
  async function runEnd() {
    const token = anim;
    const earned = RK.boardPoints(g.my, outcome());
    if (!g.frozen) {
      account.recordRanked(outcome(), g.opp.rating, g.my);
      clearPending();
      post(earned);
      const t = RK.rank(account.stats.rating);
      view.style.setProperty('--rk-accent', TIER_COLOR[t]); view.style.setProperty('--rk-ink', TIER_INK[t]);
    }
    const end = screen.querySelector('.rk-end'), rc = screen.querySelector('.rk-ratingcard');
    const [me, them] = screen.querySelectorAll('.rk-rscore');
    rc.innerHTML = ratingCard(g.before, 0);
    if (!(await wait(450, token))) return;
    // Full time: both scores count up together, ticking as they go.
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const e = 1 - Math.pow(1 - i / steps, 2.2);
      me.textContent = Math.round(g.my * e); them.textContent = Math.round(g.their * e);
      if (i % 4 === 0) { sound.tick(); Haptics.press(0.35); }
      if (!(await wait(55, token))) return;
    }
    me.textContent = g.my; them.textContent = g.their;
    if (!(await wait(250, token))) return;
    // The verdict.
    const won = iWon(), theyWon = !won && !drawn();
    end.dataset.step = '1';
    screen.querySelector('.rk-bloom').classList.add('on');
    screen.querySelector('.rk-rface.me').classList.add(won ? 'winner' : theyWon ? 'loser' : 'even');
    screen.querySelector('.rk-rface.them').classList.add(theyWon ? 'winner' : won ? 'loser' : 'even');
    Haptics.success(); sound.reveal();
    if (won) confetti(innerWidth / 2, innerHeight * 0.30, [TIER_COLOR.easy, '#ffffff', view.style.getPropertyValue('--rk-accent') || TIER_COLOR.easy], 150);
    // The match, round by round.
    if (!(await wait(700, token))) return;
    end.dataset.step = '2';
    const rows = screen.querySelectorAll('.rk-rline');
    for (let i = 0; i < Math.max(1, rows.length); i++) { if (!(await wait(110, token))) return; rows[i]?.classList.add('in'); Haptics.select(); }
    // Where it leaves you.
    if (!(await wait(350, token))) return;
    end.dataset.step = '3';
    screen.querySelector('.rk-endbtns').classList.add('in');
    const t0 = performance.now();
    const roll = now => {
      if (token !== anim || closed) return;
      const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 2);
      rc.innerHTML = ratingCard(Math.round(g.before + (g.after - g.before) * e), Math.round(earned * e));
      if (k < 1) requestAnimationFrame(roll);
    };
    requestAnimationFrame(roll);
    Haptics.select();
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
    const rt = RK.rank(account.stats.rating);
    const sh = openSheet(`<div class="rk-lbv" style="--rk-accent:${TIER_COLOR[rt]};--rk-ink:${TIER_INK[rt]}">
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
      case 'find': case 'again': sound.click(); player.ensure(); start(); break;
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
    if (g.phase === 'searching' && !g.frozen) tickSearch(now);
    else if (g.phase === 'countdown') drawReel(now);
    else if (g.phase === 'playing' && !g.frozen) tickPlaying(now);
  };
  raf = requestAnimationFrame(loop);

  account.rolloverSeasonIfNeeded();
  settlePending();
  pushView(view);
  setPhase('idle');
  if (demo) runDemo(demo);

  // ---------- localhost-only test knob: ?rankedDemo=search|versus|countdown|round|result|final|board ----------
  function demoQueue() {
    const picked = [];
    for (let r = 0; r < RK.rounds; r++) { let s; for (let i = 0; i < 40; i++) { s = pool.pick(RK.tierFor(r), 'all', 'all'); if (s?.preview && s.artwork) break; } picked.push(s); }
    g.queue = picked; g.choices = picked.map((s, r) => deal(s, RK.tierFor(r), pool).map(toChoice));
  }
  function runDemo(kind) {
    g.frozen = true; g.token++;
    Object.assign(g, { myRating: account.stats.rating, before: account.stats.rating });
    g.opp = { name: 'Mia', rating: RK.opponentRating(g.myRating), hue: 3, form: [1, 1, 0, 1, 1] };
    if (kind === 'search') { setPhase('searching'); return; }
    if (kind === 'versus') { setPhase('found'); return; }
    if (kind === 'board') { openBoard(); return; }
    demoQueue();
    if (kind === 'countdown') {
      g.round = 1; const s = g.queue[1]; g.cur = s; g.era = eraOf(s.year); reelStartedAt = performance.now() - 1200; setPhase('countdown', 2); return;
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
    if (kind === 'final') {
      g.my = 3840; g.their = 2960;
      const pts = [[912, 780, false], [null, 840, true], [1046, null, false], [902, 1340, false], [980, null, false]];
      g.history = g.queue.map((s, i) => ({ id: i, title: s.title, artist: s.artist, artwork: s.artwork ? art(s.artwork, 120) : null, mine: pts[i][0], theirs: pts[i][1], myWrong: pts[i][2] }));
      g.round = RK.rounds; g.after = Elo.newRating(g.before, g.opp.rating, 1);
      setPhase('finished');
    }
  }
  return { close };
}
