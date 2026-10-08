// Desktop only: the game at computer size, or at phone size in the middle of the
// screen for TikTok lives. Phone size only narrows the interface to a 430px
// column; the stage, the light and the colours still fill the whole screen.
// The switch is the menu's "Phone size" row (Display), web only.
//
// The layout switches on classes rather than media queries, so phone mode can
// ask for the phone layout on a wide screen: html.wide (the tablet/desktop
// layout, from 600px) and html.xwide (the wider desktop, from 900px).
const KEY = 'songspot.view';

export const desktop = () => matchMedia('(min-width: 900px) and (pointer: fine)').matches;
export function viewMode() { try { return localStorage.getItem(KEY) === 'phone' ? 'phone' : 'pc'; } catch (e) { return 'pc'; } }

/** Set html.wide / html.xwide / html.phonemode for the current window and mode. */
export function applyLayout() {
  const phone = desktop() && viewMode() === 'phone';
  const w = innerWidth, h = document.documentElement.classList;
  h.toggle('phonemode', phone);
  h.toggle('wide', !phone && w >= 600);
  h.toggle('xwide', !phone && w >= 900);
}

/** Switch PC / phone size, and let anything sized by the window redraw. */
export function setViewMode(mode) {
  try { localStorage.setItem(KEY, mode === 'phone' ? 'phone' : 'pc'); } catch (err) {}
  applyLayout();
  dispatchEvent(new Event('resize'));
}

/** At boot: the layout classes, kept up to date with the window. */
export function mountViewToggle() {
  applyLayout();
  addEventListener('resize', applyLayout);
}
