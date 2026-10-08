// Offline.swift on the web: Connection + OfflineCover. Every song streams
// from the network, so without a connection there is no game to play: the
// page says so plainly instead of showing a play button that does nothing.
// It covers everything and lifts by itself when the connection comes back.
// Nothing to tap: there is nothing to retry by hand.
//   navigator.onLine + the online/offline events stand in for NWPathMonitor.
//   Localhost knob ?fakeOffline=1 (the app's -fakeOffline) shows the cover.

const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const fake = local && new URLSearchParams(location.search).has('fakeOffline');

/** wifi.slash, drawn like icons.js (stroke 2.2). */
const WIFI_SLASH = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 9a14 14 0 0 1 6.2-3.4M13.5 5.3A14 14 0 0 1 21.5 9M5.5 12.5a9.5 9.5 0 0 1 4.6-2.4M15.6 10.7a9.5 9.5 0 0 1 2.9 1.8M8.8 16a5 5 0 0 1 6.4 0"/><circle cx="12" cy="19.5" r="1.2" fill="currentColor" stroke="none"/><path d="M3.5 3.5l17 17"/></svg>';

export const Connection = {
  online: fake ? false : navigator.onLine !== false,
  _listeners: new Set(),
  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); },
  _set(v) { if (fake || v === this.online) return; this.online = v; this._listeners.forEach(f => { try { f(v); } catch (e) {} }); },
};
window.addEventListener('online', () => Connection._set(true));
window.addEventListener('offline', () => Connection._set(false));

let cover = null;
/** One cover for the whole page, over every screen (iOS puts it on every full-screen page). */
export function mountOffline() {
  if (cover) return cover;
  if (!document.getElementById('css-system')) {
    const l = document.createElement('link'); l.id = 'css-system'; l.rel = 'stylesheet'; l.href = '/app/css/system.css?v=1'; document.head.appendChild(l);
  }
  cover = document.createElement('div');
  cover.className = 'offline-cover';
  cover.setAttribute('role', 'alert');
  cover.setAttribute('aria-live', 'assertive');
  cover.innerHTML = `<div class="oc-in"><span class="oc-tile">${WIFI_SLASH}</span>
    <h2>You're offline</h2>
    <p>Songspot plays every song from Apple Music, so it needs a connection. It picks up where you left off as soon as you're back online.</p>
    <span class="oc-wait"><i class="oc-spin"></i>Waiting for a connection…</span></div>`;
  document.body.appendChild(cover);
  const draw = () => { cover.classList.toggle('on', !Connection.online); cover.setAttribute('aria-hidden', Connection.online ? 'true' : 'false'); };
  draw();
  Connection.onChange(draw);
  return cover;
}
