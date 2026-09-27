// The daily challenge — Daily/Daily.swift and Daily/DailyView.swift on the web.
// One song a day, five chances to name it, one go. The song is the same for
// everyone in the world: the server's row for the day (daily_songs). It opens
// straight into the round, dressed exactly like the stage; the go is spent on
// the first press of play. The result is kept here and posted to the board.
import { STAGES, Pool, eraOf } from './pool.js';
import { Game } from './game.js';
import { el, esc, art, label, face, settings, shareText, pushView, popView, LINKS, TIER_COLOR, TIER_INK, PILL_FILL } from './ui.js';
import { I } from './icons.js';
import { Haptics } from './haptics.js';
import { supabase, SUPABASE_URL, SUPABASE_ANON } from './supabase.js';
import { spring, bezier, CURVE, still } from './motion.js';

/** Shake: .easeInOut(duration: 0.42) over the piecewise offsets of WinSequence's Shake, on the whole round. */
function shakeNode(p) {
  if (!p || still()) return;
  const f = x => (x < 0.2 ? -7 * x / 0.2 : x < 0.4 ? -7 + 13 * (x - 0.2) / 0.2 : x < 0.6 ? 6 - 10 * (x - 0.4) / 0.2 : x < 0.8 ? -4 + 7 * (x - 0.6) / 0.2 : 3 * (1 - (x - 0.8) / 0.2));
  const ease = bezier(0.42, 0, 0.58, 1), frames = [];
  for (let i = 0; i <= 30; i++) frames.push({ offset: i / 30, transform: `translateX(${f(ease(i / 30)).toFixed(2)}px)` });
  frames[30].transform = 'none';
  p.animate(frames, { duration: 420, easing: 'linear' });
}
/** An inserted view's default .transition(.opacity) under the given curve. */
const fadeIn = (n, ms, easing = CURVE.easeOut) => { if (n && !still()) n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing }); };
const fadeOut = (n, ms, easing = CURVE.easeOut) => { if (!n) return; if (still()) return n.remove(); n.style.pointerEvents = 'none'; n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing, fill: 'forwards' }).finished.then(() => n.remove(), () => n.remove()); };
// The stage's bar curve: .timingCurve(0.32, 0.72, 0, 1, duration: 0.35).
const BAR = 'cubic-bezier(.32,.72,0,1)';

// ---------------------------------------------------------------- the rules

const EPOCH = Date.UTC(2026, 8, 19);                 // day one, 19 Sep 2026 UTC
const DAY = 86400000;
const M64 = (1n << 64n) - 1n;
const K = { seed: 'songspot.daily.seed', count: 'songspot.daily.count', record: 'songspot.daily.record' };
const raw = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

