// The web SettingsKit (iOS Home/SettingsKit.swift) and the round-intro kit
// (iOS Party/RoundIntro.swift), plus SeededRNG (iOS Loading.swift), so every
// screen ported from SwiftUI is built from the same pieces with the same
// hexes, sizes (px = pt) and springs. Styles: app/css/kit.css (load it once:
// index.html links it). Inter stands in for SF Pro; "black" = 900, "heavy" =
// 800, "bold" = 700, "semibold" = 600, "medium" = 500.
//
// ============================================================================
//  API — every builder returns an HTML STRING (compose them, then insert with
//  el()/innerHTML/morph()); behaviour is wired once per container with wire().
// ============================================================================
//
//  COLOURS
//   PanelColours.purple|pink|orange|green|gold|blue|red|teal|slate   [hex, hex, hex]
//                         (green is a getter: the season's panel while a season is on)
//   FlatIcon[name]        → [sfSymbolName, hex] for the 26 'ui-icon-*' names (else undefined)
//   roundColours(tier)    → RoundIntro.colours: easy green · medium gold · hard orange · expert red · impossible purple
//   kitGreen()            → SettingsKit's `green` (Theme.pillFill(.easy): #1ed760, season accent in a season)
//
//  COLOUR PANELS (the Games-tab look)
//   panel({ title, note?, icon, colours, body, key?, cls?, attrs?, subtle? })
//                         SettingsPanel: gradient + record grooves + sheen + light edge + coloured shadow,
//                         big italic caps title (21px black, -0.5 tracking), note (12 semibold white .82),
//                         3D icon top-right (a FlatIcon name → white IconTile 42; else /app/img/games/<icon>.webp
//                         at 62 with -8px vertical margin); `body` (HTML) underneath, 12px gap, 14px padding.
//                         `subtle: true` = the calm panel (or put class "k-subtle" on any ancestor, like
//                         SwiftUI's \.subtlePanels environment).
//   dressAttr(colours, { radius = 20, grooves = [-45, 38], cls = '', style = '' })
//                         → ' class="k-dress …" style="…"' — panelBackground() on any element of yours.
//                         grooves: [x, y], x < 0 = from the right edge.
//   group(rows)           PanelGroup (black .2 glass, radius 14, white .1 edge). rows: array of HTML strings
//                         (dividers go between them) or one HTML string.
//   divider()             PanelDivider (white .12, inset 50)
//   label(text)           PanelLabel (10 black caps, tracking 1.4, white .78)
//   switchRow({ key, title, note?, icon?, symbol?, on })
//                         PanelSwitch → <button data-kit="switch" data-key=key role="switch" aria-checked>
//   linkRow({ key, title, value?, icon?, symbol?, locked? })
//                         PanelLink → <button data-kit="link" data-key=key> (gold PREMIUM capsule when locked)
//   pills({ key, options, selected, onColour? })
//                         ChoicePills. options: [{ key, label, tint?, ink?, dot?, enabled? }]
//                         (tint default kitGreen(), ink default #04160b). onColour: the ink of the chosen
//                         (white) pill on a colour panel, e.g. '#7c3aed'; omit off a panel.
//                         → <div data-kit="pills" data-key=key> with <button data-kit="pill" data-v=optKey>
//   chips({ key, options, selected, columns = 3, dots = false, onColour = false })
//                         ChipGrid → <div data-kit="chips" data-key=key> with <button data-kit="chip" data-v>
//   glossy({ title, colours = PanelColours.green, height = 58, key?, tag = 'button', attrs = '' })
//                         GlossyLabel (the big button: Rematch, Play again, Share …). As a <button data-kit="glossy">
//                         by default (tag 'span'/'div' for just the face inside a button of yours).
//   iconTile(name, { size = 30, light = false })   IconTile (FlatIcon tile, or the 3D picture)
//   flatIcon(name, size)  same as iconTile(name, { size })
//   tabTitle(text)        TabTitle (26 black italic, centred, hairline under it)
//   press(scale = 0.96)   → ' data-press data-scale="…"' — Pressable(scale:) on anything (pressable() in ui.js
//                         must be running on an ancestor; app.js runs it on document).
//
//  PLAIN SETTINGS SET (the party's GAME SETTINGS sheet etc.)
//   settingsTitle({ text, done = false, key = 'close' })  → <button data-kit="link" data-key=key> on the right
//   section({ title, note?, trailing? })   caps 11 heavy label
//   card(rows)            SettingsCard (white .045, radius 16) with SettingsDividers between rows
//   settingsIcon(symbol, tint = kitGreen())
//   plainSwitch({ key, title, note?, symbol, tint?, on })  SwitchRow (data-kit="switch")
//   plainLink({ key, title, value, symbol, tint?, highlighted?, locked? })  LinkRow (data-kit="link")
//
//  ROUND INTRO KIT
//   roundBanner({ title, tier, subtitle?, shown = true, colours?, compact = false, key? })
//                         "ROUND 2" on a glossy band tilted -3°, the level pill under it; shown:false holds
//                         both parts off screen (band -460px, pill +460px). setBannerShown(el, bool) slams it
//                         in/out with spring(0.5, 0.72). `el` is the .k-banner element.
//   grooves({ x = -34, y = 50, start = 18, step = 10, opacity = 0.08 })  Grooves as an absolute layer
//   stageLight(colour)    StageLight: a fixed pool of the level colour from the floor (put it behind content)
//   countRing({ number, accent, size = 150 })  CountRing: one big number in the accent (SF Rounded heavy)
//   popCount(el, number)  set the count and pop it (scale 1.4/opacity .3 → 1 on spring(0.32, 0.55))
//   runCount(el, endsAt, { onTick?, onDone? })  run a CountRing from the clock until endsAt (ms epoch):
//                         ceil(seconds left), popping each second. → stop()
//   countLine({ accent }) CountLine: a 6px capsule; runCountLine(el, endsAt, lengthSeconds) drains it from
//                         the clock every frame → stop()
//   capsLine(text, colour = '#a8a8a8')   CapsLine (11 heavy caps, tracking 3, centred, 2 lines)
//
//  BEHAVIOUR
//   wire(root, { switch(key, on, el), pick(groupKey, value, el), link(key, el), glossy(key, el) })
//                         One delegated click handler on root. Switch/pill/chip update themselves at once
//                         (optimistic, animated) and play Haptics.select; then your handler runs. Re-rendering
//                         with morph() afterwards is fine (data-k keys keep the nodes, so CSS transitions run).
//                         Also runs fit(root) now and whenever root resizes. → unwire()
//   setSwitch(el, on) / setPick(groupEl, value)   change one from code (no handler, no haptic)
//   fit(root)             shrink every [data-fit="0.75"] line to fit its box, down to that scale
//                         (SwiftUI lineLimit(1).minimumScaleFactor)
//
//  RANDOM
//   new SeededRNG(seed)   iOS SeededRNG (xorshift64) + Swift's stdlib random(in:)/shuffled(using:), bit for bit:
//     .next() → BigInt (UInt64)      .nextBelow(bigintBound) → BigInt (Swift next(upperBound:), Lemire)
//     .int(lo, hi)        Int.random(in: lo..<hi)       .intClosed(lo, hi)     Int.random(in: lo...hi)
//     .double(lo, hi)     Double/CGFloat.random(in: lo..<hi)   .doubleClosed(lo, hi)  …(in: lo...hi)
//     .bool()             Bool.random(using:)            .shuffled(array) / .shuffle(array)
//     SeededRNG.seed(n)   Swift UInt64(truncatingIfNeeded:) of any integer (negative ok), e.g.
//                         new SeededRNG(SeededRNG.seed(0x9E37 + day * 31 + preset))
// ============================================================================
import { esc, mix, PILL_FILL } from './ui.js';
import { sf } from './icons.js';
import { Season } from './season.js';
import { spring, still } from './motion.js';
import { Haptics } from './haptics.js';

