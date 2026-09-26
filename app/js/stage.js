// The stage: the solo game, StageView.swift on the web. The era reel, the
// difficulty pills, the clip timeline, the play disc, the guess row, and the
// reveal when the round ends. Phone metrics below 600px, the app's own wide
// metrics (a 400pt column) above.
import { TIERS, ERAS, STAGES, eraLabel } from './pool.js';
import { Game } from './game.js';
import { el, toast, TIER_COLOR, TIER_INK, PILL_FILL, cap, label, esc, art, settings, sleep, viewsOpen } from './ui.js';
import { I } from './icons.js';
import { confetti } from './confetti.js';
import { Haptics } from './haptics.js';
import { shareSolo } from './share.js';

const STAGE_POS = [1.0, 5.5, 24.3, 41.3, 100.0];     // where the fill sits at each stage, in percent
const SLOT = 58;                                       // the reel's slot width
const AD_EVERY = 5, FIRST_AD_AFTER = 10;
const barRate = st => { const i = Math.min(st, 3); return STAGE_POS[i] / STAGES[i]; };

export function mountStage(root, ctx) {
  const { game, pool, player, sound, account, ads } = ctx;
  let pendingPromotion = null, promotedAfterWin = false, rerolls = 3, failed = 0;
  let query = '', picked = null, hits = [], activeHit = -1;
  let phase = 'play';            // play | offer | winning | reveal
  let hintUsed = false, secondChance = null, looking = false, lookUntil = 0, raf = 0, reelBusy = false;
  const S = k => settings.get(k, { easySearch: true, glow: true, artwork: true, motion: true, haptics: true, hint: false, sounds: true, volume: 0.28, spotlight: 'off' }[k]);

  root.innerHTML = `<div class="stage"><div class="col"></div></div>
    <button class="corner menu-btn" data-press aria-label="Menu">${I.menu}</button>
    <button class="corner crown-btn" data-press data-act="premium" hidden>${I.crown}<span>Premium</span></button>`;
  const col = root.querySelector('.col'), menuBtn = root.querySelector('.menu-btn'), crownBtn = root.querySelector('.crown-btn');
  const accent = () => TIER_COLOR[game.difficulty], ink = () => TIER_INK[game.difficulty];

  function applyLook() {
    const r = document.documentElement.style;
    r.setProperty('--accent', accent()); r.setProperty('--accent-ink', ink());
    document.body.classList.toggle('spot', S('spotlight') !== 'off');
    document.body.classList.toggle('noglow', !S('glow'));
    document.body.classList.toggle('nomotion', !S('motion'));
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', S('spotlight') !== 'off' ? '#030704' : '#0c110d');
    crownBtn.hidden = ctx.premium;
    sound.enabled = S('sounds'); player.setVolume(S('volume'));
    game.lastStageExtra = ctx.premium ? 5 : 0;
  }

  // ---------- render ----------
  function render() {
    applyLook();
    const s = game.song;
    if (phase === 'reveal' && s) { col.innerHTML = `<div class="wordmark">songspot</div>${revealHTML(s)}`; return; }
    if (phase === 'winning') { col.innerHTML = `<div class="wordmark">songspot</div>`; return; }
    const counts = game.artistSongs.length ? Object.fromEntries(TIERS.map(t => [t, Math.max(1, game.artistCounts()[t])])) : pool.counts(game.era, game.category, game.artist);
    col.innerHTML = `
      <div class="wordmark">songspot</div>
      <div class="play-ui">
        <div class="reel-wrap" style="${game.artist ? "opacity:.35;pointer-events:none" : ""}"><span class="caret">${I.caretDown}</span><div class="reel" data-act="reel" role="button" aria-label="Era: ${esc(eraLabel(game.era))}. Tap to spin"><div class="row">${reelRow(ERAS.indexOf(game.era), 0)}</div></div></div>
        <div class="pills" role="radiogroup" aria-label="Difficulty">${TIERS.map(t => `<button class="pill ${t === game.difficulty ? 'on' : ''} ${counts[t] === 0 ? 'dead' : ''}" style="--c:${PILL_FILL[t]}" data-tier="${t}" role="radio" aria-checked="${t === game.difficulty}">${cap(t)}</button>`).join('')}</div>
        ${timelineHTML()}
        <div class="playrow ${looking ? 'playing' : ''}">
          <button class="disc" data-act="play" aria-label="${looking ? 'Stop' : 'Play the clip'}">${looking ? I.pause : `<span class="play-g">${I.play}</span>`}<span class="ring"></span><svg class="sweep" viewBox="0 0 125.12 125.12"><circle cx="62.56" cy="62.56" r="61.47" pathLength="1" stroke-dasharray="0 1"/></svg></button>
          <span class="seconds">${label(game.duration)}</span>
        </div>
        ${phase === 'offer' ? offerHTML() : guessHTML()}
      </div>`;
    placeReel(ERAS.indexOf(game.era), 0);
    if (phase === 'play') refreshHits();
  }
  const reelRow = (from, base) => { let h = ''; for (let o = -4; o <= 4; o++) { const i = (((from + base + o) % ERAS.length) + ERAS.length) % ERAS.length; h += `<span data-o="${o}">${eraLabel(ERAS[i])}</span>`; } return h; };
  /** pos: slots from the centre (fractional while spinning or dragging). */
  function placeReel(from, pos) {
    const row = col.querySelector('.reel .row'); if (!row) return;
    const base = Math.floor(pos), frac = pos - base;
    if (row.dataset.k !== `${from}|${base}`) { row.innerHTML = reelRow(from, base); row.dataset.k = `${from}|${base}`; }
    row.style.transform = `translateX(${-SLOT * 4.5 - frac * SLOT}px)`;
    row.querySelectorAll('span').forEach(sp => { const d = Math.min(1, Math.abs(+sp.dataset.o - frac)); sp.style.opacity = (0.26 + 0.36 * (1 - d)).toFixed(3); });
  }
  function timelineHTML() {
    const st = game.stage, scale = barRate(st);
    const marks = STAGES.slice(0, 4).map((t, i) => { const at = Math.min(100, scale * t); return i !== st && at <= 45 ? `<div class="mark" style="left:${at}%"></div>` : ''; }).join('');
    return `<div class="timeline" aria-label="Clip length ${label(game.duration)}"><div class="track"><div class="fill" style="width:${STAGE_POS[st]}%"></div><div class="live"></div>${marks}</div>
      <div class="marker" style="left:${STAGE_POS[st]}%"><span class="caret">${I.caretUp}</span><b>${label(game.duration)}</b></div></div>`;
  }
  function guessHTML() {
    const armed = !!picked, last = game.isLastStage;
    return `<div class="guessrow"><div class="keys">
        <label class="field">${I.search}<input type="text" placeholder="Name that track" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" value="${esc(query)}" aria-label="Name that track"></label>
        ${S('hint') && !game.isOver ? `<button class="key hintkey ${hintUsed ? 'used' : ''}" data-press data-act="hint" aria-label="${hintUsed ? 'Hint used' : 'Hint: the artist'}">${hintUsed ? I.bulbOff : I.bulb}</button>` : ''}
        <button class="key skip ${armed ? 'armed' : ''}" data-press data-act="skip">${armed ? 'Guess' : `${last ? I.flag : I.skip}${last ? 'Give up' : 'Skip'}`}</button>
      </div><div class="hits" hidden role="listbox"></div></div>`;
  }
  const offerHTML = () => `<div class="offer"><div class="k">OUT OF GUESSES</div><div class="keys">
      <button class="watch" data-press data-act="watch">${I.adPlay}<span>Watch an ad, hear 5 more seconds</span></button>
      <button class="key answer" data-press data-act="answer">Answer</button></div></div>`;
  function revealHTML(s) {
    const won = game.status === 'won';
    return `<div class="reveal" style="--state:${won ? accent() : TIER_COLOR.expert}">
      ${S('artwork') && s.artwork ? `<div class="art"><img class="bloom" src="${esc(art(s.artwork, 60))}" alt=""><img class="cover" src="${esc(art(s.artwork, 400))}" alt=""></div>` : ''}
      ${won ? '' : '<div class="itwas rise" style="animation-delay:.035s">IT WAS_</div>'}
      <h2 class="rise" style="animation-delay:.05s">${esc(s.title)}</h2>
      <div class="meta rise" style="animation-delay:.08s">${esc([s.artist, s.album].filter(Boolean).join(' · '))}</div>
      ${s.url ? `<a class="listen rise" style="animation-delay:.12s" href="${esc(s.url)}" target="_blank" rel="noopener" data-press>Listen on Apple Music ${I.arrowUpRight}</a>` : ''}
      <div class="badge">${won ? `GUESSED IN ${label(game.duration).toUpperCase()}!` : 'LOST!'}</div>
      <div class="actions rise" style="animation-delay:.28s"><button class="share" data-press data-act="share">${I.share}Challenge your friend</button><button class="next" data-press data-act="next">Next</button></div>
    </div>`;
  }

  // ---------- suggestions ----------
  const pickLabel = s => `${s.title} — ${s.artist}`;
  function refreshHits() {
    const box = col.querySelector('.hits'); if (!box) return;
    const typed = query.trim();
    if (!typed || picked) { hits = []; box.hidden = true; return; }
    let scope = null;
    if (S('easySearch')) { scope = game.artistSongs.length ? game.artistSongs.slice() : pool.filter(game.difficulty, game.era, game.category, game.artist); if (game.song && !scope.some(x => x.id === game.song.id)) scope.push(game.song); }
    else if (game.artistSongs.length) scope = pool.songs.concat(game.artistSongs);
    hits = pool.search(typed, 8, scope); activeHit = -1;
    box.innerHTML = hits.map((h, i) => `<div class="hit" role="option" data-i="${i}"><b>${esc(h.title)}</b><span>${esc(h.artist)}</span></div>`).join('');
    box.hidden = hits.length === 0;
  }
  function setArmed() {
    const sk = col.querySelector('.skip'); if (!sk) return;
    const last = game.isLastStage;
    sk.className = 'key skip' + (picked ? ' armed' : '');
    sk.innerHTML = picked ? 'Guess' : `${last ? I.flag : I.skip}${last ? 'Give up' : 'Skip'}`;
  }

  // ---------- the clip ----------
  function setLook(on) {
    looking = on;
    const row = col.querySelector('.playrow'), disc = col.querySelector('.disc');
    if (!row || !disc) return;
    row.classList.toggle('playing', on);
    disc.firstElementChild.outerHTML = on ? I.pause : `<span class="play-g">${I.play}</span>`;
    disc.setAttribute('aria-label', on ? 'Stop' : 'Play the clip');
    if (!on) { const live = col.querySelector('.live'); if (live) live.style.width = '0%'; const c = col.querySelector('.sweep circle'); if (c) c.setAttribute('stroke-dasharray', '0 1'); }
  }
  function tick() {
    cancelAnimationFrame(raf);
    const step = () => {
      const on = player.playing || performance.now() < lookUntil;
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
    if (player.playing || looking) { Haptics.press(0.45); stopLook(); return; }
    Haptics.press(0.8);
    lookUntil = performance.now() + 500; setLook(true); tick();
    const ok = await player.play(s.id, s.preview, game.duration);
    if (game.song !== s) return;
    if (!ok) {
      stopLook(); failed += 1;
      if (failed >= 2 && rerolls > 0) { failed = 0; rerolls -= 1; toast("That track wouldn't load. Here's another.", 3.5); return newRound(); }
      return toast(player.lastError || "Couldn't load the clip.");
    }
    failed = 0; tick();
  }
  function stopLook() { player.stop(); lookUntil = 0; cancelAnimationFrame(raf); setLook(false); }

  // ---------- rounds ----------
  async function newRound() {
    if (secondChance && game.status === 'lost') settle();
    secondChance = null; hintUsed = false; stopLook();
    query = ''; picked = null; hits = []; phase = 'play';
    document.body.classList.remove('winning');
    if (pendingPromotion) { game.difficulty = pendingPromotion; const name = cap(pendingPromotion); pendingPromotion = null; toast(promotedAfterWin ? `Nice — next round is ${name}.` : `Next round is ${name}.`); promotedAfterWin = false; }
    // The ad break, between rounds and never over a song: every five finished rounds, not before a new player's tenth.
    const since = settings.get('roundsSinceAd', 0), total = settings.get('roundsTotal', 0);
    if (since >= AD_EVERY) {
      settings.set('roundsSinceAd', 0);
      if (!ctx.premium && total >= FIRST_AD_AFTER && ads.available) {
        const shown = await ads.interstitial('round-break');
        if (shown) setTimeout(() => toast('Premium skips these. The crown, top right.', 6), 400);
      }
    }
    const s = game.newRound();
    settings.set('difficulty', game.difficulty); settings.set('era', game.era); settings.set('category', game.category);
    render();
    if (!s) return toast(game.artist ? `No ${game.difficulty} songs for ${game.artist}. Try another difficulty.` : `Nothing matches ${game.difficulty} + that era and category. Loosen a filter.`, 5);
    for (const size of [400, 60]) if (s.artwork) { const im = new Image(); im.src = art(s.artwork, size); }
    player.prepare(s.id, s.preview).then(() => { if (game.song !== s) return; const n = game.drawUpcoming(); if (n) player.prepare(n.id, n.preview).catch(() => {}); }).catch(() => { if (game.song === s && rerolls > 0) { rerolls -= 1; newRound(); } });
  }
  /** A finished round, counted once. */
  function settle() {
    settings.set('roundsSinceAd', settings.get('roundsSinceAd', 0) + 1);
    settings.set('roundsTotal', settings.get('roundsTotal', 0) + 1);
    account.recordRound(game.status === 'won', game.stage, game.difficulty);
    pendingPromotion = Game.nextTier(game.difficulty);
    promotedAfterWin = game.status === 'won';
  }
  function win() {
    stopLook(); settle();
    Haptics.win();
    phase = 'winning';
    const ui = col.querySelector('.play-ui'); if (ui) ui.classList.add('leave');
    document.body.classList.add('winning');
    const payoff = (game.isLastStage ? 1.48 : 0.97) / 1.7 * 1000;
    setTimeout(() => {
      if (phase !== 'winning') return;
      phase = 'reveal'; render();
      sound.reveal(); Haptics.success();
      const s = game.song; setTimeout(() => { if (phase === 'reveal' && game.song === s && !viewsOpen()) player.play(s.id, s.preview, 20).catch?.(() => {}); }, 60);
      if (S('motion')) { const c = col.querySelector('.cover'); const r = c ? c.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 }; confetti(r.left + r.width / 2, r.top + r.height / 2, [accent(), '#ffffff', accent()]); }
      setTimeout(() => document.body.classList.remove('winning'), 700);
    }, S('motion') ? payoff : 0);
  }
  function lose() {
    phase = 'reveal'; render();
    Haptics.loss(); sound.reveal(); player.stop();
    const s = game.song;
    setTimeout(() => { if (phase === 'reveal' && game.song === s && !viewsOpen()) player.play(s.id, s.preview, 20); }, 320);
    if (S('motion')) {
      const lamp = el('<div class="lamp"></div>'); document.body.appendChild(lamp);
      for (const [t, o] of [[0, .95], [120, .97], [500, .54], [600, .93], [700, .22], [1080, 0]]) setTimeout(() => lamp.style.opacity = o, t);
      setTimeout(() => lamp.remove(), 1500);
    }
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
    const offer = secondChance; if (!offer) return;
    Haptics.press(0.6); stopLook();
    const rewarded = await offer.show();
    secondChance = null;
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
    query = ''; picked = null;
    if (won) return roundOver();
    Haptics.wrong();
    if (game.status === 'lost') return roundOver();
    render();
    const f = col.querySelector('.field'); if (f) { f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); }
  }
  function skip() {
    sound.click();
    if (picked) return submitGuess(picked);
    if (game.isLastStage) { game.giveUp(); stopLook(); return roundOver(); }
    Haptics.press(0.55);
    game.skip();
    // The clip keeps sounding and runs on to the new stage's length — never cut.
    if (player.playing) player.extend(game.duration);
    const wasLooking = player.playing; render(); if (wasLooking) tick();
  }

  // ---------- the reel ----------
  async function spinReel() {
    if (reelBusy || game.artist) return;
    reelBusy = true; sound.click();
    const n = ERAS.length, from = ERAS.indexOf(game.era);
    const target = Math.floor(Math.random() * n);
    const steps = n * 2 + ((target - from + n) % n) || n;
    const wrap = col.querySelector('.reel-wrap'); wrap?.classList.add('spinning');
    const dur = 2400, t0 = performance.now(); let lastSlot = 0;
    await new Promise(done => {
      const f = now => {
        const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3), pos = e * steps;
        if (Math.floor(pos) !== lastSlot) { lastSlot = Math.floor(pos); sound.tick(); }
        placeReel(from, pos);
        if (t < 1) requestAnimationFrame(f); else done();
      };
      requestAnimationFrame(f);
    });
    game.era = ERAS[target]; reelBusy = false;
    Haptics.press(0.6);
    newRound().then(() => { const w = col.querySelector('.reel-wrap'); if (w && S('motion')) { w.classList.add('land'); setTimeout(() => w.classList.remove('land'), 520); } });
  }
  // Drag to pick: the reel follows the finger and snaps to the nearest era.
  let drag = null;
  col.addEventListener('pointerdown', e => { const r = e.target.closest('.reel'); if (!r || reelBusy || game.artist) return; drag = { x: e.clientX, dx: 0, moved: false, from: ERAS.indexOf(game.era), id: e.pointerId }; });
  addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; drag.dx = e.clientX - drag.x; if (Math.abs(drag.dx) > 10) drag.moved = true; if (drag.moved) { col.querySelector('.reel-wrap')?.classList.add('spinning'); placeReel(drag.from, -drag.dx / SLOT); } });
  addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null;
    if (!d.moved) return;
    const slot = Math.round(-d.dx / SLOT), n = ERAS.length;
    game.era = ERAS[(((d.from + slot) % n) + n) % n];
    col._suppressClick = true; setTimeout(() => col._suppressClick = false, 50);
    sound.tick(); Haptics.press(0.6); newRound();
  });

  // ---------- events ----------
  menuBtn.addEventListener('click', () => { sound.click(); Haptics.press(0.5); ctx.openDrawer(); });
  crownBtn.addEventListener('click', () => { sound.click(); ctx.openPremium(null); });
  col.addEventListener('click', e => {
    if (col._suppressClick) return;
    const t = e.target;
    const pill = t.closest('.pill'); if (pill) { sound.click(); pendingPromotion = null; game.difficulty = pill.dataset.tier; return newRound(); }
    const hit = t.closest('.hit');
    if (hit) { sound.click(); Haptics.select(); picked = hits[+hit.dataset.i]; query = pickLabel(picked); const inp = col.querySelector('input'); inp.value = query; inp.blur(); hits = []; col.querySelector('.hits').hidden = true; setArmed(); return; }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'play') { sound.click(); return play(); }
    if (act === 'skip') return skip();
    if (act === 'reel') return spinReel();
    if (act === 'hint') { sound.click(); if (!game.song) return; if (!hintUsed) { hintUsed = true; Haptics.success(); const k = col.querySelector('.hintkey'); if (k) { k.classList.add('used'); k.innerHTML = I.bulbOff; } } return toast(`It's by ${game.song.artist}.`, 4); }
    if (act === 'next') { sound.click(); Haptics.press(0.7); return newRound(); }
    if (act === 'watch') { sound.click(); return watch(); }
    if (act === 'answer') { sound.click(); secondChance = null; settle(); return lose(); }
    if (act === 'share') { sound.click(); return shareSolo(game); }
  });
  col.addEventListener('input', e => {
    if (e.target.tagName !== 'INPUT') return;
    query = e.target.value;
    if (picked && query !== pickLabel(picked)) { picked = null; setArmed(); }
    refreshHits();
  });
  col.addEventListener('keydown', e => {
    if (e.target.tagName !== 'INPUT') return;
    const box = col.querySelector('.hits');
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && hits.length) { e.preventDefault(); activeHit = (activeHit + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; box.querySelectorAll('.hit').forEach((h, i) => h.classList.toggle('active', i === activeHit)); box.querySelector('.hit.active')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); if (picked) return submitGuess(picked); if (hits.length) return submitGuess(hits[Math.max(0, activeHit)]); if (query.trim()) submitGuess(query.trim()); }
    else if (e.key === 'Escape') { query = ''; picked = null; e.target.value = ''; setArmed(); refreshHits(); }
  });
  // Space plays, Enter moves on — when nothing else has the keyboard.
  document.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || viewsOpen() || document.querySelector('.drawer-wrap') || document.querySelector('.login')) return;
    if (e.code === 'Space') { e.preventDefault(); if (phase === 'reveal') newRound(); else if (phase === 'play') play(); }
    else if (e.key === 'Enter' && phase === 'reveal') newRound();
    else if (e.key === '/' && phase === 'play') { e.preventDefault(); col.querySelector('input')?.focus(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && player.playing && phase !== 'reveal') stopLook(); });

  // First round: a forced song from ?song= on localhost, else the deal.
  const q = new URLSearchParams(location.search), forced = q.get('song') && pool.byId.get(q.get('song'));
  if (forced) { game.newRound(forced); render(); } else newRound();
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    const demo = q.get('demo');
    if (demo === 'win') setTimeout(() => { game.status = 'won'; win(); }, 400);
    if (demo === 'lost') setTimeout(() => { game.status = 'lost'; settle(); lose(); }, 400);
    if (demo === 'offer') setTimeout(() => { game.status = 'lost'; phase = 'offer'; render(); }, 400);
    if (demo === 'hits') setTimeout(() => { const i = col.querySelector('input'); i.value = q.get('q') || 'blin'; i.dispatchEvent(new Event('input', { bubbles: true })); }, 400);
  }

  return {
    newRound, render, stopLook,
    setTier(t) { pendingPromotion = null; game.difficulty = t; newRound(); },
  };
}
