// Small helpers every screen uses.
export const TIER_COLOR = { easy: '#19df70', medium: '#ffd60a', hard: '#ff8a2a', expert: '#ff4d5a', impossible: '#b46cff' };
export const TIER_INK = { easy: '#04120a', medium: '#1a1400', hard: '#1a0c00', expert: '#ffffff', impossible: '#ffffff' };
export const PARTY_PALETTE = ['#19df70', '#ffd60a', '#ff8a2a', '#ff4d5a', '#b46cff', '#4cc9f0'];
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const label = s => (s < 1 ? s.toFixed(1) + 's' : Math.round(s) + 's');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const art = (url, size = 300) => (url || '').replace('{w}x{h}', `${size}x${size}`);

/** Build an element from an HTML string. */
export function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The toast: 12.5px, bottom, 3.6 s by default. One at a time. */
let toastTimer = null;
export function toast(msg, seconds = 3.6) {
  let t = document.querySelector('.toast');
  if (!t) { t = el('<div class="toast" role="status" aria-live="polite"></div>'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), seconds * 1000);
}

/** A stack of full-screen views over the stage: push to open, pop to close. */
const stack = [];
export function pushView(node) { const host = document.getElementById('views'); host.appendChild(node); stack.push(node); requestAnimationFrame(() => node.classList.add('in')); return node; }
export function popView(node) { const i = stack.indexOf(node); if (i >= 0) stack.splice(i, 1); node.classList.remove('in'); setTimeout(() => node.remove(), 280); }

/** Press feedback on anything with [data-press]: scale .96, dim .72 — the apps' Pressable. */
export function pressable(root = document) {
  root.addEventListener('pointerdown', e => { const b = e.target.closest('[data-press]'); if (b) b.classList.add('pressed'); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => root.addEventListener(ev, () => root.querySelectorAll('.pressed').forEach(b => b.classList.remove('pressed')), true));
}

/** A face: the picture if there is one, else the initial on a colour. */
export function face(name, avatar, color, size = 40, ink = '#04120a') {
  const initial = esc((name || '?').trim()[0] || '?').toUpperCase();
  return avatar ? `<img class="face" src="data:image/jpeg;base64,${avatar}" alt="" style="width:${size}px;height:${size}px">`
    : `<span class="face" style="width:${size}px;height:${size}px;background:${color};color:${ink};font-size:${Math.round(size * 0.44)}px">${initial}</span>`;
}

export function hueColor(hue) { return PARTY_PALETTE[(hue - 1 + PARTY_PALETTE.length) % PARTY_PALETTE.length]; }
export const settings = {
  get(k, d) { try { const v = localStorage.getItem('songspot.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('songspot.' + k, JSON.stringify(v)); } catch (e) {} },
};
