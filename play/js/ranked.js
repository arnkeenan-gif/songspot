// Ranked on the web: one song, two people, the faster right answer takes
// it. Five rounds up the tiers, a rating that moves, a badge that wears the
// tier colours — the same screens and numbers as the iPhone and Android.
// Until live matchmaking lands the opponent is a stand-in: rated near you,
// answering on its own clock, right about as often as that rating says.
import { TIERS, ERAS } from './pool.js';
import { matches } from './matcher.js';
import { Ranked } from './account.js';
import { ranked as boards } from './supabase.js';
import { el, toast, pushView, popView, face, hueColor, TIER_COLOR, TIER_INK, cap, esc, art, settings } from './ui.js';

if (!document.querySelector('link[href="/play/css/ranked.css"]')) document.head.append(el('<link rel="stylesheet" href="/play/css/ranked.css">'));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
/** Ink that reads on a palette colour: the tier's own ink, dark on anything else. */
const inkOn = c => { const t = Object.keys(TIER_COLOR).find(k => TIER_COLOR[k] === c); return t ? TIER_INK[t] : '#04120a'; };
const NAMES = ['Mia', 'Noah', 'Liv', 'Theo', 'Sofia', 'Eli', 'Aya', 'Max', 'Ida', 'Otto', 'Nora', 'Felix', 'Luca', 'Ruby', 'Ivan', 'Alma'];
const MEDAL = ['#ffd60a', '#c9ced6', '#d4915a'];
const RING_C = 2 * Math.PI * 98;             // the 196 timer ring, stroke centred on its edge

const X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const CROWN = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>';
const LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.5M4 12h.5M4 18h.5" stroke-width="2.6"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

/** The rules. Same numbers as the apps' Ladder. */
export const Ladder = {
  rounds: 5, window: 15, resultHold: 5, closeAt: 15.4, perfect: 500,
  base: { easy: 500, medium: 600, hard: 700, expert: 850, impossible: 1000 },
  floors: { easy: 900, medium: 1100, hard: 1300, expert: 1500, impossible: 1700 },
  tier(round) { return TIERS[Math.min(Math.floor(round * 5 / this.rounds), 4)]; },
  rankName(rating) { return cap(Ranked.rank(rating)); },
  /** Where a rating sits in its rank: the next threshold (null at the top) and how far along it is. */
  progress(rating) {
    const t = Ranked.rank(rating), i = TIERS.indexOf(t);
    if (i === TIERS.length - 1) return { next: null, fraction: 1 };
    const lo = this.floors[t], hi = this.floors[TIERS[i + 1]];
    return { next: hi, fraction: clamp((rating - lo) / (hi - lo), 0, 1) };
  },
  /** A round's worth: the tier's base, scaled by how fast, docked 10% a wrong guess (floor 50%). */
  points(tier, elapsed, wrong) {
    const t = clamp(elapsed, 0, this.window);
    const speed = t <= 1 ? 1.25 : 1 - 0.6 * Math.pow((t - 1) / (this.window - 1), 0.8);
    return Math.round(this.base[tier] * speed * Math.max(0.5, 1 - 0.1 * wrong));
  },
  /** Seasons are ISO weeks (account.js), so the next one starts Monday, local time. */
  seasonCountdown() {
    const now = new Date(), monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((8 - now.getDay()) % 7 || 7));
    const days = Math.ceil((monday - now) / 864e5);
    return days <= 1 ? 'Resets tonight' : `Resets in ${days} days`;
  },
};

/** The stand-in opponent: a rating near yours, a name, a colour, a form line, and an answer clock that goes with the rating. */
function standIn(mine) {
  const rating = Math.max(600, mine + Math.round(rnd(-80, 80)));
  const winChance = clamp(0.5 + (rating - 1000) / 900, 0.28, 0.78);
  return {
    name: NAMES[Math.floor(Math.random() * NAMES.length)], hue: 1 + Math.floor(Math.random() * 6), rating,
    form: Array.from({ length: 5 }, () => (Math.random() < winChance ? 1 : 0)),
    /** Seconds into the round when the answer comes — or null: not this one. */
    answerAt() {
      if (Math.random() >= Math.min(0.9, 0.3 + (rating - 600) / 1400)) return null;
      const skill = clamp((rating - 600) / 1000, 0, 1);
      return Math.max(1.2, rnd(Ladder.window * (0.55 - 0.40 * skill), Ladder.window * (0.98 - 0.35 * skill)));
    },
  };
}

