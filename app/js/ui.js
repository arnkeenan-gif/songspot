// Small helpers every screen uses. The colours are the iPhone app's Theme.swift.
export const TIER_COLOR = { easy: '#19df70', medium: '#f7c823', hard: '#ff8a2b', expert: '#f8545c', impossible: '#a855f7' };
export const TIER_INK = { easy: '#04160b', medium: '#171004', hard: '#180b02', expert: '#1a0507', impossible: '#120421' };
/** The pill fills differ from the accent only for easy (Theme.pillFill). */
export const PILL_FILL = { ...TIER_COLOR, easy: '#1ed760' };
export const PILL_INK = '#08120c';
export let ACCENT_TEXT = '#39e887';   // [season] `let` + setter: season.js swaps it (live ES binding)
export const setAccentText = v => { ACCENT_TEXT = v; };
export const PARTY_PALETTE = ['#19df70', '#f7c823', '#ff8a2b', '#f8545c', '#a855f7', '#4cc9f0', '#f72585'];
export const TIERS = ['easy', 'medium', 'hard', 'expert', 'impossible'];

export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
/** 0.1s, 0.5s, 2s, 8s, 15s — the apps' label(). */
export const label = s => (s < 1 ? s.toFixed(1) + 's' : Math.round(s) + 's');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const art = (url, size = 300) => (url || '').replace('{w}x{h}', `${size}x${size}`);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const isPhone = () => !document.documentElement.classList.contains('wide');

/** sRGB mix, like the app's srgbMix: a toward b by t (0..1). Hex in, hex out. */
export function mix(a, b, t) {
  const p = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
/** hex + alpha → rgba() */
export function alpha(hex, a) { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; }

/** Build an element from an HTML string. */
export function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

/**
 * The toast (StageView show/toastLayer): 12.5px, 3.6 s by default, one at a time.
 * Where it sits: over the sign-in gate at the top (status bar + 28); with the
 * keyboard up, 12 above the keys; with the tab bar up, just above it
 * (52 + the bottom inset + 10); else 28 from the bottom. Moves with easeOut 0.2.
 */
let toastTimer = null;
function placeToast(t) {
  const h = document.documentElement, vv = window.visualViewport;
  const keys = vv && matchMedia('(pointer: coarse)').matches ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
  t.classList.toggle('top', !!document.querySelector('.login'));
  t.style.setProperty('--toast-b', keys > 80 ? `${keys + 12}px` : h.classList.contains('tabbar-up') && !document.querySelector('#views > *') ? 'calc(62px + var(--sab))' : '28px');
}
export function toast(msg, seconds = 3.6) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = el('<div class="toast" role="status" aria-live="polite"></div>'); document.body.appendChild(t);
    const again = () => t.classList.contains('on') && placeToast(t);
    window.visualViewport?.addEventListener('resize', again);
    new MutationObserver(again).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  placeToast(t);
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), seconds * 1000);
}

/** A stack of full-screen views over the stage: push to open, pop to close. */
const stack = [];
export function pushView(node) { const host = document.getElementById('views'); host.appendChild(node); stack.push(node); requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('in'))); return node; }
export function popView(node) { const i = stack.indexOf(node); if (i >= 0) stack.splice(i, 1); node.classList.remove('in'); setTimeout(() => node.remove(), 500); }
/** Something is in front of the stage: a full-screen view, or a tab page (Games, Party, Friends, Profile). */
export const viewsOpen = () => stack.length > 0 || !!document.querySelector('.tabpages.open');

/**
 * A sheet: a bottom sheet on a phone, a centred card on a wide screen.
 * `body` is the inner HTML. Returns { node, body, close }. Escape and the scrim close it.
 */
export function openSheet(body, { cls = '', label = 'Sheet', onClose } = {}) {
  const node = el(`<div class="view sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="scrim"></div><div class="sheet-body">${body}</div></div>`);
  const onKey = e => { if (e.key === 'Escape') close(); };
  let closed = false;
  const close = () => { if (closed) return; closed = true; document.removeEventListener('keydown', onKey); popView(node); onClose && onClose(); };
  node.querySelector('.scrim').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  pushView(node);
  return { node, body: node.querySelector('.sheet-body'), close };
}

