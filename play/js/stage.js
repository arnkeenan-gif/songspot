// The stage: the solo game. A disc that plays the clip, a timeline of the
// five stages, a field to name the track, and the reveal when the round ends.
import { TIERS, ERAS, STAGES } from './pool.js';
import { el, toast, TIER_COLOR, TIER_INK, cap, label, esc, art, settings, sleep } from './ui.js';
import { confetti } from './confetti.js';
import { openDrawer } from './drawer.js';
import { adBreak } from './adbreak.js';

const STAGE_POS = [1.0, 5.5, 24.3, 41.3, 100.0];    // where the fill sits at each stage, in percent
const REEL = ['all', ...ERAS];
const ICON = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" rx="1.5"/><rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  skip: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 5l10 7-10 7zM16 5h3v14h-3z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17L17 7M9 7h8v8"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8 8l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>',
};

export function mountStage(root, ctx) {
  const { game, pool, player, sound, account } = ctx;
  let pendingPromotion = null, promotedAfterWin = false, roundsSinceAd = settings.get('roundsSinceAd', 0), rerolls = 3, failed = 0;
  let query = '', picked = null, hits = [], activeHit = -1, showReveal = false, revealWon = false, winClock = null;
  let easySearch = settings.get('easySearch', true), artwork = settings.get('artwork', true), glow = settings.get('glow', true);
  sound.enabled = settings.get('sounds', true); player.setVolume(settings.get('volume', .28));

  root.innerHTML = `<div class="stage"><div class="col"></div></div>`;
  const stage = root.querySelector('.stage'), col = root.querySelector('.col');
  const accent = () => TIER_COLOR[game.difficulty], ink = () => TIER_INK[game.difficulty];
  const applyAccent = () => { stage.style.setProperty('--accent', accent()); stage.style.setProperty('--accent-ink', ink()); };

  // ---- render ----
  function render() {
    applyAccent();
    const s = game.song, st = game.stage, counts = pool.counts(game.era, game.category, game.artist);
    col.innerHTML = `
      <button class="menu-btn" data-press aria-label="Menu">${ICON.menu}</button>
      ${ctx.premium ? '' : `<button class="crown-btn" data-press data-act="premium">${ICON.crown}Premium</button>`}
      <div class="wordmark">songspot</div>
      <div class="reel" data-act="reel"><div class="row">${reelRow()}</div></div>
      <div class="pills">${TIERS.map(t => `<button class="pill ${t === game.difficulty ? 'on' : ''} ${counts[t] === 0 ? 'dead' : ''}" style="--c:${TIER_COLOR[t]};--ink:${TIER_INK[t]}" data-tier="${t}">${cap(t)}</button>`).join('')}</div>
      ${showReveal ? revealHTML(s) : playHTML(s, st)}`;
    placeReel();
    if (!showReveal) refreshHits();
  }
  // The selected era sits in the middle of the strip; the rest fade with distance, as the apps' reel does.
  const reelRow = () => { const i = REEL.indexOf(game.era); return REEL.map((e, k) => `<span style="opacity:${e === game.era ? 1 : Math.max(.26, .62 - .12 * Math.abs(k - i))}">${e === 'all' ? 'Any era' : e}</span>`).join(''); };
  const placeReel = () => { const row = col.querySelector('.reel .row'); if (!row) return; const i = REEL.indexOf(game.era); row.style.transform = `translateX(calc(-50% + ${((REEL.length - 1) / 2 - i) * 58}px))`; };
  function playHTML(s, st) {
    const seconds = STAGES[Math.min(st, 4)];
    const skipLabel = st >= 4 ? 'Give up' : 'Skip';
    return `
      <div class="timeline">
        <div class="fill" style="width:${STAGE_POS[st]}%"></div>
        <div class="live" style="width:0%"></div>
        ${STAGE_POS.map((p, i) => i !== st && p <= 45 ? `<div class="mark" style="left:${p}%"></div>` : '').join('')}
        <div class="marker" style="left:${STAGE_POS[st]}%"><i></i><b>${label(seconds)}</b></div>
      </div>
      <div class="playrow">
        <button class="disc" data-act="play" aria-label="Play the clip">${ICON.play}<span class="ring"></span></button>
        <span class="seconds">${label(seconds)}</span>
      </div>
      <div class="guessrow">
        <div class="field">${ICON.search}<input type="text" placeholder="Name that track" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" value="${esc(query)}" aria-label="Name that track"></div>
        <button class="skip ${picked ? 'armed' : ''}" data-press data-act="skip">${picked ? 'Guess' : `${ICON.skip}${skipLabel}`}</button>
        <div class="hits" hidden></div>
      </div>`;
  }
  function revealHTML(s) {
    const state = revealWon ? accent() : TIER_COLOR.expert;
    const stageLabel = label(STAGES[Math.min(game.stage, 4)]);
    return `
      <div class="reveal" style="--state:${state}">
        ${artwork ? `<div class="art pop"><img class="bloom" src="${art(s.artwork, 300)}" alt="" style="opacity:${glow ? .3 : 0}"><img class="cover" src="${art(s.artwork, 300)}" alt=""></div>` : ''}
        ${revealWon ? '' : '<div class="itwas rise">IT WAS_</div>'}
        <h2 class="rise" style="animation-delay:.06s">${esc(s.title)}</h2>
        <div class="meta rise" style="animation-delay:.14s">${esc(s.artist)} · ${esc(s.album)}</div>
        <a class="listen rise" style="animation-delay:.2s" href="${esc(s.url)}" target="_blank" rel="noopener" data-press>Listen on Apple Music ${ICON.arrow}</a>
        <div class="badge stamp" style="animation-delay:.32s">${revealWon ? `GUESSED IN ${stageLabel.toUpperCase()}!` : 'LOST!'}</div>
        <div class="actions rise" style="animation-delay:.47s"><button class="share" data-press data-act="share">${ICON.share}Challenge your friend</button><button class="next" data-press data-act="next">Next</button></div>
      </div>`;
  }

  // ---- hits ----
  function refreshHits() {
    const box = col.querySelector('.hits'); if (!box) return;
    const typed = query.trim();
    if (!typed || (picked && typed === pickLabel(picked))) { hits = []; box.hidden = true; return; }
    let scope = null;
    if (easySearch) { scope = pool.filter(game.difficulty, game.era, game.category, game.artist); if (game.song && !scope.some(x => x.id === game.song.id)) scope = [...scope, game.song]; }
    hits = pool.search(typed, 8, scope); activeHit = -1;
    box.innerHTML = hits.map((h, i) => `<div class="hit" data-i="${i}"><b>${esc(h.title)}</b><span>${esc(h.artist)}</span></div>`).join('');
    box.hidden = hits.length === 0;
  }
  const pickLabel = s => `${s.title} — ${s.artist}`;

  // ---- play ----
  let playingUntil = null;
  async function play() {
    const s = game.song; if (!s || showReveal) return;
    sound.click();
    const seconds = game.seconds;
    const disc = col.querySelector('.disc'), row = col.querySelector('.playrow'), live = col.querySelector('.live');
    const ok = await player.play(s.id, s.preview, seconds);
    if (!ok) {
      failed += 1;
      if (failed >= 2 && rerolls > 0) { failed = 0; rerolls -= 1; toast("That track wouldn't load. Here's another.", 3.5); return newRound(); }
      return toast(player.lastError);
    }
    failed = 0;
    disc.innerHTML = ICON.pause + '<span class="ring"></span>'; row.classList.add('playing');
    const t0 = performance.now(); const rate = STAGE_POS[Math.min(game.stage, 3)] / STAGES[Math.min(game.stage, 3)];
    const anim = () => { if (!player.playing) { row.classList.remove('playing'); disc.innerHTML = ICON.play + '<span class="ring"></span>'; live.style.width = '0%'; return; }
      const e = (performance.now() - t0) / 1000; live.style.width = Math.min(100, e * rate) + '%'; requestAnimationFrame(anim); };
    requestAnimationFrame(anim);
  }
  player.onEnded = () => {};

  // ---- rounds ----
  function newRound() {
    player.stop(); query = ''; picked = null; hits = []; showReveal = false;
    if (pendingPromotion) { game.difficulty = pendingPromotion; const name = cap(pendingPromotion); pendingPromotion = null; toast(promotedAfterWin ? `Nice — next round is ${name}.` : `Next round is ${name}.`); promotedAfterWin = false; }
    if (roundsSinceAd >= 5) { roundsSinceAd = 0; settings.set('roundsSinceAd', 0); if (!ctx.premium) adBreak({ accent: accent(), onPremium: () => ctx.openPremium('ads'), onDone: () => toast('Premium skips these. The crown, top right.', 6) }); }
    const s = game.newRound();
    render();
    if (!s) { const a = game.artist; return toast(a ? `No ${game.difficulty} songs for ${a}. Try another difficulty.` : `Nothing matches ${game.difficulty} + that era and category. Loosen a filter.`); }
    player.prepare(s.id, s.preview).then(() => { const n = game.drawUpcoming(); if (n) player.prepare(n.id, n.preview).catch(() => {}); }).catch(() => {});
  }
  async function finish(won) {
    player.stop();
    account.recordRound(won, game.stage, game.difficulty);
    roundsSinceAd += 1; settings.set('roundsSinceAd', roundsSinceAd);
    revealWon = won; showReveal = true;
    if (won) { pendingPromotion = game.next(game.difficulty); promotedAfterWin = true; }
    render();
    sound.reveal();
    if (won) {
      const cover = col.querySelector('.cover');
      const r = cover ? cover.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
      confetti(r.left + r.width / 2, r.top + r.height / 2, [accent(), '#ffffff', accent()]);
    } else {
      // the lamp: a quick dim and back, the loss's beat
      const lamp = el('<div class="lamp"></div>'); document.body.appendChild(lamp);
      for (const [t, o] of [[0, .55], [100, .2], [200, .6], [320, 0], [520, .35], [700, 0]]) { setTimeout(() => lamp.style.opacity = o, t); }
      setTimeout(() => lamp.remove(), 1600);
    }
  }
  function submitGuess(p) {
    if (!game.song) return;
    sound.click();
    if (game.guess(p)) return finish(true);
    // wrong: shake the field, clear it
    const f = col.querySelector('.field'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
    query = ''; picked = null; const inp = col.querySelector('input'); if (inp) inp.value = ''; refreshHits(); col.querySelector('.skip').className = 'skip'; col.querySelector('.skip').innerHTML = `${ICON.skip}${game.stage >= 4 ? 'Give up' : 'Skip'}`;
  }
  function skip() {
    sound.click();
    if (picked) return submitGuess(picked);
    if (game.stage >= 4) return finish(false);
    game.skip(); player.stop(); render();
  }
  async function spinReel() {
    sound.click();
    const target = Math.floor(Math.random() * REEL.length);
    const row = col.querySelector('.reel .row'); let i = REEL.indexOf(game.era); const steps = REEL.length * 2 + ((target - i + REEL.length) % REEL.length);
    for (let k = 0; k < steps; k++) { i = (i + 1) % REEL.length; game.era = REEL[i]; row.innerHTML = reelRow(); placeReel(); sound.tick(); await sleep(34 + k * k * 1.2); }
    newRound();
  }

  // ---- events ----
  col.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('.menu-btn')) { sound.click(); return openDrawer({ ...ctx, onChange: newRound, onTier: tier => { pendingPromotion = null; game.difficulty = tier; newRound(); }, onOption: (k, v) => { if (k === 'easySearch') { easySearch = v; refreshHits(); } if (k === 'sounds') sound.enabled = v; if (k === 'volume') player.setVolume(v); if (k === 'artwork') artwork = v; if (k === 'glow') glow = v; } }); }
    const pill = t.closest('.pill'); if (pill) { sound.click(); pendingPromotion = null; game.difficulty = pill.dataset.tier; return newRound(); }
    const hit = t.closest('.hit'); if (hit) { picked = hits[+hit.dataset.i]; query = pickLabel(picked); col.querySelector('input').value = query; hits = []; col.querySelector('.hits').hidden = true; const sk = col.querySelector('.skip'); sk.className = 'skip armed'; sk.textContent = 'Guess'; return; }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'play') return play();
    if (act === 'skip') return skip();
    if (act === 'reel') return spinReel();
    if (act === 'next') { sound.click(); return newRound(); }
    if (act === 'premium') { sound.click(); return ctx.openPremium(null); }
    if (act === 'share') { sound.click(); const text = `I named it in ${label(STAGES[Math.min(game.stage, 4)])} on ${cap(game.difficulty)}. Beat that.\nhttps://songspotapp.com/play`; if (navigator.share) navigator.share({ text }).catch(() => {}); else { navigator.clipboard?.writeText(text); toast('Copied. Send it to someone.'); } }
  });
  col.addEventListener('input', e => { if (e.target.tagName === 'INPUT') { query = e.target.value; if (picked && query !== pickLabel(picked)) { picked = null; const sk = col.querySelector('.skip'); sk.className = 'skip'; sk.innerHTML = `${ICON.skip}${game.stage >= 4 ? 'Give up' : 'Skip'}`; } refreshHits(); } });
  col.addEventListener('keydown', e => {
    if (e.target.tagName !== 'INPUT') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!hits.length) return; e.preventDefault(); activeHit = (activeHit + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; col.querySelectorAll('.hit').forEach((h, i) => h.classList.toggle('active', i === activeHit)); }
    if (e.key === 'Enter') { e.preventDefault(); if (picked) return submitGuess(picked); if (hits.length) { const h = hits[activeHit >= 0 ? activeHit : 0]; return submitGuess(h); } if (query.trim()) submitGuess(query.trim()); }
    if (e.key === 'Escape') { query = ''; e.target.value = ''; refreshHits(); }
  });
  document.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || document.querySelector('#views > *') || document.querySelector('.drawer-wrap')) return; if (e.code === 'Space') { e.preventDefault(); if (showReveal) newRound(); else play(); } });

  newRound();
  return { newRound, render };
}
