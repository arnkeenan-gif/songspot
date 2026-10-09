// The seasons the app dresses up for — Daily/Season.swift + Daily/Christmas.swift
// on the web: Halloween (15 Oct to 1 Nov, the App Store event) and Christmas
// (1 Dec to 1 Jan), by the device's LOCAL calendar like iOS Calendar.current.
// Each swaps the page, the level palette, the big-button panel and a few
// pictures; everything else keeps its shape.
//
// API (import { Season, SeasonTheme, Weather, bootSeason, applySeason,
//              mountBackdrop, mountNight, mountSnowfall } from './season.js')
//
//   bootSeason()          app.js calls it first thing: reads the localhost knob, applies the palette,
//                         sets Weather from the saved genre. Returns Season.
//   applySeason()         re-apply after anything changed (the switch does it itself). Mutates ui.js's
//                         TIER_COLOR / TIER_INK.easy / PILL_FILL / ACCENT_TEXT (via setAccentText), makes
//                         LevelTheme.page()/stage() return the season's page/stage, sets the CSS custom
//                         properties below on :root and html classes .season .season-halloween|christmas.
//                         Off season it restores the original values exactly. Fires window 'songspot:season'.
//   Season.current        'halloween' | 'christmas' | null (null whenever the Seasonal theme switch is off)
//   Season.on             current != null
//   Season.accent / glow / ink / page / stage / accentText   hex strings for the current season
//   Season.panel          [hex, hex, hex] the big-button gradient (PanelColours.green in a season)
//   Season.level(tier)    the season's level colour ('easy'..'impossible')
//   Season.suffix         '-halloween' | '-christmas' (picture names: games-hero-solo + suffix …)
//   Season.dailyIcon / dailyTitle / dailySub(streak) / homeIcon
//   Season.genre(s?)      'Halloween' | 'Christmas'  (s defaults to current)
//   Season.isGenre(cat)   cat is a season genre
//   Season.inGenre(cat, id, poolCategory)   Christmas = pool 'Holiday'; Halloween = halloweenIDs
//   Season.halloweenIDs   Set of the 175 song ids (verbatim from iOS)
//   Season.openingSongID(s?) / cardTitle(s?) / cardIcon(s?) / dailyCardTitle(s?)
//   Season.firstOpen()    true the first time this season is seen on this device (songspot.season.opened.<s>)
//   Season.markOpened()   remember it (call once the opener has been dealt)
//   SeasonTheme.enabled   get/set the menu's "Seasonal theme" switch (songspot.seasonTheme, default true);
//                         setting it re-applies the palette and Weather, like withAnimation(.easeInOut(0.5))
//   Weather.snowing       December and the Christmas genre is in play on Home
//   Weather.update(category)  the stage calls it on launch and on every genre change; fires 'songspot:weather'
//   mountBackdrop(el)     SeasonBackdrop: the page colour + the snow while it snows → { node, destroy() }
//   mountNight(el)        SeasonNight: backdrop + the low haze in Season.glow + Halloween's moon → { node, destroy() }
//   mountSnowfall(el)     just the flakes (the stage puts them behind its spotlight) → { node, destroy() }
//
// CSS custom properties on :root (always set, season or not):
//   --easy --medium --hard --expert --impossible  level colours      --accent-text  link/Skip text
//   --pill-easy  the Easy pill fill     --gold  Theme.accent(.medium)   --ink-easy  text on the easy accent
//   --green-0 --green-1 --green-2  PanelColours.green (season panel in a season)
//   --season-accent --season-glow --season-ink --season-page --season-stage  (only meaningful in a season)
//
// Localhost knob (like iOS -halloween / -christmas / -noSeason in a debug build):
//   ?season=halloween | christmas  force it and remember it (songspot.season.forced)
//   ?season=none                    no season this load, forget the forced one
//   ?season=auto                    forget the forced one, back to the calendar
import { TIER_COLOR, TIER_INK, PILL_FILL, ACCENT_TEXT, setAccentText, LevelTheme, settings } from './ui.js';
import { SeededRNG } from './kit.js';
import { still } from './motion.js';

const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const FORCED = 'season.forced';

// The plain palette, captured before anything mutates it.
const BASE = { color: { ...TIER_COLOR }, ink: { ...TIER_INK }, pill: { ...PILL_FILL }, accentText: ACCENT_TEXT };
const GREEN = ['#3ff08f', '#14a95a', '#0a5c35'];

let noSeason = false;           // ?season=none for this load
let enabledCache = null;

function dateSeason(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  if ((m === 10 && day >= 15) || (m === 11 && day === 1)) return 'halloween';
  if (m === 12 || (m === 1 && day === 1)) return 'christmas';
  return null;
}

