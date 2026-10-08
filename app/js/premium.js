// Premium as a full page (Premium.swift · PremiumSheet): the album wall behind
// "Every song. No limits.", the five perks, the three plans with Yearly picked,
// how the free trial runs, and one button in a footer that never scrolls away.
// Every door (the crown, the ranked / host / artist / album / Songbot locks,
// the ad break, sign-in) opens this same page; nothing is singled out.
//
// On the web it is sold through Stripe Checkout (api/checkout.js); Restore
// re-reads this account's premium grant, Manage is Stripe's billing portal
// (api/portal.js). Until the owner's Stripe keys are in place (api/config.js
// says stripe: false, and locally there is no api at all) the footer says
// premium on the web is coming soon instead of failing.
//
// Not on the web (platform differences): the 25% gift (Gift.swift), which
// needs a $22.49 gift price and a switch-at-renewal in Stripe, the icon quick
// action, and StoreKit's renewal state (willCancel / lapsed / onGift).
//
// Localhost knobs: ?perk=<ads|ranked|host|artist|album|songbot> (the door; the
// page looks the same from every door), ?paywallTrial=1 (the trial layout
// without the api, as iOS -paywallTrial YES).
import { pushView, popView, esc, TIER_COLOR, TIER_INK } from './ui.js';
import { I, sf } from './icons.js';
import { Funnel } from './funnel.js';
import { auth } from './supabase.js';
import { CoverWall } from './coverwall.js';

const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const knob = k => (local ? new URLSearchParams(location.search).get(k) : null);

