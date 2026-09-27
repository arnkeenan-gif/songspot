// WinSequence.swift on the web: the correct-guess choreography of the stage
// light, measured off the original's capture. Every function takes the win
// clock `t` — real seconds × Win.speed — exactly as the app does.
import { keys, bezier } from './motion.js';

export const SPEED = 1.7;

export const ratio = t => keys([[0, 1], [0.5, 1], [0.6, 0.946], [0.7, 0.87], [0.8, 0.752], [0.9, 0.62],
  [1.0, 0.5415], [1.1, 0.574], [1.2, 0.586], [1.4, 0.586], [1.5, 0.592], [1.6, 0.694], [1.7, 0.801], [1.8, 0.911], [1.9, 0.977], [2.0, 1]], t);

export const glow = t => keys([[0, 0], [0.5, 0], [0.6, 0.012], [0.8, 0.03], [0.9, 0.05], [1.0, 0.075], [1.1, 0.16], [1.26, 0.135],
  [1.5, 0.1], [1.6, 0.075], [1.7, 0.0625], [1.8, 0.05], [1.9, 0.045], [2.0, 0.038]], t);

export const sway = t => keys([[0, 0], [0.44, 0], [0.60, 2.2], [0.76, -2.6], [0.92, 2.9], [1.08, -2.4], [1.24, 1.8], [1.40, -1.3], [1.60, 0.8], [1.80, -0.4], [2.0, 0]], t);
export const tilt = t => keys([[0, 0], [0.44, 0], [0.60, 0.34], [0.76, -0.40], [0.92, 0.46], [1.08, -0.38], [1.24, 0.28], [1.40, -0.20], [1.60, 0.12], [1.80, -0.06], [2.0, 0]], t);

const waveCurve = bezier(0.22, 0.7, 0.24, 1);
/** CSS re-applies the timing function inside every keyframe segment. */
export function segment(f, stops, curve) {
  if (f <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (f <= stops[i][0]) {
    const [f0, v0] = stops[i - 1], [f1, v1] = stops[i];
    if (f1 <= f0) return v1;
    return v0 + (v1 - v0) * curve((f - f0) / (f1 - f0));
  }
  return stops[stops.length - 1][1];
}

/** The glimpse of light: a fixed 0.35 s lead on the payoff. offset is a mask-position fraction. */
export function wave(t, payoff = 0.97) {
  const start = 0.62 + (payoff - 0.97), dur = 0.76, f = (t - start) / dur;
  if (!(f > 0 && f < 1)) return { offset: -0.62, opacity: 0, scaleX: 0.94 };
  return {
    offset: keys([[0, -0.62], [0.092, -0.17], [0.224, 0.219], [0.355, 0.724], [0.487, 1.048], [1, 1.62]], f),
    opacity: segment(f, [[0, 0], [0.16, 0.48], [0.50, 0.88], [0.82, 0.34], [1, 0]], waveCurve),
    scaleX: segment(f, [[0, 0.94], [0.50, 1.015], [1, 1.06]], waveCurve),
  };
}

/** The beam holds this long (win clock) before the cover and confetti land. */
export const payoff = last => (last ? 1.48 : 0.97);

// The era reel's spin.
export const reelDuration = steps => Math.min(2.9, 0.380 * steps);
export function reelPosition(elapsed, steps) { const f = Math.min(1, elapsed / reelDuration(steps)); return steps * (1 - Math.pow(1 - f, 3)); }
export function reelBlur(elapsed, steps) {
  const d = reelDuration(steps), f = Math.min(1, elapsed / d);
  return Math.min(2.6, steps * 3 * Math.pow(1 - f, 2) / d * 0.055);
}