export const SeasonTheme = {
  get enabled() { if (enabledCache === null) enabledCache = settings.get('seasonTheme', true) !== false; return enabledCache; },
  set enabled(v) {
    enabledCache = !!v; settings.set('seasonTheme', !!v);
    document.documentElement.classList.add('season-fade');
    applySeason();
    Weather.update(Weather.category);
    setTimeout(() => document.documentElement.classList.remove('season-fade'), 600);
  },
};

export const Season = {
  get current() {
    if (!SeasonTheme.enabled) return null;
    if (local) {
      if (noSeason) return null;
      const f = settings.get(FORCED, null);
      if (f === 'halloween' || f === 'christmas') return f;
    }
    return dateSeason();
  },
  get on() { return this.current !== null; },
  /** For tests: the calendar's answer for a given date, ignoring switch and knobs. */
  forDate: dateSeason,

  get accent() { return this.current === 'christmas' ? '#e63946' : '#ff7a1a'; },
  get glow() { return this.current === 'christmas' ? '#f2c14e' : '#8b3dff'; },
  get ink() { return this.current === 'christmas' ? '#2a0408' : '#2a1200'; },
  get page() { return this.current === 'christmas' ? '#04120a' : '#0b0612'; },
  get stage() { return this.current === 'christmas' ? '#0a1c11' : '#120a1c'; },
  get panel() { return this.current === 'christmas' ? ['#ff6b6b', '#d7263d', '#6a0b1e'] : ['#ff9a3c', '#d9461f', '#4a1570']; },
  level(tier) {
    const xmas = this.current === 'christmas';
    switch (tier) {
      case 'easy': return this.accent;
      case 'medium': return xmas ? '#f2c14e' : '#f7c823';
      case 'hard': return xmas ? '#ff8a2b' : '#e6303a';
      case 'expert': return xmas ? '#5dd5ff' : '#a855f7';
      case 'impossible': return xmas ? '#a855f7' : '#7cff4d';
    }
    return this.accent;
  },
  get accentText() { return this.current === 'christmas' ? '#ff8a93' : '#ffa04a'; },

  get suffix() { return '-' + (this.current || 'halloween'); },
  get dailyIcon() { return this.current === 'christmas' ? 'christmas-snowman' : 'halloween-pumpkin'; },
  get dailyTitle() { return this.current === 'christmas' ? 'CHRISTMAS DAILY' : 'HALLOWEEN DAILY'; },
  dailySub(streak = 0) {
    const song = this.current === 'christmas' ? 'One festive song' : 'One spooky song';
    return streak > 0 ? `${song} · ${streak}-day streak` : `${song}, five tries, one go`;
  },
  get homeIcon() { return this.current === 'christmas' ? 'game-icon-play-expert' : 'game-icon-play-hard'; },

  genre(s = this.current) { return s === 'christmas' ? 'Christmas' : 'Halloween'; },
  isGenre(category) { return category === 'Christmas' || category === 'Halloween'; },
  inGenre(category, id, poolCategory) { return category === 'Christmas' ? poolCategory === 'Holiday' : HALLOWEEN.has(String(id)); },
  openingSongID(s = this.current) { return s === 'christmas' ? '585972803' : '269573303'; },
  cardTitle(s = this.current) { return s === 'christmas' ? ['CHRISTMAS', 'HITS'] : ['HALLOWEEN', 'HITS']; },
  cardIcon(s = this.current) { return s === 'christmas' ? 'christmas-gift' : 'halloween-ghost'; },
  dailyCardTitle(s = this.current) { return s === 'christmas' ? ['CHRISTMAS', 'DAILY'] : ['HALLOWEEN', 'DAILY']; },

  firstOpen() { const s = this.current; return !!s && !settings.get('season.opened.' + s, false); },
  markOpened() { const s = this.current; if (s) settings.set('season.opened.' + s, true); },
};
const HALLOWEEN = new Set(['269573303','574044008','1440808985','1500643398','1828830887','1450695739','1694768031','1440873339','1440858784','1440792144','1373506178','1657584259','170587451','1016217388','1443725207','529843558','1440650722','1713839110','911121216','926187670','1213815804','500162594','1889992113','1442823431','1444011456','1422648970','27496369','1440808519','213361028','697669247','1369109322','1440723145','1484413134','1589119250','1441154571','1450695881','1450695867','1440857734','1476095086','1440831632','217635848','251003094','298099932','1440767004','196426852','592364996','1568362819','273750250','1440805227','1442990560','1479628004','1556175854','1622579619','1833586452','206130413','157316531','1612321591','1228742327','1065976173','270246711','1260878669','357653347','714657667','1533361289','1422955215','1076779225','1788380907','1444007299','1364574094','1824106694','1525911584','1121473193','1450330681','158816070','1440768572','1440617577','1445667962','265816708','635829447','1440874856','157294440','191035851','1774799971','1440666071','409001935','1538214889','440880925','1541060450','402298943','1629522574','1587414059','1440827493','209388499','1157610003','523223725','1771719344','1771719589','207346368','273714741','973556120','1638814933','83134409','272876998','1010617506','1675561168','1376115725','1422828213','726131465','1440838690','1447452183','20833655','1440944892','693584844','1111577770','270246779','1746567091','1746566960','1746567085','1442978209','1569899583','1568606492','1568606493','1568606620','1568606618','1568606490','1568606483','1762519895','1077821386','923691589','607338169','1445138356','1477361272','721258731','1615488592','1440827781','1610834870','1794563062','1690609674','389079888','518549376','1440839062','57676526','1440851048','1831584962','491596729','206201760','304841571','1444533062','1438653331','1711246149','1758066436','1216344997','6808333226','1443821690','559710302','1491888506','378658742','976820535','1606692939','1452877486','1614037649','1440894523','1440617342','1491855721','6789812648','1502324622','1503415447','1411341338','1383847432','1877949266','558274318','1686978840','1434900332','1478324134','6805970547']);
Season.halloweenIDs = HALLOWEEN;