/** This browser's own draw, made once and kept (a UInt64 as a decimal string). */
function seed() {
  const s = (raw.get(K.seed) || '').replace(/"/g, '');
  if (/^\d+$/.test(s)) { const v = BigInt(s); if (v > 0n && v <= M64) return v; }
  let v = 0n;
  const a = new Uint32Array(2);
  while (v === 0n) { crypto.getRandomValues(a); v = (BigInt(a[0]) << 32n) | BigInt(a[1]); }
  raw.set(K.seed, v.toString());
  return v;
}

export const Daily = {
  maxHints: 2,
  /** The shared calendar key: days since 19 Sep 2026 UTC, plus one. */
  number(now = Date.now()) { return Math.max(1, Math.floor((now - EPOCH) / DAY) + 1); },
  /** Seconds until the next song, the same moment for everyone. */
  secondsToNext(now = Date.now()) { const e = now - EPOCH; const into = e - Math.floor(e / DAY) * DAY; return Math.max(0, Math.floor((DAY - into) / 1000)); },
  /** The day's song, the same for everyone: the server's row once fetched, else the pick by the day alone (as the app makes it). */
  song(pool, day = Daily.number()) {
    const id = (raw.get('songspot.daily.song.' + day) || '').replace(/"/g, '');
    return (id && pool.byId.get(id)) || Daily.localPick(pool, day);
  },
  /** Ask the server for the day's song (proposing ours if the day has none) and keep it. */
  async syncSong(pool, day = Daily.number()) {
    try {
      const mine = Daily.localPick(pool, day);
      const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/daily_song', {
        method: 'POST', headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_day: day, p_song_id: mine?.id || '', p_title: mine?.title || '', p_artist: mine?.artist || '' }),
      });
      const rows = r.ok ? await r.json() : [];
      const id = rows && rows[0] && rows[0].song_id;
      if (id && pool.byId.get(id)) { raw.set('songspot.daily.song.' + day, id); return pool.byId.get(id); }
    } catch (e) {}
    return null;
  },
  localPick(pool, day) {
    const c = pool.songs.filter(s => (s.tier === 'easy' || s.tier === 'medium') && !Pool.excludedFromAll(s))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (!c.length) return null;
    let h = (BigInt(day) * 0x9E3779B97F4A7C15n) & M64;
    h ^= h >> 29n; h = (h * 0xBF58476D1CE4E5B9n) & M64; h ^= h >> 32n;
    return c[Number(h % BigInt(c.length))];
  },
  /** How many dailies this player has done, today's included once saved. */
  count() { const n = parseInt((raw.get(K.count) || '0').replace(/"/g, ''), 10); return Number.isFinite(n) ? n : 0; },
  /** Today's result on this browser, or null when today is still to play. */
  todayRecord() {
    try { const r = JSON.parse(raw.get(K.record) || 'null'); if (r && r.day === Daily.number()) return { hints: 0, ...r }; } catch (e) {}
    return null;
  },
  played() { return !!Daily.todayRecord(); },
  /** The number the player sees: their first daily is #1 whenever they join. */
  displayNumber() { return Daily.count() + (Daily.todayRecord() ? 0 : 1); },
  save(r) {
    if (!Daily.todayRecord()) raw.set(K.count, String(Daily.count() + 1));
    raw.set(K.record, JSON.stringify({ day: r.day, won: r.won, stage: r.stage, ms: r.ms, hints: r.hints || 0 }));
  },
  forgetToday() { raw.del(K.record); },
  points(stage, won, hints = 0) {
    if (!won) return 0;
    const base = [1000, 800, 600, 400, 200][Math.max(0, Math.min(4, stage))];
    return Math.floor(base * (4 - Math.max(0, Math.min(2, hints))) / 4);
  },
  stageLabel(i) { return label(STAGES[Math.max(0, Math.min(4, i))]); },
  /** One line a person would write to a friend, the link under it. Never the song. */
  shareText(r) {
    let line;
    if (r.won) {
      const t = ['a tenth of a second', 'half a second', '2 seconds', '8 seconds', '15 seconds'][Math.max(0, Math.min(4, r.stage))];
      const hint = !r.hints ? '' : r.hints === 1 ? ' (ok, I used a hint)' : ' (ok, I used two hints)';
      line = r.stage <= 1 ? `I named today's Songspot in ${t}${hint} 😤 bet you can't` : `Named today's Songspot in ${t}${hint} 😤 bet you can't beat that`;
    } else line = "Today's Songspot got away from me 😭 See if you can do better";
    return `${line}\n${LINKS.get}`;
  },
};

// ---------------------------------------------------------------- the screen

const ACCENT = TIER_COLOR.easy, INK = TIER_INK.easy, GOLD = TIER_COLOR.medium;
const STAGE_POS = [1.0, 5.5, 24.3, 41.3, 100];
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export function mountDaily(ctx) {
  const { pool, player, sound, account } = ctx;
  const q = new URLSearchParams(location.search);
  // Test knobs, this machine only: ?dailyReset=1 forgets today's go; ?dailyDemo=won|missed fakes a result without spending it;
  // ?dailyDemo=play plays today's round for real but saves, records and posts nothing.
  if (local && q.get('dailyReset') === '1') Daily.forgetToday();
  const demo = local ? q.get('dailyDemo') : null;

  const day = Daily.number();                       // fixed at open: a round across midnight keeps its day
  const song = (local && q.get('dailySong') && pool.byId.get(q.get('dailySong'))) || Daily.song(pool, day);
  let record = Daily.todayRecord();
  if (demo === 'won' || demo === 'missed') record = { day, won: demo === 'won', stage: demo === 'won' ? 2 : 5, ms: 14200, hints: demo === 'won' ? 1 : 0, demo: true };

  const game = new Game(pool);
  let started = false, roundStart = 0, hints = 0, finished = false, secondChance = false;
  let query = '', picked = null, hits = [], activeHit = -1, clipError = null;
  let board = { loading: true, failed: false, rows: [], players: 0, named: 0 };
  let raf = 0, tickTimer = 0, toastTimer = 0, closed = false;
  // Glow is off unless switched on (Settings.glow).
  const artwork = settings.get('artwork', true), glow = settings.get('glow', false);

  const node = el(`<div class="view daily" role="dialog" aria-modal="true" aria-label="Daily"><div class="screen"></div><div class="d-toast" aria-live="polite"></div></div>`);
  node.style.setProperty('--accent', ACCENT); node.style.setProperty('--accent-ink', INK);
  if (!glow) node.classList.add('noglow');
  let scr = node.querySelector('.screen');
  const toastEl = node.querySelector('.d-toast');

  // ---- hints: the decade (when the song has a year), then the artist
  const hintKinds = song ? [...(song.year ? ['Decade'] : []), 'Artist'] : [];
  const hintTexts = song ? [...(song.year ? [eraOf(song.year)] : []), song.artist] : [];
  const artistPicture = (() => {
    if (!song) return null;
    const o = pool.songs.filter(s => s.artist === song.artist && s.id !== song.id && s.artwork && s.artwork !== song.artwork)
      .sort((a, b) => (a.artistRank ?? 999) - (b.artistRank ?? 999))[0];
    return o ? art(o.artwork, 120) : null;
  })();

  function showToast(text, image = null) {
    toastEl.innerHTML = `${image ? `<img src="${esc(image)}" alt="">` : `<span class="bulb">${I.bulb}</span>`}<b>${esc(text)}</b>`;
    // .transition(.move(edge: .top).combined(with: .opacity)) on spring(response: 0.4, dampingFraction: 0.8)
    toastEl.style.transition = `transform ${spring(0.4, 0.8).css}, opacity ${spring(0.4, 0.8).css}`;
    toastEl.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('on'), 3000);
  }

  const bar = () => `<div class="screen-bar d-bar"><h1>Daily</h1><button class="xbtn" data-press data-act="close" aria-label="Close">${I.x}</button></div>`;

  // ---------------------------------------------------------------- the round
  function renderRound() {
    const st = game.stage, secs = game.duration;
    const k = Math.min(st, 3), scale = STAGE_POS[k] / STAGES[k];
    const marks = marksFor(st).map(([i, at]) => `<div class="mark" data-i="${i}" style="left:${at}%"></div>`).join('');
    const left = hints < hintTexts.length;
    scr.innerHTML = `${bar()}
      <div class="d-round">
        <div class="wordmark" aria-hidden="true">songspot</div>
        <div class="timeline" aria-label="Clip length ${label(secs)}">
          <div class="track"><div class="fill" style="width:${STAGE_POS[st]}%"></div><div class="live"></div>${marks}</div>
          <div class="marker" style="left:${STAGE_POS[st]}%"><span class="caret">${I.caretUp}</span><b>${label(secs)}</b></div>
        </div>
        <div class="playrow${player.playing ? ' playing' : ''}">
          <button class="disc" data-act="play" aria-label="${player.playing ? 'Play the clip again' : 'Play the clip'}">${player.playing ? I.pause : I.play.replace('class="i"', 'class="i play-g"')}<span class="ring"></span><svg class="sweep" viewBox="0 0 125.12 125.12"><circle cx="62.56" cy="62.56" r="61.472" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg></button>
          <span class="seconds">${label(secs)}</span>
        </div>
        ${secondChance ? offerHTML() : `
        <div class="guessrow">
          <div class="keys">
            <div class="field"><input type="text" placeholder="Name that track" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" value="${esc(query)}" aria-label="Name that track"></div>
            <button class="key hintkey${left ? '' : ' used'}" data-press data-act="hint" aria-label="${left ? 'Hint, costs a quarter of the points' : 'Show the hints again'}">${left ? I.bulb : I.bulbOff}${left ? `<span class="d-badge">${hintTexts.length - hints}</span>` : ''}</button>
            <button class="key skip${armed() ? ' armed' : ''}" data-press data-act="skip">${skipInner()}</button>
          </div>
          <div class="hits" hidden></div>
        </div>`}
        <div class="d-hintline">${hints > 0 ? hintLine() : ''}</div>
        <div class="d-err"${clipError ? '' : ' style="opacity:0"'}>${esc(clipError || ' ')}</div>
      </div>`;
    if (!secondChance) refreshHits();
    if (player.playing) animate();
  }
  /** The marks for the shorter clips, re-scaled at every stage (they slide left as the bar grows). */
  function marksFor(st) {
    const k = Math.min(st, 3), scale = STAGE_POS[k] / STAGES[k], out = [];
    STAGES.slice(0, 4).forEach((t, i) => { const at = Math.min(100, scale * t); if (i !== st && at <= 45) out.push([i, at]); });
    return out;
  }
  /**
   * A skip or a wrong guess moves the bar on in place, as the stage does: the fill,
   * the caret and the marks glide on the bar curve, a mark that comes or goes fades
   * on the same curve. Nothing else on the screen is redrawn.
   */
  function updateRound() {
    const st = game.stage, secs = game.duration;
    const tl = scr.querySelector('.timeline'); if (!tl) return renderRound();
    tl.setAttribute('aria-label', `Clip length ${label(secs)}`);
    tl.querySelector('.fill').style.width = STAGE_POS[st] + '%';
    const mk = tl.querySelector('.marker'); mk.style.left = STAGE_POS[st] + '%'; mk.querySelector('b').textContent = label(secs);
    const track = tl.querySelector('.track'), want = new Map(marksFor(st));
    track.querySelectorAll('.mark').forEach(m => {
      const i = +m.dataset.i;
      if (m.dataset.gone) return;
      if (want.has(i)) { m.style.left = want.get(i) + '%'; want.delete(i); }
      else { m.dataset.gone = '1'; fadeOut(m, 350, BAR); }
    });
    for (const [i, at] of want) { const m = el(`<div class="mark" data-i="${i}" style="left:${at}%"></div>`); track.append(m); fadeIn(m, 350, BAR); }
    const sec = scr.querySelector('.playrow .seconds'); if (sec) sec.textContent = label(secs);
    setSkip();
  }
  const armed = () => !!picked || !!query.trim();
  const skipInner = () => armed() ? 'Guess' : `${game.isLastStage ? I.flag : I.skip}${game.isLastStage ? 'Give up' : 'Skip'}`;
  /** The line gains its new hint: the new pieces fade in (.easeOut .25) while the line re-centres around them. */
  function growHintLine() {
    const line = scr.querySelector('.d-hintline'); if (!line) return;
    const before = new Map([...line.children].map((c, k) => [k, c.getBoundingClientRect().left]));
    const had = line.children.length;
    line.innerHTML = hintLine();
    if (still()) return;
    const kids = [...line.children];
    kids.forEach((c, k) => {
      if (k < had && before.has(k)) {
        const dx = before.get(k) - c.getBoundingClientRect().left;
        if (dx) c.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 250, easing: CURVE.easeOut });
      } else fadeIn(c, 250);
    });
  }
  function hintLine() {
    return `<span class="bulb">${I.bulb}</span>` + hintTexts.slice(0, hints).map((t, i) =>
      `${i > 0 ? '<i>·</i>' : ''}${hintKinds[i] === 'Artist' && artistPicture ? `<img src="${esc(artistPicture)}" alt="">` : ''}<span>${esc(t)}</span>`).join('');
  }
  function offerHTML() {
    return `<div class="offer"><div class="k">OUT OF GUESSES</div><div class="keys">
      <button class="watch" data-press data-act="watch">${I.adPlay}Watch an ad, hear 5 more seconds</button>
      <button class="key answer" data-press data-act="answer">Answer</button></div></div>`;
  }
  function swapGuessRow(fade = true) {
    const old = scr.querySelector('.guessrow, .offer'); if (!old) return renderRound();
    const tmp = document.createElement('div');
    tmp.innerHTML = secondChance ? offerHTML() : `<div class="guessrow"><div class="keys"><div class="field"><input type="text" placeholder="Name that track" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" aria-label="Name that track"></div>
      <button class="key hintkey${hints < hintTexts.length ? '' : ' used'}" data-press data-act="hint">${hints < hintTexts.length ? I.bulb + `<span class="d-badge">${hintTexts.length - hints}</span>` : I.bulbOff}</button>
      <button class="key skip${armed() ? ' armed' : ''}" data-press data-act="skip">${skipInner()}</button></div><div class="hits" hidden></div></div>`;
    const nu = tmp.firstElementChild;
    old.replaceWith(nu); if (fade) fadeIn(nu, 250);
  }
  function setSkip() { const b = scr.querySelector('.skip'); if (!b) return; b.className = 'key skip' + (armed() ? ' armed' : ''); b.innerHTML = skipInner(); }

  /** The list: .transition(.opacity.combined(with: .move(edge: .bottom))) under .easeOut(duration: 0.18). */
  function showHits(box, on) {
    if (on === !box.hidden && !box.dataset.leaving) return;
    const drop = () => box.offsetHeight + 8 + (box.parentElement?.offsetHeight || 50);
    box.getAnimations().forEach(a => a.cancel()); delete box.dataset.leaving;
    if (on) {
      box.hidden = false;
      if (!still()) box.animate([{ opacity: 0, transform: `translateY(${drop()}px)` }, { opacity: 1, transform: 'none' }], { duration: 180, easing: CURVE.easeOut });
    } else if (still()) box.hidden = true;
    else {
      box.dataset.leaving = '1';
      box.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${drop()}px)` }], { duration: 180, easing: CURVE.easeOut })
        .finished.then(() => { if (box.dataset.leaving) { box.hidden = true; delete box.dataset.leaving; } }, () => {});
    }
  }
  function refreshHits() {
    const box = scr.querySelector('.hits'); if (!box) return;
    const typed = query.trim();
    if (typed.length < 2 || picked) { hits = []; showHits(box, false); return; }
    // The daily draws from Easy and Medium, so the answer is always in reach.
    let scope = [...pool.filter('easy', 'all', 'all'), ...pool.filter('medium', 'all', 'all')];
    if (song && !scope.some(s => s.id === song.id)) scope.push(song);
    hits = pool.search(typed, 5, scope); activeHit = -1;
    box.innerHTML = hits.map((h, i) => `<div class="hit" data-i="${i}"><b>${esc(h.title)}</b><span>${esc(h.artist)}</span></div>`).join('');
    showHits(box, hits.length > 0);
  }

  // The disc: the sounding slice on the bar, the ring round the disc, 60 fps while it plays.
  function animate() {
    cancelAnimationFrame(raf);
    const step = () => {
      const row = scr.querySelector('.playrow'); if (!row) return;
      const live = scr.querySelector('.track .live'), sweep = scr.querySelector('.sweep circle');
      if (!player.playing) {
        row.classList.remove('playing');
        const d = scr.querySelector('.disc'); if (d && !d.querySelector('.play-g')) { d.querySelector('.i').outerHTML = I.play.replace('class="i"', 'class="i play-g"'); d.setAttribute('aria-label', 'Play the clip'); }
        if (live) live.style.width = '0%';
        return;
      }
      const e = player.elapsed, k = Math.min(game.stage, 3);
      if (live) live.style.width = Math.min(100, (STAGE_POS[k] / STAGES[k]) * e) + '%';
      if (sweep) sweep.setAttribute('stroke-dashoffset', String(100 * (1 - Math.min(1, e / Math.max(0.05, player.length)))));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  async function play() {
    if (!song || finished || game.status !== 'playing') return;
    if (!started) {
      // The go is spent the moment play is first pressed. Written now as a miss,
      // so a reload mid-round cannot buy a second attempt; finishing overwrites it.
      started = true; roundStart = performance.now();
      if (!demo && !Daily.todayRecord()) Daily.save({ day, won: false, stage: 5, ms: 0, hints });
    }
    // As DailyView.play(): a press while it plays starts the clip again from the hook.
    sound.click(); Haptics.press(0.8);
    clipError = null; const err = scr.querySelector('.d-err'); if (err) err.style.opacity = 0;
    const row = scr.querySelector('.playrow'), disc = scr.querySelector('.disc');
    cancelAnimationFrame(raf);
    const paused = () => { row.classList.add('playing'); const ic = disc.querySelector('.i'); if (ic.classList.contains('play-g')) ic.outerHTML = I.pause; disc.setAttribute('aria-label', 'Play the clip again'); };
    paused();
    const ok = await player.play(song.id, song.preview, game.duration);
    if (closed || finished) { if (ok) player.stop(); return; }
    if (!ok) {
      row.classList.remove('playing'); disc.querySelector('.i').outerHTML = I.play.replace('class="i"', 'class="i play-g"');
      clipError = player.lastError || "Couldn't load the clip. Check your connection and try again.";
      if (err) { err.textContent = clipError; err.style.opacity = 1; }
      return;
    }
    paused();
    animate();
  }

  function takeHint() {
    sound.click();
    if (hints < hintTexts.length) {
      hints += 1; Haptics.success();
      const i = hints - 1, artist = hintKinds[i] === 'Artist';
      showToast(artist ? hintTexts[i] : `${hintKinds[i]}: ${hintTexts[i]}`, artist ? artistPicture : null);
      const b = scr.querySelector('.hintkey'), left = hints < hintTexts.length;
      b.className = 'key hintkey' + (left ? '' : ' used'); b.setAttribute('aria-label', left ? 'Hint, costs a quarter of the points' : 'Show the hints again');
      // withAnimation(.easeOut(duration: 0.25)): the icon and the badge cross-fade.
      const oldIcon = b.querySelector('.i'), oldBadge = b.querySelector('.d-badge');
      if (left) { oldBadge.textContent = hintTexts.length - hints; }
      else {
        oldIcon.insertAdjacentHTML('afterend', I.bulbOff); const nu = oldIcon.nextElementSibling;
        oldIcon.classList.add('d-gone'); fadeOut(oldIcon, 250); fadeIn(nu, 250); oldBadge && fadeOut(oldBadge, 250);
      }
      growHintLine();
    } else showToast(hintTexts.join(' · '), artistPicture);
  }

  function submit(c) {
    if (game.status !== 'playing') return;
    sound.click();
    query = ''; picked = null; hits = [];
    let won;
    if (typeof c === 'string') {
      // A typed title: the best match decides, as on the phone.
      const best = pool.search(c, 1)[0];
      won = game.matches(c) || (best ? game.matches(best) : false);
      if (won) game.guess(song); else game.guess(c);
    } else won = game.guess(c);
    if (won) { Haptics.success(); return settle(); }
    wrong();
    settle();
  }
  function wrong() {
    Haptics.wrong();
    if (player.playing) player.extend(game.duration);
    if (game.status !== 'playing') return;
    updateRound();
    const inp = scr.querySelector('.field input'); if (inp) inp.value = '';
    refreshHits();
    shakeNode(scr.querySelector('.d-round'));
  }
  function skip() {
    if (picked) return submit(picked);
    if (query.trim()) return submit(query.trim());
    sound.click();
    if (game.isLastStage) game.giveUp();
    else {
      Haptics.press(0.55); game.skip();
      // Skipping never cuts the audio: the clip runs on to the new length.
      if (player.playing) player.extend(game.duration);
      updateRound();
    }
    settle();
  }
  /** After every guess or skip: still playing, or over one way or the other. */
  function settle() {
    if (game.status === 'won') return finish(true, game.stage);
    if (game.status === 'lost') {
      // Free play can earn five more seconds with a rewarded ad, once. Premium already had its 20.
      const ads = ctx.ads;
      if (!ctx.premium && ads && ads.available && !secondChance && game.bonus === 0) {
        ads.rewarded('daily-five-more-seconds').then(offer => {
          if (finished || game.status !== 'lost') return;
          if (offer) { secondChance = offer; swapGuessRow(); } else finish(false, 5);
        });
      }
      else finish(false, 5);
    }
  }

  function finish(won, stage) {
    if (finished) return;
    finished = true; player.stop(); cancelAnimationFrame(raf);
    const ms = started ? Math.round(performance.now() - roundStart) : 0;
    record = { day, won, stage, ms, hints, demo: !!demo };
    if (!demo) { Daily.save(record); account.recordDaily(day, won); }
    sound.reveal();
    if (won) Haptics.success(); else Haptics.loss();
    renderResult(true);
    // The whole song, as the stage does after a reveal.
    setTimeout(() => { if (!closed && song) player.play(song.id, song.preview, 20); }, 300);
    (demo ? Promise.resolve() : post(record)).then(() => loadBoard());
  }

  // ---------------------------------------------------------------- the board
  async function post(r) {
    try {
      const u = await account.ensureUser(); if (!u) return;
      const name = (account.name || '').trim() || 'Player';
      // A plain insert, as the phone posts it: the unique (user_id, day) index turns a
      // repeat into a 409 we ignore. (No upsert: players have no SELECT on the table.)
      await supabase.from('daily_results').insert({
        user_id: u.id, day: r.day, stage: r.stage, won: r.won, ms: r.ms, hints: r.hints,
        points: Daily.points(r.stage, r.won, r.hints), display_name: name.slice(0, 20), avatar: account.avatar || null,
      });
    } catch (e) {}
  }
  async function loadBoard() {
    if (demo) { board = demoBoard(); return renderBoard(); }
    board.loading = true; board.failed = false; renderBoard();
    try {
      const { data, error } = await supabase.rpc('daily_board', { p_day: day });
      if (error || !data) throw error || new Error('no board');
      const p = typeof data === 'string' ? JSON.parse(data) : data;
      board = { loading: false, failed: false, rows: p.rows || [], players: p.players || 0, named: p.named || 0 };
    } catch (e) { board = { ...board, loading: false, failed: true }; }
    if (!closed) renderBoard();
  }
  const myId = () => account.user?.id || (demo ? 'demo-me' : null);
  function rowsWithMe(rows) {
    const me = myId();
    if (!record || !me || rows.some(r => r.user_id === me)) return rows;
    const mine = { user_id: me, display_name: (account.name || '').trim() || 'You', avatar: account.avatar, stage: record.stage, won: record.won, ms: record.ms, hints: record.hints };
    // By the clock, first to name it at the top: you have just finished, so you go after everyone already there.
    const named = rows.filter(r => r.won), missed = rows.filter(r => !r.won);
    return record.won ? [...named, mine, ...missed] : [...named, ...missed, mine];
  }
  function rowHTML(r, place) {
    const me = r.user_id === myId();
    const name = (r.display_name || '').trim() || 'Someone';
    return `<div class="d-row${me ? ' me' : ''}">
      <span class="pl${place <= 3 ? ' top' : ''}">${place}</span>
      ${face(name, r.avatar, 'rgba(255,255,255,.12)', 30, '#a8a8a8')}
      <span class="nm">${esc(name)}</span>
      ${r.hints > 0 ? `<span class="hb">${I.bulb.repeat(r.hints)}</span>` : ''}
      <span class="pill-t${r.won ? ' won' : ''}">${r.won ? `in ${Daily.stageLabel(r.stage)}` : 'missed'}</span>
    </div>`;
  }
  function renderBoard() {
    const panel = scr.querySelector('.d-board'); if (!panel) return;
    const rank = scr.querySelector('[data-fig="rank"]');
    if (board.failed) { panel.hidden = true; return; }
    panel.hidden = false;
    const all = rowsWithMe(board.rows);
    const i = all.findIndex(r => r.user_id === myId());
    const mine = board.rows.findIndex(r => r.user_id === myId());
    if (rank) rank.textContent = mine >= 0 ? `#${mine + 1}` : '—';
    const head = `<div class="d-bhead"><span>FIRST TODAY</span><small>${board.players ? `${board.players} played · ${board.named} named it` : ''}</small></div>`;
    if (board.loading && !board.rows.length) { panel.innerHTML = head + '<div class="d-spin"><span class="spin"></span></div>'; return; }
    let body = all.slice(0, 10).map((r, k) => rowHTML(r, k + 1)).join('');
    if (i >= 10) body += rowHTML(all[i], i + 1);
    panel.innerHTML = head + body;
  }
  function demoBoard() {
    const me = myId();
    const rows = [
      { user_id: 'a', display_name: 'Maja', avatar: null, stage: 1, won: true, ms: 5200, hints: 0 },
      { user_id: 'b', display_name: 'Theo', avatar: null, stage: 2, won: true, ms: 9100, hints: 1 },
      { user_id: 'c', display_name: 'Ines', avatar: null, stage: 3, won: true, ms: 21000, hints: 2 },
      { user_id: 'd', display_name: 'Oskar', avatar: null, stage: 5, won: false, ms: 30000, hints: 0 },
    ];
    const mine = { user_id: me, display_name: (account.name || '').trim() || 'You', avatar: account.avatar, stage: record.stage, won: record.won, ms: record.ms, hints: record.hints };
    rows.splice(record.won ? 2 : rows.length, 0, mine);
    return { loading: false, failed: false, rows, players: 214, named: 163 };
  }

  // ---------------------------------------------------------------- the result
  function renderResult(fresh = false) {
    const r = record;
    const streak = (() => { const s = account.stats || {}; return (s.lastDaily || 0) >= day - 1 ? (s.dailyStreak || 0) : 0; })();
    const pts = Daily.points(r.stage, r.won, r.hints);
    const state = r.won ? ACCENT : TIER_COLOR.expert;
    // From the round: withAnimation(.easeOut(duration: 0.28)) { phase = .result } — the two cross-fade.
    if (fresh && !still()) {
      const old = scr;
      scr = document.createElement('div'); scr.className = 'screen';
      old.after(scr);
      old.classList.add('d-leaving');
      old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: CURVE.easeOut, fill: 'forwards' }).finished.then(() => old.remove(), () => old.remove());
      scr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: CURVE.easeOut });
    }
    scr.innerHTML = `${bar()}
      <div class="d-result">
        ${song && artwork ? `<img class="d-art" src="${esc(art(song.artwork, 400))}" alt="">` : ''}
        ${song ? `<h2>${esc(song.title)}</h2><div class="d-artist">${esc(song.artist)}</div>` : ''}
        <div class="d-stamp" style="--s:${state}">${r.won ? `NAMED AT ${Daily.stageLabel(r.stage).toUpperCase()}` : 'MISSED IT'}${r.hints > 0 ? ` · ${r.hints} HINT${r.hints === 1 ? '' : 'S'}` : ''}</div>
        <div class="d-figs">
          <div class="${r.won ? 'lit' : ''}"><b>${pts}</b><span>Points</span></div>
          <div class="${streak > 0 ? 'lit' : ''}"><b>${streak}</b><span>Streak</span></div>
          <div><b data-fig="rank">—</b><span>Today</span></div>
        </div>
        <button class="d-share" data-press data-act="share">${I.share}Share</button>
        <div class="d-board card"></div>
        <div class="d-next"></div>
      </div>`;
    renderBoard();
    countdown();
  }
  function countdown() {
    const n = Daily.secondsToNext(), p = v => String(v).padStart(2, '0');
    const t = scr.querySelector('.d-next'); if (t) t.textContent = `Next song in ${p(Math.floor(n / 3600))}:${p(Math.floor(n / 60) % 60)}:${p(n % 60)}`;
  }

  // ---------------------------------------------------------------- open, close
  function close() {
    if (closed) return;
    closed = true; player.stop(); cancelAnimationFrame(raf); clearInterval(tickTimer); clearTimeout(toastTimer);
    document.removeEventListener('keydown', onKey);
    popView(node);
  }
  /** The app's confirmationDialog: an action sheet, the destructive choice in red, Keep playing on its own below. */
  let leaveOpen = false;
  function askLeave() {
    if (leaveOpen) return;
    leaveOpen = true;
    const sheet = el(`<div class="view sheet d-confirm" role="alertdialog" aria-label="Leave today's song?"><div class="scrim"></div>
      <div class="stackup"><div class="cardc"><div class="lead"><b>Leave today's song?</b><div>One go a day. Leaving now uses it.</div></div>
      <button class="act" data-press>Leave and count it as missed</button></div><div class="cardc"><button class="cancel" data-press>Keep playing</button></div></div></div>`);
    const end = ok => { if (!leaveOpen) return; leaveOpen = false; document.removeEventListener('keydown', onEsc, true); popView(sheet); if (ok) finish(false, 5); };
    const onEsc = e => { if (e.key === 'Escape') { e.stopPropagation(); end(false); } };
    sheet.querySelector('.scrim').addEventListener('click', () => end(false));
    sheet.querySelector('.cancel').addEventListener('click', () => end(false));
    sheet.querySelector('.act').addEventListener('click', () => end(true));
    document.addEventListener('keydown', onEsc, true);
    pushView(sheet);
  }
  const tryClose = () => { sound.click(); if (!finished && started && !record) return askLeave(); close(); };

  const onTop = () => { const host = document.getElementById('views'); return !host || host.lastElementChild === node; };
  function onKey(e) {
    if (!onTop()) return;
    if (e.key === 'Escape') { if (e.target.tagName === 'INPUT' && query) { query = ''; picked = null; e.target.value = ''; setSkip(); refreshHits(); return; } e.preventDefault(); return tryClose(); }
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON' && !record) { e.preventDefault(); play(); }
  }

  node.addEventListener('click', e => {
    const t = e.target;
    const hit = t.closest('.hit');
    // DailyView: a tap on a suggestion is the guess (.onTapGesture { submit(song: s) }).
    if (hit) { const s2 = hits[+hit.dataset.i]; scr.querySelector('.field input')?.blur(); showHits(scr.querySelector('.hits'), false); if (s2) submit(s2); return; }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'close') return tryClose();
    if (act === 'play') return play();
    if (act === 'hint') return takeHint();
    if (act === 'skip') return skip();
    if (act === 'share') { sound.click(); return shareText(Daily.shareText(record)); }
    if (act === 'answer') { sound.click(); secondChance = false; return finish(false, 5); }
    if (act === 'watch') {
      sound.click(); player.stop();
      const offer = secondChance;
      if (!offer || !offer.show) { secondChance = false; return finish(false, 5); }
      offer.show().then(rewarded => {
        secondChance = false;
        if (rewarded && game.status === 'lost') { game.revive(5); updateRound(); swapGuessRow(false); showToast('Five more seconds. Same song.'); play(); }
        else if (game.status === 'lost') finish(false, 5);
      });
    }
  });
  node.addEventListener('input', e => {
    if (e.target.tagName !== 'INPUT') return;
    query = e.target.value;
    if (picked && query !== `${picked.title} — ${picked.artist}`) { picked = null; }
    setSkip(); refreshHits();
  });
  node.addEventListener('keydown', e => {
    if (e.target.tagName !== 'INPUT') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hits.length) return; e.preventDefault();
      activeHit = (activeHit + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
      scr.querySelectorAll('.hit').forEach((h, i) => h.classList.toggle('active', i === activeHit));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (picked) return submit(picked);
      if (activeHit >= 0 && hits[activeHit]) return submit(hits[activeHit]);
      if (query.trim()) submit(query.trim());
    }
  });
  document.addEventListener('keydown', onKey);

  // ---- open
  if (record) {
    renderResult();
    loadBoard();
  } else if (!song) {
    scr.innerHTML = `${bar()}<div class="d-round"><div class="wordmark">songspot</div><div class="d-err">Today's song couldn't be found. Try again later.</div></div>`;
  } else {
    game.lastStageExtra = ctx.premium ? 5 : 0;           // premium hears 20 s on the last stage
    game.newRound(song);
    renderRound();
    player.prepare(song.id, song.preview).catch(() => {});
  }
  tickTimer = setInterval(() => { if (record && !closed) countdown(); }, 1000);
  pushView(node);
  return { close };
}
