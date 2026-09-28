// Desktop only: the game at computer size, or at phone size in the middle of the
// screen for TikTok lives. Phone size only narrows the interface to a 430px
// column; the stage, the light and the colours still fill the whole screen.
//
// The layout switches on classes rather than media queries, so phone mode can
// ask for the phone layout on a wide screen: html.wide (the tablet/desktop
// layout, from 600px) and html.xwide (the wider desktop, from 900px).
const KEY = 'songspot.view';
const PC = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
const PHONE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>';

export const desktop = () => matchMedia('(min-width: 900px) and (pointer: fine)').matches;
export function viewMode() { try { return localStorage.getItem(KEY) === 'phone' ? 'phone' : 'pc'; } catch (e) { return 'pc'; } }

/** Set html.wide / html.xwide / html.phonemode for the current window and mode. */
export function applyLayout() {
  const phone = desktop() && viewMode() === 'phone';
  const w = innerWidth, h = document.documentElement.classList;
  h.toggle('phonemode', phone);
  h.toggle('wide', !phone && w >= 600);
  h.toggle('xwide', !phone && w >= 900);
  const box = document.querySelector('.viewtoggle');
  if (box) box.hidden = !desktop();
}

/** The PC / phone box in the top corner. */
export function mountViewToggle() {
  applyLayout();
  addEventListener('resize', applyLayout);
  const box = document.createElement('div');
  box.className = 'viewtoggle';
  box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'View');
  const paint = () => {
    const m = viewMode();
    box.innerHTML = `<button data-view="pc" class="${m === 'pc' ? 'on' : ''}" aria-label="Computer view" title="Computer view">${PC}</button>`
      + `<button data-view="phone" class="${m === 'phone' ? 'on' : ''}" aria-label="Phone view" title="Phone view">${PHONE}</button>`;
  };
  paint();
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    try { localStorage.setItem(KEY, b.dataset.view); } catch (err) {}
    paint(); applyLayout();
    dispatchEvent(new Event('resize'));        // anything sized by the window redraws
  });
  document.body.appendChild(box);
  document.body.classList.add('has-viewtoggle');
  box.hidden = !desktop();
}
