// Songspot on the web: opening the link is opening the game. The pool, the
// account, then straight onto the stage — no homepage, no site menu. Guests
// play at once; signing in, premium and the modes live in the app's own drawer.
import { Pool } from './pool.js';
import { Game } from './game.js';
import { Player } from './audio.js';
import { Sound } from './sound.js';
import { Account } from './account.js';
import { Ads } from './ads.js';
import { mountStage } from './stage.js';
import { toast, pressable, settings, TIER_COLOR, TIER_INK } from './ui.js';

const root = document.getElementById('app');
pressable(document);
const q = new URLSearchParams(location.search);
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/** A module's own stylesheet, loaded once when the module first opens. */
export function loadCSS(name) {
  const id = 'css-' + name;
  if (document.getElementById(id)) return;
  const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = `/app/css/${name}.css`; document.head.appendChild(l);
}

(async function boot() {
  const player = new Player(), sound = new Sound(player), account = new Account();
  let pool;
  try { [pool] = await Promise.all([Pool.load('/data/pool.json'), account.boot().catch(e => console.warn('account', e))]); }
  catch (e) { root.innerHTML = `<div class="boot"><div><div class="wordmark">songspot</div><p class="err">Couldn't load the songs. Check your connection and reload.</p></div></div>`; return; }
  const game = new Game(pool);
  // The filters of the last round, as the app remembers them.
  game.difficulty = settings.get('difficulty', 'easy'); game.era = settings.get('era', 'all'); game.category = settings.get('category', 'all');
  if (!['all', '80s', '90s', '2000s', '2010s', '2020s'].includes(game.era)) game.era = 'all';

  const debugPremium = local && q.get('premium') === '1';
  const ads = new Ads({ player, isPremium: () => ctx.premium });
  let stage = null;
  const lazy = async (name, fn, css = name) => { loadCSS(css); const m = await import(`./${name}.js`); return m[fn]; };

  const ctx = {
    pool, game, player, sound, account, ads, toast, settings,
    get premium() { return debugPremium || !!account.premium; },
    get tier() { return game.difficulty; },
    get accent() { return TIER_COLOR[game.difficulty]; },
    get accentInk() { return TIER_INK[game.difficulty]; },
    /** Stop the stage's clip (every mode calls this before it plays anything). */
    stopStage() { player.stop(); stage?.stopLook?.(); },
    /** A song by id: the pool's row, or Apple's lookup for one we never shipped (a host's artist). */
    async lookupSong(id) {
      const s = pool.byId.get(String(id)); if (s) return s;
      try { const r = await fetch('/api/itunes?id=' + encodeURIComponent(id)); if (!r.ok) return null; const d = await r.json(); return d.songs?.[0] || null; } catch (e) { return null; }
    },
    openDrawer: async () => (await lazy('drawer', 'openDrawer', 'app'))(ctx),
    openProfile: async () => { ctx.stopStage(); (await lazy('profile', 'mountProfile'))(ctx); },
    openParty: async (opts) => { ctx.stopStage(); (await lazy('party', 'mountParty'))(ctx, opts); },
    openRanked: async () => { if (!ctx.premium) return ctx.openPremium('ranked'); ctx.stopStage(); (await lazy('ranked', 'mountRanked'))(ctx); },
    openDaily: async () => { ctx.stopStage(); (await lazy('daily', 'mountDaily'))(ctx); },
    openPremium: async perk => (await lazy('premium', 'mountPremium'))(ctx, perk ?? null),
    openGenres: async () => (await lazy('pickers', 'openGenres', 'app'))(ctx),
    openArtists: async () => { if (!ctx.premium) return ctx.openPremium('artist'); (await lazy('pickers', 'openArtists', 'app'))(ctx); },
    openFAQ: async () => (await lazy('pickers', 'openFAQ', 'app'))(ctx),
    signIn: async () => (await lazy('login', 'openLogin', 'app'))(ctx),
    /** The stage redraws after the drawer or a picker changed something. */
    newRound: () => stage?.newRound(),
    setTier: t => stage?.setTier(t),
    refresh: () => stage?.render(),
  };
  window.__songspot = ctx;                                   // for poking at it from the console
  account.onChange(() => { stage?.render(); ads.sync(); });

  stage = mountStage(root, ctx);
  ads.sync();
  account.rolloverSeasonIfNeeded();

  // Back from Stripe Checkout: say so, and look for the grant (the webhook may take a moment).
  if (q.get('checkout') === 'success') {
    history.replaceState(null, '', location.pathname);
    toast('Thanks! Switching premium on…', 5);
    for (let i = 0; i < 8 && !(await account.refreshPremium()); i++) await new Promise(r => setTimeout(r, 1500));
    toast(account.premium ? "You're premium. No more ad breaks." : 'Payment received. Premium switches on in a moment — reload if it does not.', 6);
    stage.render();
  } else if (q.get('checkout') === 'cancel') history.replaceState(null, '', location.pathname);

  // A party link: songspotapp.com/?party=CODE opens the room.
  const party = (q.get('party') || '').toUpperCase();
  if (party) ctx.openParty({ join: party });
  // Test knobs (the screenshots are taken from the real game).
  const open = q.get('open');
  if (open) setTimeout(() => ({ daily: ctx.openDaily, ranked: ctx.openRanked, party: ctx.openParty, profile: ctx.openProfile, premium: () => ctx.openPremium(null), drawer: ctx.openDrawer, genres: ctx.openGenres, artists: ctx.openArtists, faq: ctx.openFAQ, login: ctx.signIn }[open] || (() => {}))(), 300);
})();