// SF Symbols the page needs that icons.js doesn't have, on the same 24-box.
const f = d => `<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`;
const SF = {
  // speaker.slash.fill
  speakerSlash: f('<path d="M3.5 9.2h3.8l5.2-4.4c.6-.5 1.5-.1 1.5.7v13c0 .8-.9 1.2-1.5.7l-5.2-4.4H3.5a1 1 0 0 1-1-1v-3.6a1 1 0 0 1 1-1z"/><path d="M4 4l16 16" fill="none" stroke="var(--pw-tile)" stroke-width="5" stroke-linecap="round"/><path d="M4 4l16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  // music.mic
  micOwn: f('<circle cx="15.4" cy="8.6" r="5.6"/><path d="M11.6 12.4L4.6 19.4" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>'),
  // opticaldisc.fill
  discOwn: f('<path fill-rule="evenodd" d="M12 2.6a9.4 9.4 0 1 1 0 18.8 9.4 9.4 0 0 1 0-18.8zm0 7a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z"/><path d="M6.6 12A5.4 5.4 0 0 1 12 6.6M17.4 12a5.4 5.4 0 0 1-5.4 5.4" fill="none" stroke="var(--pw-tile)" stroke-width="1.4" stroke-linecap="round"/>'),
  // lock.open.fill
  lockOpenOwn: f('<path d="M5.5 10.6h11.2a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-7.2a2 2 0 0 1 2-2z"/><path d="M13.6 10.6V6.9a4 4 0 0 1 8 0v1.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
};
SF.mic = sf('music.mic') || SF.micOwn;
SF.disc = sf('opticaldisc.fill') || SF.discOwn;
SF.lockOpen = sf('lock.open.fill') || SF.lockOpenOwn;
SF.crown = sf('crown.fill') || I.crown;
SF.trophy = sf('trophy.fill') || I.trophy;
SF.bolt = sf('bolt.fill') || I.bolt;
SF.x = sf('xmark') || I.x;

/** PremiumSheet.Perk: the doors, in the page's one fixed order (songbot is a door but not a row). */
export const PERKS = [
  { key: 'ads', icon: SF.speakerSlash, title: 'No ad breaks', detail: 'Round after round, straight through' },
  { key: 'ranked', icon: SF.trophy, title: 'Unlimited ranked', detail: 'Bronze to Legend, a new season monthly' },
  { key: 'host', icon: I.people, title: 'Host parties for up to 50', detail: 'One code, everyone hears the same clip' },
  { key: 'artist', icon: SF.mic, title: 'One-artist mode', detail: 'Every round from the artist you pick' },
  { key: 'album', icon: SF.disc, title: 'One-album mode', detail: 'Every round from the album you pick' },
  { key: 'songbot', icon: SF.bolt, title: 'Practice 1v1s against Songbot', detail: 'A practice 1v1 whenever you like', hidden: true },
];
export const PERK_KEYS = PERKS.map(p => p.key);

let config = null;
export async function premiumConfig() {
  if (config) return config;
  try { const r = await fetch('/api/config', { cache: 'no-store' }); config = r.ok ? await r.json() : { stripe: false }; }
  catch (e) { config = { stripe: false }; }
  config.monthly = config.monthly || '$6.99'; config.lifetime = config.lifetime || '$49.99';
  // Not on sale yet (no api, or no Stripe keys): the page still shows the app's three
  // plans at the App Store prices, and the footer says it is coming soon.
  if (!config.stripe && !config.yearly) config.yearly = '$29.99';
  config.yearlyPerMonth = config.yearlyPerMonth || '$2.50';
  config.trialDays = config.stripe ? (Number(config.trialDays) || 0) : 0;
  if (knob('paywallTrial')) config.trialDays = 3;
  return config;
}

/** Store.yearlySaving: "Save 64%" from the two prices, only when it is 10% or more. */
function yearlySaving(cfg) {
  const n = s => parseFloat(String(s || '').replace(/[^0-9.,]/g, '').replace(',', '.'));
  const y = n(cfg.yearly), m = n(cfg.monthly);
  if (!(y > 0) || !(m > 0)) return null;
  const pct = Math.floor((1 - y / (m * 12)) * 100);
  return pct >= 10 ? `Save ${pct}%` : null;
}

/**
 * Where a signed-out player was going when they were sent to sign in: { kind: 'open', perk } (they
 * pressed Premium) or { kind: 'buy', plan } (they pressed pay). app.js carries on once they're back.
 */
export const PENDING = 'songspot.pendingBuy';
export function rememberPending(v) { try { sessionStorage.setItem(PENDING, JSON.stringify({ ...v, at: Date.now() })); } catch (e) {} }
export function takePending() {
  try { const p = JSON.parse(sessionStorage.getItem(PENDING) || 'null'); sessionStorage.removeItem(PENDING); return p && Date.now() - p.at < 15 * 60e3 ? p : null; } catch (e) { return null; }
}

/**
 * The funnel's outcome comes back with the player from Stripe (?checkout=success|cancel), so the
 * door they pressed pay from is kept for the trip. app.js calls checkoutReturned('bought' | 'cancelled').
 */
const DOOR = 'songspot.funnelDoor';
function rememberDoor(door) { try { sessionStorage.setItem(DOOR, door); } catch (e) {} }
export function checkoutReturned(outcome) {
  let door = null;
  try { door = sessionStorage.getItem(DOOR); sessionStorage.removeItem(DOOR); } catch (e) {}
  if (door && (outcome === 'bought' || outcome === 'cancelled')) Funnel.log(outcome, door);
}

/** Straight to Stripe, for a signed-in player. Resolves with an error message if it could not start. */
export async function startCheckout(ctx, plan) {
  if (!ctx.account.signedIn) { rememberPending({ kind: 'buy', plan }); ctx.signIn(); return null; }
  try {
    const token = await auth.token();
    const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ plan, return: location.origin + '/' }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 503) return 'Premium on the web is coming soon.';
    if (r.status === 401 || r.status === 403) { rememberPending({ kind: 'buy', plan }); ctx.signIn(); return null; }
    if (!r.ok || !d.url) throw new Error(d.error || 'checkout');
    location.href = d.url;
    return null;
  } catch (err) { return "Couldn't start the payment. Check your connection and try again."; }
}

/**
 * Stripe's billing portal: Manage on the web (a subscriber cancels or changes their card).
 * Resolves with an error message when it could not open, after a toast saying so.
 */
