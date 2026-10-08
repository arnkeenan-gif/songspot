// The daily challenge — Daily/Daily.swift and Daily/DailyView.swift (iOS 810f015) on the web.
// One song a day, five chances to name it, one go. The song is the same for
// everyone in the world: the server's row for the day (daily_songs); nothing is
// dealt until the server has answered (the phone's own pick only if it can't).
// It opens straight into the round under the DAILY CHALLENGE badge, dressed
// like the stage; the go is spent on the first press of anything (play, skip or
// a guess). The result is kept here per account and posted to the board.
import { STAGES, Pool } from './pool.js';
import { Game } from './game.js';
import { el, esc, art, label, settings, shareText, pushView, popView, LINKS, TIER_COLOR, TIER_INK, PILL_FILL, PILL_INK } from './ui.js';
import { I } from './icons.js';
import { Haptics } from './haptics.js';
import { supabase, SUPABASE_URL, SUPABASE_ANON } from './supabase.js';
import { spring, bezier, CURVE, still } from './motion.js';
import { Streak } from './account.js';
import { faceHTML, NameFilter } from './characters.js';
import { PanelColours, dressAttr, glossy } from './kit.js';
import { Season, mountBackdrop, mountNight } from './season.js';

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
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- the rules

const EPOCH = Date.UTC(2026, 8, 19);                 // day one, 19 Sep 2026 UTC
const DAY = 86400000;
const M64 = (1n << 64n) - 1n;
const K = { count: 'songspot.daily.count', legacy: 'songspot.daily.record' };
const raw = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/**
 * SupabaseAuth.userID for the record's key, read from the stored session (synchronously, as the phone reads its
 * keychain). A web guest (an anonymous session, made so the board has somewhere to put the go) is the phone's
 * signed-out player: "guest", so creating it mid-round never loses the go.
 */
function signedInID() {
  try {
    const s = JSON.parse(raw.get('songspot.auth') || 'null');
    const u = s && (s.user || s.currentSession?.user);
    return u && u.id && !u.is_anonymous ? u.id : null;
  } catch (e) { return null; }
}

