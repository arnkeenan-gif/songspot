// Songspot's brand characters on the web: iOS Profile/DefaultAvatar.swift
// (DefaultAvatar, CartoonFace, CharacterFigure, PoseMotion, GirlNames),
// Profile/PoseClip.swift (the clip player), Profile/NameFilter.swift,
// Profile/PlayerName.swift and Profile/CharacterPicker.swift ("Edit avatar").
//
// Every face in the game is one of these glossy vinyl-toy characters. Photos
// are gone (iOS e0338ca): a stored base64 photo in `profiles.avatar` is
// ignored and drawn as the player's default character, exactly as the
// iPhone does. A chosen character travels in the avatar field as
// `char:<id>:<pose>:<v.v.v.v.v>` (see Choice).
//
// ───────────────────────────── API ─────────────────────────────
// Roster (DefaultAvatar)
//   COUNT 59 · SPOT 46 · SPOT_GIRL 54 (Spot's sister) · SONGBOT 47
//   HALLOWEEN [48..53] · LEGENDS [{id:58,at:400},{id:59,at:1000}] · LEGEND_NAMES {58,59} · RETIRED Set(55,56,57)
//   EVERYDAY                    the stand-in cast: [46, 1..45 without 34] (45 ids, iOS order)
//   has(id)                     a portrait ships for this id (01-54, 58, 59)
//   roster(season?)             the picker order: 46, 54, (48-53 in Halloween), 1..45 w/o 34, 58, 59
//   unlockAt(id) · isUnlocked(id, named)
//   POSES ['portrait','fight','dance','win','lose'] · POSE_TITLES
//   indexForKey(key)            FNV-1a 32-bit (unsigned) over the trimmed+lowercased UTF-8 key → EVERYDAY[h % 45];
//                               'songbot'/'bot-songbot' → 47. Bit-identical to iOS (tested in tools, see report).
//   unchosen(key)               what a real player wears until they choose: Spot (Songbot keys stay Songbot)
//   indexFor(avatar, key)       someone's character from their profile's avatar field (Choice id, else unchosen(key))
//   indexOfPlayer({face, avatar, id})  a party player's character (PartyPlayer.face, then avatar, then hash of id)
//   myKey(account) · myIndex(account)  your key (user id, else name) and your character (what you send as `face`)
//   parseChoice(raw) → {id, pose, variants:{pose:n}} | null  (iOS Choice(raw): retired ids → Spot; photos/nil → null)
//   choiceRaw({id, pose, variants}) / formatChoice(id, pose, variants) → 'char:12:portrait:1.1.1.1.1'
//   variantOf(choice, pose) → n (1 when unset)
//   assetName(id) 'char-NN' · poseAsset(id, pose, v) · poseName(id, pose, v) (falls back to v1, then the portrait)
//   portraitURL(id) '/app/img/chars/char-NN.webp' · poseURL(id, pose, v) · clipURL(name) (webm, or .mov on Safari)
// Names
//   GirlNames.ready (Promise) · GirlNames.contains(name) (false until the list has loaded)
//   NameFilter.allows(name) · NameFilter.blocked(name) · NameFilter.shown(name) ('Player' when blocked)
//   PlayerName.first(name)      'Johnson Derrick Lewis' → 'Johnson', 'johnson_lewis' → 'johnson'
// Drawing
//   faceHTML(avatar, key, size = 40, opts)  CartoonFace in a circle. `avatar` may be the avatar string (char:/photo/null)
//        or a NUMBER (a character id). opts: { hash: true → stand-in by key (CartoonFace(key:)), variant, cls, ring:
//        'css colour' (2pt ring), square: true (no circle clip, fills the box), label, style }. size null → 100% of the box.
//   figureHTML(index, pose = 'fight', opts)  CharacterFigure: full-body cut-out, feet on the bottom edge, may spill
//        sideways. opts: { height: px (else fills the parent's height), variant, floor: 'css colour' (pool of light),
//        animated = true, calm = false (quiet idle), clip = true (play the pose's clip once, then calm idle), cls }.
//        Figures start themselves when they land in the DOM (a MutationObserver), and stop when removed.
//   mountFigures(root)          start any figures under root at once (idempotent) · stopFigures(root)
//   PoseMotion.calm(pose, t) · PoseMotion.frame(pose, t) → {dx, dy, sx, sy, rot, lift}  (pure functions of time)
//   openCharacterPicker(ctx, { onClose })    "EDIT AVATAR": full-screen picker over the page; Save writes the choice.
// Motion: the web's Motion setting (motion.js `still()`: body.nomotion or prefers-reduced-motion) keeps every figure still.
// ────────────────────────────────────────────────────────────────
import { el, esc, pushView, popView } from './ui.js';
// ui.js imports this file (face() draws through faceHTML), so nothing here may touch ui.js, motion.js or
// haptics.js while modules are still loading: those are read lazily.
const still = () => (typeof document !== 'undefined' && document.body && document.body.classList.contains('nomotion'))
  || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);   // motion.js still()