// ---------------------------------------------------------------- colours
const GREEN = ['#3ff08f', '#14a95a', '#0a5c35'];
export const PanelColours = {
  purple: ['#c07bff', '#7c3aed', '#3b1286'],
  pink: ['#ff5fb8', '#c026d3', '#5b1690'],
  orange: ['#ffa53a', '#f8545c', '#a31d5b'],
  /** The brand's big-button green; in a season it is the season's panel. */
  get green() { return Season.on ? Season.panel : GREEN; },
  gold: ['#ffd84a', '#f59e0b', '#9a4a07'],
  blue: ['#5aa2ff', '#2f5fe0', '#16287a'],
  red: ['#ff7a6b', '#e23a4c', '#7f1531'],
  teal: ['#33e6c4', '#0f9e8a', '#0a4d45'],
  slate: ['#6f8279', '#3a4a43', '#1c2621'],
};
export const kitGreen = () => PILL_FILL.easy;
const GREEN_INK = '#04160b';

export const FlatIcon = {
  'ui-icon-game': ['music.note', '#9b5cff'],
  'ui-icon-artist': ['music.mic', '#ff4fa3'],
  'ui-icon-album': ['opticaldisc.fill', '#ff8a2b'],
  'ui-icon-hint': ['lightbulb.fill', '#f5b700'],
  'ui-icon-search': ['magnifyingglass', '#3d8bff'],
  'ui-icon-lookfeel': ['paintbrush.pointed.fill', '#1ed760'],
  'ui-icon-animations': ['sparkles', '#9b5cff'],
  'ui-icon-artwork': ['photo.fill', '#ff8a2b'],
  'ui-icon-glow': ['sun.max.fill', '#14c3a2'],
  'ui-icon-colours': ['paintpalette.fill', '#ff4fa3'],
  'ui-icon-spotlight': ['flashlight.on.fill', '#f5b700'],
  'ui-icon-help': ['questionmark', '#5b6b64'],
  'ui-icon-restore': ['arrow.clockwise', '#f5b700'],
  'ui-icon-code': ['qrcode', '#1ed760'],
  'ui-icon-addfriend': ['person.badge.plus', '#3d8bff'],
  'ui-icon-requests': ['envelope.fill', '#ff8a2b'],
  'ui-icon-friends': ['person.2.fill', '#9b5cff'],
  'ui-icon-waiting': ['hourglass', '#5b6b64'],
  'ui-icon-signin': ['lock.fill', '#ff4fa3'],
  'ui-icon-teams': ['flag.2.crossed.fill', '#ff4fa3'],
  'ui-icon-songs': ['music.note.list', '#9b5cff'],
  'ui-icon-rounds': ['flag.checkered', '#ff8a2b'],
  'ui-icon-difficulty': ['gauge.with.dots.needle.67percent', '#14c3a2'],
  'ui-icon-time': ['stopwatch.fill', '#3d8bff'],
  'ui-icon-years': ['calendar', '#f5b700'],
  'ui-icon-antishazam': ['shield.lefthalf.filled', '#ff4d5e'],
};

