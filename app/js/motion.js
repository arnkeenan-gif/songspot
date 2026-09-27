// SwiftUI motion on the web. The app's animations are springs and bezier
// curves; these turn them into CSS (a linear() easing plus a duration) or into
// plain functions of time for the requestAnimationFrame-driven pieces.
//
//   spring(response, dampingFraction)  → .spring(response:dampingFraction:)
//   CURVE.easeOut / easeInOut / easeIn  → .easeOut / .easeInOut / .easeIn
//   bezier(x1,y1,x2,y2)(t)              → .timingCurve(x1,y1,x2,y2)

/** A unit spring's step response at time t (s): 0 → 1, mass 1, as SwiftUI defines it. */
export function springAt(t, response = 0.55, damping = 0.825) {
  const w0 = (2 * Math.PI) / response, z = damping;
  if (t <= 0) return 0;
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
  }
  if (z === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const r1 = -w0 * (z - Math.sqrt(z * z - 1)), r2 = -w0 * (z + Math.sqrt(z * z - 1));
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

/** How long the spring takes to settle within 0.1% (what SwiftUI waits for). */
export function springDuration(response = 0.55, damping = 0.825) {
  let last = 0;
  for (let t = 0; t < 10; t += 1 / 240) if (Math.abs(1 - springAt(t, response, damping)) > 0.001) last = t;
  return Math.max(0.05, last);
}

const cache = new Map();
/**
 * A SwiftUI spring as CSS: { easing: 'linear(...)', duration: seconds, ms, css }.
 * `css` is "<duration>s linear(...)" ready for a transition or an animation.
 */
export function spring(response = 0.55, damping = 0.825) {
  const k = response + '|' + damping;
  if (cache.has(k)) return cache.get(k);
  const d = springDuration(response, damping), n = Math.min(120, Math.max(24, Math.round(d * 60)));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(+springAt((i / n) * d, response, damping).toFixed(4));
  pts[n] = 1;
  const easing = `linear(${pts.join(', ')})`;
  const out = { easing, duration: d, ms: Math.round(d * 1000), css: `${d.toFixed(3)}s ${easing}` };
  cache.set(k, out);
  return out;
}

/** cubic-bezier y at progress x, solved on the curve's own x (as CSS does). */
export function bezier(x1, y1, x2, y2) {
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let lo = 0, hi = 1, t = 0.5;
    for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; const bx = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3; if (bx < x) lo = t; else hi = t; }
    return 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3;
  };
}
/** SwiftUI's named curves, as CSS strings. Default duration for all of them is 0.35s. */
export const CURVE = {
  easeOut: 'cubic-bezier(0,0,.58,1)', easeIn: 'cubic-bezier(.42,0,1,1)', easeInOut: 'cubic-bezier(.42,0,.58,1)', linear: 'linear',
};

/** Piecewise-linear interpolation through [t, v] keys (Win's interpolate()). */
export function keys(k, t) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const [t0, v0] = k[i - 1], [t1, v1] = k[i]; return v0 + (v1 - v0) * (t - t0) / (t1 - t0); }
  return k[k.length - 1][1];
}

/**
 * Animate one number with a spring from `from` to `to`, calling `set(v)` each
 * frame. Returns a cancel function. Use for values CSS cannot transition.
 */
export function springTo(from, to, set, response = 0.55, damping = 0.825, done) {
  const t0 = performance.now(), d = springDuration(response, damping);
  let raf = 0;
  const f = now => { const t = (now - t0) / 1000; if (t >= d) { set(to); done && done(); return; } set(from + (to - from) * springAt(t, response, damping)); raf = requestAnimationFrame(f); };
  raf = requestAnimationFrame(f);
  return () => cancelAnimationFrame(raf);
}

/** Reduced motion, or the app's own Motion switch turned off. */
export const still = () => document.body.classList.contains('nomotion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