export async function openPortal(ctx) {
  try {
    const token = await auth.token();
    const r = await fetch('/api/portal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ return: location.origin + '/' }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) throw new Error(d.error || 'portal');
    location.href = d.url;
    return null;
  } catch (err) {
    return ctx.account.premium ? 'This premium was not bought on the web — manage it where you bought it.' : "Couldn't open billing right now.";
  }
}

/**
 * The page. `highlight` is the perk whose lock opened it (null = the crown);
 * `opts.entry` names a door that isn't a perk ("login": straight after signing in);
 * `opts.onClose` runs once it has closed. Returns { node, close }.
 */
export async function mountPremium(ctx, highlight = null, opts = {}) {
  const { account, sound } = ctx;
  if (!highlight && PERK_KEYS.includes(knob('perk'))) highlight = knob('perk');
  const tier = ctx.game?.difficulty || 'easy';
  const cfg = await premiumConfig();
  // Yearly is the default: it carries the free trial and the best price a month.
  let plan = cfg.yearly ? 'yearly' : 'monthly', working = false, error = '';
  /** Funnel.swift's door: entry ?? highlight ?? "crown". */
  const door = opts.entry || highlight || 'crown';
  const saving = yearlySaving(cfg);

  const label = p => (p === 'yearly' ? cfg.yearly : p === 'monthly' ? cfg.monthly : cfg.lifetime);
  /** Store.trialPeriod / trialLabel: on the web only the yearly plan carries the trial. */
  const trialPeriod = p => (p === 'yearly' && cfg.trialDays ? `${cfg.trialDays} ${cfg.trialDays === 1 ? 'day' : 'days'}` : null);
  const trialLabel = p => (p === 'yearly' && cfg.trialDays ? `${cfg.trialDays}-day free trial` : null);
  const trial = () => (plan === 'lifetime' ? null : trialPeriod(plan));
  const buttonTitle = () => {
    if (trial() && trialLabel(plan)) return `Start my ${trialLabel(plan)}`;
    return plan === 'yearly' ? `Continue — ${cfg.yearly}/year` : plan === 'monthly' ? `Continue — ${cfg.monthly}/month` : `Unlock for good — ${cfg.lifetime}`;
  };
  /** The deal in a few words under the button, read before the tap. */
  const buttonNote = () => {
    if (plan === 'lifetime') return 'One payment. No subscription.';
    const price = `${label(plan)}/${plan === 'yearly' ? 'year' : 'month'}`;
    return trial() ? `${trial()} free, then ${price}. Cancel any time.` : `${price}. Cancel any time.`;
  };

  const covers = ctx.pool ? CoverWall.covers(ctx.pool, { preset: 7 }) : [];
  const node = document.createElement('div');
  node.className = 'view pw';
  node.dataset.door = door;
  node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-label', 'Premium');
  node.style.setProperty('--accent', TIER_COLOR[tier]); node.style.setProperty('--accent-ink', TIER_INK[tier]);
  node.style.setProperty('--gold', TIER_COLOR.medium); node.style.setProperty('--err', TIER_COLOR.expert);
  const perkRow = p => `<div class="pw-perk"><i class="pw-tile">${p.icon}</i><div><b>${esc(p.title)}</b><span>${esc(p.detail)}</span></div></div>`;
  const planCard = (p, title, price, note, badge, save = null) => `<button class="pw-plan${plan === p ? ' on' : ''}" data-plan="${p}" data-press aria-pressed="${plan === p}">
      <i class="pw-radio"></i>
      <div class="pw-pt"><div class="pw-ptl"><b>${title}</b>${save ? `<em class="pw-save">${esc(save.toUpperCase())}</em>` : ''}</div><span>${esc(note)}</span></div>
      <strong>${esc(price)}</strong>
      ${badge ? `<em class="pw-badge">${esc(badge.toUpperCase())}</em>` : ''}
    </button>`;
  const step = (icon, title, text, last) => `<div class="pw-step${last ? ' last' : ''}"><div class="pw-rail"><i>${icon}</i>${last ? '' : '<u></u>'}</div><div class="pw-st"><b>${esc(title)}</b><span>${esc(text)}</span></div></div>`;
  node.innerHTML = `
    ${covers.length ? `<div class="pw-wall">${CoverWall.html(covers, 0.5)}</div>` : ''}
    <div class="pw-scroll"><div class="pw-col pw-content">
      <div class="pw-kicker">${SF.crown}<span>SONGSPOT PREMIUM</span></div>
      <h1 class="pw-head">Every song.<br><em>No limits.</em></h1>
      <div class="pw-perks">${PERKS.filter(p => !p.hidden).map(perkRow).join('')}</div>
      <div class="pw-plans">
        ${cfg.yearly ? planCard('yearly', 'Yearly', cfg.yearly + '/yr', trialLabel('yearly') ? `Then ${cfg.yearlyPerMonth}/mo, billed yearly` : `${cfg.yearlyPerMonth}/mo, billed yearly`, trialLabel('yearly') || 'Best value', saving) : ''}
        ${planCard('monthly', 'Monthly', cfg.monthly + '/mo', trialLabel('monthly') || 'Cancel any time', null)}
        ${planCard('lifetime', 'Lifetime', cfg.lifetime, 'Pay once, keep it for good', null)}
      </div>
      <div class="pw-timewrap"></div>
    </div></div>
    <div class="pw-fade"></div>
    <div class="pw-top"><div class="pw-col"><button class="pw-x" data-act="close" data-press aria-label="Close"><span>${SF.x}</span></button></div></div>
    <div class="pw-foot"><div class="pw-col pw-footin"></div></div>`;
  const timeWrap = node.querySelector('.pw-timewrap'), foot = node.querySelector('.pw-footin');

  /** How the free trial runs, so nobody wonders when they'll be charged. */
  const paintTimeline = () => {
    const t = trial();
    timeWrap.innerHTML = t ? `<div class="pw-time">
        ${step(SF.lockOpen, 'Today', 'Full premium unlocks straight away, nothing to pay.', false)}
        ${step(SF.crown, `After ${t}`, plan === 'yearly' ? `Premium carries on for ${label(plan)}/year, just ${cfg.yearlyPerMonth} a month. Cancel any time.` : `Premium carries on for ${label(plan)}/month. Cancel any time.`, true)}
      </div>` : '';
  };
  const paintFoot = () => {
    const has = ctx.premium, guest = !account.signedIn;
    let button;
    if (has) button = `<button class="pw-buy" data-act="manage" data-press>You're premium — manage</button>`;
    else if (!cfg.stripe) button = `<button class="pw-buy" disabled>Premium on the web is coming soon</button>`;
    else button = `<button class="pw-buy" data-act="buy" data-press ${working ? 'disabled' : ''}>${working ? 'One moment…' : guest ? 'Sign in to go premium' : esc(buttonTitle())}</button>`;
    const note = has ? '' : !cfg.stripe
      ? `<a class="pw-note pw-ios" href="https://songspotapp.com/get" target="_blank" rel="noopener">Get it now in the <b>iPhone app</b></a>`
      : `<p class="pw-note">${esc(buttonNote())}</p>`;
    foot.innerHTML = `
      ${error ? `<p class="pw-err">${esc(error)}</p>` : ''}
      ${button}
      ${note}
      <div class="pw-legal">${has ? '' : `<button data-act="restore" data-press>Restore</button>`}<a href="/support" target="_blank" rel="noopener" data-press>Terms</a><a href="/privacy" target="_blank" rel="noopener" data-press>Privacy</a></div>`;
  };
  paintTimeline(); paintFoot();

  let closed = false, showX = 0;
  const onKey = e => { if (e.key === 'Escape') close(); };
  const off = account.onChange(() => { if (!closed) paintFoot(); });
  function close() {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey);
    clearTimeout(showX);
    if (typeof off === 'function') off();
    popView(node);
    opts.onClose?.();
  }
  document.addEventListener('keydown', onKey);
  pushView(node);
  Funnel.log('sheet', door);
  // The way out fades in a beat after the page, so the headline is read first.
  showX = setTimeout(() => node.classList.add('x-on'), 1200);

  node.addEventListener('click', async e => {
    const t = e.target.closest('[data-plan], [data-act]'); if (!t) return;
    sound?.click?.();
    if (t.dataset.plan) {
      if (plan === t.dataset.plan) return;
      plan = t.dataset.plan;
      // In place, so the radio and the border ease over (easeOut 0.18 s).
      node.querySelectorAll('.pw-plan').forEach(b => { const on = b.dataset.plan === plan; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      paintTimeline();
      return paintFoot();
    }
    const act = t.dataset.act;
    if (act === 'close') return close();
    if (act === 'restore') {
      // Restore on the web: read this account's premium grant again (Stripe, App Store or given by hand).
      if (!account.signedIn) { close(); return ctx.signIn(); }
      error = ''; t.disabled = true; t.textContent = 'Restoring…';
      const has = await account.refreshPremium();
      ctx.refresh?.();
      if (has) { ctx.toast?.('Premium restored.'); return close(); }
      error = 'No premium was found for this account.'; return paintFoot();
    }
    if (act === 'manage') { const msg = await openPortal(ctx); if (msg) { error = msg; paintFoot(); } return; }
    if (act === 'buy' && !working) {
      // Premium belongs to a profile: signed out, sign in first, then straight on to Stripe.
      if (!account.signedIn) { close(); rememberPending({ kind: 'buy', plan }); return ctx.signIn(); }
      working = true; error = ''; paintFoot();
      Funnel.log('tap', `${door}/${plan}`);
      rememberDoor(door);
      const msg = await startCheckout(ctx, plan);
      if (msg) { working = false; error = msg; paintFoot(); Funnel.log('failed', door); }
    }
  });
  return { node, body: node, close };
}
