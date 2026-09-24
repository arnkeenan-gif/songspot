// The menu: a drawer from the left over a dimmed stage. Difficulty, era,
// genre, the two multiplayer doors, display options, premium, FAQ.
import { TIERS, ERAS } from './pool.js';
import { el, face, TIER_COLOR, TIER_INK, cap, settings } from './ui.js';

const ICON = {
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="8" r="3.2"/><circle cx="16" cy="8" r="3.2"/><path d="M2 19c0-3.3 2.7-6 6-6s6 2.7 6 6H2zM11.5 13.6A6 6 0 0 1 22 19h-7.2a7.6 7.6 0 0 0-3.3-5.4z"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12v2h3v3a5 5 0 0 1-4.4 5A6 6 0 0 1 13 16.9V19h3v2H8v-2h3v-2.1A6 6 0 0 1 7.4 13 5 5 0 0 1 3 8V5h3zm0 4H5v1a3 3 0 0 0 1.3 2.5A9 9 0 0 1 6 8zm12 0a9 9 0 0 1-.3 2.5A3 3 0 0 0 19 8V7z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>',
  reroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16M4 20v-4h4"/></svg>',
  era: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 8l-4 4 4 4M17 8l4 4-4 4M3 12h18"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>',
};

export function openDrawer(ctx) {
  const { game, pool, account, sound, premium } = ctx;
  const accent = TIER_COLOR[game.difficulty], ink = TIER_INK[game.difficulty];
  const counts = () => pool.counts(game.era, game.category, game.artist);
  const won = account.stats.roundsWon, played = account.stats.roundsPlayed;
  const wrap = el(`<div class="drawer-wrap" style="--accent:${accent};--accent-ink:${ink}"><div class="scrim"></div><aside class="drawer" role="dialog" aria-label="Menu"></aside></div>`);
  const d = wrap.querySelector('.drawer');
  const opts = { easySearch: settings.get('easySearch', true), sounds: settings.get('sounds', true), volume: settings.get('volume', .28), artwork: settings.get('artwork', true), glow: settings.get('glow', true), haptics: settings.get('haptics', true) };
  const render = () => {
    const c = counts();
    d.innerHTML = `
      <div class="brand"><span class="wordmark">songspot</span><button class="close" data-press aria-label="Close">${ICON.x}</button></div>
      <button class="profile" data-press data-act="profile">${face(account.name, account.avatar, accent, 40, ink)}<div><b>${account.name ? esc(account.name) : 'Sign in'}</b><span>${played ? `${won} rounds won · ${Math.round(100 * won / played)}%` : 'No rounds yet'}</span></div><span class="chev">›</span></button>
      <p class="label">Play</p>
      <button class="opt" data-press data-act="party">${ICON.people}Play with friends</button>
      ${premium ? `<button class="opt" data-press data-act="ranked">${ICON.trophy}Play ranked</button>` : `<button class="opt locked" data-press data-act="premium-ranked">${ICON.trophy}Play ranked<span style="margin-left:auto">${ICON.lock}</span></button>`}
      <div class="rule"></div>
      <p class="label">Difficulty</p>
      <div class="rail">${TIERS.map(t => `<button data-press data-tier="${t}" class="${t === game.difficulty ? 'on' : ''} ${c[t] === 0 ? 'dead' : ''}">${cap(t)}</button>`).join('')}</div>
      <div style="height:18px"></div>
      <button class="action" data-act="reroll">${ICON.reroll}Reroll all</button>
      ${game.era !== 'all' ? `<button class="action" data-act="anyera">${ICON.era}Any era</button>` : ''}
      <div class="rule"></div>
      <p class="label">Spotlight</p>
      <div class="seg">${['off', 'simple'].map(v => `<button data-spot="${v}" class="${settings.get('spotlight', 'off') === v ? 'on' : ''}">${v === 'off' ? 'Off' : 'Simple'}</button>`).join('')}</div>
      <p class="note">The stage light behind the game.</p>
      <div class="rule"></div>
      <p class="label">Era</p>
      <div class="chips">${['all', ...ERAS].map(e => `<button data-era="${e}" class="${e === game.era ? 'on' : ''}">${e === 'all' ? 'Any' : e}</button>`).join('')}</div>
      <div class="rule"></div>
      <p class="label">Genre</p>
      <div class="chips">${['all', ...pool.categories].map(g => `<button data-cat="${g}" class="${g === game.category ? 'on' : ''}" title="${esc(g)}">${g === 'all' ? 'All' : esc(g)}</button>`).join('')}</div>
      <div class="rule"></div>
      <p class="label">Options</p>
      ${toggle('easySearch', 'Easy search', 'Suggestions only from songs in play.')}
      ${toggle('sounds', 'Sounds')}
      <div class="toggle"><span>Volume</span><input type="range" min="0" max="1" step="0.02" value="${opts.volume}" data-vol style="width:120px;accent-color:${accent}"></div>
      ${toggle('artwork', 'Artwork on the reveal')}
      ${toggle('glow', 'Accent glow')}
      <a class="faqlink" href="#" data-act="faq">Questions? Read the FAQ</a>`;
  };
  function toggle(k, t, note) { return `<div class="toggle ${opts[k] ? 'on' : ''}" data-toggle="${k}"><span>${t}${note ? `<span class="note" style="display:block">${note}</span>` : ''}</span><span class="sw"></span></div>`; }
  render();
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  const close = then => { wrap.classList.remove('in'); setTimeout(() => { wrap.remove(); then && then(); }, 260); };
  wrap.querySelector('.scrim').addEventListener('click', () => close());
  d.addEventListener('click', e => {
    const b = e.target.closest('button, a'); if (!b) return;
    if (b.classList.contains('close')) { sound.click(); return close(); }
    if (b.dataset.tier) { sound.click(); ctx.onTier(b.dataset.tier); return render(); }
    if (b.dataset.era) { sound.click(); game.era = b.dataset.era; ctx.onChange(); return render(); }
    if (b.dataset.spot) { sound.click(); settings.set('spotlight', b.dataset.spot); ctx.onOption('spotlight', b.dataset.spot); return render(); }
    if (b.dataset.cat) { sound.click(); game.category = b.dataset.cat; ctx.onChange(); return render(); }
    const act = b.dataset.act; if (!act) return;
    sound.click(); e.preventDefault();
    if (act === 'reroll') { ctx.toast('New song.'); ctx.onChange(); }
    else if (act === 'anyera') { game.era = 'all'; ctx.onChange(); render(); }
    else if (act === 'profile') close(() => account.signedIn ? ctx.openProfile() : ctx.signIn());
    else if (act === 'party') close(() => ctx.openParty());
    else if (act === 'ranked') close(() => ctx.openRanked());
    else if (act === 'premium-ranked') ctx.openPremium('ranked');
    else if (act === 'premium') ctx.openPremium(null);
    else if (act === 'faq') ctx.openFAQ();
  });
  d.addEventListener('click', e => {
    const t = e.target.closest('[data-toggle]'); if (!t) return;
    const k = t.dataset.toggle; opts[k] = !opts[k]; settings.set(k, opts[k]); t.classList.toggle('on', opts[k]); ctx.onOption(k, opts[k]);
  });
  d.addEventListener('input', e => { if (e.target.dataset.vol !== undefined) { settings.set('volume', +e.target.value); ctx.onOption('volume', +e.target.value); } });
  return { close };
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