/** Whether it is snowing: December, and the Christmas genre is the one in play on Home. */
export const Weather = {
  snowing: false,
  category: 'all',
  update(category = this.category) {
    this.category = category || 'all';
    const was = this.snowing;
    this.snowing = Season.current === 'christmas' && this.category === Season.genre('christmas');
    if (was !== this.snowing) dispatchEvent(new CustomEvent('songspot:weather', { detail: { snowing: this.snowing } }));
  },
};

const hex = h => h.replace('#', '');
const rgb = h => { h = hex(h); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(','); };

let installed = false;
function installLevelTheme() {
  if (installed) return; installed = true;
  const page = LevelTheme.page, stage = LevelTheme.stage;
  LevelTheme.page = function (t) { return Season.on ? Season.page : page.call(this, t); };
  LevelTheme.stage = function (t) { return Season.on ? Season.stage : stage.call(this, t); };
}

export function applySeason() {
  installLevelTheme();
  const s = Season.current, on = s !== null;
  for (const t of Object.keys(BASE.color)) {
    TIER_COLOR[t] = on ? Season.level(t) : BASE.color[t];
    TIER_INK[t] = BASE.ink[t];
    PILL_FILL[t] = on ? Season.level(t) : BASE.pill[t];       // Theme.pillFill: no #1ed760 special case in a season
  }
  if (on) TIER_INK.easy = Season.ink;
  setAccentText(on ? Season.accentText : BASE.accentText);

  const root = document.documentElement, r = root.style;
  for (const t of Object.keys(TIER_COLOR)) r.setProperty('--' + t, TIER_COLOR[t]);
  r.setProperty('--accent-text', on ? Season.accentText : BASE.accentText);
  r.setProperty('--pill-easy', PILL_FILL.easy);
  r.setProperty('--ink-easy', TIER_INK.easy);
  r.setProperty('--gold', TIER_COLOR.medium);
  const g = on ? Season.panel : GREEN;
  g.forEach((c, i) => r.setProperty('--green-' + i, c));
  for (const k of ['accent', 'glow', 'ink', 'page', 'stage']) r.setProperty('--season-' + k, Season[k]);
  r.setProperty('--season-glow-rgb', rgb(Season.glow));
  root.classList.toggle('season', on);
  root.classList.toggle('season-halloween', s === 'halloween');
  root.classList.toggle('season-christmas', s === 'christmas');
  LevelTheme.apply();
  dispatchEvent(new CustomEvent('songspot:season', { detail: { season: s } }));
}

export function bootSeason() {
  if (local) {
    const k = new URLSearchParams(location.search).get('season');
    if (k === 'none') { noSeason = true; settings.del(FORCED); }
    else if (k === 'auto') settings.del(FORCED);
    else if (k === 'halloween' || k === 'christmas') settings.set(FORCED, k);
  }
  applySeason();
  Weather.update(settings.get('category', 'all'));
  return Season;
}

// ---------------------------------------------------------------------------
// The pictures behind the screens.

/** The page behind a screen, with the season's weather far in the background. */
export function mountBackdrop(container) {
  const node = document.createElement('div');
  node.className = 'season-backdrop';
  node.setAttribute('aria-hidden', 'true');
  container.prepend(node);
  let snow = null;
  const sync = () => {
    if (Weather.snowing && !snow) snow = mountSnowfall(node);
    else if (!Weather.snowing && snow) { snow.destroy(); snow = null; }
  };
  sync();
  addEventListener('songspot:weather', sync); addEventListener('songspot:season', sync);
  return { node, destroy() { removeEventListener('songspot:weather', sync); removeEventListener('songspot:season', sync); snow?.destroy(); node.remove(); } };
}