/** One match: five songs drawn up front (no repeats, all with a preview), the scores, and what it did to the rating. */
class Match {
  constructor(pool, myRating) {
    const avoid = new Set(); this.rounds = [];
    for (let r = 0; r < Ladder.rounds; r++) {
      const tier = Ladder.tier(r); let song = null;
      for (let i = 0; i < 30 && !song?.preview; i++) { song = pool.pick(tier, 'all', 'all', null, avoid); if (song) avoid.add(song.id); }
      if (!song?.preview) throw new Error(`Not enough ${tier} songs with a preview.`);
      this.rounds.push({ tier, song, myPoints: null, theirPoints: null, theirAt: null, wrong: 0, startedAt: 0, closeAt: null, muted: false, error: null });
    }
    this.round = 0; this.myRating = myRating; this.opponent = standIn(myRating);
    this.myScore = 0; this.theirScore = 0; this.forfeited = false; this.done = false;
    this.ratingBefore = myRating; this.ratingAfter = myRating; this.earned = 0;
  }
  get current() { return this.rounds[this.round]; }
  get tier() { return this.current.tier; }
  get last() { return this.round + 1 >= Ladder.rounds; }
  get iWon() { return !this.forfeited && this.myScore > this.theirScore; }
  get drawn() { return !this.forfeited && this.myScore === this.theirScore; }
  get outcome() { return this.iWon ? 1 : this.drawn ? 0.5 : 0; }
  named(side) { return this.rounds.filter(r => r[side] != null).length; }
}

/** Open Ranked over the stage. Returns the view; its X pops it and stops the audio. */
export function mountRanked(ctx) { return new RankedUi(ctx).view; }

class RankedUi {
  constructor(ctx) {
    this.ctx = ctx; this.pool = ctx.pool; this.player = ctx.player; this.sound = ctx.sound; this.account = ctx.account;
    this.say = ctx.toast || toast;
    this.glow = settings.get('glow', true); this.artwork = settings.get('artwork', true);
    this.timers = new Set(); this.raf = 0; this.confettiRaf = 0; this.match = null; this.phase = 'entry';
    this.prevEnded = this.player.onEnded;
    this.view = el('<div class="view rk"><div class="rk-stage"></div><canvas class="rk-confetti" hidden></canvas></div>');
    this.stage = this.view.querySelector('.rk-stage');
    // The apps' Shazam guard, in short: a round left in the background gets no sound.
    this.onVisibility = () => { const cur = this.match?.current; if (document.hidden && this.phase === 'playing' && cur) { this.player.stop(); cur.muted = true; this.paintEq(); } };
    document.addEventListener('visibilitychange', this.onVisibility);
    pushView(this.view);
    if (this.account.rolloverSeasonIfNeeded()) this.say('New season — everyone starts at Easy again.');
    this.go('entry');
  }
  get myName() { return this.account.name || 'You'; }
  get tier() { return this.match && ['countdown', 'playing', 'result'].includes(this.phase) ? this.match.tier : Ranked.rank(this.account.stats.rating); }
  get accent() { return TIER_COLOR[this.tier]; }
  /** Once the first clip has played the X costs the match. Before it, a free exit. */
  get inMatch() { return !!this.match && !this.match.done && (this.phase === 'playing' || this.phase === 'result' || (this.phase === 'countdown' && this.match.round > 0)); }

