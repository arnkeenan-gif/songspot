// Songspot on the web: opening the link is opening the game. The pool, the
// account, then straight onto the stage — no homepage, no site menu. Guests
// play at once. Like the iPhone app (StageView + HomeTabs): Home is the stage,
// and the bar along the bottom opens Games, Party, Friends and Profile over it;
// the ☰ on Home is settings only.
import { Pool } from './pool.js';
import { Game } from './game.js';
import { Player } from './audio.js';
import { Sound } from './sound.js';
import { Account } from './account.js';
import { Ads } from './ads.js';
import { mountStage } from './stage.js';
import { toast, pressable, settings, viewsOpen, TIER_COLOR, TIER_INK } from './ui.js';
import { mountViewToggle } from './view.js';
import { mountTabs } from './tabs.js';
import { Friends, codeFrom } from './friends.js';
import { Season, bootSeason } from './season.js';
bootSeason();   // [season] the season's palette onto ui.js's colours and :root, before anything draws

const root = document.getElementById('app');
pressable(document);
const q = new URLSearchParams(location.search);
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/** Bumped with every deploy that changes CSS, so browsers drop the old files. */
const CSS_V = 27;

/** A module's own stylesheet, loaded once when the module first opens. */
export function loadCSS(name) {
  const id = 'css-' + name;
  if (document.getElementById(id)) return;
  const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = `/app/css/${name}.css?v=${CSS_V}`; document.head.appendChild(l);
}