/** SeasonNight: the backdrop, a soft haze of Season.glow low down, a thin moon high on the left in October. */
export function mountNight(container) {
  const b = mountBackdrop(container);
  const haze = document.createElement('i'); haze.className = 'season-haze';
  const moon = document.createElement('i'); moon.className = 'season-moon';
  moon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.6 2.6a.8.8 0 0 1 .9 1A7.6 7.6 0 0 0 20.4 13.5a.8.8 0 0 1 1 .9A9.8 9.8 0 1 1 9.6 2.6z"/></svg>';
  b.node.append(haze, moon);
  b.node.classList.add('night');
  return b;
}

// Snowfall: 40 flakes from SeededRNG(0xC0FFEE), exactly the iOS draws, so the
// same flakes fall in the same places. Canvas at 30 fps; still under Reduce Motion.
let FLAKES = null;
function flakes() {
  if (FLAKES) return FLAKES;
  const g = new SeededRNG(0xC0FFEE);
  FLAKES = Array.from({ length: 40 }, () => ({
    x: g.doubleClosed(0, 1), phase: g.doubleClosed(0, 1), speed: g.doubleClosed(0.016, 0.03), size: g.intClosed(0, 2),
    sway: g.doubleClosed(6, 18), alpha: g.doubleClosed(0.08, 0.2), spin: g.doubleClosed(-0.3, 0.3),
  }));
  return FLAKES;
}
/** 1 in the two open bands (the sky, the floor), 0 where the controls are. */
function band(f) {
  const edge = (a, b) => Math.min(1, Math.max(0, (f - a) / (b - a)));
  const sky = edge(0.055, 0.08) * (1 - edge(0.125, 0.15));
  const floor = edge(0.56, 0.60) * (1 - edge(0.85, 0.88));
  return Math.max(sky, floor);
}
/** The SF snowflake (ultraLight) at 8 / 11 / 15 pt, as sprites. */
function sprite(pt, dpr) {
  const box = Math.ceil(pt * 1.1), c = document.createElement('canvas');
  c.width = c.height = Math.ceil(box * dpr);
  const x = c.getContext('2d'); x.scale(dpr, dpr); x.translate(box / 2, box / 2);
  const R = box / 2 - 0.4; x.strokeStyle = '#fff'; x.lineCap = 'round'; x.lineWidth = Math.max(0.45, pt * 0.05);
  x.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 - Math.PI / 2, P = (r, da = 0) => [r * Math.cos(a + da), r * Math.sin(a + da)];
    x.moveTo(0, 0); x.lineTo(...P(R));
    const m = P(R * 0.62); x.moveTo(...m); x.lineTo(...P(R * 0.9, 0.3)); x.moveTo(...m); x.lineTo(...P(R * 0.9, -0.3));
  }
  x.stroke();
  return { c, box };
}
const REF = 978307200;   // timeIntervalSinceReferenceDate counts from 1 Jan 2001

export function mountSnowfall(container) {
  const cv = document.createElement('canvas');
  cv.className = 'season-snow'; cv.setAttribute('aria-hidden', 'true');
  container.appendChild(cv);
  const ctx = cv.getContext('2d');
  let w = 0, h = 0, dpr = 1, sprites = [], raf = 0, last = 0, alive = true;
  const size = () => {
    dpr = Math.min(3, devicePixelRatio || 1); w = cv.clientWidth; h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    sprites = [8, 11, 15].map(p => sprite(p, dpr));
    draw(still() ? 0 : Date.now() / 1000 - REF);
  };
  function draw(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    if (!h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const f of flakes()) {
      const p = ((f.phase + t * f.speed) % 1 + 1) % 1;
      const y = p * (h + 60) - 30;
      const a = f.alpha * band(y / h);
      if (a <= 0.004) continue;
      const x = f.x * w + Math.sin(t * 0.5 + f.phase * 6.28) * f.sway;
      const s = sprites[f.size];
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(t * f.spin);
      ctx.drawImage(s.c, -s.box / 2, -s.box / 2, s.box, s.box); ctx.restore();
    }
  }
  const loop = now => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (document.hidden || still()) return;
    if (now - last < 1000 / 30 - 2) return;
    last = now; draw(Date.now() / 1000 - REF);
  };
  const ro = new ResizeObserver(size); ro.observe(cv);
  size(); raf = requestAnimationFrame(loop);
  return { node: cv, destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); cv.remove(); } };
}
