// Desktop only: the game at computer size, or in a phone frame in the middle of
// the screen — the whole app exactly as on a phone, for TikTok lives and the like.
// Phone mode loads the site inside a phone-sized frame, so every screen uses the
// real phone layout rather than an imitation of it.
const KEY = 'songspot.view';
const PC = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
const PHONE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>';

export const framed = () => { try { return window.self !== window.top; } catch (e) { return true; } };
export const desktop = () => matchMedia('(min-width: 900px) and (pointer: fine)').matches;
export function viewMode() { try { return localStorage.getItem(KEY) === 'phone' ? 'phone' : 'pc'; } catch (e) { return 'pc'; } }
function setMode(m) { try { localStorage.setItem(KEY, m); } catch (e) {} location.reload(); }

/** The PC / phone box in the top corner. */
export function mountViewToggle() {
  if (framed() || !desktop()) return;
  const m = viewMode();
  const box = document.createElement('div');
  box.className = 'viewtoggle';
  box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'View');
  box.innerHTML = `<button data-view="pc" class="${m === 'pc' ? 'on' : ''}" aria-label="Computer view" title="Computer view">${PC}</button>`
    + `<button data-view="phone" class="${m === 'phone' ? 'on' : ''}" aria-label="Phone view" title="Phone view">${PHONE}</button>`;
  box.addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b && b.dataset.view !== m) setMode(b.dataset.view); });
  document.body.appendChild(box);
  document.body.classList.add('has-viewtoggle');
}

/** Phone mode: the site again, inside a phone-sized frame. Returns true when shown. */
export function showPhoneShell() {
  if (framed() || !desktop() || viewMode() !== 'phone') return false;
  document.body.classList.add('phone-shell');
  const app = document.getElementById('app');
  app.innerHTML = `<div class="phoneframe"><iframe src="${location.pathname}${location.search}${location.hash}" title="Songspot" allow="autoplay; clipboard-write; web-share"></iframe></div>`;
  mountViewToggle();
  return true;
}