(async function boot() {
  mountViewToggle();
  const player = new Player(), sound = new Sound(player), account = new Account();
  let pool;
  try { [pool] = await Promise.all([Pool.load('/data/pool.json'), account.boot().catch(e => console.warn('account', e))]); }
  catch (e) { root.innerHTML = `<div class="boot"><div><div class="wordmark">songspot</div><p class="err">Couldn't load the songs. Check your connection and reload.</p></div></div>`; return; }
  // Today's daily song from the server, the same one everyone plays.
  import('./daily.js').then(m => m.Daily.syncSong(pool)).catch(() => {});
  // Back from a sign-in that failed at the provider: say so, rather than
  // landing quietly as a guest as if it had worked.
  {
    const err = q.get('error_description') || new URLSearchParams(location.hash.slice(1)).get('error_description');
    if (err) {
      setTimeout(() => toast("Sign-in didn't go through. Try again in a minute.", 6), 800);
      history.replaceState(null, '', location.pathname);
    }
  }
  const game = new Game(pool);
  // A cold launch is Easy, any era, all genres, as the app (stage.js sets them at mount).

  const debugPremium = local && q.get('premium') === '1';
  const ads = new Ads({ player, isPremium: () => ctx.premium });
  let stage = null, drawer = null, tabs = null;
  const lazy = async (name, fn, css = name) => { loadCSS(css); const m = await import(`./${name}.js`); return m[fn]; };

  const ctx = {
    pool, game, player, sound, account, ads, toast, settings, loadCSS,
    /** The tab bar (tabs.js): current, select(name), setAway(reason, on), setTier, onChange, refresh, height. */
    get tabs() { return tabs; },
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
    openDrawer: async () => { const d = await (await lazy('drawer', 'openDrawer', 'app'))(ctx); if (d) drawer = d; return d; },
    // A profile needs an account: a guest is sent to sign in first.
    openProfile: async () => {
      if (!ctx.account.signedIn) { ctx.toast('Sign in to get a profile.'); return ctx.signIn(); }
      ctx.stopStage(); (await lazy('profile', 'mountProfile'))(ctx);
    },
    openParty: async (opts) => {
      // Hosting a room is premium (StageView.createParty); Songbot's practice 1v1 too.
      if (opts?.host && !ctx.premium) return ctx.openPremium('host');
      if (opts?.songbot && !ctx.premium) return ctx.openPremium('songbot');
      ctx.stopStage(); (await lazy('party', 'mountParty'))(ctx, opts);
    },
    /** Beat Songbot: the bot 1v1, premium. */
    openSongbot: () => ctx.openParty({ songbot: true }),
    /** Friends (FriendsView): anyone can open it; a guest sees the sign-in line. */
    openFriends: async () => (await lazy('friendsview', 'openFriends', 'friends'))(ctx),
    // Ranked is premium, with one free match for a new player (StageView.rankedOpen).
    openRanked: async () => { if (!ctx.premium && (account.stats.rankedPlayed || 0) > 0) return ctx.openPremium('ranked'); ctx.stopStage(); (await lazy('ranked', 'mountRanked'))(ctx); },
    openDaily: async () => { ctx.stopStage(); (await lazy('daily', 'mountDaily'))(ctx); },
    // Premium needs a profile first: signed out, sign in, and premium opens once they're back.
    openPremium: async perk => {
      if (!account.signedIn && !ctx.premium) { (await lazy('premium', 'rememberPending'))({ kind: 'open', perk: perk ?? null }); ctx.toast('Make a profile first, so premium is saved to it.'); return ctx.signIn(); }
      (await lazy('premium', 'mountPremium'))(ctx, perk ?? null);
    },
    openGenres: async () => (await lazy('pickers', 'openGenres', 'app'))(ctx),
    openArtists: async () => { if (!ctx.premium) return ctx.openPremium('artist'); (await lazy('pickers', 'openArtists', 'app'))(ctx); },
    /** One album (AlbumPicker): gated exactly as the artist pick. */
    openAlbums: async () => {
      if (!ctx.premium) return ctx.openPremium('album');
      const open = await lazy('pickers', 'openAlbums', 'app');
      if (typeof open === 'function') open(ctx); else toast('Coming soon.');
    },
    /** A card on the Games page (StageView.pick): into that mode, or its premium door. */
    pick(mode) {
      switch (mode) {
        case 'daily': return ctx.openDaily();
        case 'classic': return tabs.select('home');
        case 'season': {
          // The season's hits: its genre on Home, a fresh deal.
          const s = Season.current;
          if (s) { game.category = Season.genre(s); game.artist = null; game.setArtistSongs?.([]); if ('album' in game) game.album = null; stage?.newRound(); }
          return tabs.select('home');
        }
        case 'genres': return ctx.openGenres();
        case 'artists': return ctx.openArtists();
        case 'albums': return ctx.openAlbums();
        case 'ranked': return ctx.openRanked();
        case 'party': return tabs.select('party');
        case 'friends': return tabs.select('friends');
        case 'songbot': return ctx.openSongbot();
      }
    },
    /** [money] Manage the plan: Stripe's billing portal (profile.js calls it). */
    openManage: async () => { const m = await import('./premium.js'); const msg = await m.openPortal(ctx); if (msg) ctx.toast(msg); },
    openFAQ: async () => (await lazy('pickers', 'openFAQ', 'app'))(ctx),
    signIn: async () => (await lazy('login', 'openLogin', 'app'))(ctx),
    /** The stage redraws after the drawer or a picker changed something; a pick from a sheet lands on Home. */
    newRound: () => { stage?.newRound(); tabs?.select('home', { quiet: true }); },
    setTier: t => { stage?.setTier(t); tabs?.setTier(t); },
    refresh: () => { stage?.render(); tabs?.refresh(); },
  };
  window.__songspot = ctx;                                   // for poking at it from the console
  account.onChange(() => { stage?.render(); tabs?.refresh(); ads.sync(); if (account.signedIn && settings.get('mustProfile', false)) settings.set('mustProfile', false); resumePremium(); loginDoor(); });
  // [money] A new player sees premium once, straight after signing in (StageView's LoginGateView done):
  // only for a sign-in during this visit, with nothing else waiting (a pending buy, a party or friend code, a screen open).
  const signedInAtBoot = account.signedIn;
  let doorShown = false;
  function loginDoor() {
    if (doorShown || signedInAtBoot || !account.signedIn || ctx.premium) return;
    doorShown = true;
    setTimeout(async () => {
      let pending = null; try { pending = sessionStorage.getItem('songspot.pendingBuy'); } catch (e) {}
      if (ctx.premium || pending || Friends.pendingCode || (q.get('party') || '') || viewsOpen() || document.querySelector('.login, .drawer-wrap')) return;
      (await lazy('premium', 'mountPremium'))(ctx, null, { entry: 'login' });
    }, 600);
  }
  // Sent to sign in on the way to premium: once back and signed in, carry on — open premium,
  // or, if they had pressed pay, go straight on to Stripe.
  let premiumResumed = false;
  async function resumePremium() {
    if (premiumResumed || !account.signedIn || ctx.premium) return;
    let raw = null; try { raw = sessionStorage.getItem('songspot.pendingBuy'); } catch (e) {}
    if (!raw) return;
    premiumResumed = true;
    const m = await import('./premium.js'); const p = m.takePending(); if (!p) return;
    if (p.kind === 'buy' && ['yearly', 'monthly', 'lifetime'].includes(p.plan)) { toast('Taking you to checkout…'); const msg = await m.startCheckout(ctx, p.plan); if (msg) { toast(msg, 5); ctx.openPremium(null); } }
    else ctx.openPremium(p.perk ?? null);
  }
  /** Paid as a guest: the sign-in screen without a way out, until premium sits on a real profile. */
  const mustProfile = async () => { if (account.isGuest) (await lazy('login', 'openLogin', 'app'))(ctx, { forced: true }); };
  // Friends: the heartbeat (online + incoming challenges) and the challenge banner.
  // A 1v1 opens out of whatever is on screen: the menu closes, the stage goes quiet.
  loadCSS('friends');
  Friends.onLaunch = launch => { drawer?.close(); drawer = null; ctx.openParty({ duel: launch }); };
  Friends.init(account);

  // The bar before the stage, so the stage's first render can already ask for it.
  loadCSS('tabs');
  tabs = mountTabs(ctx);
  stage = mountStage(root, ctx);
  tabs.refresh();
  ads.sync();
  account.rolloverSeasonIfNeeded();

  // Back from Stripe Checkout: say so, and look for the grant (the webhook may take a moment).
  if (q.get('checkout') === 'success') {
    history.replaceState(null, '', location.pathname);
    // Paid as a guest: a profile is next, and the screen stays until they have one (see mustProfile below).
    if (account.isGuest) { settings.set('mustProfile', true); mustProfile(); }
    toast('Thanks! Switching premium on…', 5);
    for (let i = 0; i < 8 && !(await account.refreshPremium()); i++) await new Promise(r => setTimeout(r, 1500));
    toast(account.premium ? "You're premium. No more ad breaks." : 'Payment received. Premium switches on in a moment — reload if it does not.', 6);
    stage.render();
    import('./premium.js').then(m => m.checkoutReturned?.('bought')).catch(() => {});   // [money] the funnel
  } else if (q.get('checkout') === 'cancel') {
    history.replaceState(null, '', location.pathname);
    import('./premium.js').then(m => m.checkoutReturned?.('cancelled')).catch(() => {});   // [money] the funnel
  }
  // Came back without finishing the profile (closed the tab, reloaded): it is still the first thing they see.
  if (account.isGuest && (settings.get('mustProfile', false) || account.premium)) mustProfile();

  // A party link: songspotapp.com/?party=CODE opens the room.
  const party = (q.get('party') || '').toUpperCase();
  if (party) ctx.openParty({ join: party });
  // A friend's link: songspotapp.com/?add=CODE (from /add?c=CODE) opens Friends and adds them.
  // The code is kept through a sign-in, which comes back to a bare URL.
  {
    const c = codeFrom(q.get('add') || '');
    if (c) { Friends.pendingCode = c; const u = new URL(location.href); u.searchParams.delete('add'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
    if (!party && Friends.pendingCode) setTimeout(() => ctx.openFriends(), 400);
  }
  // A tab by link: ?tab=games|party|friends|profile (like iOS -tab); ?multiplayer=1 opens Games on Multiplayer.
  if (q.get('multiplayer') === '1') settings.set('games.multiplayer', true);
  else if (q.get('multiplayer') === '0') settings.set('games.multiplayer', false);
  { const t = q.get('tab'); if (t && t !== 'home' && !party) tabs.select(t, { quiet: true }); }
  // Test knobs (the screenshots are taken from the real game).
  const open = q.get('open');
  if (open) setTimeout(() => ({ daily: ctx.openDaily, ranked: ctx.openRanked, party: ctx.openParty, profile: ctx.openProfile, friends: ctx.openFriends, premium: async () => (await lazy('premium', 'mountPremium'))(ctx, q.get('perk') || null),   // localhost: straight in, even as a guest
 drawer: ctx.openDrawer, genres: ctx.openGenres, artists: ctx.openArtists, albums: ctx.openAlbums, songbot: ctx.openSongbot, faq: ctx.openFAQ, login: ctx.signIn }[open] || (() => {}))(), 300);
  // `?toast=text` (localhost): a toast after 2 s for 30 s, as iOS -toast, to check where it sits.
  if (local && q.get('toast')) setTimeout(() => toast(q.get('toast'), 30), 2000);
})();
