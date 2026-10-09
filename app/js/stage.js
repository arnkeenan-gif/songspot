// The stage: the solo game, StageView.swift on the web. The floating corner
// row (menu, clean-display eye, streak flame, Premium), the faint wordmark,
// the filter line over the era reel, the difficulty pills, the clip timeline,
// the play disc, the guess row, and the reveal when the round ends. Phone
// metrics below 600px, the app's own big-screen metrics (a 400/520 column)
// above. The bottom keeps the tab bar's room (html.tabbar-room), so nothing
// moves when the bar steps aside for the clip, the confetti or a lost card.
import { TIERS, ERAS, STAGES, eraLabel, byline, setSeasonGenres } from './pool.js';
import { Game } from './game.js';
import { toast, TIER_COLOR, TIER_INK, PILL_FILL, cap, label, esc, art, settings, viewsOpen, morph, mix, LevelTheme, rgbOf } from './ui.js';
import * as Win from './win.js';
import { spring, still } from './motion.js';
import { I, SF } from './icons.js';
import { confetti } from './confetti.js';
import { Haptics } from './haptics.js';
import { shareSolo } from './share.js';
import { normalise } from './matcher.js';
import { searchSongs } from './itunes.js';
import { albumDisplayName } from './albumcatalog.js';
import { syncFlame } from './streakflame.js';
import { openSongSaver } from './songsaver.js';
import { Splash } from './wordmark.js';
import { Season, Weather, mountSnowfall } from './season.js';

// The stage's own stylesheet, fetched as soon as the module is (in parallel with the pool).
try { if (!document.getElementById('css-stage')) { const l = document.createElement('link'); l.id = 'css-stage'; l.rel = 'stylesheet'; l.href = '/app/css/stage.css?v=1'; document.head.appendChild(l); } } catch (e) {}
setSeasonGenres(Season);
// The opening name types itself from the first frame, while the pool loads (the module is fetched first).
Splash.start();

const STAGE_POS = [1.0, 5.5, 24.3, 41.3, 100.0];     // where the fill sits at each stage, in percent
/** Premium's extra 20 s stage: 15 s stops short of the end so the last skip still has room. */
const STAGE_POS_EXTRA = [1.0, 5.5, 24.3, 41.3, 41.3 / 8 * 15, 100.0];
const SLOT = 58;                                       // the reel's slot width
const AD_EVERY = 5;
const FADE_FROM = 3.4 * 0.66;                          // Piece.fadeFrom: the confetti starts to thin
const barRate = st => { const i = Math.min(st, 3); return STAGE_POS[i] / STAGES[i]; };
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const PLUS = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>';

