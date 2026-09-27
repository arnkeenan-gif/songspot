// Haptics.swift → the Vibration API where the browser has one (Android Chrome).
// iPhone Safari has none, so these quietly do nothing there. The Haptics
// switch in the menu turns them off everywhere. A vibration motor has no
// intensity or sharpness, so weight becomes length.
import { settings } from './ui.js';
const buzz = p => { try { if (settings.get('haptics', true) && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch (e) {} };
/** Taps at times (s) with lengths (ms), as one vibrate pattern. */
const beats = list => { const p = []; let at = 0; for (const [t, ms] of list.sort((a, b) => a[0] - b[0])) { const gap = Math.max(0, Math.round(t * 1000 - at)); if (p.length) p.push(gap); else if (gap) p.push(0, gap); p.push(ms); at = t * 1000 + ms; } buzz(p); };
export const Haptics = {
  /** UIImpactFeedbackGenerator: rigid, or soft, at a weight. */
  press: (weight = 0.7) => buzz(Math.round(6 + 12 * weight)),
  tap: () => buzz(8),
  select: () => buzz(5),
  /** UINotificationFeedbackGenerator .success / .error */
  success: () => buzz([10, 60, 14]),
  wrong: () => buzz([14, 50, 14, 50, 22]),
  /** One heavy thud as the light dips, a soft one 0.9 s later as it comes back. */
  loss: () => beats([[0, 26], [0.9, 12]]),
  /** Haptics.winSweep's fallback beats, on the win clock divided into real seconds. */
  winSweep(payoff, speed = 1.7) {
    const closeStart = 0.5 / speed, waveStart = (0.62 + (payoff - 0.97)) / speed, waveDur = 0.76 / speed, flareAt = 1.1 / speed;
    beats([[closeStart, 9], [waveStart, 11], [waveStart + waveDur * 0.33, 14], [waveStart + waveDur * 0.66, 17], [flareAt, 24]]);
  },
  win() {},
};