/** Press feedback on anything with [data-press]: scale .96, dim .72 — the apps' Pressable. */
export function pressable(root = document) {
  root.addEventListener('pointerdown', e => { const b = e.target.closest('[data-press]'); if (b) b.classList.add('pressed'); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => root.addEventListener(ev, () => root.querySelectorAll('.pressed').forEach(b => b.classList.remove('pressed')), true));
}

// [characters] face() now draws the character (CartoonFace) via characters.js faceHTML: a `char:` avatar is that
// character, anything else (a legacy base64 photo, nothing) is the player's default (Spot; Songbot for 'songbot').
// `color`/`ink` are unused now and kept for the old call sites. New code: import { faceHTML } from './characters.js'.
import { faceHTML } from './characters.js';
/** A face: the player's character in a circle (iOS CartoonFace(avatar:key:)). */
export function face(name, avatar, color, size = 40, ink = '#08120c') {
  return faceHTML(avatar, name || '', size, { cls: 'face' });
}
export function hueColor(hue) { const n = PARTY_PALETTE.length; return PARTY_PALETTE[((hue % n) + n) % n]; }

export const settings = {
  get(k, d) { try { const v = localStorage.getItem('songspot.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('songspot.' + k, JSON.stringify(v)); } catch (e) {} try { dispatchEvent(new CustomEvent('songspot:setting', { detail: { key: k, value: v } })); } catch (e) {} },
  del(k) { try { localStorage.removeItem('songspot.' + k); } catch (e) {} },
};

/** Share a line of text: the system sheet where there is one, else the clipboard. */
export async function shareText(text, done = 'Copied. Send it to someone.') {
  if (navigator.share) { try { await navigator.share({ text }); return true; } catch (e) { if (e && e.name === 'AbortError') return false; } }
  try { await navigator.clipboard.writeText(text); toast(done); return true; } catch (e) { toast("Couldn't copy that. Try again."); return false; }
}

export const LINKS = { get: 'https://songspotapp.com/get', go: 'https://songspotapp.com/go', appStore: 'https://apps.apple.com/app/id6808657554', privacy: '/privacy', support: '/support' };

/**
 * Redraw `parent` from an HTML string, keeping the nodes that are still there
 * so their CSS transitions run — SwiftUI animates a changed value on the same
 * view; replacing the DOM would only ever jump. A node is kept when its tag
 * and its data-k key match; anything else is replaced (and so re-enters, with
 * its entrance animation). A focused input keeps its caret.
 */
export function morph(parent, html) {
  const t = document.createElement('template'); t.innerHTML = html.trim();
  morphChildren(parent, t.content);
}
function same(a, b) { return a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.nodeType !== 1 || a.getAttribute('data-k') === b.getAttribute('data-k')); }
function morphChildren(from, to) {
  const next = Array.from(to.childNodes);
  let cur = from.firstChild;
  for (const n of next) {
    if (cur && same(cur, n)) { morphNode(cur, n); cur = cur.nextSibling; }
    else from.insertBefore(n, cur);
  }
  while (cur) { const x = cur.nextSibling; cur.remove(); cur = x; }
}
function morphNode(a, b) {
  if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  for (const { name, value } of Array.from(b.attributes)) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  for (const { name } of Array.from(a.attributes)) if (!b.hasAttribute(name)) a.removeAttribute(name);
  if (a.tagName === 'INPUT') { const v = b.getAttribute('value') ?? ''; if (a.value !== v && document.activeElement !== a) a.value = v; return; }
  if (a.hasAttribute('data-keep')) return;
  morphChildren(a, b);
}

/**
 * Theme.swift's LevelTheme: the page and the stage behind the light take a
 * whisper of the current level's colour (green on Easy, gold on Medium…), or
 * the original green-black with "Level colours" off. The stage sets
 * `stageTier`; ranked and party set `override` round by round and clear it on
 * the way out. --page and --stage are registered properties (app.css), so a
 * change cross-fades over 0.6 s easeInOut as withAnimation does in the app.
 */
export const LevelTheme = {
  stageTier: 'easy', override: null,
  get enabled() { return settings.get('levelColours', true); },
  set enabled(v) { settings.set('levelColours', !!v); this.apply(); },
  get tier() { return this.override || this.stageTier; },
  page(t = this.tier) { return this.enabled ? mix('#040404', TIER_COLOR[t], t === 'easy' ? 0.035 : 0.05) : '#030704'; },
  stage(t = this.tier) { return this.enabled ? mix('#0b0b0b', TIER_COLOR[t], t === 'easy' ? 0.03 : 0.075) : '#0c110d'; },
  setStage(t) { if (t && t !== this.stageTier) { this.stageTier = t; this.apply(); } },
  setOverride(t) { t = t || null; if (t !== this.override) { this.override = t; this.apply(); } },
  apply() {
    const r = document.documentElement.style, page = this.page(), stage = this.stage();
    r.setProperty('--page', page); r.setProperty('--stage', stage);
    const spot = document.body && document.body.classList.contains('spot');
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', spot ? page : stage);
  },
};
/** The stage colour as [r, g, b], for the win light's brightness. */
export const rgbOf = hex => { const h = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