export function roundColours(tier) {
  switch (tier) {
    case 'medium': return PanelColours.gold;
    case 'hard': return PanelColours.orange;
    case 'expert': return PanelColours.red;
    case 'impossible': return PanelColours.purple;
    default: return PanelColours.green;
  }
}

const rgb = h => { h = String(h).replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(','); };
const fmt = n => +(+n).toFixed(3);

// ------------------------------------------------- shared styles from JS
// The record grooves as one big SVG of rings each (crisp at any DPR), and the
// springs as CSS linear() easings.
const RING_R = 820;
function rings(start, step, opacity) {
  let c = '';
  for (let r = start; r < RING_R; r += step) c += `<circle cx="${RING_R}" cy="${RING_R}" r="${r}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${RING_R * 2}" height="${RING_R * 2}" fill="none" stroke="#fff" stroke-opacity="${opacity}" stroke-width="1">${c}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
(function installStyles() {
  if (typeof document === 'undefined' || document.getElementById('kit-js-vars')) return;
  const s = document.createElement('style'); s.id = 'kit-js-vars';
  s.textContent = `:root{--k-rings-panel:${rings(22, 11, 0.07)};--k-rings-band:${rings(18, 10, 0.08)};--k-ring-r:${RING_R}px;`
    + `--k-sp-switch:${spring(0.25, 0.8).css};--k-sp-pill:${spring(0.3, 0.82).css};--k-sp-chip:${spring(0.3, 0.8).css};--k-sp-banner:${spring(0.5, 0.72).css};}`;
  document.head.appendChild(s);
})();

// ---------------------------------------------------------------- pieces
export const press = (scale = 0.96) => ` data-press data-scale="${scale}"`;

/** CSS variables for a gradient [c0, c1, c2]. */
function vars(colours) {
  const [a, b, c] = colours.length >= 3 ? colours : [colours[0], colours[1] ?? colours[0], colours[1] ?? colours[0]];
  return `--c0:${a};--c1:${b};--c2:${c};--c0rgb:${rgb(a)};--c2rgb:${rgb(c)};--c0t:${mix(a, '#ffffff', 0.25)};`;
}

export function dressAttr(colours, { radius = 20, grooves = [-45, 38], cls = '', style = '' } = {}) {
  const [gx, gy] = grooves;
  const pos = gx < 0 ? `--gx:right ${fmt(-gx - RING_R)}px;` : `--gx:left ${fmt(gx - RING_R)}px;`;
  return ` class="k-dress ${cls}" style="${vars(colours)}--r:${radius}px;${pos}--gy:${fmt(gy - RING_R)}px;${style}"`;
}

export function iconTile(name, { size = 30, light = false } = {}) {
  const f = FlatIcon[name];
  if (f) {
    const [symbol, colour] = f;
    const bg = light ? '#fff' : `linear-gradient(${mix(colour, '#ffffff', 0.12)},${colour})`;
    return `<span class="k-tile" aria-hidden="true" style="width:${size}px;height:${size}px;border-radius:${fmt(size * 0.27)}px;background:${bg};color:${light ? colour : '#fff'};font-size:${fmt(size * 0.48)}px">${sf(symbol)}</span>`;
  }
  return `<img class="k-pic" src="/app/img/games/${esc(name)}.webp" alt="" aria-hidden="true" style="width:${size}px;height:${size}px">`;
}
export const flatIcon = (name, size = 30) => iconTile(name, { size });

export function panel({ title, note = null, icon, colours, body = '', key = null, cls = '', attrs = '', subtle = false }) {
  const pic = FlatIcon[icon]
    ? `<span class="k-picon flat">${iconTile(icon, { size: subtle ? 36 : 42, light: true })}</span>`
    : icon ? `<img class="k-picon pic" src="/app/img/games/${esc(icon)}.webp" alt="" aria-hidden="true">` : '';
  return `<section${dressAttr(colours, { cls: `k-panel k-cq ${subtle ? 'k-subtle-self' : ''} ${cls}` })}${key != null ? ` data-k="${esc(key)}"` : ''} ${attrs}>
    <div class="k-ph"><div class="k-pt"><h3 class="k-ptitle" data-fit="0.75">${esc(title)}</h3>${note != null ? `<p class="k-pnote">${esc(note)}</p>` : ''}</div>${pic}</div>
    ${body}</section>`;
}

export const divider = () => '<i class="k-div" aria-hidden="true"></i>';
export function group(rows) {
  const inner = Array.isArray(rows) ? rows.filter(Boolean).join(divider()) : rows;
  return `<div class="k-group">${inner}</div>`;
}
export const label = text => `<div class="k-label">${esc(text)}</div>`;

function glyphHTML(icon, symbol) {
  if (icon) return `<span class="k-glyph">${iconTile(icon, { size: FlatIcon[icon] ? 28 : 30 })}</span>`;
  if (symbol) return `<span class="k-glyph"><span class="k-sym">${sf(symbol)}</span></span>`;
  return '';
}

export function switchRow({ key, title, note = null, icon = null, symbol = null, on }) {
  return `<button class="k-row k-swrow${on ? ' on' : ''}" data-kit="switch" data-key="${esc(key)}" data-k="sw-${esc(key)}" role="switch" aria-checked="${on ? 'true' : 'false'}">
    ${glyphHTML(icon, symbol)}<span class="k-rt"><span class="k-rtitle">${esc(title)}</span>${note != null ? `<span class="k-rnote">${esc(note)}</span>` : ''}</span>
    <span class="k-switch" aria-hidden="true"><i></i></span></button>`;
}

export function linkRow({ key, title, value = '', icon = null, symbol = null, locked = false }) {
  const end = locked ? `<span class="k-prem">${sf('crown.fill')}PREMIUM</span>`
    : value ? `<span class="k-rvalue" data-fit="0.75">${esc(value)}</span>` : '';
  return `<button class="k-row k-link" data-kit="link" data-key="${esc(key)}" data-k="ln-${esc(key)}"${press(0.98)}>
    ${glyphHTML(icon, symbol)}<span class="k-rtitle">${esc(title)}</span><span class="k-sp"></span>${end}<span class="k-chev">${sf('chevron.right')}</span></button>`;
}

export function pills({ key, options, selected, onColour = null }) {
  const i = Math.max(0, options.findIndex(o => o.key === selected));
  const sel = options[i] || {};
  const tint = sel.tint || kitGreen();
  const thumbBg = onColour ? '#fff' : `linear-gradient(${mix(tint, '#ffffff', 0.14)},${tint})`;
  const small = options.length >= 5;
  return `<div class="k-pills${onColour ? ' on-colour' : ''}${small ? ' small' : ''}" data-kit="pills" data-key="${esc(key)}" data-k="pl-${esc(key)}" role="radiogroup" style="--n:${options.length};--i:${i};--ink-on:${onColour || ''}">
    <i class="k-thumb" aria-hidden="true" style="background:${thumbBg}"></i>
    ${options.map(o => {
      const on = o.key === selected, enabled = o.enabled !== false;
      const ink = on ? (onColour || o.ink || GREEN_INK) : '';
      return `<button class="k-pill${on ? ' on' : ''}${enabled ? '' : ' off'}" data-kit="pill" data-v="${esc(o.key)}" data-k="${esc(o.key)}" role="radio" aria-checked="${on}" data-tint="${o.tint || ''}" data-ink="${o.ink || ''}"${ink ? ` style="color:${ink}"` : ''}>${o.dot && !on ? `<i class="k-dot" style="background:${o.tint || kitGreen()}"></i>` : ''}<span data-fit="0.75">${esc(o.label)}</span></button>`;
    }).join('')}</div>`;
}

export function chips({ key, options, selected, columns = 3, dots = false, onColour = false }) {
  return `<div class="k-chips${onColour ? ' on-colour' : ''}" data-kit="chips" data-key="${esc(key)}" data-k="ch-${esc(key)}" role="radiogroup" data-dots="${dots ? 1 : 0}" style="--cols:${columns}">
    ${options.map(o => chipHTML(o, o.key === selected, dots, onColour)).join('')}</div>`;
}
function chipHTML(o, on, dots, onColour) {
  const tint = o.tint || kitGreen(), enabled = o.enabled !== false;
  const deep = mix(tint, '#000000', 0.38);
  const bg = on ? (onColour ? '#fff' : `linear-gradient(${mix(tint, '#ffffff', 0.14)},${tint})`) : '';
  const colour = on ? (onColour ? deep : (o.ink || GREEN_INK)) : '';
  const dot = (dots && !on) || (on && onColour) ? `<i class="k-dot" style="background:${tint}"></i>` : '';
  return `<button class="k-chip${on ? ' on' : ''}${enabled ? '' : ' off'}" data-kit="chip" data-v="${esc(o.key)}" data-k="${esc(o.key)}" role="radio" aria-checked="${on}" data-tint="${tint}" data-ink="${o.ink || ''}" style="${bg ? `background:${bg};` : ''}${colour ? `color:${colour}` : ''}">${dot}<span data-fit="0.8">${esc(o.label)}</span></button>`;
}

export function glossy({ title, colours = PanelColours.green, height = 58, key = null, tag = 'button', attrs = '' }) {
  const t = tag === 'button' ? `button data-kit="glossy"${key != null ? ` data-key="${esc(key)}"` : ''}${press()}` : tag;
  return `<${t}${dressAttr(colours, { radius: 18, cls: 'k-glossy' })} ${attrs}><span class="k-gt" style="height:${height}px" data-fit="0.7">${esc(title)}</span></${tag}>`;
}

export const tabTitle = text => `<h2 class="k-tabtitle">${esc(text)}</h2>`;

// ---------------------------------------------------- plain settings set
export function settingsTitle({ text, done = false, key = 'close' }) {
  return `<div class="k-stitle"><h2>${esc(text)}</h2>${done
    ? `<button class="k-done" data-kit="link" data-key="${esc(key)}"${press()}>Done</button>`
    : `<button class="k-xdisc" data-kit="link" data-key="${esc(key)}" aria-label="Close"${press()}>${sf('xmark')}</button>`}</div>`;
}
export function section({ title, note = null, trailing = '' }) {
  return `<div class="k-section"><div class="k-sh"><span>${esc(title)}</span>${trailing}</div>${note != null ? `<p>${esc(note)}</p>` : ''}</div>`;
}
export function card(rows) {
  const inner = Array.isArray(rows) ? rows.filter(Boolean).join('<i class="k-sdiv" aria-hidden="true"></i>') : rows;
  return `<div class="k-card">${inner}</div>`;
}
export function settingsIcon(symbol, tint = kitGreen()) {
  return `<span class="k-sicon" style="color:${tint};background:rgba(${rgb(tint)},.15)">${sf(symbol)}</span>`;
}
export function plainSwitch({ key, title, note = null, symbol, tint = kitGreen(), on }) {
  return `<button class="k-prow k-swrow plain${on ? ' on' : ''}" data-kit="switch" data-key="${esc(key)}" data-k="sw-${esc(key)}" role="switch" aria-checked="${on}" style="--tint:${tint}">
    ${settingsIcon(symbol, tint)}<span class="k-rt"><span class="k-rtitle">${esc(title)}</span>${note != null ? `<span class="k-rnote">${esc(note)}</span>` : ''}</span>
    <span class="k-switch plain" aria-hidden="true"><i></i></span></button>`;
}
export function plainLink({ key, title, value = '', symbol, tint = kitGreen(), highlighted = false, locked = false }) {
  const end = locked ? `<span class="k-prem plain">${sf('crown.fill')}PREMIUM</span>`
    : `<span class="k-pvalue${highlighted ? ' hi' : ''}" style="${highlighted ? `color:${mix(tint, '#ffffff', 0.2)}` : ''}">${esc(value)}</span>`;
  return `<button class="k-prow k-plink" data-kit="link" data-key="${esc(key)}" data-k="ln-${esc(key)}"${press(0.98)}>
    ${settingsIcon(symbol, tint)}<span class="k-rtitle">${esc(title)}</span><span class="k-sp"></span>${end}<span class="k-chev plain">${sf('chevron.right')}</span></button>`;
}

// ------------------------------------------------------- round intro kit
export function grooves({ x = -34, y = 50, start = 18, step = 10, opacity = 0.08 } = {}) {
  const img = start === 18 && step === 10 && opacity === 0.08 ? 'var(--k-rings-band)' : rings(start, step, opacity);
  const px = x < 0 ? `right ${fmt(-x - RING_R)}px` : `left ${fmt(x - RING_R)}px`;
  return `<i class="k-grooves" aria-hidden="true" style="background:${img} no-repeat ${px} top ${fmt(y - RING_R)}px"></i>`;
}

export function stageLight(colour) {
  return `<div class="k-stagelight" aria-hidden="true" style="--a:${rgb(colour)}"></div>`;
}

export function roundBanner({ title, tier = 'easy', subtitle = null, shown = true, colours = null, compact = false, key = null }) {
  const c = colours || roundColours(tier);
  const accent = (Season.on ? Season.level(tier) : null) || ({ easy: '#19df70', medium: '#f7c823', hard: '#ff8a2b', expert: '#f8545c', impossible: '#a855f7' })[tier];
  return `<div class="k-banner${shown ? '' : ' off'}${compact ? ' compact' : ''}"${key != null ? ` data-k="${esc(key)}"` : ''}>
    <div${dressAttr(c, { radius: 20, grooves: [-34, 50], cls: 'k-band' })}><span class="k-bt" data-fit="0.6">${esc(title)}</span></div>
    ${subtitle != null ? `<div class="k-bsub" style="--a:${accent};--argb:${rgb(accent)}">${esc(subtitle)}</div>` : ''}</div>`;
}
export function setBannerShown(el, shown) { el?.classList.toggle('off', !shown); }

export function countRing({ number, accent, size = 150 }) {
  return `<div class="k-count" role="timer" aria-label="${Math.max(0, number)}" style="color:${accent};width:${size}px;height:${fmt(size * 0.6)}px;font-size:${fmt(size * 0.43)}px"><span>${Math.max(0, number)}</span></div>`;
}
const POP = spring(0.32, 0.55);
export function popCount(el, number) {
  if (!el) return;
  const n = Math.max(0, number | 0);
  const span = el.querySelector('span') || el;
  span.textContent = String(n); el.setAttribute('aria-label', String(n));
  if (still()) return;
  span.getAnimations?.().forEach(a => a.cancel());
  span.animate?.([{ transform: 'scale(1.4)', opacity: 0.3 }, { transform: 'scale(1)', opacity: 1 }], { duration: POP.ms, easing: POP.easing });
}
export function runCount(el, endsAt, { onTick, onDone } = {}) {
  let last = null, timer = 0, dead = false;
  const tick = () => {
    if (dead) return;
    const left = endsAt - Date.now(), n = Math.max(0, Math.ceil(left / 1000));
    if (n !== last) { last = n; popCount(el, n); onTick && onTick(n); }
    if (n <= 0) { onDone && onDone(); return; }
    timer = setTimeout(tick, Math.max(16, (left % 1000) + 5));
  };
  tick();
  return () => { dead = true; clearTimeout(timer); };
}

export const countLine = ({ accent }) => `<div class="k-cline" aria-hidden="true" style="--a:${accent};--argb:${rgb(accent)}"><i></i></div>`;
export function runCountLine(el, endsAt, length) {
  const bar = el?.querySelector('i'); if (!bar) return () => {};
  let raf = 0;
  const f = () => { const fill = Math.min(1, Math.max(0, (endsAt - Date.now()) / 1000 / Math.max(0.1, length))); bar.style.width = (fill * 100) + '%'; if (fill > 0) raf = requestAnimationFrame(f); };
  f();
  return () => cancelAnimationFrame(raf);
}

export const capsLine = (text, colour = '#a8a8a8') => `<div class="k-caps" style="color:${colour}">${esc(text)}</div>`;

// --------------------------------------------------------------- behaviour
export function setSwitch(el, on) {
  el.classList.toggle('on', !!on); el.setAttribute('aria-checked', on ? 'true' : 'false');
}
export function setPick(groupEl, value) {
  if (!groupEl) return;
  const isPills = groupEl.dataset.kit === 'pills';
  const opts = Array.from(groupEl.querySelectorAll(isPills ? '[data-kit=pill]' : '[data-kit=chip]'));
  const i = opts.findIndex(b => b.dataset.v === String(value)); if (i < 0) return;
  if (isPills) {
    const onColour = groupEl.style.getPropertyValue('--ink-on').trim();
    groupEl.style.setProperty('--i', i);
    opts.forEach((b, k) => {
      const on = k === i; b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
      b.style.color = on ? (onColour || b.dataset.ink || GREEN_INK) : '';
      const dot = b.querySelector('.k-dot'); if (dot) dot.style.visibility = on ? 'hidden' : '';
    });
    const tint = opts[i].dataset.tint || kitGreen();
    const th = groupEl.querySelector('.k-thumb');
    if (th) th.style.background = onColour ? '#fff' : `linear-gradient(${mix(tint, '#ffffff', 0.14)},${tint})`;
  } else {
    const onColour = groupEl.classList.contains('on-colour'), dots = groupEl.dataset.dots === '1';
    opts.forEach((b, k) => {
      const on = k === i, o = { key: b.dataset.v, label: b.textContent, tint: b.dataset.tint, ink: b.dataset.ink || undefined, enabled: !b.classList.contains('off') };
      const fresh = document.createElement('template'); fresh.innerHTML = chipHTML(o, on, dots, onColour).trim();
      const nb = fresh.content.firstElementChild;
      b.className = nb.className; b.setAttribute('aria-checked', on); b.setAttribute('style', nb.getAttribute('style') || ''); b.innerHTML = nb.innerHTML;
    });
  }
}

export function fit(root = document) {
  root.querySelectorAll('[data-fit]').forEach(n => {
    const min = parseFloat(n.dataset.fit) || 1;
    n.style.fontSize = '';
    const w = n.clientWidth, sw = n.scrollWidth;
    if (!w || sw <= w + 0.5) return;
    const base = parseFloat(getComputedStyle(n).fontSize);
    n.style.fontSize = (base * Math.max(min, w / sw)).toFixed(2) + 'px';
  });
}

export function wire(root, h = {}) {
  const onClick = e => {
    const b = e.target.closest('[data-kit]'); if (!b || !root.contains(b)) return;
    const kind = b.dataset.kit;
    if (kind === 'switch') {
      const on = !b.classList.contains('on'); Haptics.select(); setSwitch(b, on); h.switch && h.switch(b.dataset.key, on, b);
    } else if (kind === 'pill' || kind === 'chip') {
      if (b.classList.contains('on') || b.classList.contains('off')) return;
      const g = b.closest('[data-kit=pills],[data-kit=chips]'); Haptics.select(); setPick(g, b.dataset.v);
      h.pick && h.pick(g?.dataset.key, b.dataset.v, b);
    } else if (kind === 'link') h.link && h.link(b.dataset.key, b);
    else if (kind === 'glossy') h.glossy && h.glossy(b.dataset.key, b);
  };
  root.addEventListener('click', onClick);
  let ro = null;
  requestAnimationFrame(() => fit(root));
  document.fonts?.ready?.then(() => fit(root));
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => fit(root)); ro.observe(root); }
  return () => { root.removeEventListener('click', onClick); ro && ro.disconnect(); };
}

// ------------------------------------------------------------------ random
const M64 = (1n << 64n) - 1n;
const TWO53 = 1n << 53n;
/** iOS SeededRNG: xorshift64 (13, 7, 17), zero seed → 0x2545F4914F6CDD1D. */
export class SeededRNG {
  constructor(seed) { const s = SeededRNG.seed(seed); this.state = s === 0n ? 0x2545F4914F6CDD1Dn : s; }
  /** UInt64(truncatingIfNeeded:) of a Number or BigInt. */
  static seed(n) { return BigInt.asUintN(64, typeof n === 'bigint' ? n : BigInt(Math.trunc(n))); }
  next() {
    let s = this.state;
    s ^= (s << 13n) & M64; s ^= s >> 7n; s ^= (s << 17n) & M64;
    this.state = s; return s;
  }
  /** Swift RandomNumberGenerator.next(upperBound:) — Lemire's nearly divisionless method. */
  nextBelow(bound) {
    let m = this.next() * bound;
    if ((m & M64) < bound) {
      const t = ((1n << 64n) - bound) % bound;
      while ((m & M64) < t) m = this.next() * bound;
    }
    return m >> 64n;
  }
  int(lo, hi) {
    const d = BigInt.asUintN(64, BigInt(hi) - BigInt(lo));
    return Number(BigInt.asIntN(64, BigInt.asUintN(64, BigInt(lo)) + this.nextBelow(d)));
  }
  intClosed(lo, hi) {
    let d = BigInt.asUintN(64, BigInt(hi) - BigInt(lo));
    if (d === M64) return Number(BigInt.asIntN(64, this.next()));
    d += 1n;
    return Number(BigInt.asIntN(64, BigInt.asUintN(64, BigInt(lo)) + this.nextBelow(d)));
  }
  double(lo, hi) {
    const delta = hi - lo;
    for (;;) {
      const u = Number(this.next() & (TWO53 - 1n)) * 2 ** -53;
      const v = delta * u + lo;
      if (v !== hi) return v;
    }
  }
  doubleClosed(lo, hi) {
    const delta = hi - lo, r = this.nextBelow(TWO53 + 1n);
    if (r === TWO53) return hi;
    return delta * (Number(r) * 2 ** -53) + lo;
  }
  bool() { return ((this.next() >> 17n) & 1n) === 0n; }
  /** Swift's MutableCollection.shuffle(using:), in place. */
  shuffle(a) {
    let amount = a.length, i = 0;
    while (amount > 1) { const r = this.int(0, amount); amount -= 1; const j = i + r; [a[i], a[j]] = [a[j], a[i]]; i += 1; }
    return a;
  }
  shuffled(list) { return this.shuffle(Array.from(list)); }
}