const Haptics = { select: () => buzz('select'), success: () => buzz('success') };
function buzz(kind) { import('./haptics.js').then(m => m.Haptics[kind] && m.Haptics[kind]()).catch(() => {}); }

// Its own stylesheet, once, whoever imports this first.
if (typeof document !== 'undefined' && document.head && !document.getElementById('css-characters')) {
  const l = document.createElement('link'); l.id = 'css-characters'; l.rel = 'stylesheet'; l.href = '/app/css/characters.css?v=1'; document.head.appendChild(l);
}

// The season engine is built alongside; read it if it is there.
let seasonMod = null;
import('./season.js').then(m => { seasonMod = m; }).catch(() => {});
function currentSeason() {
  try {
    const S = seasonMod && (seasonMod.Season || seasonMod.default || seasonMod);
    if (!S) return null;
    const c = typeof S.current === 'function' ? S.current() : S.current;
    return typeof c === 'string' ? c : (c && (c.id || c.key || c.name)) || null;
  } catch (e) { return null; }
}

// ───────── the roster ─────────
export const COUNT = 59;
export const SPOT = 46;
export const SPOT_GIRL = 54;
export const SONGBOT = 47;
export const HALLOWEEN = [48, 49, 50, 51, 52, 53];
export const LEGENDS = [{ id: 58, at: 400 }, { id: 59, at: 1000 }];
export const LEGEND_NAMES = { 58: 'Drill Rapper', 59: 'Rap Boss' };
export const RETIRED = new Set([55, 56, 57]);

/** The portraits that ship (iOS `has`): 01-54 and the two legends. */
export const has = i => Number.isInteger(i) && ((i >= 1 && i <= 54) || i === 58 || i === 59);
export const unlockAt = id => (LEGENDS.find(l => l.id === id) || { at: 0 }).at;
export const isUnlocked = (id, named) => (named || 0) >= unlockAt(id);

/** The everyday cast handed to stand-ins: Spot, then 1…45 without 34. Kept exactly as iOS. */
export const EVERYDAY = [SPOT, ...Array.from({ length: 45 }, (_, k) => k + 1).filter(n => n !== 34)];

/** The picker's order: the two Spots, the costumes in Halloween, the rest, the legends last. */
export function roster(season = currentSeason()) {
  const spots = [SPOT, SPOT_GIRL].filter(has);
  const rest = EVERYDAY.filter(n => n !== SPOT);
  const won = LEGENDS.map(l => l.id).filter(has);
  if (season !== 'halloween') return [...spots, ...rest, ...won];
  return [...spots, ...HALLOWEEN.filter(has), ...rest, ...won];
}

export const POSES = ['portrait', 'fight', 'dance', 'win', 'lose'];
export const POSE_TITLES = { portrait: 'Vibing', fight: 'Battle', dance: 'Dance', win: 'Victory', lose: 'Defeat' };

// ───────── text the way Swift reads it ─────────
/** CharacterSet.whitespacesAndNewlines: Zs, tab, LF…CR, NEL, LS, PS. (JS trim() differs on U+FEFF and U+0085.) */
const WS = '\\p{Zs}\\t\\n\\v\\f\\r\\u0085\\u2028\\u2029';
const trimSwift = s => String(s ?? '').replace(new RegExp(`^[${WS}]+|[${WS}]+$`, 'gu'), '');

