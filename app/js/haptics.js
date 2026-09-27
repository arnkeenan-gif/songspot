// Haptics.swift on the web, same calls at the same moments:
//   tap · press(weight) · select · success · wrong · loss · winSweep
//
// Android (and any browser with the Vibration API): navigator.vibrate, with
// the app's patterns. A vibration motor has no intensity or sharpness, so
// weight becomes length.
//
// iPhone Safari has no Vibration API. Since iOS 18 a switch control
// (<input type="checkbox" switch>) gives the system's own haptic tick when it
// flips, and clicking the <label> that holds it flips it — so a hidden one,
// clicked from code, is a haptic. Each beat of a pattern is one tick. Only
// where the switch exists and vibrate does not; anywhere else it is never
// built. The Haptics switch in the menu turns all of it off.
import { settings } from './ui.js';

const on = () => settings.get('haptics', true);
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
const hasSwitch = (() => {
  try { return !canVibrate && typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 0; }
  catch (e) { return false; }
})();

let label = null;
function tick() {
  try {
    if (!label) {
      label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none';
      const i = document.createElement('input');
      i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
      // The flip must never reach the page's own click handlers.
      i.addEventListener('click', e => e.stopPropagation());
      label.addEventListener('click', e => e.stopPropagation());
      label.appendChild(i);
      document.body.appendChild(label);
    }
    label.click();
  } catch (e) {}
}

/** Beats at times (s): [t, ms]. ms is the vibration length; on iPhone each beat is one tick. */
function beats(list) {
  if (!on()) return;
  list = list.slice().sort((a, b) => a[0] - b[0]);
  if (canVibrate) {
    try {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      const p = []; let at = 0;
      for (const [t, ms] of list) { const gap = Math.max(0, Math.round(t * 1000 - at)); if (p.length) p.push(gap); else if (gap) p.push(0, gap); p.push(ms); at = t * 1000 + ms; }
      navigator.vibrate(p.length === 1 ? p[0] : p);
    } catch (e) {}
  } else if (hasSwitch) {
    for (const [t] of list) t <= 0 ? tick() : setTimeout(tick, t * 1000);
  }
}

export const Haptics = {
  /** Whether this browser can make any haptic at all. */
  supported: canVibrate || hasSwitch,
  /** UIImpactFeedbackGenerator(.light): one light tap, a beat in a sequence. */
  tap: () => beats([[0, 8]]),
  /** UIImpactFeedbackGenerator(.rigid / .soft) at a weight: the play disc, Skip, Give up. */
  press: (weight = 0.7) => beats([[0, Math.round(6 + 12 * weight)]]),
  /** UISelectionFeedbackGenerator: a suggestion, a setting. */
  select: () => beats([[0, 5]]),
  /** UINotificationFeedbackGenerator .success: two beats, the second firmer. */
  success: () => beats([[0, 10], [0.07, 14]]),
  /** .error: three quick beats. */
  wrong: () => beats([[0, 14], [0.064, 14], [0.128, 22]]),
  /** One heavy thud as the light dips, a soft one 0.9 s later as it comes back. */
  loss: () => beats([[0, 26], [0.9, 12]]),
  /** Haptics.winSweep's fallback beats, on the win clock divided into real seconds. */
  winSweep(payoff, speed = 1.7) {
    const closeStart = 0.5 / speed, waveStart = (0.62 + (payoff - 0.97)) / speed, waveDur = 0.76 / speed, flareAt = 1.1 / speed;
    beats([[closeStart, 9], [waveStart, 11], [waveStart + waveDur * 0.33, 14], [waveStart + waveDur * 0.66, 17], [flareAt, 24]]);
  },
  win() {},
};
