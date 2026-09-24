// The questions the web build answers, same wording as the apps, on a sheet.
import { el, pushView, popView, esc } from './ui.js';

const CSS = new URL('../css/profile.css', import.meta.url);
function styles() { if (!document.querySelector('link[data-profile]')) document.head.appendChild(el(`<link rel="stylesheet" href="${CSS}" data-profile>`)); }

export const FAQ = [
  ['How do I play?', 'You hear a fraction of a second of a song. Name it, or skip for more: 0.1s, 0.5s, 2s, 8s, then 15s.'],
  ['Where do the songs come from?', 'A curated pool of 10,333 well-known tracks, tiered by how recognisable they are, played from Apple Music.'],
  ['What do the difficulties mean?', 'Easy is the biggest hits and Impossible the deepest cuts still worth knowing. Every finished round moves you up one, and Impossible wraps back to Easy.'],
  ['What are the eras?', 'Seven decades from the 60s to the 2020s, or Any era. Tap the reel to spin for one.'],
  ['Can I play one artist?', 'Yes. Pick an artist in the menu and difficulty becomes catalogue depth for that artist instead.'],
  ['Do I need Apple Music?', 'No. Everyone hears the Apple Music preview of each song. With an Apple Music subscription you hear the full track instead.'],
  ['Why did a skip keep playing?', "Skipping never cuts the audio — the clip keeps sounding and runs on to the new stage's length."],
  ['What is Arcade mode?', 'A skin: raised keys with coloured soles, dot ratings and a chunkier play button.'],
  ['Does it remember me?', 'Your difficulty, era, genre and options are kept on this device. Nothing is sent anywhere.'],
];

/** A bottom sheet: title and Done on one baseline, then the nine flat cells. */
export function mountFAQ(ctx) {
  styles();
  const view = el(`<div class="view sheet faq" role="dialog" aria-label="How to play">
    <div class="scrim"></div>
    <div class="sheet-body">
      <div class="head"><h2>How to play</h2><button class="done" data-press>Done</button></div>
      <div class="list">${FAQ.map(([q, a]) => `<div class="qa"><b>${esc(q)}</b><p>${esc(a)}</p></div>`).join('')}</div>
    </div>
  </div>`);
  const close = () => { popView(view); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  view.querySelector('.scrim').addEventListener('click', close);
  view.querySelector('.done').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  pushView(view);
  return close;
}