/** Swift Int(String): optional sign, ASCII digits only, must fit. */
function swiftInt(s) {
  if (!/^[+-]?[0-9]+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

// ───────── Choice: char:<id>:<pose>:<v.v.v.v.v> ─────────
/** `char:12:fight:1.2.1.3` → { id 12, pose 'fight', variants }; null for a photo, nothing, or a bad id. Older `char:12:fight` still reads. */
export function parseChoice(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('char:')) return null;
  const parts = raw.split(':').filter(p => p.length);          // Swift split drops empty pieces
  if (parts.length < 2) return null;
  const n = swiftInt(parts[1]);
  if (n == null || n < 1 || n > COUNT) return null;
  const id = RETIRED.has(n) ? SPOT : n;
  const pose = parts.length > 2 && POSES.includes(parts[2]) ? parts[2] : 'portrait';
  const variants = {};
  if (parts.length > 3) {
    const vs = parts[3].split('.').filter(p => p.length).map(v => swiftInt(v) ?? 1);
    POSES.forEach((p, i) => { if (i < vs.length) variants[p] = Math.max(1, vs[i]); });
  }
  return { id, pose, variants };
}
export const variantOf = (choice, pose) => (choice && choice.variants && choice.variants[pose]) || 1;
/** Choice.raw: always all five versions. */
export const choiceRaw = c => `char:${c.id}:${c.pose || 'portrait'}:` + POSES.map(p => String(variantOf(c, p))).join('.');
export const formatChoice = (id, pose = 'portrait', variants = {}) => choiceRaw({ id, pose, variants });

// ───────── stable characters ─────────
const utf8 = new TextEncoder();
/** A character for any key: FNV-1a 32-bit over the trimmed, lowercased UTF-8 key, into the everyday cast. */
export function indexForKey(key) {
  const k = trimSwift(key).toLowerCase();
  if ((k === 'bot-songbot' || k === 'songbot') && has(SONGBOT)) return SONGBOT;
  let h = 0x811c9dc5;
  for (const b of utf8.encode(k)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return EVERYDAY[(h >>> 0) % EVERYDAY.length];
}
/** What a real player wears until they choose: Spot. Songbot is still Songbot. */
export function unchosen(key) {
  const k = trimSwift(key).toLowerCase();
  if (k === 'bot-songbot' || k === 'songbot' || !has(SPOT)) return indexForKey(key);
  return SPOT;
}
/** Someone else's character from their profile's avatar field. */
export const indexFor = (avatar, key) => parseChoice(avatar)?.id ?? unchosen(key ?? '');
/** A party player's character: the number they sent, else their avatar, else their player id's. */
export function indexOfPlayer(p) {
  const f = p && p.face;
  if (Number.isInteger(f) && f >= 1 && f <= COUNT) return RETIRED.has(f) ? SPOT : f;
  const c = parseChoice(p && p.avatar); if (c) return c.id;
  return indexForKey((p && p.id) || '');
}
/** Your key: the account id once signed in, else your name. */
export const myKey = account => (account && account.user && account.user.id) || (account && account.name) || '';
/** Your character: the one you picked, else Spot. What you send to a party as `face`. */
export const myIndex = account => parseChoice(account && account.avatar)?.id ?? unchosen(myKey(account));

// ───────── pictures ─────────
const wrap = i => ((((i - 1) % COUNT) + COUNT) % COUNT) + 1;
export const assetName = i => `char-${String(wrap(Number(i) || 1)).padStart(2, '0')}`;
export const poseAsset = (i, pose, v = 1) => { const base = pose === 'portrait' ? assetName(i) : `${assetName(i)}-${pose}`; return v <= 1 ? base : `${base}-${v}`; };

/** What the assets manifest (/app/img/manifest.json: { chars: [ids], poses: { id: [poses] }, clips: [names] }) says
 *  exists; null until read, and then the naming rules decide (everything ships). */
let shipped = null, clipSet = null;
fetch('/app/img/manifest.json').then(r => (r.ok ? r.json() : null)).then(m => {
  if (!m || !m.poses) return;
  const names = new Set();
  (m.chars || []).forEach(i => names.add(assetName(+i)));
  Object.entries(m.poses).forEach(([i, ps]) => (ps || []).forEach(p => names.add(String(p).startsWith('char-') ? p : `${assetName(+i)}-${p}`)));
  shipped = names;
  if (Array.isArray(m.clips)) clipSet = new Set(m.clips.map(c => String(c).replace(/\.[a-z0-9]+$/i, '')));
}).catch(() => {});
const ships = name => (shipped ? shipped.has(name) : true);

/** A full-body pose ships for this character (all 56 have all four; Songbot too). */
export const hasPose = (i, pose) => pose === 'portrait' || (has(i) && ships(poseAsset(i, pose)));
/** The versions of a pose this character has (no -2…-6 pictures ship today, so [1]). */
export const variants = (i, pose) => [1, ...[2, 3, 4, 5, 6].filter(v => shipped && shipped.has(poseAsset(i, pose, v)))];
/** The picture a pose draws: that version, else version 1, else the portrait. */
export function poseName(i, pose, v = 1) {
  if (v > 1 && shipped && shipped.has(poseAsset(i, pose, v))) return poseAsset(i, pose, v);
  return hasPose(i, pose) ? poseAsset(i, pose) : assetName(i);
}
export const portraitURL = (i, v = 1) => `/app/img/chars/${poseName(i, 'portrait', v)}.webp`;
export const poseURL = (i, pose, v = 1) => `/app/img/chars/${poseName(i, pose, v)}.webp`;

/** HEVC with alpha plays on Apple's WebKit (Safari, and every iOS browser); VP9 alpha everywhere else. */
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const appleWebKit = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  || (/Safari\//.test(ua) && /AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android|Firefox/.test(ua));
/** Only fight clips ship (PoseClip.url: Resources/PoseClips/char-NN-fight.mov). */
export function clipURL(name) {
  if (!/^char-\d\d-fight$/.test(name)) return null;
  if (clipSet && !clipSet.has(name)) return null;
  return `/app/img/clips/${name}.${appleWebKit ? 'mov' : 'webm'}`;
}

// ───────── GirlNames ─────────
let girlSet = null;
export const GirlNames = {
  ready: fetch('/data/girl-names.txt').then(r => (r.ok ? r.text() : '')).then(t => { girlSet = new Set(t.split('\n').map(s => s.trim()).filter(Boolean)); return true; }).catch(() => { girlSet = new Set(); return false; }),
  /** Whether the first word of a name is a girl's name: "Emma", "emma k", "Lærke" and "Sofie_22" all are. */
  contains(name) {
    if (!girlSet) return false;
    const m = String(name ?? '').normalize('NFC').match(/\p{L}[\p{L}\p{M}]*/u);
    if (!m) return false;
    const key = m[0].toLowerCase().replace(/ø/g, 'o').replace(/æ/g, 'ae').normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
    return Array.from(key).length >= 2 && girlSet.has(key);
  },
  get loaded() { return !!girlSet; },
};

// ───────── NameFilter ─────────
const isLetter = c => /\p{L}/u.test(c);
const fold = s => String(s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().normalize('NFC');
const SWAPS = { 0: 'o', 1: 'i', '!': 'i', '|': 'i', 3: 'e', 4: 'a', '@': 'a', 5: 's', $: 's', 7: 't', '+': 't', 8: 'b', 9: 'g', ø: 'o', æ: 'ae', å: 'a', ß: 'ss' };
const swapped = s => Array.from(s).map(c => SWAPS[c] ?? c).join('');
const letters = s => Array.from(s).filter(isLetter).join('');
/** Runs of one letter: with keep 2, two stay two and three or more become one; with keep 1, every run becomes one. */
function cut(s, keep) {
  let out = '', run = [];
  const flush = () => { if (!run.length) return; out += run.length <= keep && keep === 2 ? run.join('') : run[0]; run = []; };
  for (const c of Array.from(s)) { if (c !== run[0]) flush(); run.push(c); }
  flush();
  return out;
}
const form = s => ({ long: cut(s, 2), short: cut(s, 1) });
const fContains = (f, e) => f.long.includes(e.text) || (e.single && f.short.includes(e.text));
const fEquals = (f, e) => f.long === e.text || (e.single && f.short === e.text);
const prepare = list => list.map(w => { const t = letters(swapped(fold(w))); return { text: t, single: cut(t, 1) === t }; });
function words(name) {
  const parts = []; let cur = '', last = null;
  for (const c of Array.from(String(name).normalize('NFC'))) {
    if (/[\p{L}\p{N}]/u.test(c) || '@$!|+'.includes(c) || (/\p{M}/u.test(c) && cur)) {
      if (last != null && /\p{Ll}/u.test(last) && /\p{Lu}/u.test(c) && cur) { parts.push(cur); cur = ''; }
      cur += c;
    } else if (cur) { parts.push(cur); cur = ''; }
    last = c;
  }
  if (cur) parts.push(cur);
  return parts.map(p => form(letters(swapped(fold(p))))).filter(f => f.long);
}
const ANYWHERE = prepare([
  // swearing and sexual
  'fuck', 'fck', 'fvck', 'phuck', 'cunt', 'bitch', 'biatch', 'whore', 'slut', 'bastard', 'asshole',
  'arsehole', 'dickhead', 'cocksucker', 'jerkoff', 'wanker', 'twat', 'bollock', 'pussy', 'blowjob',
  'handjob', 'dildo', 'porno', 'pornhub', 'hentai', 'milf', 'cumshot', 'orgasm', 'masturbat', 'penis',
  'vagina', 'testicle', 'erection', 'boner', 'titties', 'motherf',
  // slurs and hate
  'nigger', 'nigga', 'faggot', 'retard', 'tranny', 'shemale', 'chink', 'wetback', 'beaner', 'gook',
  'raghead', 'towelhead', 'spearchucker', 'hitler', 'siegheil', 'kukluxklan', 'whitepower',
  'whitesupremac', 'holocaust', 'gaschamber', 'killjews', 'killblacks', 'killgays', 'killmuslims',
  'pedophile', 'paedophile', 'molest', 'incest',
  // Danish
  'fisse', 'kælling', 'bøsserøv',
]);
const WHOLE = prepare([
  'fuk', 'fuc', 'shit', 'shite', 'sht', 'ass', 'arse', 'dick', 'cock', 'cum', 'tit', 'tits', 'boob',
  'boobs', 'anal', 'anus', 'sex', 'sexy', 'horny', 'porn', 'rape', 'raped', 'rapist', 'fag', 'fags',
  'homo', 'dyke', 'lesbo', 'spic', 'coon', 'paki', 'jap', 'nig', 'niga', 'negro', 'nazi', 'nazis',
  'kike', 'hoe', 'hoes', 'thot', 'piss', 'crap', 'damn', 'pedo', 'kys',
  // Danish
  'pik', 'lort', 'luder', 'kusse', 'neger', 'perker',
]);
/** What a player may call themselves: no swearing, slurs or hate speech (NameFilter.swift, both lists verbatim). */
export const NameFilter = {
  blocked(name) {
    const folded = fold(String(name ?? ''));
    if (folded.includes('1488') || folded.includes('kkk')) return true;
    const all = form(letters(swapped(folded)));
    if (!all.long) return false;
    if (ANYWHERE.some(e => fContains(all, e))) return true;
    if (WHOLE.some(e => fEquals(all, e))) return true;
    for (const w of words(String(name ?? ''))) if (WHOLE.some(e => fEquals(w, e)) || ANYWHERE.some(e => fContains(w, e))) return true;
    return false;
  },
  allows(name) { return !NameFilter.blocked(name); },
  /** Someone else's name as it may be shown. */
  shown(name) { return NameFilter.blocked(name) ? 'Player' : name; },
};

// ───────── PlayerName ─────────
export const PlayerName = {
  /** The first word of a name, for the 1v1 and ranked screens. Display only. */
  first(name) {
    const full = trimSwift(name);
    const ws = full.split(/[\p{White_Space}]+/u).filter(Boolean);
    let first = ws[0] || '';
    if (ws.length <= 1) first = full.split(/[_.]/).filter(Boolean)[0] || '';
    first = trimSwift(first);
    return first || full;
  },
};

// ───────── CartoonFace ─────────
/** The character's portrait in a circle. `avatar`: the avatar field (char:…, a photo, null) or a character id. */
export function faceHTML(avatar, key = '', size = 40, opts = {}) {
  let index, variant = opts.variant || 1;
  if (typeof avatar === 'number') index = has(avatar) ? avatar : (RETIRED.has(avatar) ? SPOT : wrap(avatar));
  else if (opts.hash) index = indexForKey(key);
  else { const c = parseChoice(avatar); index = c ? c.id : unchosen(key); if (c && !opts.variant) variant = variantOf(c, 'portrait'); }
  const dim = size == null ? 'width:100%;height:100%' : `width:${size}px;height:${size}px`;
  const ring = opts.ring ? `;box-shadow:0 0 0 2px ${opts.ring}` : '';
  const label = opts.label ? ` role="img" aria-label="${esc(opts.label)}"` : ' aria-hidden="true"';
  return `<span class="cface${opts.square ? ' sq' : ''}${opts.cls ? ' ' + opts.cls : ''}" data-char="${index}" style="${dim}${ring}${opts.style ? ';' + opts.style : ''}"${label}><img src="${portraitURL(index, variant)}" alt="" decoding="async"${opts.lazy ? ' loading="lazy"' : ''} draggable="false"></span>`;
}

// ───────── PoseMotion ─────────
const TAU = 2 * Math.PI;
const frac = x => x - Math.trunc(x);
export const PoseMotion = {
  /** The quiet idle: a slow breath and a gentle lean, never leaving the floor. */
  calm(pose, t) {
    const f = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, lift: 0 };
    const breath = (1 - Math.cos(TAU * t / 2.8)) / 2, lean = Math.sin(TAU * t / 5.6);
    f.sy = 1 + 0.014 * breath; f.sx = 1 - 0.006 * breath; f.rot = 0.9 * lean;
    if (pose === 'win') f.dy = -3 * breath;
    else if (pose === 'lose') { f.sy = 0.975 + 0.01 * breath; f.rot = -1.5 + 0.6 * lean; }
    return f;
  },
  /** Each pose's own move. */
  frame(pose, t) {
    const f = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, lift: 0 };
    if (pose === 'portrait') { const s = Math.sin(Math.PI * t / (60 / 96)); f.dy = -2.5 * Math.abs(s); f.rot = 2 * s; }
    else if (pose === 'fight') {
      const p = 0.6, b = (1 - Math.cos(TAU * t / p)) / 2, sway = Math.sin(Math.PI * t / p);
      f.sy = 1 - 0.04 * b; f.sx = 1 + 0.015 * b; f.dx = 3.5 * sway; f.rot = 1.6 * sway;
      const q = frac(t / 2.4);
      if (q < 0.14) { const k = Math.sin(Math.PI * q / 0.14); f.dx += 8 * k; f.rot += 3 * k; f.sy -= 0.025 * k; }
    } else if (pose === 'dance') {
      const ph = t / (60 / 118), b = Math.abs(Math.sin(Math.PI * ph));
      f.dy = -5 * b; f.lift = b * 0.18; f.dx = 4 * Math.sin(Math.PI * ph / 2); f.rot = 3 * Math.sin(Math.PI * ph / 2 + 0.6); f.sy = 1 + 0.012 * b;
    } else if (pose === 'win') { const up = Math.abs(Math.sin(Math.PI * t / 1.1)); f.dy = -8 * up; f.lift = 0.25 * up; f.sy = 1 + 0.015 * up; }
    else if (pose === 'lose') {
      const breath = Math.sin(TAU * t / 3.2);
      f.sy = 0.955 + 0.012 * breath; f.sx = 1.02 - 0.006 * breath; f.rot = -2.2 + 1.2 * Math.sin(TAU * t / 5.6);
      const q = frac(t / 4.2);
      if (q < 0.2) { const k = Math.sin(Math.PI * q / 0.2); f.dx = 3 * k * Math.sin(TAU * q / 0.066); }
      else if (q > 0.5 && q < 0.74) { const k = Math.sin(Math.PI * (q - 0.5) / 0.24); f.sy -= 0.035 * k; f.sx += 0.014 * k; }
    }
    return f;
  },
};

// ───────── CharacterFigure ─────────
/** Where the feet are, as a fraction of the picture's height (6 of 490 px of floor kept under them). */
const FEET = 1 - 6 / 490;
/** PoseClip: the character is 72% of the square clip's side tall, its top 20% down. */
const CLIP_H = 0.72, CLIP_TOP = 0.2;

/** A character standing full-body in a pose, cut out, feet on the bottom edge. */
export function figureHTML(index, pose = 'fight', opts = {}) {
  const i = has(index) ? index : (RETIRED.has(index) ? SPOT : wrap(Number(index) || SPOT));
  const v = opts.variant || 1;
  const name = poseName(i, pose, v);
  const cut = name !== assetName(i);
  const h = opts.height;
  const pools = opts.floor ? `<i class="cfig-pool" style="--pc:${esc(opts.floor)}"></i><i class="cfig-shadow"></i>` : '';
  const flags = `data-anim="${opts.animated === false ? 0 : 1}" data-calm="${opts.calm ? 1 : 0}" data-clip="${opts.clip === false ? 0 : 1}"`;
  return `<div class="cfig${opts.cls ? ' ' + opts.cls : ''}" data-k="cfig-${name}" data-keep data-char="${i}" data-pose="${pose}" data-pic="${name}" ${flags} style="${h ? `height:${h}px;--h:${h}px` : ''}" aria-hidden="true">${pools}<div class="cfig-stage"><img class="cfig-pic${cut ? '' : ' nocut'}" src="/app/img/chars/${name}.webp" alt="" decoding="async" draggable="false"></div></div>`;
}

const live = new Map();        // element → state
let raf = 0;
const REF = 978307200;         // Date.timeIntervalSinceReferenceDate's epoch (1 Jan 2001), so phases match the iPhone's clock
const now = () => Date.now() / 1000 - REF;
let ro = null;

function startFigure(node) {
  if (live.has(node)) return;
  const st = {
    node, pic: node.querySelector('.cfig-pic'), pools: [...node.querySelectorAll('.cfig-pool,.cfig-shadow')],
    index: +node.dataset.char, pose: node.dataset.pose, name: node.dataset.pic,
    animated: node.dataset.anim === '1', calm: node.dataset.calm === '1', clip: node.dataset.clip === '1',
    cut: !node.querySelector('.cfig-pic.nocut'), video: null, clipDone: false, idleFrom: null, h: 0,
  };
  live.set(node, st);
  measure(st);
  if (!ro && typeof ResizeObserver !== 'undefined') ro = new ResizeObserver(es => es.forEach(e => { const s = live.get(e.target); if (s) measure(s); }));
  ro && ro.observe(node);
  const url = st.animated && st.cut && st.clip && !still() ? clipURL(st.name) : null;
  if (url) playClip(st, url);
  if (!raf) raf = requestAnimationFrame(tick);
}
function measure(st) {
  const h = st.node.clientHeight || parseFloat(st.node.style.height) || 0;
  if (h && h !== st.h) { st.h = h; st.node.style.setProperty('--h', h + 'px'); }
}
function playClip(st, url) {
  const v = document.createElement('video');
  v.className = 'cfig-clip';
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.autoplay = true; v.loop = false; v.preload = 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('disablepictureinpicture', ''); v.setAttribute('disableremoteplayback', '');
  v.setAttribute('aria-hidden', 'true');
  v.src = url;
  st.video = v;
  const ready = () => { if (st.video === v) st.node.classList.add('clip-ready'); };
  const done = () => { if (st.video === v) killVideo(st); };
  v.addEventListener('playing', () => { if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(ready); else ready(); }, { once: true });
  v.addEventListener('ended', done);
  v.addEventListener('error', done);
  st.node.appendChild(v);
  const p = v.play(); if (p && p.catch) p.catch(done);       // autoplay refused: straight to the idle
}
function killVideo(st) {
  const v = st.video; if (!v) return;
  st.video = null; st.clipDone = true; st.idleFrom = now(); st.node.classList.remove('clip-ready');
  v.pause(); v.removeAttribute('src'); try { v.load(); } catch (e) {} v.remove();
}
function stopFigure(node) {
  const st = live.get(node); if (!st) return;
  live.delete(node); ro && ro.unobserve(node);
  killVideo(st);
}
let stillNow = false, stillAt = 0;
const ZERO = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, lift: 0 };
function tick() {
  raf = 0;
  const t = now();
  if (!stillAt || performance.now() - stillAt > 500) { stillNow = still(); stillAt = performance.now(); }
  const calmOnly = stillNow;
  for (const [node, st] of live) {
    if (!node.isConnected) { stopFigure(node); continue; }
    let f = ZERO;
    if (st.animated && st.cut && !calmOnly) {
      if (st.video) f = ZERO;                                                     // the clip moves; the still waits underneath
      else if (st.clipDone) f = PoseMotion.calm(st.pose, t - st.idleFrom);        // after the move: a quiet breath
      else f = st.calm ? PoseMotion.calm(st.pose, t + st.index * 0.37) : PoseMotion.frame(st.pose, t + st.index * 0.37);
    } else if (calmOnly && st.video) killVideo(st);                               // Motion switched off mid-clip
    const unit = (st.h || 240) / 240;
    const tf = f === ZERO ? '' : `translate(${(f.dx * unit).toFixed(2)}px,${(f.dy * unit).toFixed(2)}px) rotate(${f.rot.toFixed(3)}deg) scale(${f.sx.toFixed(4)},${f.sy.toFixed(4)})`;
    if (st.pic && st.lastTf !== tf) { st.pic.style.transform = tf; st.lastTf = tf; }
    if (st.pools.length && st.lastLift !== f.lift) {
      st.lastLift = f.lift;
      const [light, shadow] = st.pools;
      if (light) { light.style.transform = `translateX(-50%) scale(${1 - 0.25 * f.lift})`; light.style.opacity = String(1 - 0.3 * f.lift); }
      if (shadow) { shadow.style.transform = `translateX(-50%) scale(${1 - 0.4 * f.lift})`; shadow.style.opacity = String(1 - 0.6 * f.lift); }
    }
  }
  if (live.size) raf = requestAnimationFrame(tick);
}
/** Start every figure under `root` (they also start by themselves when added to the page). */
export function mountFigures(root = document) {
  if (root.classList && root.classList.contains('cfig')) startFigure(root);
  root.querySelectorAll && root.querySelectorAll('.cfig').forEach(startFigure);
  return { destroy: () => stopFigures(root) };
}
export function stopFigures(root = document) {
  if (root.classList && root.classList.contains('cfig')) stopFigure(root);
  root.querySelectorAll && root.querySelectorAll('.cfig').forEach(stopFigure);
}
// A one-time clip that the tab's hiding paused resumes on return, if it hadn't ended (ClipView's didBecomeActive).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  for (const st of live.values()) if (st.video && st.video.paused && !st.video.ended) st.video.play().catch(() => {});
});
if (typeof MutationObserver !== 'undefined') {
  const mo = new MutationObserver(list => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) mountFigures(n);
  });
  const go = () => { mo.observe(document.body, { childList: true, subtree: true }); mountFigures(document); };
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
}