export function mountStage(root, ctx) {
  const { game, pool, player, sound, account, ads } = ctx;
  // A cold launch opens on Easy, any era, all genres: the round's filters live in memory only
  // (Settings.rememberRound); what older builds stored is forgotten (forgetStoredRound).
  game.difficulty = 'easy'; game.era = 'all'; game.category = 'all'; game.artist = null; game.album = null;
  for (const k of ['difficulty', 'era', 'category', 'artist']) settings.del(k);
  let pendingPromotion = null, rerolls = 3, failed = 0;
  let query = '', picked = null, hits = [], activeHit = -1, catalogHits = [], catalogTimer = 0, catalogSeq = 0;
  let phase = 'play';            // play | offer | winning | reveal
  let hintUsed = false, secondChance = null, adBusy = false, looking = false, lookUntil = 0, raf = 0, spin = null, drag = null;
  let lift = 0, wasPremium = null;
  // [tabs] iOS Settings.spotlight defaults to "off" (the menu's switch reads the same)
  const S = k => settings.get(k, { easySearch: true, glow: false, artwork: true, motion: true, haptics: true, hint: false, sounds: true, volume: 0.28, spotlight: 'off', cleanDisplay: false }[k]);
  const away = (reason, on) => ctx.tabs?.setAway?.(reason, on);
  /** Home is what the player is looking at: no tab page, no mode or sheet over it. */
  const homeInFront = () => (!ctx.tabs || ctx.tabs.current === 'home') && !viewsOpen();

  root.innerHTML = `<div class="stage"><div class="col"></div></div>
    <div class="corner-row">
      <button class="corner menu-btn" data-press aria-label="Menu">${I.menu}</button>
      <button class="eye-btn" data-press aria-label="Clean display"><span>${SF['eye.slash']}</span></button>
      <span class="row-fill"></span>
      <div class="flame-host"></div>
      <button class="corner crown-btn" data-press hidden>${I.crown}<span>Premium</span></button>
    </div>`;
  const col = root.querySelector('.col'), row = root.querySelector('.corner-row');
  const menuBtn = row.querySelector('.menu-btn'), eyeBtn = row.querySelector('.eye-btn'), crownBtn = row.querySelector('.crown-btn'), flameHost = row.querySelector('.flame-host');
  const accent = () => TIER_COLOR[game.difficulty], ink = () => TIER_INK[game.difficulty];

  // The season's weather, far behind the stage (snow while the Christmas genre is in play).
  let snow = null;
  const syncSnow = () => {
    if (Weather.snowing && !snow) { const host = document.createElement('div'); host.className = 'stage-snow'; document.body.insertBefore(host, document.querySelector('.cone') || document.getElementById('app')); snow = { host, s: mountSnowfall(host) }; }
    else if (!Weather.snowing && snow) { snow.s?.destroy?.(); snow.host.remove(); snow = null; }
  };
  addEventListener('songspot:weather', syncSnow); addEventListener('songspot:season', () => { pool.clearCounts?.(); syncSnow(); render(); });

  function applyLook() {
    const r = document.documentElement.style;
    r.setProperty('--accent', accent()); r.setProperty('--accent-ink', ink());
    document.body.classList.toggle('spot', S('spotlight') !== 'off');
    document.body.classList.toggle('noglow', !S('glow'));
    document.body.classList.toggle('nomotion', !S('motion'));
    LevelTheme.stageTier === game.difficulty ? LevelTheme.apply() : LevelTheme.setStage(game.difficulty);
    ctx.tabs?.setTier?.(game.difficulty);
    const clean = S('cleanDisplay');
    crownBtn.hidden = ctx.premium || clean;
    menuBtn.hidden = clean;
    eyeBtn.classList.toggle('on', clean);
    eyeBtn.firstElementChild.innerHTML = clean ? SF.eye : SF['eye.slash'];
    eyeBtn.setAttribute('aria-label', clean ? 'Show everything' : 'Clean display');
    row.classList.toggle('lifted', lift > 0);
    syncFlame(flameHost, account.stats?.streak || 0, game.status === 'won');
    sound.enabled = S('sounds'); player.setVolume(S('volume'));
    // Premium gets one more skip after 15 s: a 20 s stage. The old +5 on the last stage is the daily's alone now.
    game.extraStage = !!ctx.premium; game.lastStageExtra = 0;
    // A remembered artist or album comes off when premium lapses.
    if (wasPremium === true && !ctx.premium && game.narrowed) { wasPremium = false; game.artist = null; game.album = null; game.setArtistSongs([]); setTimeout(newRound, 0); }
    wasPremium = !!ctx.premium;
    paintLight();
  }
  addEventListener('resize', () => { paintLight(); measureLift(); });

  // ---------- render ----------
  function counts() {
    if (game.narrowed && game.artistSongs.length) { const own = game.artistCounts(); return Object.fromEntries(TIERS.map(t => [t, Math.max(1, own[t] || 0)])); }
    return pool.counts(game.era, game.category, game.artist);
  }
  /** `tier`, or the first level after it that has songs: the ladder steps over a dead pill. */
  function playable(tier, c = counts()) { let t = tier, hops = 0; while ((c[t] ?? 1) === 0 && hops < TIERS.length - 1) { t = Game.nextTier(t); hops++; } return t; }

  function render() {
    applyLook();
    const s = game.song;
    const offering = phase === 'offer';
    const playing = phase === 'play' || offering;
    const head = `<div class="wordmark">songspot</div>${filterLineHTML(playing)}`;
    // The 20fps capture cuts the controls in a single frame when the round
    // ends — no fade — and the card only arrives at the payoff.
    if (phase === 'reveal' && s) { morph(col, `${head}${revealHTML(s)}`); return; }
    if (phase === 'winning') { morph(col, head); return; }
    const c = counts();
    morph(col, `${head}
      <div class="play-ui" data-k="play">
        <div class="reel-wrap"><span class="caret">${I.caretDown}</span><div class="reel" data-act="reel" role="button" aria-label="Era: ${esc(eraLabel(game.narrowed ? 'all' : game.era))}. Tap to spin"><div class="rs" data-keep><div class="row"></div></div></div></div>
        <div class="pills" role="radiogroup" aria-label="Difficulty">${TIERS.map(t => `<button class="pill ${t === game.difficulty ? 'on' : ''} ${c[t] === 0 ? 'dead' : ''}" style="--c:${PILL_FILL[t]}" data-tier="${t}" role="radio" aria-checked="${t === game.difficulty}" aria-label="${cap(t)} difficulty">${cap(t)}</button>`).join('')}</div>
        ${timelineHTML()}
        <div class="playrow ${looking ? 'playing' : ''}">
          <button class="disc" data-act="play" aria-label="${looking ? 'Stop' : 'Play the clip'}">${looking ? I.pause : `<span class="play-g">${I.play}</span>`}<span class="ring"></span><svg class="sweep" viewBox="0 0 125.12 125.12"><circle cx="62.56" cy="62.56" r="61.47" pathLength="1" stroke-dasharray="0 1"/></svg></button>
          <span class="seconds">${label(game.duration)}</span>
        </div>
        ${offering ? offerHTML() : guessHTML()}
      </div>`);
    if (!spin && !drag) placeReel(game.narrowed ? 0 : ERAS.indexOf(game.era), 0);
    if (phase === 'play') refreshHits();
  }
  /** What the songs are narrowed to: the name as plain text over the era wheel, and a cross. */
  function filterLineHTML(playing) {
    const items = [];
    if (game.category !== 'all') items.push(['genre', 'Genre', game.category]);
    if (game.artist) items.push(['artist', 'Artist', game.artist]);
    if (game.album) items.push(['album', 'Album', albumDisplayName(game.album.name)]);
    const on = items.length > 0;
    return `<div class="stfilters ${on ? 'on' : ''} ${playing ? '' : 'idle'}" data-k="filters"><div class="stfl">${items.map(([k, kind, name]) =>
      `<span class="fitem" data-k="f-${k}"><button class="fname" data-press data-filter="${k}" aria-label="${esc(kind)}: ${esc(name)}. Change">${esc(name)}</button><button class="fx" data-press data-clear="${k}" aria-label="Play everything">${I.x}</button></span>`).join('')}</div></div>`;
  }
  const reelRow = (from, base) => { let h = ''; for (let o = -4; o <= 4; o++) { const i = (((from + base + o) % ERAS.length) + ERAS.length) % ERAS.length; h += `<span data-o="${o}">${eraLabel(ERAS[i])}</span>`; } return h; };
  /** pos: slots from the centre (fractional while spinning or dragging). */
  function placeReel(from, pos) {
    const r = col.querySelector('.reel .row'); if (!r) return;
    const base = Math.floor(pos), frac = pos - base;
    if (r.dataset.rk !== `${from}|${base}`) { r.innerHTML = reelRow(from, base); r.dataset.rk = `${from}|${base}`; }
    r.style.transform = `translateX(${-SLOT * 4.5 - frac * SLOT}px)`;
    r.querySelectorAll('span').forEach(sp => { const d = Math.min(1, Math.abs(+sp.dataset.o - frac)); sp.style.opacity = (0.26 + 0.36 * (1 - d)).toFixed(3); });
  }
  const barPos = () => { const pos = game.extraStage ? STAGE_POS_EXTRA : STAGE_POS; return pos[Math.min(game.stage, pos.length - 1)]; };
  function timelineHTML() {
    const st = game.stage, scale = barRate(st), at0 = barPos();
    let marks = STAGES.slice(0, 4).map((t, i) => { const at = Math.min(100, scale * t); return i !== st && at <= 45 ? `<div class="mark" data-k="m${i}" style="left:${at}%"></div>` : ''; }).join('');
    // Premium's extra skip: 15 s is a step of its own then, so it gets the same line.
    if (game.extraStage && st !== 4) { const at = scale * STAGES[4]; if (at < 100) marks += `<div class="mark" data-k="m4" style="left:${at}%"></div>`; }
    return `<div class="timeline" aria-label="Clip length ${label(game.duration)}"><div class="track"><div class="fill" style="width:${at0}%"></div><div class="live"></div>${marks}</div>
      <div class="marker" style="left:${at0}%"><span class="caret">${I.caretUp}</span><b>${label(game.duration)}</b></div></div>`;
  }
  function guessHTML() {
    const armed = !!picked, last = game.isLastStage;
    return `<div class="guessrow" data-k="guess"><div class="keys">
        <label class="field">${I.search}<input type="text" placeholder="Name that track" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" value="${esc(query)}" aria-label="Name that track"></label>
        ${S('hint') && !game.isOver ? `<button class="key hintkey ${hintUsed ? 'used' : ''}" data-press data-act="hint" aria-label="${hintUsed ? 'Hint used' : 'Hint: the artist'}">${hintUsed ? I.bulbOff : I.bulb}</button>` : ''}
        <button class="key skip ${armed ? 'armed' : ''}" data-press data-act="skip">${armed ? 'Guess' : `${last ? I.flag : I.skip}${last ? 'Give up' : 'Skip'}`}</button>
      </div><div class="hits" hidden role="listbox"></div></div>`;
  }
  const offerHTML = () => `<div class="offer" data-k="offer"><div class="k">OUT OF GUESSES</div><div class="keys">
      <button class="watch" data-press data-act="watch" ${adBusy ? 'disabled' : ''}>${I.adPlay}<span>Watch an ad, hear 5 more seconds</span></button>
      <button class="key answer" data-press data-act="answer" ${adBusy ? 'disabled' : ''}>Answer</button></div></div>`;
  function revealHTML(s) {
    const won = game.status === 'won';
    return `<div class="reveal" data-k="reveal-${esc(s.id)}-${game.status}" style="--state:${won ? accent() : '#f8545c'}">
      ${S('artwork') && s.artwork ? `<div class="art" ${s.url ? `data-act="cover" role="link" tabindex="0" aria-label="${esc(s.title)}" title="Opens the song in Apple Music"` : ''}><img class="bloom" src="${esc(art(s.artwork, 60))}" alt=""><img class="cover" src="${esc(art(s.artwork, 400))}" alt=""></div>` : ''}
      ${won ? '' : '<div class="itwas rise" style="animation-delay:.035s">IT WAS_</div>'}
      <h2 class="rise" style="animation-delay:.047s">${esc(s.title)}</h2>
      <div class="meta rise" style="animation-delay:.082s">${esc([s.artist, s.album].filter(Boolean).join(' · '))}</div>
      ${s.url ? `<button class="saveit rise" style="animation-delay:.118s" data-press data-act="save">${PLUS}<span>Add to playlist</span></button>` : ''}
      <div class="badge">${won ? `GUESSED IN ${label(game.duration).toUpperCase()}!` : 'LOST!'}</div>
      <div class="actions rise" style="animation-delay:.276s"><button class="share" data-press data-act="share">${I.share}Challenge your friend</button><button class="next" data-press data-act="next">Next</button></div>
    </div>`;
  }

  // ---------- suggestions ----------
  const pickLabel = s => `${s.title} — ${s.artist}`;
  function suggestions() {
    const typed = query.trim();
    if (!typed) return [];
    if (picked && typed === pickLabel(picked)) return [];
    // Easy search only lists the songs in play, so one letter would hand over a shortlist of the answers.
    if (S('easySearch') && !game.artistSongs.length && [...typed].length < 2) return [];
    // Artist and album mode search their own index; the list is never trimmed.
    if (game.artistSongs.length) return pool.searchWithin(game.artistSongs, typed, 8);
    let scope = null;
    if (S('easySearch')) {
      scope = pool.filter(game.difficulty, game.era, game.category, game.artist);
      if (game.song && !scope.some(x => x.id === game.song.id)) scope.push(game.song);
    }
    // One row per song, keyed on the artist and on the byline.
    const seen = new Set();
    const fresh = s => { const keys = [s.artist, byline(s)].map(a => `${normalise(s.title)}|${normalise(a)}`); const ok = !keys.some(k => seen.has(k)); keys.forEach(k => seen.add(k)); return ok; };
    const out = pool.search(typed, 8, scope).filter(fresh);
    if (S('easySearch') || out.length >= 5) return out;
    for (const r of catalogHits) { if (fresh(r)) out.push(r); if (out.length >= 8) break; }
    return out;
  }
  function refreshHits() {
    const box = col.querySelector('.hits'); if (!box) return;
    hits = phase === 'play' ? suggestions() : []; activeHit = -1;
    box.innerHTML = hits.map((h, i) => `<div class="hit" role="option" data-i="${i}"><b>${esc(h.title)}</b><span>${esc(byline(h))}</span></div>`).join('');
    box.hidden = hits.length === 0;
  }
  /** Easy search off: the whole catalogue too, debounced 220 ms; a stale answer never replaces a newer one. */
  function catalogSearch(q) {
    clearTimeout(catalogTimer); const my = ++catalogSeq;
    if (!q.trim()) { catalogHits = []; return; }
    catalogTimer = setTimeout(async () => { const r = await searchSongs(q.trim()); if (my !== catalogSeq) return; if (r) catalogHits = r; refreshHits(); }, 220);
  }
  function setArmed() {
    const sk = col.querySelector('.skip'); if (!sk) return;
    const last = game.isLastStage;
    sk.className = 'key skip' + (picked ? ' armed' : '');
    sk.innerHTML = picked ? 'Guess' : `${last ? I.flag : I.skip}${last ? 'Give up' : 'Skip'}`;
  }
  const resetGuess = () => { query = ''; picked = null; hits = []; catalogHits = []; catalogSeq++; clearTimeout(catalogTimer); };

  // ---------- the keyboard: the stage rises only as far as the guess bar needs ----------
  function measureLift() {
    const inp = col.querySelector('.guessrow input'), vv = window.visualViewport;
    let next = 0;
    if (inp && document.activeElement === inp && vv && matchMedia('(pointer: coarse)').matches && homeInFront()) {
      const keysTop = vv.offsetTop + vv.height;
      if (innerHeight - keysTop > 80) {
        const bottom = col.querySelector('.guessrow').getBoundingClientRect().bottom + lift;   // as laid out, without the lift
        next = Math.max(0, bottom + 10 - keysTop);
      }
    }
    if (Math.abs(next - lift) < 0.5) return;
    lift = next;
    col.style.transform = lift ? `translateY(${-lift}px)` : '';
    row.classList.toggle('lifted', lift > 0);
  }
  window.visualViewport?.addEventListener('resize', measureLift);
  window.visualViewport?.addEventListener('scroll', measureLift);
  col.addEventListener('focusin', e => { if (e.target.tagName === 'INPUT') setTimeout(measureLift, 60); });
  col.addEventListener('focusout', e => { if (e.target.tagName === 'INPUT') setTimeout(measureLift, 60); });

  // ---------- the clip ----------
  function setLook(on) {
    if (looking !== on) away('clip', on && !game.isOver);
    looking = on;
    const pr = col.querySelector('.playrow'), disc = col.querySelector('.disc');
    if (!pr || !disc) return;
    pr.classList.toggle('playing', on);
    disc.firstElementChild.outerHTML = on ? I.pause : `<span class="play-g">${I.play}</span>`;
    disc.setAttribute('aria-label', on ? 'Stop' : 'Play the clip');
    if (!on) { const live = col.querySelector('.live'); if (live) live.style.width = '0%'; const c = col.querySelector('.sweep circle'); if (c) c.setAttribute('stroke-dasharray', '0 1'); }
  }
  function tick() {
    cancelAnimationFrame(raf);
    const step = () => {
      const on = player.playing || !!player.pending || performance.now() < lookUntil;
      if (!on || phase !== 'play' && phase !== 'offer') { setLook(false); return; }
      if (!looking) setLook(true);
      const e = player.elapsed, d = game.duration;
      const live = col.querySelector('.live'); if (live) live.style.width = Math.min(100, barRate(game.stage) * e) + '%';
      const c = col.querySelector('.sweep circle'); if (c) { const p = Math.min(1, e / d); c.setAttribute('stroke-dasharray', `${p} 1`); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  async function play() {
    const s = game.song;
    if (!s) return toast('No songs match these filters. Change the difficulty, era or genre.', 5);
    if (ads.showing) return;
    // A press stops only a clip that is sounding or loading. The playing look lingers
    // half a second after a 0.1 s clip ends; a press then plays it again at once.
    if (player.playing || player.pending) { Haptics.press(0.45); stopLook(); return; }
    Haptics.press(0.8);
    lookUntil = performance.now() + 500; setLook(true); tick();
    const ok = await player.play(s.id, s.preview, game.duration);
    if (game.song !== s) return;
    if (!ok && !player.lastError) return;          // stopped while it was still loading: nothing to say
    if (!ok) {
      stopLook(); failed += 1;
      if (failed >= 2 && rerolls > 0) { failed = 0; rerolls -= 1; toast("That track wouldn't load. Here's another.", 3.5); return newRound(); }
      return toast(player.lastError || "Couldn't load the clip.");
    }
    failed = 0; rerolls = 3;
    lookUntil = performance.now() + 500;
    // Stopped, skipped or answered while it was loading: never show a playing look for a finished round.
    if (phase !== 'play' && phase !== 'offer') { stopLook(); return; }
    tick();
  }
  function stopLook() { player.stop(); lookUntil = 0; cancelAnimationFrame(raf); setLook(false); }

  // ---------- rounds ----------
  let awayTimers = [];
  const clearAway = () => { awayTimers.forEach(clearTimeout); awayTimers = []; away('confetti', false); away('reveal', false); };
  async function newRound() {
    const wasOver = game.isOver;
    if (secondChance && game.status === 'lost') settle();
    secondChance = null; adBusy = false; hintUsed = false; stopLook();
    resetGuess(); phase = 'play';
    endLight(); clearAway();
    // Counted for the filters this round is dealt under, before the promotion reads them.
    if (pendingPromotion) { game.difficulty = playable(pendingPromotion); pendingPromotion = null; }
    // One break per five finished rounds, only at a real round boundary, only with Home in front and no picker open.
    if (settings.get('roundsSinceAd', 0) >= AD_EVERY && wasOver) {
      if (ctx.premium) settings.set('roundsSinceAd', 0);
      else if (ads.available && homeInFront() && !document.querySelector('.view.picker')) {
        settings.set('roundsSinceAd', 0);
        const shown = await ads.interstitial('round-break');
        if (shown && !ctx.premium) setTimeout(() => toast('Premium skips these.', 4), 400);
      }
    }
    const s = game.newRound();
    Weather.update(game.category);
    render();
    if (!s) return toast(game.artist ? `No ${game.difficulty} songs for ${game.artist}. Try another difficulty.`
      : game.album ? `No songs from ${albumDisplayName(game.album.name)} could be loaded. Pick it again.`
      : `Nothing matches ${game.difficulty} + that era and category. Loosen a filter.`, 3.6);
    for (const size of [400, 60]) if (s.artwork) { const im = new Image(); im.src = art(s.artwork, size); }
    prime(s);
  }
  /** StageView.prime(): this round's clip ready as soon as it is dealt, then the next one at the
   *  level Next will deal (every finished round promotes), up to three draws. A clip that will
   *  not load is swapped for another before anyone presses play — silently. */
  async function prime(s = game.song) {
    if (!s) return;
    let ok = true;
    try { await player.prepare(s.id, s.preview); } catch (e) { ok = false; }
    if (game.song !== s) return;
    if (!ok) {
      if (!looking && !player.pending && !player.playing && phase === 'play' && game.stage === 0 && rerolls > 0) { rerolls -= 1; newRound(); }
      return;
    }
    rerolls = 3;
    // A cold launch opens on Easy with no filters: remember an opener drawn under those, from such a round.
    const plain = game.era === 'all' && game.category === 'all' && !game.narrowed;
    const opener = game.difficulty === 'easy' && plain ? game.drawUpcoming('easy') : null;
    const level = playable(Game.nextTier(game.difficulty));
    for (let i = 0; i < 3; i++) {
      const n = game.drawUpcoming(level); if (!n) break;
      try { await player.prepare(n.id, n.preview); break; } catch (e) { if (game.song !== s) return; }
    }
    if (opener && game.song === s && opener.preview) { settings.set('nextID', opener.id); settings.set('nextKey', game.filterKeyFor('easy')); }
  }
  /** A finished round, counted once. */
  function settle() {
    settings.set('roundsSinceAd', settings.get('roundsSinceAd', 0) + 1);
    settings.set('roundsTotal', settings.get('roundsTotal', 0) + 1);
    account.recordRound(game.status === 'won', game.stage, game.difficulty);
    pendingPromotion = Game.nextTier(game.difficulty);
  }
  // ---------- the light ----------
  // WinSequence: the win clock runs at Win.SPEED, holds at 2.0 (the beam keeps
  // its last glow until the next round), and drives the cone's width, glow,
  // sway and tilt plus the travelling light. With the spotlight off the light
  // sweeps the full width as a soft band instead (StageView.bareWave).
  const cone = document.querySelector('.cone'), coneI = cone?.querySelector('i');
  let winRaf = 0, winT = null, lamp = 1, lampTimers = [];
  function paintLight() {
    const spot = S('spotlight') !== 'off', t = winT;
    const narrow = !document.documentElement.classList.contains('wide'), foot = narrow ? 0.52 : 0.5;
    const r = t == null ? 1 : Win.ratio(t), gl = t == null ? 0 : Win.glow(t);
    const w = t == null || !S('motion') ? null : Win.wave(t, Win.payoff(game.isLastStage));
    const tint = mix(accent(), '#edf2ee', 0.64);
    if (coneI) {
      coneI.style.clipPath = `polygon(${(50 - 30 * r).toFixed(3)}% 0, ${(50 + 30 * r).toFixed(3)}% 0, ${(50 + foot * 100 * r).toFixed(3)}% 100%, ${(50 - foot * 100 * r).toFixed(3)}% 100%)`;
      coneI.style.backgroundColor = gl ? `rgb(${rgbOf(LevelTheme.stage()).map(v => Math.min(255, Math.round(v + gl * 255))).join(',')})` : '';
      cone.style.transform = t == null ? '' : `translateX(-50%) translateX(${Win.sway(t).toFixed(2)}px) rotate(${Win.tilt(t).toFixed(3)}deg)`;
      cone.style.opacity = lamp === 1 ? '' : lamp;
      let sw = coneI.querySelector('.sweep');
      if (spot && w && w.opacity > 0) {
        if (!sw) { sw = document.createElement('b'); sw.className = 'sweep'; coneI.appendChild(sw); }
        const hSpot = innerHeight + 96, hSweep = hSpot * 1.2, band = hSweep * 0.42, top = -0.08 * hSpot + w.offset * (hSweep - band);
        const c = a => `color-mix(in srgb, ${tint} ${(a * 100).toFixed(2)}%, transparent)`;
        sw.style.cssText = `height:${band}px;top:${top}px;opacity:${w.opacity};transform:scaleX(${w.scaleX});background:linear-gradient(${c(0)},${c(0.28 * 0.17)} 16%,${c(0.17)} 42%,${c(0.17)} 58%,${c(0.30 * 0.17)} 82%,${c(0)})`;
      } else if (sw) sw.remove();
    }
    let bw = document.querySelector('.bare-wave');
    if (!spot && w && w.opacity > 0) {
      if (!bw) { bw = document.createElement('div'); bw.className = 'bare-wave'; document.body.insertBefore(bw, document.getElementById('app')); }
      const hSpot = innerHeight + 96, hSweep = hSpot * 1.2, band = hSweep * 0.42, top = -0.08 * hSpot + w.offset * (hSweep - band);
      const c = a => `color-mix(in srgb, ${tint} ${(a * 100).toFixed(2)}%, transparent)`;
      bw.style.cssText = `height:${band}px;top:${top}px;opacity:${w.opacity};background:linear-gradient(${c(0)},${c(0.048)} 16%,${c(0.17)} 50%,${c(0.048)} 84%,${c(0)})`;
    } else if (bw) bw.remove();
  }
  function endLight() { cancelAnimationFrame(winRaf); winT = null; lampTimers.forEach(clearTimeout); lampTimers = []; lamp = 1; paintLight(); }

  function win() {
    stopLook(); settle();
    phase = 'winning'; render();                   // the controls go in one frame
    const motion = S('motion');
    const payoff = motion ? Win.payoff(game.isLastStage) : 0, s = game.song, t0 = performance.now();
    // The bar steps out of the way from the press until the confetti starts to thin.
    if (motion) away('confetti', true);
    // The buzz runs with the light: rumble as the beam closes, a sweep, a tap at the flare.
    if (motion) Haptics.winSweep(Win.payoff(game.isLastStage), Win.SPEED);
    let revealed = false;
    const f = now => {
      const t = (now - t0) / 1000 * Win.SPEED;
      winT = Math.min(t, 2.0); paintLight();
      if (!revealed && t >= payoff) {
        revealed = true;
        if (phase !== 'winning' || game.song !== s) return;
        phase = 'reveal'; render();
        sound.reveal(); Haptics.success();
        setTimeout(() => { if (phase === 'reveal' && game.song === s && homeInFront()) player.play(s.id, s.preview, 20).catch?.(() => {}); }, 60);
        if (motion) {
          const c = col.querySelector('.reveal .art'); const r = c ? c.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight * 0.4, width: 0, height: 0 };
          confetti(r.left + r.width / 2, r.top + r.height / 2, [accent(), '#ffffff', accent()]);
          awayTimers.push(setTimeout(() => away('confetti', false), FADE_FROM * 1000));
        } else away('confetti', false);
      }
      if (t <= 2.6 && motion) winRaf = requestAnimationFrame(f);
    };
    cancelAnimationFrame(winRaf); winRaf = requestAnimationFrame(f);
  }
  function lose() {
    phase = 'reveal'; render();
    Haptics.loss(); sound.reveal(); player.stop();
    const s = game.song;
    // Next, another tab or a mode in those 320 ms: the old song must not start over whatever is in front now.
    setTimeout(() => { if (phase === 'reveal' && game.song === s && game.status === 'lost' && homeInFront()) player.play(s.id, s.preview, 20); }, 320);
    // The bar is away while the answer's card comes in (revealClock 0..3 at Win.SPEED), back once it has landed.
    away('reveal', true);
    awayTimers.push(setTimeout(() => away('reveal', false), 3 / Win.SPEED * 1000));
    // loseSequence: the light blinks out like a blown bulb, stutters, and comes back as the answer rises.
    lampTimers.forEach(clearTimeout);
    lampTimers = [[0, 0.05], [0.12, 0.03], [0.5, 0.46], [0.6, 0.07], [0.7, 0.78], [1.08, 1]].map(([at, lv]) => setTimeout(() => { lamp = lv; paintLight(); }, at * 1000));
  }
  /** Out of guesses: offer the rewarded ad if one is ready, else the reveal. */
  async function roundOver() {
    if (game.status === 'won') return win();
    if (!ctx.premium && game.bonus === 0 && !secondChance && ads.available) {
      col.querySelector('.play-ui')?.style.setProperty('pointer-events', 'none');
      const s = game.song, offer = await ads.rewarded('five-more-seconds');
      if (game.song !== s || game.status !== 'lost') return;
      if (offer) { secondChance = offer; phase = 'offer'; render(); return; }
    }
    settle(); lose();
  }
  async function watch() {
    const offer = secondChance; if (!offer || adBusy) return;
    Haptics.press(0.6); stopLook();
    adBusy = true; render();
    const rewarded = await offer.show();
    adBusy = false; secondChance = null;
    if (rewarded && game.status === 'lost') {
      game.revive(5); phase = 'play'; render();
      toast('Five more seconds. Same song.', 4);
      play();
    } else if (game.status === 'lost') { settle(); lose(); }
  }
  function submitGuess(p) {
    if (!game.song || game.status !== 'playing') return;
    sound.click();
    stopLook();
    const won = game.guess(p);
    resetGuess();
    if (won) return roundOver();
    Haptics.wrong();
    if (game.status === 'lost') return roundOver();
    render();
    const f = col.querySelector('.field');
    if (f && !still()) f.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)', offset: 0.2 }, { transform: 'translateX(6px)', offset: 0.4 }, { transform: 'translateX(-4px)', offset: 0.6 }, { transform: 'translateX(3px)', offset: 0.8 }, { transform: 'translateX(0)' }], { duration: 420, easing: 'cubic-bezier(.42,0,.58,1)' });
  }
  function skip() {
    sound.click();
    if (picked) return submitGuess(picked);
    if (game.isLastStage) { game.giveUp(); return roundOver(); }
    Haptics.press(0.55);
    game.skip();
    // The clip keeps sounding and runs on to the new stage's length — never cut.
    const was = player.playing;
    if (was) player.extend(game.duration);
    render(); if (was) tick();
  }

  // ---------- the reel ----------
  // StageView's startSpin/advanceSpin: two full loops plus the distance to a
  // random era with songs at this level in this genre, eased out cubic over
  // min(2.9, 0.38 × steps) s, a tick per slot with a 34 ms floor, and a blur
  // that follows the speed. A drag still on the reel is taken over.
  const reelWrap = () => col.querySelector('.reel-wrap');
  const caret = on => reelWrap()?.classList.toggle('spinning', on);
  function landBump() {
    if (still()) return;
    const rs = col.querySelector('.reel .rs'); if (!rs) return;
    const sp = spring(0.34, 0.5);
    rs.animate([{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: sp.ms, easing: sp.easing });
  }
  const reelLocked = () => game.narrowed || game.isOver;
  function startSpin() {
    if (spin || reelLocked()) return;
    sound.click();
    const n = ERAS.length;
    let from = ERAS.indexOf(game.era), frac = 0;
    if (drag && drag.started) {
      const exact = -drag.dx / SLOT, slot = Math.round(exact);
      from = drag.landing ?? (((drag.from + slot) % n) + n) % n;
      frac = drag.landing == null ? exact - slot : 0;
      drag = null; game.era = ERAS[from];
    }
    const live = ERAS.map((e, i) => i).filter(i => (pool.counts(ERAS[i], game.category)[game.difficulty] ?? 1) > 0);
    const landOn = live.length ? live[Math.floor(Math.random() * live.length)] : Math.floor(Math.random() * n);
    const steps = n * 2 + ((landOn - from + n) % n);
    spin = { target: landOn, steps, from, frac, index: 0, lastTick: -1, t0: performance.now() };
    caret(true);
    const rowEl = () => col.querySelector('.reel .row');
    const f = now => {
      if (!spin) return;
      const e = (now - spin.t0) / 1000, dur = Win.reelDuration(steps), done = e >= dur;
      placeReel(from, Win.reelPosition(e, steps) + frac * Math.max(0, 1 - e / 0.3));
      const r = rowEl(); if (r) r.style.filter = still() || done ? '' : `blur(${Win.reelBlur(e, steps).toFixed(2)}px)`;
      const i = Math.min(steps, Math.floor(Win.reelPosition(e, steps) + 1e-9));
      if (i > spin.index) { spin.index = i; game.era = ERAS[(from + i) % n]; if (e - spin.lastTick >= 0.034) { sound.tick(); spin.lastTick = e; } }
      if (!done) { requestAnimationFrame(f); return; }
      game.era = ERAS[landOn]; spin = null; caret(false);
      Haptics.press(0.6);
      landBump();
      // A guess that resolved while the reel moved keeps its reveal; Next deals in the new era.
      if (!game.isOver) newRound();
    };
    requestAnimationFrame(f);
  }
  // Drag to pick: the reel follows the finger past a 10pt minimum, ticks each
  // era it passes, and on release glides 0.2 s to the nearest era.
  col.addEventListener('pointerdown', e => {
    const r = e.target.closest('.reel'); if (!r || spin || reelLocked() || (drag && drag.landing != null)) return;
    drag = { x: e.clientX, id: e.pointerId, started: false, from: ERAS.indexOf(game.era), origin: 0, dx: 0, slot: 0, landing: null };
  });
  addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id || drag.landing != null) return;
    const raw = e.clientX - drag.x;
    if (!drag.started) { if (Math.abs(raw) < 10) return; drag.started = true; drag.origin = raw; caret(true); }
    drag.dx = raw - drag.origin;
    const slot = Math.round(-drag.dx / SLOT);
    if (slot !== drag.slot) { drag.slot = slot; sound.tick(); }
    placeReel(drag.from, -drag.dx / SLOT);
  });
  const release = e => {
    if (!drag || e.pointerId !== drag.id || drag.landing != null) return;
    if (!drag.started) { drag = null; return; }
    col._suppressClick = true; setTimeout(() => col._suppressClick = false, 50);
    const d = drag, n = ERAS.length, slot = Math.round(-d.dx / SLOT);
    d.landing = (((d.from + slot) % n) + n) % n;
    const fromDx = d.dx, toDx = -slot * SLOT;
    const finish = () => { if (drag !== d) return; drag = null; caret(false); game.era = ERAS[d.landing]; Haptics.press(0.6); landBump(); if (!game.isOver) newRound(); else render(); };
    if (still()) return finish();
    const t0 = performance.now();
    const f = now => {
      if (drag !== d) return;
      const t = Math.min(1, (now - t0) / 200), k = 1 - Math.pow(1 - t, 3);
      d.dx = fromDx + (toDx - fromDx) * k; placeReel(d.from, -d.dx / SLOT);
      if (t < 1) requestAnimationFrame(f); else finish();
    };
    requestAnimationFrame(f);
  };
  addEventListener('pointerup', release); addEventListener('pointercancel', release);

  // ---------- events ----------
  menuBtn.addEventListener('click', () => { sound.click(); Haptics.press(0.5); ctx.openDrawer(); });
  crownBtn.addEventListener('click', () => { sound.click(); Haptics.press(0.5); ctx.openPremium(null); });
  // The streamers' switch: a small, dim eye. On, Home shows only the game; the eye stays, fainter, as the way back.
  eyeBtn.addEventListener('click', () => {
    Haptics.press(0.4);
    const on = !S('cleanDisplay'); settings.set('cleanDisplay', on);
    if (on) toast('Clean display. Tap the faint eye to bring everything back.', 4);
    render(); ctx.tabs?.refresh?.();
  });
  addEventListener('songspot:setting', e => { if (e.detail?.key === 'cleanDisplay') applyLook(); });
  // The disc answers on touch-down, not on release: in a 0.1 s game the press is the moment.
  let discDownAt = 0;
  col.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.target.closest('[data-act="play"]')) return;
    discDownAt = performance.now(); sound.click(); play();
  });
  const openFilter = k => ({ genre: ctx.openGenres, artist: ctx.openArtists, album: ctx.openAlbums }[k] || (() => {}))();
  col.addEventListener('click', e => {
    if (col._suppressClick) return;
    const t = e.target;
    const fname = t.closest('[data-filter]'); if (fname) { sound.click(); return openFilter(fname.dataset.filter); }
    const fx = t.closest('[data-clear]');
    if (fx) {
      sound.click(); Haptics.select();
      const k = fx.dataset.clear;
      if (k === 'genre') game.category = 'all';
      else if (k === 'artist') { game.artist = null; game.setArtistSongs([]); }
      else if (k === 'album') { game.album = null; game.setArtistSongs([]); }
      return newRound();
    }
    const pill = t.closest('.pill');
    if (pill) {
      sound.click();
      // An open second-chance offer is settled first, as the loss on the tier it was played on.
      if (secondChance && game.status === 'lost') { settle(); secondChance = null; }
      pendingPromotion = null; game.difficulty = pill.dataset.tier; return newRound();
    }
    const hit = t.closest('.hit');
    if (hit) { sound.click(); Haptics.select(); picked = hits[+hit.dataset.i]; query = pickLabel(picked); const inp = col.querySelector('input'); inp.value = query; inp.blur(); hits = []; col.querySelector('.hits').hidden = true; setArmed(); return; }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'play') { if (performance.now() - discDownAt < 1500) return; sound.click(); return play(); }
    if (act === 'skip') return skip();
    if (act === 'reel') return startSpin();
    if (act === 'hint') { sound.click(); if (!game.song) return; if (!hintUsed) { hintUsed = true; Haptics.success(); const k = col.querySelector('.hintkey'); if (k) { k.classList.add('used'); k.innerHTML = I.bulbOff; k.setAttribute('aria-label', 'Hint used'); } } return toast(`It's by ${game.song.artist}.`, 4); }
    if (act === 'next') { sound.click(); Haptics.press(0.7); return newRound(); }
    if (act === 'watch') { sound.click(); return watch(); }
    if (act === 'answer') { if (adBusy) return; sound.click(); secondChance = null; settle(); return lose(); }
    if (act === 'share') { sound.click(); return shareSolo(game); }
    // Guideline 5.2.5: the song links back to Apple Music. The cover is the link.
    if (act === 'cover') { const s = game.song; if (s?.url) { sound.click(); window.open(s.url, '_blank', 'noopener'); } return; }
    if (act === 'save') { sound.click(); return openSongSaver(game.song, { sound }); }
  });
  col.addEventListener('input', e => {
    if (e.target.tagName !== 'INPUT') return;
    query = e.target.value;
    if (picked && query !== pickLabel(picked)) { picked = null; setArmed(); }
    if (!S('easySearch') && !picked) catalogSearch(query);
    refreshHits();
  });
  col.addEventListener('keydown', e => {
    if (e.target.tagName !== 'INPUT') return;
    const box = col.querySelector('.hits');
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && hits.length) { e.preventDefault(); activeHit = (activeHit + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; box.querySelectorAll('.hit').forEach((h, i) => h.classList.toggle('active', i === activeHit)); box.querySelector('.hit.active')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); if (picked) return submitGuess(picked); if (hits.length) return submitGuess(hits[Math.max(0, activeHit)]); if (query.trim()) submitGuess(query.trim()); }
    else if (e.key === 'Escape') { query = ''; picked = null; e.target.value = ''; setArmed(); refreshHits(); }
  });
  col.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-act="cover"]')) { e.preventDefault(); e.target.click(); } });
  // Space plays, Enter moves on — when nothing else has the keyboard.
  document.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || viewsOpen() || document.querySelector('.drawer-wrap') || document.querySelector('.login') || !homeInFront()) return;
    if (e.code === 'Space') { e.preventDefault(); if (phase === 'reveal') newRound(); else if (phase === 'play') play(); }
    else if (e.key === 'Enter' && phase === 'reveal') newRound();
    else if (e.key === '/' && phase === 'play') { e.preventDefault(); col.querySelector('input')?.focus(); }
  });
  // Only a clip that is actually sounding is stopped when the page goes away; back in front, Home's song is primed again.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (player.playing && phase !== 'reveal') stopLook(); }
    else if (homeInFront() && phase === 'play') prime();
  });
  // Home in front again (back from a tab): its song is buffered again, so the next press is instant.
  ctx.tabs?.onChange?.(t => { if (t === 'home' && phase === 'play') prime(); });

  // ---------- the first round ----------
  const q = new URLSearchParams(location.search);
  let opener = null;
  // A season's first opening: its genre is picked for them and the first song is the season's own, once.
  if (Season.current && Season.firstOpen()) {
    Season.markOpened();
    game.category = Season.genre(); game.artist = null; game.album = null;
    opener = pool.byId.get(Season.openingSongID()) || null;
  }
  const forced = local && q.get('song') && pool.byId.get(q.get('song'));
  // Open on the song the last session lined up, when the filters still match.
  const launchPick = () => { const id = settings.get('nextID', null); if (!id || settings.get('nextKey', '') !== game.filterKey) return null; const s = pool.byId.get(id); return s && s.hidden !== true ? s : null; };
  const first = forced || opener || launchPick();
  if (first) { game.newRound(first); Weather.update(game.category); render(); prime(first); } else newRound();
  syncSnow();
  // The opening name stays until the first song is buffered (at most 3 s), then the game opens on the whole word.
  {
    const s = game.song;
    const buffered = s ? Promise.race([player.prepare(s.id, s.preview).catch(() => {}), new Promise(r => setTimeout(r, 3000))]) : Promise.resolve();
    buffered.then(() => Splash.finish());
  }
  // Covers for the loading screens wait a few seconds: the first song has the network first.
  import('./coverwall.js').then(m => m.CoverWall.warm?.(pool, 4)).catch(() => {});

  // ---------- localhost knobs (the screenshots are taken from the real game) ----------
  if (local) {
    const demo = q.get('demo');
    const streak = +q.get('streak'); if (streak) { try { account.stats.streak = streak; } catch (e) {} }
    if (demo === 'win') setTimeout(() => { game.status = 'won'; win(); }, 400);
    if (demo === 'lost') setTimeout(() => { game.giveUp(); settle(); lose(); }, 400);
    if (demo === 'offer') setTimeout(() => { game.status = 'lost'; secondChance = { show: async () => false }; phase = 'offer'; render(); }, 400);
    if (demo === 'hits') setTimeout(() => { const i = col.querySelector('input'); i.value = q.get('q') || 'blin'; i.dispatchEvent(new Event('input', { bubbles: true })); }, 400);
    if (demo === 'playing') setTimeout(() => { lookUntil = performance.now() + 4000; setLook(true); const t0 = performance.now(); const f = () => { if (performance.now() > lookUntil) return setLook(false); const e = (performance.now() - t0) / 1000; const c = col.querySelector('.sweep circle'); if (c) c.setAttribute('stroke-dasharray', `${Math.min(1, e / 4)} 1`); requestAnimationFrame(f); }; f(); }, 400);
    if (q.get('focus') === '1') setTimeout(() => col.querySelector('input')?.focus(), 600);
    const st = q.get('stage'); if (st) setTimeout(() => { game.setStage(+st, true); render(); }, 300);
    const ar = q.get('artist'); if (ar) { game.artist = ar; game.setArtistSongs(pool.filter(null, 'all', 'all', ar)); newRound(); }
    const al = q.get('album');
    if (al) import('./albumcatalog.js').then(async A => {
      const { songs } = await A.songsForLocal({ name: al, artist: '', collectionID: al }, pool.songs);
      if (!songs.length) return;
      game.artist = null; game.setArtistSongs(songs); game.album = { id: al, name: songs[0].album || al, artist: songs[0].artist }; newRound();
    });
    const tt = q.get('toast'); if (tt) setTimeout(() => toast(tt, 30), 800);
  }

  return {
    newRound, render, stopLook, prime,
    setTier(t) { if (secondChance && game.status === 'lost') { settle(); secondChance = null; } pendingPromotion = null; game.difficulty = t; newRound(); },
  };
}
