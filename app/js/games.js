// The Games tab: Home/GamesView.swift and the mode card pieces of
// Home/HomeTabs.swift (ModeCard, CardGrain, CardMotif, ModeRibbon, ModePill).
// A banner (you on a record for solo, two crews squaring up for multiplayer),
// Singleplayer / Multiplayer, then one big glossy card per mode with its 3D
// icon and a ribbon or a live stat.
import { el, esc, settings, PILL_FILL, cap, TIER_COLOR } from './ui.js';
import { Haptics } from './haptics.js';
import { Ladder } from './ladder.js';
import { Streak } from './account.js';
import { tabTitle, season } from './tabs.js';
import { SeededRNG } from './kit.js';
import { figureHTML, SONGBOT } from './characters.js';

const img = name => `/app/img/games/${name}.webp`;
const KEY = 'games.multiplayer';            // songspot.games.multiplayer, default false

// ---------- PanelColours (SettingsKit.swift) ----------
const C = {
  orange: ['#ffa53a', '#f8545c', '#a31d5b'],
  green: ['#3ff08f', '#14a95a', '#0a5c35'],
  purple: ['#c07bff', '#7c3aed', '#3b1286'],
  gold: ['#ffd84a', '#f59e0b', '#9a4a07'],
  album: ['#ff7ac8', '#db2777', '#6d0f45'],
  blue: ['#5aa2ff', '#2f5fe0', '#16287a'],
  pink: ['#ff5fb8', '#c026d3', '#5b1690'],
  red: ['#ff7a6b', '#e23a4c', '#7f1531'],
  teal: ['#33e6c4', '#0f9e8a', '#0a4d45'],
};

// ---------- SF symbols the cards use ----------
const SYM = {
  clock: '<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12 2.2a9.8 9.8 0 1 1 0 19.6 9.8 9.8 0 0 1 0-19.6zm-.1 4.3a1 1 0 0 0-1 1V12c0 .3.1.6.4.8l3.2 2.6a1 1 0 1 0 1.3-1.6L13 11.5v-4a1 1 0 0 0-1.1-1z"/></svg>',
  note: '<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.6 2.3a.9.9 0 0 1 1.1.9v3.1c0 .4-.3.8-.7.9L11 9v9.2a3.3 3.3 0 1 1-1.9-3V4.6c0-.4.3-.8.7-.9z"/></svg>',
  star: '<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.4l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17l-5.8 3.2 1.2-6.5-4.8-4.5 6.5-.8z"/></svg>',
  disc: '<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 7.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4zm-5.6-.6A6.6 6.6 0 0 1 8.7 6l-.8-1.3a8 8 0 0 0-2.8 3.2zm11.2 6.6a6.6 6.6 0 0 1-2.3 2.7l.8 1.3a8 8 0 0 0 2.8-3.2z"/></svg>',
  crown: '<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.5 7.5l5 4.2L12 4.5l4.5 7.2 5-4.2-2.2 11.5H4.7z"/></svg>',
};

/** albumDisplayName: an album's name without its "(Deluxe Edition)" tail. */
export function albumDisplayName(raw) {
  let s = String(raw || '');
  const re = /\s*[([][^)\]]*(deluxe|remaster|edition|expanded|bonus|version|anniversary|reloaded)[^)\]]*[)\]]\s*$/i;
  while (re.test(s)) s = s.replace(re, '');
  return s || raw;
}

// ---------- the pieces ----------
/** ModePill: a live stat on a card, a dot or an icon and white text in a dark capsule. */
const pill = (text, { icon, dot } = {}) => `<span class="mpill">${dot ? `<i class="mp-dot" style="background:${dot}"></i>` : ''}${icon ? SYM[icon] : ''}<span>${esc(text)}</span></span>`;
/** ModeRibbon: a flag on the card's lower-left edge, square on the left, slanted on the right. */
const ribbon = (text, fill = '#fff', ink = '#08120c', icon) => `<span class="mribbon" style="--rf:${fill};--ri:${ink}">${icon ? SYM[icon] : ''}<span>${esc(text)}</span></span>`;
const premiumRibbon = () => ribbon('Premium', '#1a1203', '#ffd84a', 'crown');

