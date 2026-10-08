// SongSaver.swift + the reveal's "Add to playlist" choice. Both open the song
// in the music app, where the player adds it to a playlist: Apple Music by the
// song's own link, Spotify by a search for it (the Spotify app takes the link
// when installed, the web player otherwise). The app's confirmationDialog is
// an action sheet here; on the web each opens in a new tab.
import { el, esc, pushView, popView } from './ui.js';

/** The song in Spotify: a search for title and artist (urlPathAllowed: spaces as %20, slashes kept). */
export function spotifyURL(title, artist) {
  const q = encodeURIComponent(`${title} ${artist}`).replace(/%2F/gi, '/').replace(/%40/g, '@').replace(/%3A/gi, ':').replace(/%2C/gi, ',').replace(/%3B/gi, ';').replace(/%3D/gi, '=').replace(/%2B/gi, '+').replace(/%24/g, '$').replace(/%26/g, '&');
  return `https://open.spotify.com/search/${q}`;
}
const open = url => { try { window.open(url, '_blank', 'noopener'); } catch (e) {} };

let showing = null;
/** "Add to playlist": Apple Music, Spotify, Cancel. */
export function openSongSaver(song, { sound } = {}) {
  if (showing || !song) return;
  const node = el(`<div class="view sheet ss-confirm" role="alertdialog" aria-label="Add to playlist"><div class="scrim"></div>
    <div class="stackup"><div class="cardc"><div class="lead"><b>Add to playlist</b><div>Open “${esc(song.title)}” in Apple Music or Spotify</div></div>
      <button class="act" data-press data-to="apple">Apple Music</button><button class="act" data-press data-to="spotify">Spotify</button></div>
      <div class="cardc"><button class="cancel" data-press>Cancel</button></div></div></div>`);
  showing = node;
  const end = () => { if (showing !== node) return; showing = null; document.removeEventListener('keydown', onEsc, true); popView(node); };
  const onEsc = e => { if (e.key === 'Escape') { e.stopPropagation(); end(); } };
  node.querySelector('.scrim').addEventListener('click', end);
  node.querySelector('.cancel').addEventListener('click', end);
  node.querySelectorAll('[data-to]').forEach(b => b.addEventListener('click', () => {
    sound?.click?.();
    if (b.dataset.to === 'apple') { if (song.url) open(song.url); }
    else open(spotifyURL(song.title, song.artist));
    end();
  }));
  document.addEventListener('keydown', onEsc, true);
  pushView(node);
}
