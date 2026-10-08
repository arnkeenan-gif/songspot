// Home/StreakFlame.swift: on fire. Three songs in a row and up, a flame in
// the stage's corner with the count, on the right-answer screen only. Each
// song named bumps the number (it pops to 1.4) and the flame grows (up to a
// quarter) and burns a little brighter; one miss and it is gone. The flame
// flickers on three sines (scaleX 9.3, scaleY 7.1, rotation 5.3 rad/s,
// anchored at its foot), still under Reduce Motion.
import { spring } from './motion.js';

const FLAME = 'M12.6 2.3c.4 3.2 4.9 5.6 4.9 10.6a5.5 5.5 0 0 1-11 0c0-2.4 1.2-4 2.6-5.3.3 1.5 1 2.6 2 3.1-.3-3.4.5-6 1.5-8.4z';
let shown = null;

/** The capsule's markup for `count` (≥ 3). */
export function flameHTML(count) {
  const n = Math.max(0, count - 3);
  const glow = Math.min(0.7, 0.2 + n * 0.05), scale = Math.min(1.25, 1 + n * 0.025);
  return `<div class="sflame" role="img" aria-label="${count} in a row" style="--glow:${glow.toFixed(3)};--grow:${scale.toFixed(4)}">
    <span class="sf-r"><span class="sf-y"><span class="sf-x"><svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="sfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset=".5" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ff3b2f"/></linearGradient></defs><path d="${FLAME}" fill="url(#sfg)"/></svg></span></span></span>
    <b class="sf-n">${count}</b></div>`;
}

/**
 * Keep the flame in `host` in step with the streak: shown when `on`,
 * the number popping when it went up since last time.
 */
export function syncFlame(host, count, on) {
  let node = host.querySelector('.sflame');
  if (!on || count < 3) {
    if (node && !node.classList.contains('out')) { node.classList.add('out'); setTimeout(() => node.remove(), 300); }
    return;
  }
  if (node && node.classList.contains('out')) { node.remove(); node = null; }
  if (!node) {
    host.insertAdjacentHTML('afterbegin', flameHTML(count));
    node = host.querySelector('.sflame');
    // In with scale 0.3 + opacity, spring(0.45, 0.6).
    const sp = spring(0.45, 0.6);
    node.animate([{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: sp.ms, easing: sp.easing });
  } else if (+node.dataset.count !== count) {
    const old = +node.dataset.count;
    const fresh = document.createElement('div'); fresh.innerHTML = flameHTML(count);
    const f = fresh.firstElementChild;
    node.style.cssText = f.style.cssText;
    node.setAttribute('aria-label', f.getAttribute('aria-label'));
    const num = node.querySelector('.sf-n'); num.textContent = count;
    if (count > old) {
      const up = spring(0.18, 0.45), back = spring(0.35, 0.6);
      num.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.4)' }], { duration: up.ms, easing: up.easing, fill: 'forwards' });
      setTimeout(() => num.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: back.ms, easing: back.easing, fill: 'forwards' }), 200);
    }
  }
  node.dataset.count = count;
  shown = count;
}
export const flameShown = () => shown;