/** ModeCard: height 136, corner 20; the layers as HomeTabs.swift draws them. */
function card(id, title, colours, motif, iconHTML, badgeHTML) {
  const [c0, , c2] = colours;
  return `<button class="mcard" data-press data-mode="${id}" style="--c0:${c0};--c2:${c2};--grad:linear-gradient(to bottom right, ${colours.join(', ')})" aria-label="${esc(title.join(' '))}">
    <span class="mc-layer mc-grad"></span>
    <span class="mc-layer mc-light"></span>
    <canvas class="mc-layer mc-motif" data-motif="${motif}"></canvas>
    <canvas class="mc-layer mc-grain"></canvas>
    <span class="mc-layer mc-foot"></span>
    <span class="mc-layer mc-sweep"></span>
    <span class="mc-layer mc-sheen"></span>
    <span class="mc-icon"><i class="mc-pool"></i><span class="mc-art">${iconHTML}</span></span>
    <span class="mc-text"><span class="mc-title">${title.map(l => `<b>${esc(l)}</b>`).join('')}</span>${badgeHTML}</span>
  </button>`;
}

// ---------- SeededRNG (kit.js): rnd(a, b) is CGFloat.random(in: a...b, using:) ----------
function rng(seed) {
  const r = new SeededRNG(seed);
  return { range: (a, b) => r.doubleClosed(a, b), half: (a, b) => r.double(a, b), bool: () => r.bool() };
}
const SEEDS = { grooves: 11, rays: 23, wave: 37, spotlight: 41, notes: 53, stripes: 67, bokeh: 79, split: 83, dots: 97 };
const NOTE_PATHS = [
  new Path2D('M17.6 2.3a.9.9 0 0 1 1.1.9v3.1c0 .4-.3.8-.7.9L11 9v9.2a3.3 3.3 0 1 1-1.9-3V4.6c0-.4.3-.8.7-.9z'),
  new Path2D('M20 2.6v12.9a3.2 3.2 0 1 1-1.8-2.9V7.4l-8.4 2v8.1a3.2 3.2 0 1 1-1.8-2.9V5.2c0-.4.3-.8.7-.9l10.2-2.4a.9.9 0 0 1 1.1.7z'),
];