export const Daily = {
  maxHints: 2,
  /** The shared calendar key: days since 19 Sep 2026 UTC, plus one. */
  number(now = Date.now()) { return Math.max(1, Math.floor((now - EPOCH) / DAY) + 1); },
  /** Seconds until the next song, the same moment for everyone. */
  secondsToNext(now = Date.now()) { const e = now - EPOCH; const into = e - Math.floor(e / DAY) * DAY; return Math.max(0, Math.floor((DAY - into) / 1000)); },
  /** "HH:MM:SS" (GamesView.clock). */
  clock(s) { const p = v => String(v).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`; },
  /** The Games tab's daily pill: "Ends in HH:MM:SS" while today is to play, "Next in …" once it's played (GamesView.dailyBadge). */
  pillText(stats, now = Date.now()) { const played = (stats?.lastDaily || 0) === Daily.number(now); return (played ? 'Next in ' : 'Ends in ') + Daily.clock(Daily.secondsToNext(now)); },
  /** The day's song, the same for everyone: the server's row once fetched, else the pick by the day alone. */
  song(pool, day = Daily.number()) { return Daily.serverSong(pool, day) || Daily.localPick(pool, day); },
  /** The server's song for the day, if this browser has already been told it. */
  serverSong(pool, day = Daily.number()) {
    const id = (raw.get('songspot.daily.song.' + day) || '').replace(/"/g, '');
    return (id && pool.byId.get(id)) || null;
  },
  /** Ask the server for the day's song (proposing ours if the day has none) and keep it. 6 s timeout, as the phone. */
  async syncSong(pool, day = Daily.number()) {
    try {
      const mine = Daily.localPick(pool, day);
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = ctl && setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/daily_song', {
        method: 'POST', headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' }, signal: ctl?.signal,
        body: JSON.stringify({ p_day: day, p_song_id: mine?.id || '', p_title: mine?.title || '', p_artist: mine?.artist || '' }),
      });
      clearTimeout(t);
      const rows = r.status === 200 ? await r.json() : [];
      const id = rows && rows[0] && rows[0].song_id;
      if (id && pool.byId.get(id)) { raw.set('songspot.daily.song.' + day, id); return pool.byId.get(id); }
    } catch (e) {}
    return null;
  },
  /** Huge songs only (no hints, so the daily is easy): Easy, most famous, each artist's signature song. Offline fallback; the server plans the days. */
  localPick(pool, day) {
    const c = pool.songs.filter(s => s.tier === 'easy' && s.fame === 1 && s.artistRank === 0 && !Pool.excludedFromAll(s))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (!c.length) return null;
    let h = (BigInt(day) * 0x9E3779B97F4A7C15n) & M64;
    h ^= h >> 29n; h = (h * 0xBF58476D1CE4E5B9n) & M64; h ^= h >> 32n;
    return c[Number(h % BigInt(c.length))];
  },
  /** How many dailies this player has done, today's included once saved. */
  count() { const n = parseInt((raw.get(K.count) || '0').replace(/"/g, ''), 10); return Number.isFinite(n) ? n : 0; },
  /** Today's go, kept per account (`songspot.daily.record.<userID|guest>`): a second account on this browser plays its own. */
  key() { return 'songspot.daily.record.' + (signedInID() || 'guest'); },
  /** The one-per-browser record goes to whoever is signed in when it is first read under the new keying. */
  adoptLegacy() {
    const old = raw.get(K.legacy); if (old == null) return;
    raw.del(K.legacy);
    if (raw.get(Daily.key()) == null) raw.set(Daily.key(), old);
  },
  /** Today's result here, or null when today is still to play. Tolerant of records saved before hints/song/at were kept. */
  todayRecord() {
    Daily.adoptLegacy();
    try {
      const r = JSON.parse(raw.get(Daily.key()) || 'null');
      if (r && r.day === Daily.number()) return { hints: 0, songID: null, seconds: null, at: null, ...r };
    } catch (e) {}
    return null;
  },
  played() { return !!Daily.todayRecord(); },
  /** The number the player sees: their first daily is #1 whenever they join. */
  displayNumber() { return Daily.count() + (Daily.todayRecord() ? 0 : 1); },
  save(r) {
    if (!Daily.todayRecord()) raw.set(K.count, String(Daily.count() + 1));
    const o = { day: r.day, won: r.won, stage: r.stage, ms: r.ms, hints: r.hints || 0 };
    if (r.songID) o.songID = r.songID;
    if (r.seconds != null) o.seconds = r.seconds;
    if (r.at) o.at = r.at;
    raw.set(Daily.key(), JSON.stringify(o));
  },
  forgetToday() { raw.del(Daily.key()); },
  /** By speed, as in party and the app: 1000 the moment the round starts, 500 at 20 s,
   *  100 at a minute; each later stage caps it; each hint takes a quarter off. */
  points(stage, won, hints = 0, ms = 0) {
    if (!won) return 0;
    const t = Math.max(0, ms) / 1000;
    let base = t <= 20 ? 1000 - 500 * (t / 20) : Math.max(100, 500 - 400 * ((t - 20) / 40));
    base = Math.min(base, [1000, 850, 700, 550, 400][Math.max(0, Math.min(4, stage))]);
    return Math.floor(Math.round(base) * (4 - Math.max(0, Math.min(2, hints))) / 4);
  },
  stageLabel(i) { return Daily.secondsLabel(STAGES[Math.max(0, Math.min(4, i))]); },
  secondsLabel(s) { return s < 1 ? s.toFixed(1) + 's' : Math.trunc(s) + 's'; },
  /** The clip it was named at, as heard: premium's last clip, or one an ad stretched, runs past 15 s. */
  clipLabel(r) { return r.seconds != null ? Daily.secondsLabel(r.seconds) : Daily.stageLabel(r.stage); },
  /** One line a person would write to a friend, the link under it. Never the song. */
  shareText(r) {
    let line;
    if (r.won) {
      const words = ['a tenth of a second', 'half a second', '2 seconds', '8 seconds', '15 seconds'][Math.max(0, Math.min(4, r.stage))];
      const t = r.stage >= 2 && r.seconds != null ? `${Math.trunc(r.seconds)} seconds` : words;
      const hint = !r.hints ? '' : r.hints === 1 ? ' (ok, I used a hint)' : ' (ok, I used two hints)';
      line = r.stage <= 1 ? `I named today's Songspot in ${t}${hint} 😤 bet you can't` : `Named today's Songspot in ${t}${hint} 😤 bet you can't beat that`;
    } else line = "Today's Songspot got away from me 😭 See if you can do better";
    return `${line}\n${LINKS.get}`;
  },
  /** A Postgres timestamp as the API sends it ("2026-10-03T08:14:22.481+00:00"), read to the second, UTC. */
  serverDate(s) {
    if (!s || String(s).length < 19) return null;
    const t = Date.parse(String(s).slice(0, 19) + 'Z');
    return Number.isFinite(t) ? t : null;
  },
};

/** The desk calendar with the daily streak on its page (DailyView.dailyBadge / GamesView.calendar), `size` px square. */
export function calendarHTML(streak, size = 60) {
  return `<span class="d-cal" style="--s:${size}px" aria-hidden="true"><img src="/app/img/games/game-icon-calendar.webp" alt="" draggable="false">
    <span class="d-calpage"><b>${streak}</b><i>${streak === 1 ? 'DAY' : 'DAYS'}</i></span></span>`;
}

// ---------------------------------------------------------------- posting (DailyBoard.send)

/** One try: 2xx or 409 (today's row is already there) landed; 401 / 5xx / no answer worth another go; anything else refused. */
async function sendOnce(account, r) {
  try {
    const u = await account.ensureUser(); if (!u) return 'refused';
    const name = (account.name || '').trim() || 'Player';
    // A plain insert, as the phone posts it: the unique (user_id, day) index turns a
    // repeat into a 409 we ignore. (No upsert: players have no SELECT on the table.)
    const { error, status } = await supabase.from('daily_results').insert({
      user_id: u.id, day: r.day, stage: r.stage, won: r.won, ms: Math.min(r.ms, 3600000), hints: r.hints || 0,
      points: Daily.points(r.stage, r.won, r.hints, r.ms), display_name: name.slice(0, 20), avatar: account.avatar || null,
    });
    if (!error || (status >= 200 && status < 300) || status === 409 || error.code === '23505') return 'landed';
    return !status || status >= 500 || status === 401 ? 'failed' : 'refused';
  } catch (e) { return 'failed'; }
}
/** The post, retried twice (1.5 s, then 3 s) on a slow or dropped link; the next open sends it again either way. */
async function send(account, r) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(attempt * 1500);
    const o = await sendOnce(account, r);
    if (o === 'landed') return true;
    if (o === 'refused') return false;
  }
  return false;
}

// ---------------------------------------------------------------- the screen

const STAGE_POS = [1.0, 5.5, 24.3, 41.3, 100];
const DEMO_NAMES = ['Mia', 'Noah', 'Liv', 'Theo', 'Sofia', 'Eli', 'Aya', 'Max', 'Ivy', 'Kai'];

/** The shared foundation's styles (kit panels, the season's backdrop, the faces): linked once, if the page hasn't yet. */
function ensureCSS(...names) {
  for (const n of names) {
    if (document.querySelector(`link[href*="/app/css/${n}.css"]`)) continue;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `/app/css/${n}.css`; document.head.appendChild(l);
  }
}

export function mountDaily(ctx) {
  ensureCSS('kit', 'season', 'characters');
  const { pool, player, sound, account } = ctx;
  const q = new URLSearchParams(location.search);
  // Test knobs, this machine only (iOS -resetDaily / -dailySong / -demoDailyBoard / -demoDailyRank):
  //   ?dailyReset=1           forget today's go
  //   ?dailySong=<id>         play that song as today's
  //   ?dailyDemo=won|missed   a result without spending the go (friends + everyone boards made up)
  //   ?dailyDemo=board        iOS -demoDailyBoard: named at 0.5s, a 12-day streak, the demo boards (myRank 3)
  //   ?dailyRank=47           with board: you further down, under the top ten
  //   ?dailyDemo=alone        a result with no friends: the everyone board and the invite card
  //   ?dailyDemo=failed       a result whose board couldn't load
  //   ?dailyDemo=fetching     the round waiting for the server's song (the spinner stays)
  //   ?dailyDemo=play         play today's round for real but save, record and post nothing
  const demo = local ? q.get('dailyDemo') : null;
  const resultDemo = ['won', 'missed', 'board', 'alone', 'failed'].includes(demo);
  if (local && q.get('dailyReset') === '1') Daily.forgetToday();

  let day = Daily.number();                         // fixed at open: a round across midnight keeps its day
  let resultDay = day;
  let song = null, record = null, game = null;
  let started = false, roundStart = 0, hints = 0, finished = false, secondChance = false, adBusy = false, fetchingSong = false;
  let query = '', picked = null, hits = [], activeHit = -1, clipError = null;
  let board, friends, showEveryone = false, restored = false;
  let raf = 0, tickTimer = 0, toastTimer = 0, closed = false, discDownAt = 0;
  // Glow is off unless switched on (Settings.glow).
  const artwork = settings.get('artwork', true), glow = settings.get('glow', false);
  // The demo's streak lives on this page only: the real stats are never touched.
  let demoStats = null;
  const stats = () => demoStats || account.stats || {};
  const liveStreak = () => Streak.live(stats(), day);

  // Colours, read now (season.js re-tints the tier constants at boot): in a season its accent stands in for the green.
  const ACCENT = TIER_COLOR.easy, INK = TIER_INK.easy;
  const season = Season.current;
  // The badge and the stats in the Games tab's orange, or the season's panel; Share green (the season's panel at
  // Christmas, through PanelColours.green), purple in Halloween.
  const panel = season ? Season.panel : PanelColours.orange;
  const shareColours = season === 'halloween' ? PanelColours.purple : PanelColours.green;

  const node = el(`<div class="view daily${season ? ' d-season d-' + season : ''}" role="dialog" aria-modal="true" aria-label="Daily"><div class="d-back" aria-hidden="true"></div><div class="screen"></div><div class="d-toast" aria-live="polite"></div></div>`);
  node.style.setProperty('--accent', ACCENT); node.style.setProperty('--accent-ink', INK);
  node.style.setProperty('--pill-lit', PILL_FILL.easy); node.style.setProperty('--pill-ink', PILL_INK);
  if (!glow) node.classList.add('noglow');
  let scr = node.querySelector('.screen');
  const toastEl = node.querySelector('.d-toast');
  // SeasonNight in a season (the backdrop, a low haze of the season's glow, a thin moon in October), else SeasonBackdrop.
  const back = (season ? mountNight : mountBackdrop)(node.querySelector('.d-back'));

  function showToast(text, image = null) {
    toastEl.innerHTML = `${image ? `<img src="${esc(image)}" alt="">` : `<span class="bulb">${I.bulb}</span>`}<b>${esc(text)}</b>`;
    // .transition(.move(edge: .top).combined(with: .opacity)) on spring(response: 0.4, dampingFraction: 0.8)
    toastEl.style.transition = `transform ${spring(0.4, 0.8).css}, opacity ${spring(0.4, 0.8).css}`;
    toastEl.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('on'), 3000);
  }

  const leaving = () => !finished && started && !record;
  const bar = () => `<div class="screen-bar d-bar"><h1>Daily</h1><button class="xbtn" data-press data-act="close" aria-label="${leaving() ? "Leave today's song" : 'Close'}">${I.x}</button></div>`;

  // ---------------------------------------------------------------- the badge
  /** Today's challenge in the Games tab's orange (the season's panel in a season): the calendar with your streak, what the round is. */
  function badgeHTML() {
    const streak = liveStreak();
    const icon = season ? `<img class="d-sicon" src="/app/img/games/${esc(Season.dailyIcon)}.webp" alt="">` : calendarHTML(streak, 60);
    const title = season ? Season.dailyTitle : 'DAILY CHALLENGE';
    const sub = season ? Season.dailySub(streak) : 'One song, five tries, one go';
    return panelHTML(panel, 'd-badge', `<span class="d-bicon">${icon}</span><span class="d-btext"><b>${esc(title)}</b><small>${esc(sub)}</small></span>`);
  }

  // ---------------------------------------------------------------- the round
  function renderRound() {
    const st = game ? game.stage : 0, secs = game ? game.duration : STAGES[0];
    const marks = marksFor(st).map(([i, at]) => `<div class="mark" data-i="${i}" style="left:${at}%"></div>`).join('');
    const playing = player.playing && !fetchingSong;
    scr.innerHTML = `${bar()}
      <div class="d-round">
        ${badgeHTML()}
        <div class="timeline" aria-label="Clip length ${label(secs)}">
          <div class="track"><div class="fill" style="width:${STAGE_POS[st]}%"></div><div class="live"></div>${marks}</div>
          <div class="marker" style="left:${STAGE_POS[st]}%"><span class="caret">${I.caretUp}</span><b>${label(secs)}</b></div>
        </div>
        <div class="playrow${playing ? ' playing' : ''}">
          <button class="disc" data-act="play" aria-label="${fetchingSong ? "Loading today's song" : playing ? 'Stop' : 'Play the clip'}">${fetchingSong ? SPINNER : playing ? I.pause : I.play.replace('class="i"', 'class="i play-g"')}<span class="ring"></span><svg class="sweep" viewBox="0 0 125.12 125.12"><circle cx="62.56" cy="62.56" r="61.472" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg></button>
          <span class="seconds">${label(secs)}</span>
        </div>
        ${secondChance ? offerHTML() : guessRowHTML()}
        <div class="d-hintline"></div>
        <div class="d-err"${clipError ? '' : ' style="opacity:0"'}>${esc(clipError || ' ')}</div>
      </div>`;
    if (!secondChance) refreshHits();
    if (playing) animate();
  }
  const guessRowHTML = () => `<div class="guessrow"><div class="keys">
      <div class="field"><input type="text" placeholder="Name that track" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" value="${esc(query)}" aria-label="Name that track"></div>
      <button class="key skip${armed() ? ' armed' : ''}" data-press data-act="skip">${skipInner()}</button>
    </div><div class="hits" hidden></div></div>`;
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
  const lastStage = () => !!game && game.isLastStage;
  const skipInner = () => armed() ? 'Guess' : `${lastStage() ? I.flag : I.skip}${lastStage() ? 'Give up' : 'Skip'}`;
  function offerHTML() {
    return `<div class="offer"><div class="k">OUT OF GUESSES</div><div class="keys">
      <button class="watch" data-press data-act="watch"${adBusy ? ' disabled' : ''}>${I.adPlay}Watch an ad, hear 5 more seconds</button>
      <button class="key answer" data-press data-act="answer"${adBusy ? ' disabled' : ''}>Answer</button></div></div>`;
  }
  function swapGuessRow(fade = true) {
    const old = scr.querySelector('.guessrow, .offer'); if (!old) return renderRound();
    const nu = el(secondChance ? offerHTML() : guessRowHTML());
    old.replaceWith(nu); if (fade) fadeIn(nu, 250);
  }
  function setSkip() { const b = scr.querySelector('.skip'); if (!b) return; b.className = 'key skip' + (armed() ? ' armed' : ''); b.innerHTML = skipInner(); }
  function setLeaveLabel() { const x = scr.querySelector('.d-bar .xbtn'); if (x) x.setAttribute('aria-label', leaving() ? "Leave today's song" : 'Close'); }

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
  function setDisc(on) {
    const row = scr.querySelector('.playrow'), disc = scr.querySelector('.disc'); if (!row || !disc) return;
    row.classList.toggle('playing', on);
    const ic = disc.querySelector('.i'); if (!ic) return;
    if (on && ic.classList.contains('play-g')) ic.outerHTML = I.pause;
    if (!on && !ic.classList.contains('play-g')) ic.outerHTML = I.play.replace('class="i"', 'class="i play-g"');
    disc.setAttribute('aria-label', on ? 'Stop' : 'Play the clip');
  }
  function animate() {
    cancelAnimationFrame(raf);
    const step = () => {
      const row = scr.querySelector('.playrow'); if (!row || !game) return;
      const live = scr.querySelector('.track .live'), sweep = scr.querySelector('.sweep circle');
      if (!player.playing) { setDisc(false); if (live) live.style.width = '0%'; return; }
      const e = player.elapsed, k = Math.min(game.stage, 3);
      if (live) live.style.width = Math.min(100, (STAGE_POS[k] / STAGES[k]) * e) + '%';
      if (sweep) sweep.setAttribute('stroke-dashoffset', String(100 * (1 - Math.min(1, e / Math.max(0.05, player.length)))));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  /**
   * The round starts on the first press of anything: play, skip or a guess. The go
   * is spent then, written as a miss so a reload mid-round can't buy a second
   * attempt; finishing overwrites it.
   */
  function startClock() {
    if (started || !song) return;
    started = true; roundStart = performance.now();
    if (!demo && !Daily.todayRecord()) Daily.save({ day, won: false, stage: 5, ms: 0, hints, songID: song.id, at: new Date().toISOString() });
    setLeaveLabel();
  }

  async function play() {
    if (!song || !game || finished || game.status !== 'playing') return;
    // Pressed while it plays: stop, as the stage does — never a restart.
    if (player.playing) { sound.click(); Haptics.press(0.45); player.stop(); cancelAnimationFrame(raf); setDisc(false); const lv = scr.querySelector('.track .live'); if (lv) lv.style.width = '0%'; return; }
    startClock();
    sound.click(); Haptics.press(0.8);
    clipError = null; const err = scr.querySelector('.d-err'); if (err) err.style.opacity = 0;
    cancelAnimationFrame(raf);
    setDisc(true);
    const ok = await player.play(song.id, song.preview, game.duration);
    if (closed || finished) { if (ok) player.stop(); return; }
    if (!ok) {
      setDisc(false);
      clipError = player.lastError || "Couldn't load the clip. Check your connection and try again.";
      const e2 = scr.querySelector('.d-err'); if (e2) { e2.textContent = clipError; e2.style.opacity = 1; }
      return;
    }
    setDisc(true);
    animate();
  }

  function submit(c) {
    if (!game || game.status !== 'playing') return;
    startClock();
    sound.click();
    query = ''; picked = null; hits = [];
    let won;
    if (typeof c === 'string') {
      // A typed title: the best match decides, as on the phone (pool.search(t, limit: 1, artistBrowse: false)).
      const best = pool.search(c, 1, null, false)[0];
      won = game.matches(c) || (best ? game.matches(best) : false);
      if (won) game.guess(song); else game.guess(c);
    } else won = game.guess(c);
    if (won) { Haptics.success(); scr.querySelector('.field input')?.blur(); return settle(); }
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
    if (!game || game.status !== 'playing') return;
    if (picked) return submit(picked);
    if (query.trim()) return submit(query.trim());
    startClock();
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
    if (finished || record) return;
    finished = true; player.stop(); cancelAnimationFrame(raf);
    const ms = started ? Math.round(performance.now() - roundStart) : 0;
    record = { day, won, stage, ms, hints, songID: song?.id || null, seconds: game ? game.duration : null, at: new Date().toISOString(), demo: !!demo };
    resultDay = Daily.number();
    if (!demo) { Daily.save(record); account.recordDaily(day, won); }
    sound.reveal();
    if (won) Haptics.success(); else Haptics.loss();
    scr.querySelector('.field input')?.blur();
    renderResult(true);
    // The whole preview, to its end, under the result and the board.
    const s = song;
    setTimeout(() => { if (!closed && s && record) player.play(s.id, s.preview, 30); }, 300);
    // The result lands first, then both boards load, so neither shows you as not played yet.
    (demo ? Promise.resolve() : send(account, record)).then(() => loadBoards());
  }

  // ---------------------------------------------------------------- the board
  async function loadBoards() {
    if (closed) return;
    if (resultDemo || demo === 'play') { demoBoards(); return renderBoard(); }
    const d = day;
    board.loading = true; board.failed = false; renderBoard();
    try {
      const { data, error } = await supabase.rpc('daily_board', { p_day: d });
      if (error || !data) throw error || new Error('no board');
      const p = typeof data === 'string' ? JSON.parse(data) : data;
      // The server's order: who named it first, first. `me` is your place even below the hundred loaded.
      if (d === day) board = { loading: false, failed: false, rows: p.rows || [], players: p.players || 0, named: p.named || 0, myRank: p.me?.rank ?? null };
    } catch (e) { if (d === day) board = { ...board, loading: false, failed: true }; }
    if (!closed && d === day) renderBoard();
    try {
      if (account.user) {
        const { data, error } = await supabase.rpc('daily_friends', { p_day: d });
        if (!error && Array.isArray(data) && d === day) friends.rows = data;
      }
    } catch (e) {}
    if (d !== day) return;
    friends.loaded = true;
    if (!closed) renderBoard();
  }
  const myId = () => account.user?.id || (demo ? 'demo-me' : null);
  /** Friends on the board only once you have some; otherwise just everyone. */
  const hasFriends = () => friends.rows.length > 1;
  const myName = () => (account.name || '').trim();
  /** Your own line, from the record here. */
  function myRow() {
    const me = myId(); if (!record || !me) return null;
    return { user_id: me, display_name: myName() || 'You', avatar: account.avatar || null, stage: record.stage, won: record.won, ms: record.ms, hints: record.hints || 0, mine: true };
  }
  /**
   * The board with your own result in it, from the record here, only while the server doesn't have your go
   * yet: it just ended, so it goes after everyone who named it before you, among the ones who did the same.
   */
  function rowsWithMe(rows) {
    const mine = myRow();
    if (board.myRank != null || !mine || rows.some(r => r.user_id === mine.user_id)) return rows;
    const at = Daily.serverDate(record.at) ?? Date.now();
    let i = rows.findIndex(r => (mine.won !== r.won ? mine.won : (Daily.serverDate(r.at) ?? -Infinity) > at));
    if (i < 0) i = rows.length;
    return [...rows.slice(0, i), mine, ...rows.slice(i)];
  }
  /** Your place on today's board: the server's count, or where your result sits among the rows before the server has it. */
  function todayRank() {
    if (board.myRank != null) return board.myRank;
    const me = myId();
    if (!record || board.failed || !me || !(board.rows.length || board.players === 0)) return null;
    const i = rowsWithMe(board.rows).findIndex(r => r.user_id === me);
    return i < 0 ? null : i + 1;
  }
  /** The friends board with your own result in it, from the record when the server's copy hasn't landed — never "not yet" once played. */
  function friendsWithMe() {
    const me = myId(); if (!record || !me) return friends.rows;
    const rows = friends.rows.slice();
    const i = rows.findIndex(r => r.user_id === me);
    if (i >= 0) {
      if (rows[i].played) return rows;
      const o = rows[i];
      rows[i] = { ...o, played: true, won: record.won, stage: record.stage, ms: record.ms, hints: record.hints || 0, streak: Math.max(o.streak || 0, liveStreak()), at: null };
    } else if (rows.length) {
      rows.push({ user_id: me, display_name: myName(), avatar: account.avatar || null, played: true, won: record.won, stage: record.stage, ms: record.ms, hints: record.hints || 0, streak: liveStreak() });
    }
    return rows;
  }
  /** When a friend played today: the server's time, or now for your own go before the server has it. */
  function friendTime(r) {
    const d = Daily.serverDate(r.at); if (d != null) return d;
    if (r.user_id === myId()) return Daily.serverDate(record?.at) ?? Date.now();
    return Infinity;
  }
  /** Friends ranked the way the everyone board is: whoever named it first today first, then the misses, then who hasn't played. */
  const rankedFriends = () => friendsWithMe().sort((a, b) => (Number(b.played) - Number(a.played)) || (Number(b.won) - Number(a.won)) || (friendTime(a) - friendTime(b)) || (a.ms - b.ms));

  /** One line on either board: place, face, name (and the streak on the friends board), the hints taken, the stage's pill. No points, no time of day. */
  function lineHTML({ place, r, name, me, streak = 0, hints: h = 0, pill, lit, yet = false }) {
    return `<div class="d-row${me ? ' me' : ''}${yet ? ' yet' : ''}">
      <span class="pl${place != null && place <= 3 ? ' top' : ''}">${place ?? '–'}</span>
      ${faceHTML(r.avatar || null, r.user_id || '', 30)}
      <span class="nm">${esc(name)}</span>
      ${streak > 0 ? `<span class="fs">${I.flame}<b>${streak}</b></span>` : ''}
      <span class="rk-fill"></span>
      ${h > 0 ? `<span class="hb">${I.bulb.repeat(h)}</span>` : ''}
      <span class="pill-t${lit ? ' won' : ''}">${pill}</span>
    </div>`;
  }
  const shownName = (n, fallback) => ((n || '').trim() ? NameFilter.shown((n || '').trim()) : fallback);
  function rowHTML(r, place) {
    const me = r.user_id === myId();
    return lineHTML({ place, r, name: r.mine ? r.display_name : shownName(r.display_name, 'Someone'), me, hints: r.hints || 0,
      pill: r.won ? `in ${Daily.stageLabel(r.stage)}` : 'missed', lit: r.won });
  }
  function friendHTML(r, place) {
    const me = r.user_id === myId();
    return lineHTML({ place: r.played ? place : null, r, name: me ? 'You' : shownName(r.display_name, 'Player'), me, streak: r.streak || 0,
      hints: r.played ? (r.hints || 0) : 0, pill: !r.played ? 'not yet' : r.won ? `in ${Daily.stageLabel(r.stage)}` : 'missed',
      lit: r.played && r.won, yet: !r.played });
  }
  const gapHTML = '<div class="d-gap" aria-hidden="true">···</div>';
  const inviteHTML = () => `<div class="d-rule"></div><div class="d-invite">
      <p>Add friends to see how they did on their daily song, and keep an eye on their streaks.</p>
      <button class="d-invbtn" data-press data-act="invite">Invite a friend</button></div>`;
  function renderBoard() {
    const panelEl = scr.querySelector('.d-board'); if (!panelEl) return;
    const rank = scr.querySelector('[data-fig="rank"]');
    const tr = todayRank();
    if (rank) rank.textContent = tr != null ? `#${tr}` : '—';
    const everyone = showEveryone || !hasFriends();
    const tabs = hasFriends()
      ? `<span class="d-tabs"><button class="d-tab${everyone ? '' : ' on'}" data-press data-act="tab-friends">Friends</button><button class="d-tab${everyone ? ' on' : ''}" data-press data-act="tab-everyone">Everyone</button></span>`
      : '<span class="d-first">FIRST TODAY</span>';
    const played = friends.rows.filter(r => r.played).length;
    const count = everyone ? (board.players ? `${board.players.toLocaleString()} played · ${board.named.toLocaleString()} named` : '')
      : (friends.rows.length <= 1 ? '' : `${played} of ${friends.rows.length} played`);
    const head = `<div class="d-bhead">${tabs}<small>${count}</small></div>`;
    let body;
    if (!everyone) body = friends.loaded ? rankedFriends().map((r, k) => friendHTML(r, k + 1)).join('') : skeleton(3);
    else if (board.loading && !board.rows.length) body = skeleton(4);
    else if (board.failed) body = '<p class="d-bmsg">The board couldn\'t load. Check your connection.</p>';
    else {
      // The world's top ten today, the first to name it first; your own line under them, at your place, if you are further down.
      const all = rowsWithMe(board.rows), top = all.slice(0, 10), me = myId();
      body = top.map((r, k) => rowHTML(r, k + 1)).join('');
      if (me && !top.some(r => r.user_id === me)) {
        const i = all.findIndex(r => r.user_id === me);
        if (i >= 0) body += gapHTML + rowHTML(all[i], i + 1);
        else if (board.myRank != null && myRow()) body += gapHTML + rowHTML(myRow(), board.myRank);
      }
    }
    const rows = panelEl.querySelector('.d-bbody');
    rows.innerHTML = head + `<div class="d-brows">${body}</div>` + (friends.rows.length === 1 ? inviteHTML() : '');
  }
  /** SkeletonRows (Loading.swift): a face, two lines, a value, with a sweep of light. */
  const skeleton = n => `<div class="d-skel">${Array.from({ length: n }, (_, i) => `<div><i class="c"></i><span><i style="width:${[120, 96, 140, 110, 84][i % 5]}px"></i><i style="width:${[70, 90, 60, 80, 76][i % 5]}px"></i></span><i class="v"></i></div>`).join('')}</div>`;
  /** DailyBoard.demo / DailyFriendsBoard's demo rows, as the phone's -demoDailyBoard draws them. */
  function demoBoards() {
    const me = myId();
    const rows = DEMO_NAMES.map((n, i) => ({ user_id: `demo-${i}`, display_name: n, avatar: null, stage: Math.min(4, Math.floor(i / 3)), won: i < 8,
      ms: 1800 + i * 1400, hints: i === 4 ? 1 : 0, points: i < 8 ? 980 - i * 70 : 0, at: `2026-10-03T0${Math.floor(i / 3)}:${10 + i * 4}:00` }));
    const rankKnob = parseInt(q.get('dailyRank') || '', 10);
    board = demo === 'failed' ? { loading: false, failed: true, rows: [], players: 0, named: 0, myRank: null }
      : { loading: false, failed: false, rows, players: 2841, named: 2210, myRank: demo === 'board' ? (Number.isFinite(rankKnob) ? rankKnob : 3) : (Number.isFinite(rankKnob) ? rankKnob : null) };
    if (demo === 'alone' || demo === 'failed') { friends = { loaded: true, rows: [{ user_id: me, display_name: 'You', avatar: account.avatar || null, played: true, won: record?.won, stage: record?.stage ?? 5, ms: record?.ms ?? 0, hints: 0, streak: liveStreak(), at: null }] }; return; }
    friends = { loaded: true, rows: [['You', true, 1, 12], ['Mia', true, 0, 31], ['Noah', true, 2, 8], ['Liv', false, 5, 4], ['Theo', false, 5, 0]]
      .map((t, i) => ({ user_id: i === 0 ? me : `f${i}`, display_name: t[0], avatar: null, played: i < 4, won: t[1], stage: t[2], ms: 2000, hints: 0, streak: t[3], at: `2026-10-03T0${i}:1${i}:00` })) };
  }

  // ---------------------------------------------------------------- the result
  function figure(v, lab, lit = false) {
    return `<div class="d-fig${lit || v !== '0' ? '' : ' dim'}"><b${lab === 'Today' ? ' data-fig="rank"' : lab === 'Streak' ? ' data-fig="streak"' : ''}>${esc(v)}</b><span>${lab.toUpperCase()}</span></div>`;
  }
  function renderResult(fresh = false) {
    const r = record;
    const streak = liveStreak();
    const pts = Daily.points(r.stage, r.won, r.hints, r.ms);
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
    const sep = '<i class="d-figrule"></i>';
    scr.innerHTML = `${bar()}
      <div class="d-result">
        ${song && artwork ? `<img class="d-art" src="${esc(art(song.artwork, 400))}" alt="">` : ''}
        ${song ? `<h2>${esc(song.title)}</h2><div class="d-artist">${esc(song.artist)}</div>` : ''}
        <div class="d-stamp" style="--s:${state}">${r.won ? `NAMED AT ${Daily.clipLabel(r).toUpperCase()}` : 'MISSED IT'}${r.hints > 0 ? ` · ${r.hints} HINT${r.hints === 1 ? '' : 'S'}` : ''}</div>
        ${panelHTML(panel, 'd-figs', figure(String(pts), 'Points', r.won) + sep + figure(String(streak), 'Streak', streak > 0) + sep + figure('—', 'Today'), 18)}
        ${glossyHTML('Share', shareColours, 52, 'd-share', 'share', I.share)}
        ${restoreHTML()}
        <section class="d-board" aria-label="Today's board">
          <div class="d-bstrip" style="--purple0:${PanelColours.purple[0]};--purple1:${PanelColours.purple[1]};--purple2:${PanelColours.purple[2]}"><b>TODAY'S BOARD</b><img src="/app/img/games/set-icon-crown.webp" alt=""></div>
          <div class="d-bbody"></div>
        </section>
        <div class="d-next"></div>
      </div>`;
    renderBoard();
    countdown();
  }
  /**
   * A streak a miss or a skipped day just ended: premium brings it back, once a
   * week (Stats.restorableStreak). Everyone else sees what it would take.
   */
  function restoreHTML() {
    if (restored) return `<div class="d-restore done">${I.flame}<b>Streak restored: ${liveStreak()} days</b></div>`;
    const n = Streak.restorable(stats(), day);
    if (n == null) return '';
    const premium = !!ctx.premium;
    return `<button class="d-restore" data-press data-act="restore"><span class="fl">${I.flame}</span>
      <span class="tx"><b>Restore your ${n}-day streak</b><small>${premium ? 'Premium · once a week' : 'With Premium'}</small></span>
      <span class="go${premium ? ' on' : ''}">${premium ? '' : I.crown}Restore</span></button>`;
  }
  function restore() {
    sound.click();
    if (!ctx.premium) { close(); setTimeout(() => ctx.openPremium(null), 450); return; }
    // A demo result restores on this page only: nothing is saved.
    if (!demo) account.restoreStreak(day); else Streak.restore(stats(), day);
    Haptics.success();
    restored = true;
    const card = scr.querySelector('.d-restore');
    if (card) {
      const nu = el(restoreHTML()); card.replaceWith(nu);
      if (!still()) { const sp = spring(0.4, 0.75); nu.animate([{ transform: 'scale(.95)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: sp.ms, easing: sp.easing }); }
    }
    const fig = scr.querySelector('[data-fig="streak"]'), live = liveStreak();
    if (fig) { fig.textContent = live; fig.parentElement.classList.toggle('dim', live === 0); }
  }
  function countdown() {
    const t = scr.querySelector('.d-next'); if (t) t.textContent = `Next song in ${Daily.clock(Daily.secondsToNext())}`;
  }
  /** Every second: the countdown, and when the song turns over under the result, on to the new one (DailyView.tick). */
  function tick() {
    if (closed || !record) return;
    if (!resultDemo && Daily.number() !== resultDay) {
      player.stop(); cancelAnimationFrame(raf);
      day = Daily.number(); resultDay = day;
      record = null; song = null; game = null; started = false; finished = false;
      secondChance = false; restored = false; showEveryone = false; query = ''; picked = null;
      start();
      return;
    }
    countdown();
  }

  // ---------------------------------------------------------------- open, close
  function close() {
    if (closed) return;
    closed = true; player.stop(); cancelAnimationFrame(raf); clearInterval(tickTimer); clearTimeout(toastTimer); back?.destroy?.();
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
  const tryClose = () => { sound.click(); if (leaving()) return askLeave(); close(); };

  const onTop = () => { const host = document.getElementById('views'); return !host || host.lastElementChild === node; };
  function onKey(e) {
    if (!onTop()) return;
    if (e.key === 'Escape') { if (e.target.tagName === 'INPUT' && query) { query = ''; picked = null; e.target.value = ''; setSkip(); refreshHits(); return; } e.preventDefault(); return tryClose(); }
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON' && !record) { e.preventDefault(); play(); }
  }

  // The disc answers on touch-down, not on release, as on the stage: in a 0.1 s clip the press is the moment.
  // The click of that same press is swallowed; a keyboard press (Enter/Space on the button) still comes as a click.
  node.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.target.closest('[data-act="play"]')) return;
    discDownAt = performance.now(); play();
  });
  node.addEventListener('click', e => {
    const t = e.target;
    const hit = t.closest('.hit');
    // DailyView: a tap on a suggestion is the guess (.onTapGesture { submit(song: s) }).
    if (hit) { const s2 = hits[+hit.dataset.i]; scr.querySelector('.field input')?.blur(); showHits(scr.querySelector('.hits'), false); if (s2) submit(s2); return; }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'close') return tryClose();
    if (act === 'play') { if (performance.now() - discDownAt < 1500) return; return play(); }
    if (act === 'skip') return skip();
    if (act === 'share') { sound.click(); return shareText(Daily.shareText(record)); }
    if (act === 'invite') { sound.click(); return shareText(`Play the Songspot daily with me 🎧\n${LINKS.go}`); }
    if (act === 'restore') return restore();
    if (act === 'tab-friends' || act === 'tab-everyone') { sound.click(); Haptics.select(); showEveryone = act === 'tab-everyone'; return renderBoard(); }
    if (act === 'answer') { if (adBusy) return; sound.click(); secondChance = false; return finish(false, 5); }
    if (act === 'watch') {
      if (adBusy) return;
      sound.click(); player.stop();                    // never under the ad
      const offer = secondChance;
      if (!offer || !offer.show) { secondChance = false; return finish(false, 5); }
      adBusy = true; scr.querySelectorAll('.offer button').forEach(b => { b.disabled = true; });
      const adStart = performance.now();
      offer.show().then(rewarded => {
        adBusy = false; secondChance = false;
        if (rewarded && game.status === 'lost') {
          // The ad's own length is not time spent on the answer.
          if (started) roundStart += performance.now() - adStart;
          game.revive(5); updateRound(); swapGuessRow(false); showToast('Five more seconds. Same song.'); play();
        } else if (game.status === 'lost') finish(false, 5);
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

  /** A fresh round on today's song (DailyView.begin). */
  function begin() {
    if (!song) return;
    game = new Game(pool);
    game.lastStageExtra = ctx.premium ? 5 : 0;           // premium hears 20 s on the last stage
    game.newRound(song);
    query = ''; picked = null; hits = []; clipError = null; hints = 0; started = false;
    renderRound();
  }
  function notFound() {
    scr.innerHTML = `${bar()}<div class="d-round">${badgeHTML()}<div class="d-err">Today's song couldn't be found. Try again later.</div></div>`;
  }

  /** DailyView.start: today's result if it's played, else the round on the server's song (a spinner until it answers). */
  function start() {
    board = { loading: true, failed: false, rows: [], players: 0, named: 0, myRank: null };
    friends = { loaded: false, rows: [] };
    const forced = local && q.get('dailySong') ? pool.byId.get(q.get('dailySong')) : null;
    record = resultDemo ? null : Daily.todayRecord();
    if (record) {
      // The song this go was played on, whatever the day's song reads as now.
      song = (record.songID && pool.byId.get(record.songID)) || Daily.song(pool, day);
      // A round cut short (the page closed mid-way) left its miss here but never counted it: count it now.
      if (!demo && (account.stats?.lastDaily || 0) !== day) account.recordDaily(day, record.won);
    } else song = Daily.serverSong(pool, day);
    if (forced) song = forced;
    if (resultDemo) {
      if (!song) song = Daily.song(pool, day);
      const won = demo !== 'missed';
      record = demo === 'board' ? { day, won: true, stage: 1, ms: 2400, hints: 0, songID: song?.id, demo: true }
        : { day, won, stage: won ? 2 : 5, ms: 14200, hints: 0, songID: song?.id, seconds: won ? 2 : 15, demo: true };
      if (demo === 'board') demoStats = { ...(account.stats || {}), dailyStreak: 12, lastDaily: day };
    }
    if (demo === 'fetching') song = null;
    if (record) { finished = true; renderResult(); }
    else if (song) begin();
    else { fetchingSong = true; renderRound(); }
    // Sent again on every open with today played: a round played as a guest, or on an account since switched,
    // would otherwise read "not yet" on the friends board. A repeat is a 409. Then both boards load.
    const played = record && !record.demo ? record : null;
    if (record) (played ? send(account, played) : Promise.resolve()).then(() => loadBoards());
    if (song) player.prepare(song.id, song.preview).catch(() => {});
    if (record || demo === 'fetching') return;
    // Everyone gets the server's song for the day. Still waiting for it: deal it the moment it lands, or this
    // browser's own pick only if the server can't be reached. Already dealt: swap in a different one while the
    // round hasn't started.
    const d = day;
    Daily.syncSong(pool, d).then(s => {
      if (closed || day !== d || record || started || forced) return;
      if (fetchingSong) { fetchingSong = false; song = s || Daily.song(pool, d); if (!song) return notFound(); }
      else if (s && s.id !== song?.id) song = s;
      else return;
      begin();
      player.prepare(song.id, song.preview).catch(() => {});
    });
  }

  start();
  tickTimer = setInterval(tick, 1000);
  pushView(node);
  return { close };
}

// ---------------------------------------------------------------- pieces

/** The iOS large ProgressView: twelve spokes turning in steps, in the disc's ink. */
const SPINNER = `<span class="d-spinner" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="transform:rotate(${i * 30}deg);opacity:${(0.25 + 0.75 * ((12 - i) % 12) / 11).toFixed(2)}"></i>`).join('')}</span>`;
/** A glossy colour panel (SettingsKit panelBackground) around `inner`. */
function panelHTML(colours, cls, inner, radius = 20) {
  return `<div${dressAttr(colours, { radius, cls })}>${inner}</div>`;
}
/** SettingsKit GlossyLabel (the title in black italic capitals), the icon at the leading edge, 20 in. */
function glossyHTML(title, colours, height, cls, act, icon) {
  return `<button class="${cls}" data-press data-act="${act}" aria-label="${esc(title)}">${glossy({ title: title.toUpperCase(), colours, height, tag: 'span' })}<span class="d-gicon">${icon}</span></button>`;
}
