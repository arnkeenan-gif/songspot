// Everything premium is, on one sheet: the price as the one big figure, the
// four things it buys as a ledger, and the button — with the row that brought
// you here lit. Web purchase (Stripe) comes later; today the button waits.
import { el, pushView, popView, esc } from './ui.js';

const CSS = new URL('../css/profile.css', import.meta.url);
function styles() { if (!document.querySelector('link[data-profile]')) document.head.appendChild(el(`<link rel="stylesheet" href="${CSS}" data-profile>`)); }

/** The price shown until Stripe answers. */
export const PRICE = '$9.99';
export const APP_STORE = 'https://apps.apple.com/app/id6808657554';

/** Small filled glyphs, 24-box, currentColor. */
export const G = {
  crown: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/></svg>',
  mute: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8l5 8M21 8l-5 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>',
  trophy: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 3h12v3h3v2a5 5 0 0 1-4.6 5A6 6 0 0 1 13 16.9V19h3v2H8v-2h3v-2.1A6 6 0 0 1 7.6 13 5 5 0 0 1 3 8V6h3V3zm0 5H5a3 3 0 0 0 2 2.8V8zm12 0v2.8A3 3 0 0 0 21 8h-3z"/></svg>',
  people: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="7" r="3"/><circle cx="5" cy="9" r="2.2"/><circle cx="19" cy="9" r="2.2"/><path d="M7 19a5 5 0 0 1 10 0H7zM1 17.5a4 4 0 0 1 6-3.5 7 7 0 0 0-1.8 3.5H1zM23 17.5h-4.2A7 7 0 0 0 17 14a4 4 0 0 1 6 3.5z"/></svg>',
  mic: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 2a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4zm-6 9h2a4 4 0 0 0 8 0h2a6 6 0 0 1-5 5.9V19h3v2H8v-2h3v-2.1A6 6 0 0 1 6 11z"/></svg>',
};

/** The four perks, keyed by the door they lock: ads, ranked, host, artist. */
export const PERKS = [
  { key: 'ads', g: G.mute, title: 'No ad breaks', detail: 'Free play stops for a short ad after every five rounds. Premium never does.' },
  { key: 'ranked', g: G.trophy, title: 'Ranked', detail: 'Five songs against a rated opponent, and a place on the daily and weekly boards. The ladder resets every Monday.' },
  { key: 'host', g: G.people, title: 'Host parties', detail: 'Your own room code for up to fifty phones. Joining stays free for everyone.' },
  { key: 'artist', g: G.mic, title: 'One-artist mode', detail: "Play only one artist's songs — on your own, or for the whole party you host." },
];

/** A bottom sheet; `highlightPerk` is a PERKS key or null (the crown itself). */
export function mountPremium(ctx, highlightPerk = null) {
  styles();
  const has = !!ctx.account?.premium;
  const view = el(`<div class="view sheet premium" role="dialog" aria-label="Premium">
    <div class="scrim"></div>
    <div class="sheet-body">
      <div class="grab"></div>
      <div class="k">${G.crown}PREMIUM</div>
      <div class="price">${PRICE}</div>
      <div class="once">Once. Nothing renews, nothing to cancel.</div>
      <div class="perks">${PERKS.map(p => `<div class="perk${p.key === highlightPerk ? ' lit' : ''}"><div class="g">${p.g}</div><div><b>${esc(p.title)}</b><span>${esc(p.detail)}</span></div></div>`).join('')}</div>
      <div class="fill"></div>
      <button class="btn primary" disabled>${has ? "You're premium" : 'Coming to the web soon'}</button>
      ${has ? '' : `<a class="iphone" href="${APP_STORE}" target="_blank" rel="noopener">Buy in the <b>iPhone app</b></a>`}
      <button class="restore" data-press>Restore purchases</button>
    </div>
  </div>`);
  const close = () => { popView(view); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  view.querySelector('.scrim').addEventListener('click', close);
  view.querySelector('.restore').addEventListener('click', () => ctx.toast('Sign in with the account you bought with.'));
  document.addEventListener('keydown', onKey);
  pushView(view);
  return close;
}