/** CardMotifLayer: faint white line or dot work, centred on the icon at the right. */
function drawMotif(cv, motif, height) {
  const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  const dpr = Math.min(3, devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const c = { x: w - height * 0.5, y: h * 0.5 }, r = rng(SEEDS[motif] ?? 7);
  const white = a => `rgba(255,255,255,${a})`;
  switch (motif) {
    case 'grooves': {
      g.strokeStyle = white(0.147); g.lineWidth = 1;
      for (let rad = height * 0.3; rad < w; rad += 11) { g.beginPath(); g.arc(c.x, c.y, rad, 0, Math.PI * 2); g.stroke(); }
      break;
    }
    case 'rays': {
      const n = 22, grad = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, w * 0.8);
      grad.addColorStop(0, white(0.21)); grad.addColorStop(1, white(0));
      g.fillStyle = grad;
      for (let i = 0; i < n; i += 2) {
        const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI;
        g.beginPath(); g.moveTo(c.x, c.y);
        g.lineTo(c.x + Math.cos(a0) * w * 1.4, c.y + Math.sin(a0) * w * 1.4);
        g.lineTo(c.x + Math.cos(a1) * w * 1.4, c.y + Math.sin(a1) * w * 1.4);
        g.closePath(); g.fill();
      }
      break;
    }
    case 'wave': {
      g.lineWidth = 1.4;
      for (let k = 0; k < 4; k++) {
        const amp = height * (0.06 + 0.035 * k), phase = k * 1.3, y0 = h * (0.42 + 0.06 * k);
        g.beginPath();
        for (let x = 0; x <= w; x += 3) { const t = x / w, y = y0 + Math.sin(t * 9 + phase) * amp * (0.3 + t); x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
        g.strokeStyle = white(0.126 + 0.02 * k); g.stroke();
      }
      const bw = 5; g.fillStyle = white(0.147);
      for (let i = 0; i < Math.floor(w / (bw + 4)); i++) {
        const x = i * (bw + 4), t = x / w, bh = height * r.range(0.05, 0.22) * (0.4 + t);
        g.beginPath(); g.roundRect ? g.roundRect(x, h - bh, bw, bh, 2) : g.rect(x, h - bh, bw, bh); g.fill();
      }
      break;
    }
    case 'spotlight': {
      for (const [dx, bw] of [[-0.9, 0.55], [0.35, 0.45]]) {
        const top = { x: c.x + dx * height, y: -height * 0.2 };
        const grad = g.createLinearGradient(top.x, top.y, top.x, h); grad.addColorStop(0, white(0.294)); grad.addColorStop(1, white(0));
        g.fillStyle = grad; g.beginPath(); g.moveTo(top.x, top.y); g.lineTo(c.x - bw * height, h); g.lineTo(c.x + bw * height, h); g.closePath(); g.fill();
      }
      break;
    }
    case 'notes': {
      g.fillStyle = '#fff';
      for (let i = 0; i < 16; i++) {
        const x = r.range(0, w), y = r.range(0, h), t = x / w, s = height * (0.12 + 0.12 * t);
        const which = Math.floor(r.range(0, 1.99)), rot = r.range(-20, 20);
        g.save(); g.globalAlpha = 0.1 + 0.16 * t; g.translate(x, y); g.rotate(rot * Math.PI / 180); g.scale(s / 24, s / 24); g.translate(-12, -12);
        g.fill(NOTE_PATHS[which]); g.restore();
      }
      break;
    }
    case 'stripes': {
      let x = -h, i = 0;
      while (x < w) {
        const sw = height * (i % 3 === 0 ? 0.5 : 0.22);
        g.fillStyle = white(i % 3 === 0 ? 0.14 : 0.08);
        g.beginPath(); g.moveTo(x, h); g.lineTo(x + h * 0.7, 0); g.lineTo(x + h * 0.7 + sw, 0); g.lineTo(x + sw, h); g.closePath(); g.fill();
        x += sw + height * 0.35; i++;
      }
      break;
    }
    case 'bokeh': {
      // blurred party lights (blur 3): a soft edge drawn into each disc
      for (let i = 0; i < 18; i++) {
        const rad = height * r.range(0.04, 0.14), x = r.range(0, w), y = r.range(0, h), a = 0.1 + 0.16 * (x / w);
        const grad = g.createRadialGradient(x, y, Math.max(0, rad - 4), x, y, rad + 4);
        grad.addColorStop(0, white(a)); grad.addColorStop(1, white(0));
        g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad + 4, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'split': {
      const mx = w * 0.62, pts = [[mx + height * 0.25, 0], [mx - height * 0.05, h * 0.48], [mx + height * 0.12, h * 0.5], [mx - height * 0.2, h]];
      g.fillStyle = white(0.147); g.beginPath(); g.moveTo(...pts[0]); pts.slice(1).forEach(p => g.lineTo(...p)); g.lineTo(w, h); g.lineTo(w, 0); g.closePath(); g.fill();
      g.strokeStyle = white(0.28); g.lineWidth = 1.5; g.beginPath(); g.moveTo(...pts[0]); pts.slice(1).forEach(p => g.lineTo(...p)); g.stroke();
      break;
    }
    case 'dots': {
      const step = 7;
      for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) {
        const t = x / w; g.fillStyle = white(0.06 + 0.2 * t * t); g.beginPath(); g.arc(x, y, 1, 0, Math.PI * 2); g.fill();
      }
      break;
    }
  }
}
/** CardGrain: w×h/40 one-point dots, white 0.07 or black 0.08, fixed seed 0x5EED. */
function drawGrain(cv) {
  const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  const dpr = Math.min(3, devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = rng(0x5EED), n = Math.floor(w * h / 40);
  for (let i = 0; i < n; i++) {
    const x = r.half(0, w), y = r.half(0, h), light = r.bool();
    g.fillStyle = light ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)'; g.fillRect(x, y, 1, 1);
  }
}

// ---------- the page ----------
export function mountGames(container, ctx) {
  const { game, account } = ctx;
  let multi = !!settings.get(KEY, false);
  let timer = 0, lastW = 0;
  container.classList.add('games');

  const stats = () => account.stats || {};
  const locked = () => !ctx.premium;
  const rankedLocked = () => !(ctx.premium || (stats().rankedPlayed || 0) === 0);

  const clock = s => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(v => String(v).padStart(2, '0')).join(':');
  let Daily = null;
  import('./daily.js').then(m => { Daily = m.Daily; tick(); }).catch(() => {});
  // TimelineView by 1 s: "Ends in HH:MM:SS", or "Next in …" once today's is played (stats.lastDaily, as iOS).
  const dailyText = () => {
    if (!Daily) return '';
    if (typeof Daily.pillText === 'function') return Daily.pillText(stats());
    const now = Date.now(), played = (stats().lastDaily || 0) === Daily.number(now);
    return (played ? 'Next in ' : 'Ends in ') + clock(Daily.secondsToNext(now));
  };
  /** The desk calendar with your daily streak on its page. */
  const calendar = () => {
    const n = Streak.live(stats());
    return `<span class="mc-cal"><img src="${img('game-icon-calendar')}" alt="" draggable="false"><span class="mc-cal-page"><b class="mono-i">${n}</b><small>${n === 1 ? 'DAY' : 'DAYS'}</small></span></span>`;
  };
  const icon = name => `<img src="${img(name)}" alt="" draggable="false" decoding="async">`;

  function soloCards() {
    const s = season(), panel = s?.panel || null;
    const t = game.difficulty, genre = game.category || 'all', artist = game.artist, album = game.album?.name;
    let html = '';
    if (s) html += card('season', s.cardTitle, panel || C.orange, 'notes', icon(s.cardIcon), `<span class="mc-pad">${pill(s.christmas ? 'Every Christmas hit' : 'Spooky hits', { icon: 'note' })}</span>`);
    html += card('daily', s ? s.dailyCardTitle : ['DAILY', 'CHALLENGE'], s && panel ? panel : C.orange, 'rays', s ? icon(s.dailyIcon) : calendar(), `<span class="mc-pad" data-k="daily">${pill(dailyText(), { icon: 'clock' })}</span>`);
    html += card('classic', ['GUESS', 'THE SONG'], s && panel ? panel : C.green, 'wave', icon('game-icon-note'), `<span class="mc-pad">${pill(cap(t), { dot: PILL_FILL[t] })}</span>`);
    html += card('genres', ['PICK A', 'GENRE'], C.purple, 'grooves', icon('game-icon-vinyls'), `<span class="mc-pad">${pill(genre === 'all' ? 'Any genre' : genre, { icon: 'note' })}</span>`);
    html += card('artists', ['PICK AN', 'ARTIST'], C.gold, 'spotlight', icon('game-icon-mic'), locked() ? premiumRibbon() : `<span class="mc-pad">${pill(artist || 'Any artist', { icon: 'star' })}</span>`);
    html += card('albums', ['PICK AN', 'ALBUM'], C.album, 'notes', icon('set-icon-album'), locked() ? premiumRibbon() : `<span class="mc-pad">${pill(album ? albumDisplayName(album) : 'Any album', { icon: 'disc' })}</span>`);
    return html;
  }
  function multiCards() {
    const st = stats(), place = Ladder.place(st.rp || 0);
    // CharacterFigure(index: songbot, pose: .fight), scaled 1.12 from the bottom (the pose clip plays)
    let bot = '';
    try { bot = `<span class="mc-figure">${figureHTML(SONGBOT, 'fight')}</span>`; } catch (e) { bot = `<span class="mc-figure"><img src="/app/img/chars/char-47-fight.webp" alt="" draggable="false"></span>`; }
    return card('ranked', ['RANKED', '1V1'], C.blue, 'stripes', `<span class="mc-emblem"><img src="/app/img/emblems/rank-${Math.min(6, Math.max(0, place.tier.index))}.webp" alt="${esc(place.tier.name)}" draggable="false"></span>`,
        rankedLocked() ? premiumRibbon() : ribbon(`${place.name} · ${st.rp || 0} RP`, place.tier.color, place.tier.ink))
      + card('party', ['PARTY', 'MODE'], C.pink, 'bokeh', icon('game-icon-disco'), ribbon('Up to 50 players', '#ffd1ec', '#5b1034'))
      + card('friends', ['1V1 A', 'FRIEND'], C.red, 'split', icon('game-icon-mics'), ribbon('Friends', '#ffd6d0', '#5c0d1b'))
      + card('songbot', ['BEAT', 'SONGBOT'], C.teal, 'dots', bot, locked() ? premiumRibbon() : ribbon('Practice 1v1', '#c8fff3', '#053b33'));
  }
  function hero() {
    const s = season();
    const base = multi ? 'games-hero-vs' : 'games-hero-solo';
    const name = s ? base + s.suffix : base;
    const glowA = s ? s.accent : '#1ed760', glowB = s ? s.glow : '#ff3fa4';
    const word = multi ? `<span class="gh-word vs" style="--ga:${glowA};--gb:${glowB}"><span class="gh-shadow">VS</span><span class="gh-fill">VS</span></span>`
      : `<span class="gh-word solo" style="--ga:${glowA}"><span class="gh-shadow">SOLO</span><span class="gh-fill">SOLO</span></span>`;
    return `<div class="ghero" data-name="${name}"><img src="${img(name)}" alt="" draggable="false" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='${img(base === 'games-hero-solo' ? 'games-hero-vs' : base)}'}">${word}<i class="gh-fade"></i></div>`;
  }
  const toggle = () => `<div class="gtoggle" role="tablist">
      <button class="gseg ${multi ? '' : 'on'}" role="tab" aria-selected="${!multi}" data-multi="0" data-press>SINGLEPLAYER</button>
      <button class="gseg ${multi ? 'on' : ''}" role="tab" aria-selected="${multi}" data-multi="1" data-press>MULTIPLAYER</button>
      <i class="gseg-knob" aria-hidden="true"></i>
    </div>`;

  container.innerHTML = `${tabTitle('GAMES')}<div class="gcol"><div class="ghero-box"></div><div class="gtoggle-box">${toggle()}</div><div class="gcards"></div></div>`;
  const heroBox = container.querySelector('.ghero-box'), cardsBox = container.querySelector('.gcards'), tg = container.querySelector('.gtoggle');

  function paintHero() {
    const s = season(), name = (multi ? 'games-hero-vs' : 'games-hero-solo') + (s ? s.suffix : '');
    const cur = heroBox.querySelector('.ghero:not(.out)');
    if (cur && cur.dataset.name === name) return;
    const next = el(hero());
    if (cur) {
      // cross-fades by .id(name) with an opacity transition
      next.classList.add('enter'); heroBox.appendChild(next);
      cur.classList.add('out'); setTimeout(() => cur.remove(), 400);
      requestAnimationFrame(() => requestAnimationFrame(() => next.classList.remove('enter')));
    } else heroBox.appendChild(next);
  }
  function paintCards(dir) {
    const list = el(`<div class="glist">${multi ? multiCards() : soloCards()}</div>`);
    const old = cardsBox.querySelector('.glist');
    if (old && dir) {
      // in: moves from trailing (to multi) or leading (to solo) plus opacity; out: opacity
      list.classList.add('enter', dir > 0 ? 'from-right' : 'from-left');
      old.classList.add('leave'); cardsBox.appendChild(list);
      setTimeout(() => old.remove(), 380);
      requestAnimationFrame(() => requestAnimationFrame(() => list.classList.remove('enter')));
    } else { cardsBox.innerHTML = ''; cardsBox.appendChild(list); }
    paintCanvases(list);
  }
  function paintCanvases(root = cardsBox) {
    root.querySelectorAll('.mcard').forEach(b => {
      const m = b.querySelector('.mc-motif'), gr = b.querySelector('.mc-grain');
      drawMotif(m, m.dataset.motif, 136); drawGrain(gr);
      fitTitle(b);
    });
  }
  /** lineLimit 1, minimumScaleFactor 0.7 */
  function fitTitle(b) {
    b.querySelectorAll('.mc-title b').forEach(line => {
      line.style.fontSize = '';
      const box = line.parentElement.clientWidth;
      if (!box) return;
      const need = line.scrollWidth;
      if (need > box) line.style.fontSize = Math.max(29 * 0.7, 29 * box / need) + 'px';
    });
  }
  function render(dir = 0) {
    paintHero();
    tg.querySelectorAll('.gseg').forEach(s => { const on = (s.dataset.multi === '1') === multi; s.classList.toggle('on', on); s.setAttribute('aria-selected', on); });
    tg.classList.toggle('multi', multi);
    paintCards(dir);
  }
  function tick() {
    const p = cardsBox.querySelector('[data-k="daily"] .mpill span');
    if (p) p.textContent = dailyText();
  }

  tg.addEventListener('click', e => {
    const b = e.target.closest('.gseg'); if (!b) return;
    const want = b.dataset.multi === '1'; if (want === multi) return;
    Haptics.select();
    multi = want; settings.set(KEY, multi);
    render(multi ? 1 : -1);
  });
  cardsBox.addEventListener('click', e => {
    const b = e.target.closest('.mcard'); if (!b) return;
    ctx.pick?.(b.dataset.mode);
  });
  timer = setInterval(tick, 1000);
  const onResize = () => { const w = container.clientWidth; if (w !== lastW) { lastW = w; paintCanvases(); } };
  addEventListener('resize', onResize);
  const offAcc = account.onChange?.(() => render());

  render();
  requestAnimationFrame(() => { lastW = container.clientWidth; paintCanvases(); });
  if (document.fonts) document.fonts.ready.then(() => container.isConnected && paintCanvases());
  // `?gamesScroll=1`: open scrolled down to the album card, for screenshots.
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && new URLSearchParams(location.search).get('gamesScroll')) {
    setTimeout(() => container.querySelector('[data-mode="albums"]')?.scrollIntoView({ block: 'center' }), 500);
  }

  return {
    refresh() { render(); },
    destroy() { clearInterval(timer); removeEventListener('resize', onResize); offAcc?.(); },
  };
}