  after(ms, fn) { const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms); this.timers.add(id); return id; }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers.clear(); cancelAnimationFrame(this.raf); this.raf = 0; }
  /** Ease-out over ms, on the timer set so it dies with the phase. */
  tween(ms, fn) { const t0 = performance.now(); const step = () => { const p = Math.min(1, (performance.now() - t0) / ms); fn(1 - Math.pow(1 - p, 3)); if (p < 1) this.after(16, step); }; step(); }

  /** Swap the screen. Each phase has a render (the DOM) and an enter (the clocks). */
  go(phase) {
    this.clearTimers(); this.phase = phase;
    this.view.style.setProperty('--accent', this.accent); this.view.style.setProperty('--accent-ink', TIER_INK[this.tier]);
    const node = this['render' + cap(phase)](); node.classList.add('rk-phase', 'column');
    this.stage.replaceChildren(node);
    this['enter' + cap(phase)]?.();
  }
  quit() {
    this.clearTimers(); cancelAnimationFrame(this.confettiRaf);
    this.player.stop(); this.player.onEnded = this.prevEnded;
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.match) this.match.done = true;
    popView(this.view);
  }
  close() { if (this.inMatch) this.askForfeit(); else this.quit(); }

  // ---------- shared pieces ----------
  bar(title) {
    const b = el(`<div class="bar"><h1>${title}</h1><button class="close" aria-label="Close">${X}</button></div>`);
    b.querySelector('.close').onclick = () => { this.sound.click(); this.close(); };
    return b;
  }
  formRow(form = []) { return `<div class="rk-form">${Array.from({ length: 5 }, (_, i) => `<i class="${form[i] == null ? '' : form[i] === 1 ? 'w' : form[i] === 0 ? 'l' : 'd'}"></i>`).join('')}</div>`; }
  record(label, v) { return `<div class="rk-record"><b class="mono">${v}</b><span>${label.toUpperCase()}</span></div>`; }
  /** Your own face inside a ring that fills as your rank does: the picture is the badge, the ring colour is the rank. */
  badge(rating, size) {
    const t = Ranked.rank(rating), c = TIER_COLOR[t], w = Math.max(3, Math.round(size * 0.055)), f = Ladder.progress(rating).fraction;
    const r = (size - w) / 2, C = 2 * Math.PI * r, h = size / 2;
    return `<div class="rk-badge ${this.glow ? 'glow' : ''}" style="--c:${c};width:${size}px;height:${size}px">
      <svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${h}" cy="${h}" r="${r}" stroke="var(--track)" stroke-width="${w}" fill="none"/><circle cx="${h}" cy="${h}" r="${r}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.max(0.03, f))}"/></svg>
      ${face(this.myName, this.account.avatar, c, Math.round(size - w * 3.2), TIER_INK[t])}</div>`;
  }
  pulse(c) { return `<div class="rk-pulse" style="--c:${c}"><i></i><i></i><i></i></div>`; }

  // ---------- entry ----------
  renderEntry() {
    const s = this.account.stats, rating = s.rating, c = TIER_COLOR[Ranked.rank(rating)], { next, fraction } = Ladder.progress(rating);
    const n = el(`<div class="rk-entry"><div class="rk-sp"></div>
      ${this.badge(rating, 150)}
      <div class="rk-rank">${Ladder.rankName(rating)}</div>
      <div class="rk-rating mono" style="color:${c}">${rating}</div>
      <div class="rk-progress"><div class="rk-line"><i style="width:${fraction * 100}%;background:${c}"></i></div><small>${next ? `${next - rating} to ${Ladder.rankName(next)}` : 'Top rank'}</small></div>
      <div class="rk-season">${Ladder.seasonCountdown()}</div>
      <div class="rk-records">${this.record('Played', s.rankedPlayed)}${this.record('Won', s.rankedWon)}${this.record('Points', s.rankedPoints)}</div>
      ${this.formRow(s.recentRanked)}
      <div class="rk-sp"></div>
      ${this.ctx.premium ? '' : `<button class="row-btn rk-lock" data-press><span>${LOCK}Ranked is part of Premium in the apps</span><b>Go premium</b></button>`}
      <button class="btn surface rk-board-btn" data-press>${LIST}Leaderboard</button>
      <button class="btn primary rk-find ${this.glow ? 'glow' : ''}" data-press>Find a match</button></div>`);
    n.prepend(this.bar('Ranked'));
    n.querySelector('.rk-board-btn').onclick = () => { this.sound.click(); this.openBoard(); };
    n.querySelector('.rk-find').onclick = () => this.findMatch();
    n.querySelector('.rk-lock')?.addEventListener('click', () => { this.sound.click(); this.ctx.openPremium?.(); });
    return n;
  }
  findMatch() {
    this.sound.click();
    try { this.match = new Match(this.pool, this.account.stats.rating); } catch (e) { this.say(e.message); return; }
    const first = this.match.rounds[0].song; this.player.prepare(first.id, first.preview).catch(() => {});
    this.go('searching');
  }

  // ---------- searching, and the fight card ----------
  renderSearching() {
    const n = el(`<div class="rk-searching"><div class="rk-sp"></div>${this.pulse(this.accent)}<p>Looking for an opponent…</p><div class="rk-sp"></div><button class="btn quiet rk-cancel" data-press>Cancel</button></div>`);
    n.prepend(this.bar('Ranked'));
    n.querySelector('.rk-cancel').onclick = () => { this.sound.click(); this.match = null; this.go('entry'); };
    return n;
  }
  enterSearching() { this.after(900, () => this.go('found')); }

  fighter(name, rating, avatar, c, form, side) {
    const t = Ranked.rank(rating);
    return `<div class="rk-fighter ${side}"><span class="rk-fface ${this.glow ? 'glow' : ''}" style="--c:${c}">${face(name, avatar, c, 86, inkOn(c))}</span><b>${esc(name)}</b><small style="color:${TIER_COLOR[t]}">${cap(t)} · ${rating}</small>${this.formRow(form)}</div>`;
  }
  /** The two faces come in from opposite edges and the VS lands between them, last and hardest. */
  renderFound() {
    const m = this.match, o = m.opponent;
    const n = el(`<div class="rk-found"><div class="rk-sp"></div>
      <div class="rk-matchfound" style="color:${this.accent}">MATCH FOUND</div>
      <div class="rk-card">${this.fighter(this.myName, m.myRating, this.account.avatar, this.accent, this.account.stats.recentRanked, 'left')}<div class="rk-vs"><span>VS</span></div>${this.fighter(o.name, o.rating, null, hueColor(o.hue), o.form, 'right')}</div>
      <div class="rk-sp"></div><p class="rk-coming">First song coming up</p></div>`);
    n.prepend(this.bar('Ranked'));
    return n;
  }
  enterFound() {
    const n = this.stage.firstElementChild;
    this.after(420, () => n.classList.add('s2'));
    this.after(800, () => n.classList.add('s3'));
    this.after(3200, () => this.go('countdown'));
  }

  // ---------- the round ----------
  roundBar() {
    const m = this.match, t = m.tier, era = m.current.song.era;
    const b = el(`<div class="rk-roundbar"><div class="rk-roundno"><span>ROUND</span><div><b class="mono">${m.round + 1}</b><small class="mono">/ ${Ladder.rounds}</small></div></div><div class="rk-sp"></div>
      ${this.phase !== 'countdown' && era ? `<span class="rk-pill era pop">${esc(era)}</span>` : ''}<span class="rk-pill" style="background:${TIER_COLOR[t]};color:${TIER_INK[t]}">${cap(t)}</span>
      <button class="close" aria-label="Close">${X}</button></div>`);
    b.querySelector('.close').onclick = () => { this.sound.click(); this.close(); };
    return b;
  }
  /** Both scores, side by side, so the race is always on screen. */
  scoreLine() {
    const m = this.match, o = m.opponent, cur = m.current;
    const side = (name, score, answered, c, cls) => `<div class="rk-side ${cls} ${answered ? 'in' : ''}" style="--c:${c}"><div class="rk-sidename"><i class="rk-check">${CHECK}</i><span>${esc(name)}</span></div><b class="mono">${score}</b></div>`;
    return `<div class="rk-scoreline">${side(this.myName, m.myScore, cur.myPoints != null, this.accent, 'me')}${side(o.name, m.theirScore, cur.theirPoints != null, hueColor(o.hue), 'them')}</div>`;
  }
  paintScores() { const n = this.stage.querySelector('.rk-scoreline'); if (n) n.replaceWith(el(this.scoreLine())); }
  /** The era reel: four turns of the decades, landing on this song's own as the count says GO. */
  reel(era) {
    const cycles = 4, idx = (cycles - 1) * ERAS.length + Math.max(0, ERAS.indexOf(era));
    const items = Array.from({ length: cycles }, () => ERAS).flat().map(e => `<span>${e}</span>`).join('');
    return `<div class="rk-reel"><div class="rk-reelrow" style="--from:-29px;--to:${-(idx * 58 + 29)}px">${items}</div></div>`;
  }

  renderCountdown() {
    const m = this.match;
    const n = el(`<div class="rk-countdown"><div class="rk-sp"></div>
      <div class="rk-kicker">${m.round === 0 ? 'GET READY' : 'NEXT UP'}</div>
      <div class="rk-count ${this.glow ? 'glow' : ''}" style="color:${this.accent}"><span class="rk-num">3</span></div>
      <p class="rk-hint">${cap(m.tier)} · listen, then name it</p>
      ${this.reel(m.current.song.era)}
      <div class="rk-sp"></div></div>`);
    n.prepend(this.roundBar());
    return n;
  }
  enterCountdown() {
    const m = this.match, cur = m.current, next = m.rounds[m.round + 1];
    this.player.stop(); this.paintEq();
    this.player.prepare(cur.song.id, cur.song.preview).catch(() => {});
    if (next) this.after(1200, () => this.player.prepare(next.song.id, next.song.preview).catch(() => {}));
    const box = this.stage.querySelector('.rk-count');
    const show = (txt, go) => box.replaceChildren(el(`<span class="rk-num ${go ? 'go' : ''}">${txt}</span>`));
    this.sound.tick();
    [2, 1].forEach((k, i) => this.after(1000 * (i + 1), () => { show(k); this.sound.tick(); }));
    this.after(3000, () => show('GO', true));
    this.after(3600, () => this.go('playing'));
    requestAnimationFrame(() => this.stage.querySelector('.rk-reelrow')?.classList.add('spin'));
  }

  renderPlaying() {
    const n = el(`<div class="rk-playing">${this.scoreLine()}<div class="rk-sp"></div>
      <button class="ring rk-ring" aria-label="Replay the clip"><svg viewBox="0 0 206 206" aria-hidden="true"><circle class="track" cx="103" cy="103" r="98"/><circle class="arc ${this.glow ? 'glow' : ''}" cx="103" cy="103" r="98" style="stroke:${this.accent}"/></svg>
        <div class="rk-ringin"><div class="eq"><i></i><i></i><i></i><i></i><i></i></div><div class="rk-secs" data-n="15">15</div><div class="rk-listen">listening</div><small class="rk-err" hidden></small></div></button>
      <div class="rk-sp"></div><div class="rk-bottom"></div></div>`);
    n.prepend(this.roundBar());
    n.querySelector('.rk-ring').onclick = () => this.replay();
    return n;
  }
  enterPlaying() {
    const m = this.match, cur = m.current;
    cur.startedAt = performance.now(); cur.theirAt = m.opponent.answerAt(); cur.closeAt = null;
    this.player.onEnded = () => this.paintEq();
    this.player.play(cur.song.id, cur.song.preview, Ladder.window).then(ok => { if (!ok && !cur.muted) cur.error = this.player.lastError; this.paintEq(); });
    const bottom = this.stage.querySelector('.rk-bottom'); bottom.replaceChildren(this.guessRow()); bottom.querySelector('input').focus();
    const loop = () => { this.raf = requestAnimationFrame(loop); this.tick(); };
    loop();
  }
  elapsed() { return (performance.now() - this.match.current.startedAt) / 1000; }
  /** Every frame of a round: the ring drains, the seconds roll, the opponent answers on its clock, the round closes. */
  tick() {
    const m = this.match, cur = m.current, t = this.elapsed(), now = performance.now();
    const arc = this.stage.querySelector('.rk-ring .arc'); if (arc) arc.style.strokeDashoffset = RING_C * Math.min(1, t / Ladder.window);
    const left = Math.max(0, Math.ceil(Ladder.window - t)), secs = this.stage.querySelector('.rk-secs');
    if (secs && +secs.dataset.n !== left) { secs.dataset.n = left; secs.textContent = left; secs.classList.remove('roll'); void secs.offsetWidth; secs.classList.add('roll'); }
    if (cur.theirPoints == null && cur.theirAt != null && t >= cur.theirAt) {
      cur.theirPoints = Ladder.points(cur.tier, cur.theirAt, 0); m.theirScore += cur.theirPoints; this.paintScores();
      const s = this.stage.querySelector('.rk-locked small'); if (s) s.textContent = 'Both in.';
    }
    const theirDone = cur.theirAt == null || cur.theirPoints != null;
    if (cur.myPoints != null && theirDone && cur.closeAt == null) cur.closeAt = now + 700;     // a beat to read "Both in."
    if (t >= Ladder.closeAt || (cur.closeAt != null && now >= cur.closeAt)) this.go('result');
  }
  paintEq() {
    const eq = this.stage.querySelector('.rk-ring .eq'); if (eq) eq.classList.toggle('on', this.player.playing);
    const cur = this.match?.current, l = this.stage.querySelector('.rk-listen'), e = this.stage.querySelector('.rk-err'); if (!cur || !l) return;
    const playing = this.player.playing;
    l.textContent = cur.error ? 'no sound' : cur.muted ? 'no sound this round' : playing ? 'listening' : 'tap to replay';
    l.style.color = cur.error || cur.muted ? TIER_COLOR.expert : playing ? this.accent : 'var(--dim)';
    e.hidden = !cur.error; e.textContent = cur.error || '';
  }
  replay() {
    const cur = this.match?.current;
    if (this.phase !== 'playing' || !cur || this.player.playing || cur.muted) return;
    this.sound.click();
    this.player.play(cur.song.id, cur.song.preview, Ladder.window).then(ok => { if (!ok) cur.error = this.player.lastError; this.paintEq(); });
  }

  guessRow() {
    const n = el(`<div class="rk-guess"><div class="rk-hits" hidden></div><form class="rk-guessrow" autocomplete="off"><label class="sr" for="rk-in">Your guess</label><input id="rk-in" type="text" placeholder="Name that track" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send"><button type="submit" class="rk-guessbtn" disabled>Guess</button></form></div>`);
    const input = n.querySelector('input'), btn = n.querySelector('.rk-guessbtn'), hits = n.querySelector('.rk-hits');
    input.addEventListener('input', () => { btn.disabled = !input.value.trim(); this.refreshHits(input.value, hits); });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') hits.hidden = true; });
    n.querySelector('form').addEventListener('submit', e => { e.preventDefault(); this.submitTyped(input.value); });
    return n;
  }
  /** Suggestions from the round's own tier, so the answer is always in the list — the same fairness both players get. */
  refreshHits(q, box) {
    const m = this.match, cur = m.current, t = q.trim();
    if (t.length < 2) { box.hidden = true; return; }
    const scope = this.pool.filter(m.tier, 'all', 'all'); if (!scope.some(s => s.id === cur.song.id)) scope.push(cur.song);
    const list = this.pool.search(t, 5, scope);
    if (!list.length) { box.hidden = true; return; }
    box.replaceChildren(...list.map(s => { const h = el(`<button type="button" class="rk-hit"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></button>`); h.onclick = () => this.submit(s); return h; }));
    box.hidden = false;
  }
  submit(song) { const cur = this.match?.current; if (this.phase !== 'playing' || cur.myPoints != null) return; this.sound.click(); if (matches(song, cur.song)) this.lockIn(); else this.wrong(); }
  submitTyped(text) {
    const cur = this.match?.current, t = text.trim();
    if (this.phase !== 'playing' || !t || cur.myPoints != null) return;
    this.sound.click();
    if (matches(t, cur.song) || this.pool.search(t, 1)[0]?.id === cur.song.id) this.lockIn(); else this.wrong();
  }
  wrong() {
    this.match.current.wrong++;
    const g = this.stage.querySelector('.rk-guess'); if (!g) return;
    g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
    const i = g.querySelector('input'); i.value = ''; g.querySelector('.rk-guessbtn').disabled = true; g.querySelector('.rk-hits').hidden = true; i.focus();
  }
  lockIn() {
    const m = this.match, cur = m.current, t = this.elapsed();
    cur.myAt = t; cur.myPoints = Ladder.points(cur.tier, t, cur.wrong); m.myScore += cur.myPoints;
    this.paintScores();
    this.stage.querySelector('.rk-bottom').replaceChildren(el(`<div class="rk-locked pop"><span class="rk-lockcheck">${CHECK}</span><div><b>Locked in</b><small>${cur.theirPoints != null ? 'Both in.' : `Waiting for ${esc(m.opponent.name)}…`}</small></div><div class="rk-sp"></div><b class="rk-plus mono">+${cur.myPoints}</b></div>`));
  }

  // ---------- between rounds ----------
  renderResult() {
    const m = this.match, cur = m.current, o = m.opponent, s = cur.song, a = this.artwork && s.artwork ? art(s.artwork, 300) : null;
    const gained = (name, pts, c) => `<div class="rk-gained ${pts == null ? 'none' : ''}" style="--c:${c}"><span>${esc(name)}</span><b class="mono">${pts != null ? '+' + pts : '—'}</b></div>`;
    const n = el(`<div class="rk-result">
      <div class="rk-hero rise">${a ? `<div class="rk-art">${this.glow ? `<img class="bloom" src="${a}" alt="">` : ''}<img class="cover" src="${a}" alt=""></div>` : ''}<div class="rk-herotext"><div class="rk-itwas" style="color:${this.accent}">IT WAS_</div><h2>${esc(s.title)}</h2><p>${esc(s.artist)}</p></div></div>
      <div class="rk-gains">${gained(this.myName, cur.myPoints, this.accent)}${gained(o.name, cur.theirPoints, hueColor(o.hue))}</div>
      ${this.scoreLine()}<div class="rk-sp"></div>
      <button class="btn primary rk-next" data-press><i class="hold"></i><span>${m.last ? 'See the result' : 'Next round'}</span></button></div>`);
    n.prepend(this.roundBar());
    n.querySelector('.rk-next').onclick = () => { this.sound.click(); this.nextRound(); };
    return n;
  }
  enterResult() {
    this.player.stop(); this.sound.reveal();
    // The round moves on by itself; a darker bar drains across the button so that is visible rather than a jump.
    const hold = this.stage.querySelector('.rk-next .hold');
    requestAnimationFrame(() => requestAnimationFrame(() => { hold.style.transitionDuration = Ladder.resultHold + 's'; hold.style.width = '0%'; }));
    this.after(Ladder.resultHold * 1000, () => this.nextRound());
  }
  nextRound() { if (this.phase !== 'result') return; const m = this.match; if (m.last) this.finish(); else { m.round++; this.go('countdown'); } }

  // ---------- the end ----------
  /** Bank the result once, then let the screen tell it a beat at a time. */
  finish() {
    const m = this.match; m.done = true;
    if (!m.forfeited) {
      if (m.named('myPoints') === Ladder.rounds) m.myScore += Ladder.perfect;
      if (m.named('theirPoints') === Ladder.rounds) m.theirScore += Ladder.perfect;
    }
    m.ratingBefore = this.account.stats.rating;
    m.earned = Ranked.points(m.myScore, m.outcome);
    this.account.recordRanked(m.outcome, m.opponent.rating, m.myScore);
    m.ratingAfter = this.account.stats.rating;
    if (this.account.user) { try { Promise.resolve(boards.post(this.account.user.id, m.earned, m.myScore, m.outcome > 0.6, this.account.name || 'Player', this.account.avatar)).catch(() => {}); } catch (e) {} }
    this.go('finished');
  }
  forfeit() { this.match.forfeited = true; this.player.stop(); this.finish(); }
  askForfeit() {
    const d = el('<div class="rk-dialog" role="dialog" aria-modal="true"><div class="rk-dialogbox"><h3>Leave the match?</h3><p>Walking out counts as a loss, the same as losing the match.</p><div class="rk-dialogbtns"><button class="stay" data-press>Keep playing</button><button class="leave" data-press>Leave and take the loss</button></div></div></div>');
    d.querySelector('.stay').onclick = () => { this.sound.click(); d.remove(); };
    d.querySelector('.leave').onclick = () => { this.sound.click(); d.remove(); this.forfeit(); };
    this.view.append(d);
  }

  renderFinished() {
    const m = this.match, o = m.opponent, won = m.iWon, drew = m.drawn, oc = hueColor(o.hue), delta = m.ratingAfter - m.ratingBefore;
    const vc = won ? TIER_COLOR.easy : drew ? 'var(--muted)' : TIER_COLOR.expert;
    const sub = m.forfeited ? 'You left the match' : won ? `${esc(o.name)} didn't keep up` : drew ? 'Dead level after five' : `${esc(o.name)} took it`;
    const bonus = Ranked.points(0, m.outcome), perfect = !m.forfeited && m.named('myPoints') === Ladder.rounds ? Ladder.perfect : 0;
    const rface = (name, avatar, c, score, winner, loser) => `<div class="rk-rface ${winner ? 'winner' : ''} ${loser ? 'loser' : ''}" style="--c:${c}"><div class="rk-rfacebox ${winner && this.glow ? 'glow' : ''}">${winner ? `<i class="rk-crown">${CROWN}</i>` : ''}${face(name, avatar, c, 74, inkOn(c))}</div><b>${esc(name)}</b><span class="mono">${score}</span></div>`;
    const part = (label, v) => `<div class="rk-part"><b class="mono">${v}</b><span>${label}</span></div>`;
    const n = el(`<div class="rk-finished"><div class="rk-sp"></div>
      <div class="rk-verdict ${won ? 'won' : ''}" style="--c:${vc}"><h2 class="${won && this.glow ? 'glow' : ''}">${drew ? 'Draw' : won ? 'YOU WIN' : 'You lost'}</h2><p>${sub}</p></div>
      <div class="rk-faceoff rk-step">${rface(this.myName, this.account.avatar, this.accent, m.myScore, won, !won && !drew)}<span class="rk-dash">–</span>${rface(o.name, null, oc, m.theirScore, !won && !drew, won)}</div>
      <div class="card rk-points rk-step"><div class="rk-earned mono"><span>+</span><b class="rk-earnedn">0</b></div><div class="rk-kicker">POINTS</div><div class="rk-parts">${part('Round scores', m.myScore)}${perfect ? part('Perfect', perfect) : ''}${bonus ? part(drew ? 'Draw bonus' : 'Win bonus', bonus) : ''}${part('Career', this.account.stats.rankedPoints)}</div></div>
      <div class="card rk-ratingcard rk-step"><div class="rk-ratingrow"><b class="rk-rname"></b><span class="rk-rnum mono"></span><div class="rk-sp"></div><b class="rk-delta mono" style="color:${delta >= 0 ? TIER_COLOR.easy : TIER_COLOR.expert}">${delta >= 0 ? '+' : ''}${delta}</b></div><div class="rk-line"><i class="rk-rfill"></i></div><small class="rk-rnext"></small></div>
      <div class="rk-sp"></div>
      <div class="rk-endbtns rk-step"><button class="btn primary rk-again" data-press style="--accent:${TIER_COLOR.easy};--accent-ink:${TIER_INK.easy}">Play again</button><button class="btn surface rk-board-btn" data-press>${LIST}Leaderboard</button><button class="btn quiet rk-leave" data-press>Leave</button></div></div>`);
    n.prepend(this.bar('Result'));
    n.querySelector('.rk-again').onclick = () => this.findMatch();
    n.querySelector('.rk-board-btn').onclick = () => { this.sound.click(); this.openBoard(); };
    n.querySelector('.rk-leave').onclick = () => { this.sound.click(); this.quit(); };
    return n;
  }
  /** The verdict lands first with the confetti, then the faces, then the points count up, then the rating settles. */
  enterFinished() {
    const m = this.match, steps = this.stage.querySelectorAll('.rk-step'), verdict = this.stage.querySelector('.rk-verdict');
    this.paintRating(m.ratingBefore);
    this.after(220, () => { verdict.classList.add('pop'); this.sound.reveal(); if (m.iWon) this.confetti([TIER_COLOR.easy, '#ffffff', this.accent]); });
    this.after(840, () => steps[0].classList.add('in'));
    this.after(1360, () => { steps[1].classList.add('in'); const n = this.stage.querySelector('.rk-earnedn'); this.tween(850, p => { n.textContent = Math.round(m.earned * p); }); });
    this.after(1980, () => { steps[2].classList.add('in'); steps[3].classList.add('in'); this.tween(800, p => this.paintRating(Math.round(m.ratingBefore + (m.ratingAfter - m.ratingBefore) * p))); });
  }
  /** The rating card at a rating on its way from before to after. */
  paintRating(r) {
    const m = this.match, t = Ranked.rank(r), c = TIER_COLOR[t], { next, fraction } = Ladder.progress(r), card = this.stage.querySelector('.rk-ratingcard'); if (!card) return;
    const promoted = Ranked.rank(m.ratingAfter) !== Ranked.rank(m.ratingBefore), up = m.ratingAfter > m.ratingBefore;
    const name = card.querySelector('.rk-rname'); name.textContent = cap(t); name.style.color = c;
    card.querySelector('.rk-rnum').textContent = r;
    const fill = card.querySelector('.rk-rfill'); fill.style.width = fraction * 100 + '%'; fill.style.background = c;
    const nx = card.querySelector('.rk-rnext');
    nx.textContent = promoted ? `${up ? 'Promoted to' : 'Down to'} ${Ladder.rankName(m.ratingAfter)}` : next ? `${next - r} to ${Ladder.rankName(next)}` : 'Top rank';
    nx.classList.toggle('promoted', promoted); nx.style.color = promoted ? TIER_COLOR[Ranked.rank(m.ratingAfter)] : '';
  }
  /** 150 pieces thrown from a point a third of the way down, gone in under four seconds. */
  confetti(colors) {
    const cv = this.view.querySelector('.rk-confetti'), c = cv.getContext('2d');
    const W = cv.width = this.view.clientWidth, H = cv.height = this.view.clientHeight; cv.hidden = false;
    const pieces = Array.from({ length: 150 }, () => ({ x: W / 2, y: H * 0.3, vx: rnd(-7, 7), vy: rnd(-14, -5), w: rnd(5, 10), h: rnd(4, 14), rot: rnd(0, 6.28), rv: rnd(-0.25, 0.25), color: colors[Math.floor(Math.random() * colors.length)], round: Math.random() < 0.35 }));
    const t0 = performance.now(), life = 3.6; let last = t0;
    const step = () => {
      const now = performance.now(), t = (now - t0) / 1000, dt = clamp((now - last) / (1000 / 60), 0.2, 4); last = now;
      c.clearRect(0, 0, W, H); c.globalAlpha = t > life - 0.8 ? Math.max(0, (life - t) / 0.8) : 1;
      for (const p of pieces) {
        p.vy += 0.32 * dt; p.vx *= Math.pow(0.985, dt); p.vy *= Math.pow(0.99, dt); p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.rv * dt;
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color;
        if (p.round) { c.beginPath(); c.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, 6.29); c.fill(); } else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.restore();
      }
      if (t < life && this.phase === 'finished') this.confettiRaf = requestAnimationFrame(step); else { c.clearRect(0, 0, W, H); cv.hidden = true; }
    };
    cancelAnimationFrame(this.confettiRaf); step();
  }

  // ---------- the leaderboard ----------
  /** Today and this week, one list. Points are what a match is worth — round scores plus the bonus for taking it. */
  openBoard() {
    const t = Ranked.rank(this.account.stats.rating), acc = TIER_COLOR[t], me = this.account.user?.id;
    const sheet = el(`<div class="view sheet rk-boardview"><div class="scrim"></div><div class="sheet-body"><div class="rk-board" style="--accent:${acc};--accent-ink:${TIER_INK[t]}">
      <div class="bar"><h1>Leaderboard</h1><button class="close" aria-label="Close">${X}</button></div>
      <div class="segment rk-period"><button class="on" data-days="1">Today</button><button data-days="7">This week</button></div>
      <div class="rk-rows"></div><p class="rk-boardnote">Best five matches count</p></div></div></div>`);
    const rows = sheet.querySelector('.rk-rows'), closeIt = () => { this.sound.click(); popView(sheet); };
    sheet.querySelector('.close').onclick = closeIt; sheet.querySelector('.scrim').onclick = closeIt;
    let seq = 0;
    const load = async days => {
      const my = ++seq; rows.replaceChildren(el(`<div class="rk-boardmsg">${this.pulse(acc)}</div>`));
      let data;
      try { data = await boards.board(days); } catch (e) { if (my === seq) rows.replaceChildren(el('<p class="rk-boardmsg">The board couldn\'t load. Check your connection.</p>')); return; }
      if (my !== seq) return;
      if (!data?.length) { rows.replaceChildren(el(`<p class="rk-boardmsg">${days === 1 ? 'Nobody has played today yet. Be the first.' : 'No matches this week yet. Be the first.'}</p>`)); return; }
      rows.replaceChildren(...data.map((r, i) => this.boardRow(r, i + 1, !!me && r.user_id === me)));
    };
    sheet.querySelectorAll('.rk-period button').forEach(b => b.onclick = () => {
      if (b.classList.contains('on')) return; this.sound.click();
      sheet.querySelectorAll('.rk-period button').forEach(x => x.classList.remove('on')); b.classList.add('on'); load(+b.dataset.days);
    });
    pushView(sheet); load(1);
  }
  /** One line. The top three wear a medal colour; everyone else wears their place. A stable colour per id, the apps' reduction. */
  boardRow(r, place, isMe) {
    const name = r.display_name ?? r.name ?? 'Player', pts = r.points ?? 0, m = r.matches;
    let seed = 0; for (const ch of String(r.user_id || '')) seed = (seed * 31 + ch.codePointAt(0)) & 0xffff;
    const medal = MEDAL[place - 1] || null, c = medal || hueColor(seed);
    return el(`<div class="rk-row ${isMe ? 'me' : ''}"><span class="rk-place mono" style="color:${medal || 'var(--dim)'}">${place}</span>${face(name, r.avatar, c, 34, inkOn(c))}<b>${esc(name)}${isMe ? ' (you)' : ''}</b><div class="rk-rowpts"><span class="mono" style="color:${medal || 'var(--text)'}">${pts}</span>${m > 0 ? `<small>${m} ${m === 1 ? 'match' : 'matches'}</small>` : ''}</div></div>`);
  }
}
