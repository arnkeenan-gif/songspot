// Songspot on the web. The door, the pool, the account, then the stage.
import { gate } from './lock.js';
import { Pool } from './pool.js';
import { Game } from './game.js';
import { Player } from './audio.js';
import { Sound } from './sound.js';
import { Account } from './account.js';
import { mountStage } from './stage.js';
import { el, toast, pressable, settings } from './ui.js';

const root = document.getElementById('app');
pressable(document);

gate(root, async () => {
  root.innerHTML = '<div class="login"><div class="wordmark">songspot</div></div>';
  const player = new Player(), sound = new Sound(player), account = new Account();
  let pool;
  try { [pool] = await Promise.all([Pool.load('/data/pool.json'), account.boot()]); }
  catch (e) { root.innerHTML = `<div class="login"><p class="err">Couldn't load the songs. ${e.message}</p></div>`; return; }
  const game = new Game(pool);

  const ctx = {
    pool, game, player, sound, account, toast,
    get premium() { return account.premium || settings.get('debugPremium', false); },
    openProfile: async () => { const m = await import('./profile.js'); m.mountProfile(ctx); },
    openParty: async () => { player.stop(); const m = await import('./party.js'); m.mountParty(ctx); },
    openRanked: async () => { player.stop(); const m = await import('./ranked.js'); m.mountRanked(ctx); },
    openPremium: async perk => { const m = await import('./premium.js'); m.mountPremium(ctx, perk); },
    openFAQ: async () => { const m = await import('./faq.js'); m.mountFAQ(ctx); },
    signIn: async () => { const m = await import('./login.js'); m.mountLogin(root, ctx, start); },
  };
  const start = () => { root.innerHTML = ''; mountStage(root, ctx); };
  window.__songspot = ctx;                                   // for poking at it from the console

  // Sign in first, as the apps do — the profile, the picture and the stats live on the account.
  // Until Google sign-in is switched on for the domain, the door below the button lets you in without one.
  if (account.signedIn || settings.get('skipLogin', false)) start(); else ctx.signIn();
});