// ───────── Edit avatar (CharacterPicker) ─────────
const LOCK = `<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 10V7.5a5 5 0 0 1 10 0V10h.6c1 0 1.9.9 1.9 1.9v7.7c0 1-.9 1.9-1.9 1.9H6.4c-1 0-1.9-.9-1.9-1.9v-7.7c0-1 .9-1.9 1.9-1.9zm2.5 0h5V7.5a2.5 2.5 0 0 0-5 0z"/></svg>`;
const lockBadge = size => `<span class="cp-lock" style="width:${size}px;height:${size}px;font-size:${(size * 0.46).toFixed(1)}px">${LOCK}</span>`;

/**
 * Edit avatar: pick one of Songspot's characters, and nothing else. Legends sit dimmed with a lock until their
 * songs-named count; tapping one only shows it up top with what unlocks it. Save wears the pick.
 * ctx needs { account, accent }. Returns { close }.
 */
export function openCharacterPicker(ctx, { onClose } = {}) {
  const { account } = ctx;
  const accent = ctx.accent || '#19df70';
  const named = (account.stats && account.stats.roundsWon) || 0;
  const mine = parseChoice(account.avatar);
  let id = mine ? mine.id : myIndex(account);
  if (!has(id)) id = SPOT;
  const chosenVariants = (mine && mine.variants) || {};
  let peek = null, closed = false;
  const locked = c => !isUnlocked(c, named);
  const unlockLine = c => { const at = unlockAt(c); return `Guess ${at} songs to unlock · ${Math.min(named, at)}/${at}`; };
  const variant = p => { const v = chosenVariants[p] || 1; return variants(id, p).includes(v) ? v : 1; };
  const list = roster();

  const node = el(`<div class="view cpick" role="dialog" aria-modal="true" aria-label="Edit avatar" style="--cp-accent:${esc(accent)}">
    <div class="cp-back season-backdrop"></div>
    <div class="cp-col">
      <div class="cp-bar"><button class="cp-cancel" data-act="cancel" data-press>Cancel</button><h1>EDIT AVATAR</h1><button class="cp-save" data-act="save" data-press>Save</button></div>
      <div class="cp-preview"></div>
      <div class="cp-scroll"><div class="cp-grid">${list.map((c, i) => {
        const shut = locked(c), nm = LEGEND_NAMES[c] || `Character ${i + 1}`;
        return `<button class="cp-tile${shut ? ' shut' : ''}" data-c="${c}" data-press aria-label="${esc(shut ? `${nm}, locked. ${unlockLine(c)}` : nm)}">${faceHTML(c, '', null, { lazy: i > 23 })}${shut ? lockBadge(24) : ''}</button>`;
      }).join('')}</div><div style="height:40px"></div></div>
    </div></div>`);
  // The season's backdrop, if the season engine offers one.
  if (seasonMod && typeof seasonMod.backdropHTML === 'function') { try { node.querySelector('.cp-back').innerHTML = seasonMod.backdropHTML(); } catch (e) {} }
  const preview = node.querySelector('.cp-preview');

  function paintPreview() {
    const shown = peek ?? id;
    const old = preview.querySelector('.cp-shot');
    const shot = peek != null
      ? `<div class="cp-shot peek" data-k="${shown}"><span class="cp-glow"></span><div class="cp-pic">${faceHTML(peek, '', null, { square: true })}<div class="cp-peekfoot"><b>${esc(LEGEND_NAMES[peek] || 'Locked')}</b><small>${esc(unlockLine(peek))}</small></div>${lockBadge(44)}</div></div>`
      : `<div class="cp-shot" data-k="${shown}"><span class="cp-glow"></span><div class="cp-pic">${faceHTML(id, '', null, { square: true, variant: variant('portrait') })}</div></div>`;
    const n = el(shot);
    if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 300); }
    preview.appendChild(n);
    requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add('in')));
  }
  function paintGrid() {
    node.querySelectorAll('.cp-tile').forEach(b => {
      const c = +b.dataset.c;
      b.classList.toggle('sel', c === id); b.classList.toggle('peeked', c === peek);
      b.setAttribute('aria-pressed', c === id ? 'true' : 'false');
    });
  }
  function close() {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey);
    popView(node); onClose && onClose();
  }
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  node.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-c]'); if (!b) return;
    if (b.dataset.act === 'cancel') return close();
    if (b.dataset.act === 'save') {
      Haptics.success();
      // The profile shows the portrait; the other poses play in the game.
      const vs = {}; POSES.forEach(p => { vs[p] = variant(p); });
      account.setCharacter(id, 'portrait', vs);
      return close();
    }
    const c = +b.dataset.c;
    Haptics.select();
    if (locked(c)) { if (peek === c) return; peek = c; } else { if (c === id && peek == null) return; id = c; peek = null; }
    paintGrid(); paintPreview();
  });
  document.addEventListener('keydown', onKey);
  paintGrid(); paintPreview();
  pushView(node);
  return { close };
}
