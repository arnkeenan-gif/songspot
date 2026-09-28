// Everything premium is, on one sheet (Premium.swift): the price as the one
// big figure, Monthly or Lifetime, the four things it buys as a ledger, and
// the button — with the row that brought you here lit. On the web it is sold
// through Stripe Checkout; until the owner's Stripe keys are in place the
// sheet says premium is coming soon instead of failing.
import { openSheet, esc, TIER_COLOR, TIER_INK, toast } from './ui.js';
import { I } from './icons.js';
import { auth } from './supabase.js';

export const PERKS = [
  { key: 'ads', icon: I.mute, title: 'No ad breaks', detail: 'Free play stops for a short ad after every five rounds. Premium never does, and hears 20 seconds on the last stage instead of 15.' },
  { key: 'ranked', icon: I.trophy, title: 'Ranked', detail: 'Five-round matches, a ladder from Bronze to Legend, and a new season every month. Your first match is free.' },
  { key: 'host', icon: I.people, title: 'Host parties', detail: 'Your own room code for up to fifty phones. Joining stays free for everyone.' },
  { key: 'artist', icon: I.mic, title: 'One-artist mode', detail: "Play only one artist's songs — on your own, or for the whole party you host." },
];

let config = null;
export async function premiumConfig() {
  if (config) return config;
  try { const r = await fetch('/api/config', { cache: 'no-store' }); config = r.ok ? await r.json() : { stripe: false }; }
  catch (e) { config = { stripe: false }; }
  config.monthly = config.monthly || '$4.99'; config.lifetime = config.lifetime || '$14.99';
  return config;
}

/** Set when a guest presses Go premium: sign in first, then come back to the plan they chose. */
export const PENDING = 'songspot.pendingBuy';

export async function mountPremium(ctx, highlight = null) {
  const { account, sound } = ctx;
  const tier = ctx.game.difficulty, accent = TIER_COLOR[tier], ink = TIER_INK[tier];
  const cfg = await premiumConfig();
  let plan = 'monthly', working = false, error = '';
  // Back from signing in to buy: the plan they had chosen is still chosen.
  try { const p = JSON.parse(sessionStorage.getItem(PENDING) || 'null'); sessionStorage.removeItem(PENDING); if (p && Date.now() - p.at < 15 * 60e3 && (p.plan === 'monthly' || p.plan === 'lifetime')) plan = p.plan; } catch (e) {}
  let off = null;
  const sh = openSheet('', { cls: 'premium tall', label: 'Premium', onClose: () => off && off() });
  sh.node.style.setProperty('--accent', accent); sh.node.style.setProperty('--accent-ink', ink);
  const b = sh.body;
  const price = () => (plan === 'monthly' ? cfg.monthly : cfg.lifetime);
  const paint = () => {
    const has = ctx.premium;
    const guest = !account.signedIn;
    b.innerHTML = `<div class="pm">
      <div class="grab"></div>
      <div class="pk">${I.crown}<span>PREMIUM</span></div>
      <div class="pprice">${price()}</div>
      <div class="ponce">${plan === 'monthly' ? 'A month at a time. Cancel any time.' : 'Once. Nothing renews, nothing to cancel.'}</div>
      <div class="plans">
        ${card('monthly', 'Monthly', cfg.monthly + '/mo', 'cancel any time', 'Most popular')}
        ${card('lifetime', 'Lifetime', cfg.lifetime, 'pay once', null)}
      </div>
      <div class="ledger card"><p>WHAT YOU GET</p>${PERKS.map(p => `<div class="perk ${p.key === highlight ? 'lit' : ''}"><i>${p.icon}</i><div><b>${esc(p.title)}</b><span>${esc(p.detail)}</span></div></div>`).join('')}</div>
      <div class="pfill"></div>
      ${error ? `<p class="perr">${esc(error)}</p>` : ''}
      ${has ? `<button class="btn primary" data-act="manage" data-press>You're premium — manage</button>`
        : cfg.stripe ? `<button class="btn primary" data-act="buy" data-press ${working ? 'disabled' : ''}>${working ? 'One moment…' : guest ? 'Sign in to go premium' : plan === 'monthly' ? `Go premium — ${cfg.monthly}/month` : `Go premium — ${cfg.lifetime} once`}</button>`
        : `<button class="btn primary" disabled>Premium on the web is coming soon</button><a class="pios" href="https://songspotapp.com/get" target="_blank" rel="noopener">Get it now in the <b>iPhone app</b></a>`}
      ${!has && cfg.stripe && guest ? `<p class="pguest">Premium belongs to your account, so you have it on every device. Sign in first, then pay.</p>` : ''}
      ${has ? '' : `<button class="prestore" data-act="restore" data-press>Restore purchases</button>`}
      ${plan === 'monthly' && !has && cfg.stripe ? `<p class="prenew">Renews at ${cfg.monthly}/month until cancelled. Payments by Stripe.</p>` : ''}
      <div class="plinks"><a href="/support" target="_blank">Terms</a><a href="/privacy" target="_blank">Privacy</a></div>
    </div>`;
  };
  const card = (p, title, pr, note, badge) => `<button class="plan ${plan === p ? 'on' : ''}" data-plan="${p}" data-press><b>${title}</b><strong>${pr}</strong><span>${note}</span>${badge ? `<em>${badge.toUpperCase()}</em>` : ''}</button>`;
  paint();
  off = account.onChange(() => paint());
  b.addEventListener('click', async e => {
    const t = e.target.closest('[data-plan], [data-act]'); if (!t) return;
    sound.click();
    if (t.dataset.plan) { plan = t.dataset.plan; return paint(); }
    const act = t.dataset.act;
    if (act === 'signin') { sh.close(); return ctx.signIn(); }
    if (act === 'restore') {
      if (!account.signedIn) { toast('Sign in with the account you bought premium on.'); sh.close(); return ctx.signIn(); }
      const has = await account.refreshPremium(); toast(has ? 'Premium restored.' : 'No premium was found for this account.'); ctx.refresh(); return paint();
    }
    if (act === 'manage') return openPortal();
    if (act === 'buy' && !working) {
      // Premium must belong to a real account, never a guest one that a cleared browser loses.
      if (!account.signedIn) {
        try { sessionStorage.setItem(PENDING, JSON.stringify({ plan, at: Date.now() })); } catch (e) {}
        sh.close(); return ctx.signIn();
      }
      working = true; error = ''; paint();
      try {
        const token = await auth.token();
        const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ plan, return: location.origin + '/' }) });
        const d = await r.json().catch(() => ({}));
        if (r.status === 503) { config = { ...cfg, stripe: false }; cfg.stripe = false; working = false; return paint(); }
        if (r.status === 401 || r.status === 403) { working = false; paint(); try { sessionStorage.setItem(PENDING, JSON.stringify({ plan, at: Date.now() })); } catch (e) {} sh.close(); return ctx.signIn(); }
        if (!r.ok || !d.url) throw new Error(d.error || 'checkout');
        location.href = d.url;
      } catch (err) { working = false; error = "Couldn't start the payment. Check your connection and try again."; paint(); }
    }
  });
  async function openPortal() {
    try {
      const token = await auth.token();
      const r = await fetch('/api/portal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ return: location.origin + '/' }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(d.error || 'portal');
      location.href = d.url;
    } catch (err) { toast(account.premium ? 'This premium was not bought on the web — manage it where you bought it.' : "Couldn't open billing right now."); }
  }
  return sh;
}
