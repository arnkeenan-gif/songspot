// Haptics → the Vibration API where the browser has one (Android Chrome).
// iPhone Safari has none, so these quietly do nothing there. The Haptics
// switch in the menu turns them off everywhere.
import { settings } from './ui.js';
const buzz = p => { try { if (settings.get('haptics', true) && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch (e) {} };
export const Haptics = {
  press: (strong = 0.6) => buzz(Math.round(6 + 10 * strong)),
  select: () => buzz(6),
  success: () => buzz([12, 40, 18]),
  wrong: () => buzz([22, 50, 22]),
  loss: () => buzz([30, 60, 30]),
  win: () => buzz([10, 30, 10, 30, 40]),
};
