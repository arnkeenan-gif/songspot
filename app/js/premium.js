// Premium as a full page (Premium.swift · PremiumSheet at iOS 1f2aa56), built
// to convert: the album wall behind the one headline ("Every song. No
// limits."), four ticked benefits, three plans with Yearly picked and its
// price a month at a time against twelve months of monthly, a Free-vs-Premium
// table of ticks and crosses, and one button that never scrolls away. Buying
// ends on your character jumping for joy ("YOU'RE IN").
// Every door (the crown, the ranked / host / artist / album / Songbot locks,
// the ad break, sign-in) opens this same page; nothing is singled out.
//
// On the web it is sold through Stripe Checkout (api/checkout.js); Restore
// re-reads this account's premium grant, Manage is Stripe's billing portal
// (api/portal.js). Until the owner's Stripe keys are in place (api/config.js
// says stripe: false, and locally there is no api at all) the footer says
// premium on the web is coming soon instead of failing. Stripe sends the
// player back with ?checkout=success, so the thank-you is opened from app.js
// (mountThankYou) once the grant is seen, not from this page.
//
// Not on the web (platform differences): the 25% gift (Gift.swift) and its
// one-time exit offer, which need a gift price and a switch-at-renewal in
// Stripe, the icon quick action, and StoreKit's renewal state.
//
// Localhost knobs: ?perk=<ads|ranked|host|artist|album|songbot> (the door; the
// page looks the same from every door), ?paywallTrial=1 (the trial layout
// without the api, as iOS -paywallTrial YES), ?paywallLive=1 (the real button
// as if Stripe were set up; pressing it fails locally), ?paywallBought=1 (the
// thank-you, as iOS -paywallBought).
import { pushView, popView, esc, TIER_COLOR, TIER_INK } from './ui.js';
import { I, sf } from './icons.js';
import { Funnel } from './funnel.js';
import { auth } from './supabase.js';
import { CoverWall } from './coverwall.js';
import { figureHTML } from './characters.js';

const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const knob = k => (local ? new URLSearchParams(location.search).get(k) : null);

const SF = {
  crown: sf('crown.fill') || I.crown,
  x: sf('xmark') || I.x,
  check: sf('checkmark') || I.check,
  lock: sf('lock.fill') || I.lock,
  yes: sf('checkmark.circle.fill'),
  no: sf('xmark.circle.fill'),
};

/** PremiumSheet.Perk: the doors, for the funnel. The page looks the same from every one. */
export const PERK_KEYS = ['ads', 'ranked', 'host', 'artist', 'album', 'songbot'];

/** PremiumSheet.benefits: four lines, a tick each — what premium is, read in three seconds. */
const BENEFITS = [
  ['No ad breaks', 'Round after round, straight through'],
  ['Unlimited ranked', 'Climb from Bronze to Legend'],
  ['Host parties for up to 50', 'One code, everyone hears the same clip'],
  ['One-artist and one-album modes', 'Every round from the music you pick'],
];

/** PremiumSheet.comparison: what changes, free against premium (true = a green tick, false = a red cross). */
const COMPARE = [
  ['No ad breaks', false, true],
  ['Ranked matches', false, true],
  ['Host a party', false, true],
  ['Join a party', true, true],
  ['One-artist mode', false, true],
  ['One-album mode', false, true],
  ['1v1 Songbot practice', false, true],
  ['Daily challenge', true, true],
];

let config = null;
export async function premiumConfig() {
  if (config) return config;
  try { const r = await fetch('/api/config', { cache: 'no-store' }); config = r.ok ? await r.json() : { stripe: false }; }
  catch (e) { config = { stripe: false }; }
  config.monthly = config.monthly || '$6.99'; config.lifetime = config.lifetime || '$49.99';
  // Not on sale yet (no api, or no Stripe keys): the page still shows the app's three
  // plans at the App Store prices, and the footer says it is coming soon.
  if (!config.stripe && !config.yearly) config.yearly = '$29.99';
  // Store.yearlyPerMonth: the yearly price twelfth by twelfth, in the same currency
  // ("$29.99" → "$2.50"); the api's own label only when the price can't be read.
  config.yearlyPerMonth = priceTimes(config.yearly, 1 / 12) || config.yearlyPerMonth || '$2.50';
  config.trialDays = config.stripe ? (Number(config.trialDays) || 0) : 0;
  if (knob('paywallTrial')) config.trialDays = 3;
  if (knob('paywallLive')) config.stripe = true;
  return config;
}

/**
 * A price label as a number and its dressing: "$29.99" → { pre: '$', post: '', n: 29.99, dec: '.', dp: 2 },
 * "29,99 kr." → { pre: '', post: ' kr.', n: 29.99, dec: ',', dp: 2 }. null when it isn't a price.
 */
function parsePrice(s) {
  const m = /^(\D*?)(\d[\d.,\s ]*)(\D*)$/.exec(String(s || '').trim()); if (!m) return null;
  const num = m[2].replace(/[\s ]/g, '');
  const sep = Math.max(num.lastIndexOf('.'), num.lastIndexOf(','));
  // The last separator is the decimal point only when one or two digits follow it ("1,299" is a thousand).
  const dp = sep >= 0 && num.length - sep - 1 <= 2 ? num.length - sep - 1 : 0;
  const n = Number(num.replace(/[.,]/g, '')) / 10 ** dp;
  return Number.isFinite(n) ? { pre: m[1], post: m[3], n, dec: dp ? num[sep] : '.', dp } : null;
}
/** The label's number times `k`, formatted like the label ("$6.99" × 12 → "$83.88"); null when it isn't a price. */
function priceTimes(label, k) {
  const p = parsePrice(label); if (!p) return null;
  const dp = p.dp || 2;
  return p.pre + (p.n * k).toFixed(dp).replace('.', p.dec) + p.post;
}

/** Store.yearlySaving: "Save 64%" from the two prices, only when it is 10% or more. */
function yearlySaving(cfg) {
  const y = parsePrice(cfg.yearly), m = parsePrice(cfg.monthly);
  if (!y || !m || !(y.n > 0) || !(m.n > 0)) return null;
  const pct = Math.floor((1 - y.n / (m.n * 12)) * 100);
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
 * door they pressed pay from, and the plan, are kept for the trip. app.js calls
 * checkoutReturned('bought' | 'cancelled'), which answers with the plan that was bought (or null).
 */
const DOOR = 'songspot.funnelDoor', PLAN = 'songspot.funnelPlan';
function rememberDoor(door, plan) { try { sessionStorage.setItem(DOOR, door); sessionStorage.setItem(PLAN, plan); } catch (e) {} }
export function checkoutReturned(outcome) {
  let door = null, plan = null;
  try { door = sessionStorage.getItem(DOOR); plan = sessionStorage.getItem(PLAN); sessionStorage.removeItem(DOOR); sessionStorage.removeItem(PLAN); } catch (e) {}
  if (door && (outcome === 'bought' || outcome === 'cancelled')) Funnel.log(outcome, door);
  return outcome === 'bought' ? plan : null;
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

/** Both pages share the page's colours: the level's accent, gold for the crown, red for a strike or a cross. */
function paint(node, tier) {
  node.style.setProperty('--accent', TIER_COLOR[tier]); node.style.setProperty('--accent-ink', TIER_INK[tier]);
  node.style.setProperty('--gold', TIER_COLOR.medium); node.style.setProperty('--gold-ink', TIER_INK.medium);
  node.style.setProperty('--yes', TIER_COLOR.easy); node.style.setProperty('--err', TIER_COLOR.expert);
}

const kicker = () => `<div class="pw-kicker">${SF.crown}<span>SONGSPOT PREMIUM</span></div>`;

/**
 * PremiumSheet.thankYou: your character jumping for joy on a pool of the accent, a crown, "YOU'RE IN",
 * and one button back to the game. `trial` = the free trial just started (the line says so).
 */
function thanksHTML(ctx, trial) {
  const { account } = ctx;
  const fig = figureHTML(account.faceIndex, 'win', { height: 250, variant: account.variant('win'), floor: TIER_COLOR[ctx.game?.difficulty || 'easy'], calm: true, clip: false });
  return `<div class="pw-col pw-tcol">
      <div class="pw-tfig">${fig}</div>
      ${kicker()}
      <h2 class="pw-in">YOU'RE IN</h2>
      <p class="pw-tline">${trial ? 'Your free trial is on. Every song, no limits.' : 'Every song. No limits. Enjoy.'}</p>
      <div class="pw-tspace"></div>
      <button class="pw-buy pw-play" data-act="play" data-press>Let's play</button>
    </div>`;
}

/**
 * The thank-you on its own, for the way back from Stripe (app.js, ?checkout=success once the grant
 * is seen). `opts.plan` is the plan that was bought, for the trial line. Returns { node, close }.
 */
export async function mountThankYou(ctx, opts = {}) {
  const cfg = await premiumConfig();
  const trial = opts.plan === 'yearly' && cfg.trialDays > 0;
  const node = document.createElement('div');
  node.className = 'view pw pw-thanks';
  node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-label', "You're in");
  paint(node, ctx.game?.difficulty || 'easy');
  node.innerHTML = thanksHTML(ctx, trial);
  let closed = false;
  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() { if (closed) return; closed = true; document.removeEventListener('keydown', onKey); popView(node); opts.onClose?.(); }
  document.addEventListener('keydown', onKey);
  node.addEventListener('click', e => { if (e.target.closest('[data-act="play"]')) { ctx.sound?.click?.(); close(); } });
  pushView(node);
  return { node, close };
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
  let plan = cfg.yearly ? 'yearly' : 'monthly', working = false, error = '', bought = false;
  /** Funnel.swift's door: entry ?? highlight ?? "crown". */
  const door = opts.entry || highlight || 'crown';
  const saving = yearlySaving(cfg) || 'Save 64%';
  /** Twelve months of monthly, the price the yearly plan is set against. */
  const twelveMonthly = priceTimes(cfg.monthly, 12) || '$83.88';

  /** Store.trialPeriod / trialLabel: on the web only the yearly plan carries the trial. */
  const trialPeriod = p => (p === 'yearly' && cfg.trialDays ? `${cfg.trialDays} ${cfg.trialDays === 1 ? 'day' : 'days'}` : null);
  const trialLabel = p => (p === 'yearly' && cfg.trialDays ? `${cfg.trialDays}-day free trial` : null);
  const trial = () => (plan === 'lifetime' ? null : trialPeriod(plan));
  const buttonTitle = () => {
    if (trial() && trialLabel(plan)) return `Start my ${trialLabel(plan)}`;
    return plan === 'yearly' ? `Continue — ${cfg.yearlyPerMonth}/mo` : plan === 'monthly' ? `Continue — ${cfg.monthly}/month` : `Unlock for good — ${cfg.lifetime}`;
  };

  const covers = ctx.pool ? CoverWall.covers(ctx.pool, { preset: 7 }) : [];
  const node = document.createElement('div');
  node.className = 'view pw';
  node.dataset.door = door;
  node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-label', 'Premium');
  paint(node, tier);

  const benefit = ([title, detail]) => `<div class="pw-benefit"><i class="pw-tick">${SF.check}</i><div><b>${esc(title)}</b><span>${esc(detail)}</span></div></div>`;
  const radio = '<i class="pw-radio"></i>';
  const price = (big, unit) => `<strong class="pw-price">${esc(big)}<small>${esc(unit)}</small></strong>`;
  /** The plan most people take, so it gets the room: the price a month big, the yearly bill and the saving small under it, the trial on top. */
  const yearlyCard = () => `<button class="pw-plan pw-yearly${plan === 'yearly' ? ' on' : ''}" data-plan="yearly" data-press aria-pressed="${plan === 'yearly'}" aria-label="Yearly, ${esc(cfg.yearlyPerMonth)} a month, ${esc(cfg.yearly)} billed yearly">
      ${radio}
      <div class="pw-pt"><b>Yearly</b><span class="pw-was"><s>${esc(twelveMonthly)}</s> ${esc(cfg.yearly)} billed yearly</span></div>
      <div class="pw-pr">${price(cfg.yearlyPerMonth, '/mo')}<em class="pw-save">${esc(saving.toUpperCase())}</em></div>
      <em class="pw-badge">${esc((trialLabel('yearly') || 'Most popular').toUpperCase())}</em>
    </button>`;
  const slimCard = (p, title, big, unit, note) => `<button class="pw-plan${plan === p ? ' on' : ''}" data-plan="${p}" data-press aria-pressed="${plan === p}" aria-label="${esc(title)}, ${esc(big + unit)}">
      ${radio}
      <div class="pw-pt"><b>${esc(title)}</b><span>${esc(note)}</span></div>
      ${price(big, unit)}
    </button>`;
  const compareRow = ([name, free, prem]) => `<div class="pw-tr"><span>${esc(name)}</span><i class="${free ? 'yes' : 'no'}">${free ? SF.yes : SF.no}</i><i class="${prem ? 'yes' : 'no'}">${prem ? SF.yes : SF.no}</i></div>`;

  node.innerHTML = `
    ${covers.length ? `<div class="pw-wall">${CoverWall.html(covers, 0.55)}</div>` : ''}
    <div class="pw-scroll"><div class="pw-col pw-content">
      <div class="pw-hero pw-r" style="--step:0">
        ${kicker()}
        <h1 class="pw-head">Every song.<br><em>No limits.</em></h1>
      </div>
      <div class="pw-benefits pw-r" style="--step:2">${BENEFITS.map(benefit).join('')}</div>
      <div class="pw-plans pw-r" style="--step:3">
        ${cfg.yearly ? yearlyCard() : ''}
        ${slimCard('monthly', 'Monthly', cfg.monthly, '/mo', trialLabel('monthly') || 'Cancel any time')}
        ${slimCard('lifetime', 'Lifetime', cfg.lifetime, ' once', 'Pay once, keep it for good')}
      </div>
      <div class="pw-table pw-r" style="--step:4">
        <div class="pw-th"><span>WHAT CHANGES</span><b>FREE</b><b class="on">PREMIUM</b></div>
        ${COMPARE.map(compareRow).join('')}
      </div>
    </div></div>
    <div class="pw-fade"></div>
    <div class="pw-top"><div class="pw-col"><button class="pw-x" data-act="close" data-press aria-label="Close"><span>${SF.x}</span></button></div></div>
    <div class="pw-foot"><div class="pw-col pw-footin"></div></div>`;
  const foot = node.querySelector('.pw-footin');

  const paintFoot = () => {
    const has = ctx.premium, guest = !account.signedIn;
    let button;
    if (has) button = `<button class="pw-buy" data-act="manage" data-press>You're premium — manage</button>`;
    else if (!cfg.stripe) button = `<button class="pw-buy" disabled>Premium on the web is coming soon</button>`;
    else button = `<button class="pw-buy" data-act="buy" data-press ${working ? 'disabled' : ''}>${working ? 'One moment…' : guest ? 'Sign in to go premium' : esc(buttonTitle())}</button>`;
    // Under the button: where the money goes (iOS: "Secured by the App Store"), or, until Stripe is
    // set up, the way to the iPhone app.
    const note = has ? '' : !cfg.stripe
      ? `<a class="pw-note pw-ios" href="https://songspotapp.com/get" target="_blank" rel="noopener">Get it now in the <b>iPhone app</b></a>`
      : `<p class="pw-secure">${SF.lock}<span>Secured by Stripe · Cancel any time</span></p>`;
    foot.innerHTML = `
      ${error ? `<p class="pw-err">${esc(error)}</p>` : ''}
      ${button}
      ${note}
      <div class="pw-legal">${has ? '' : `<button data-act="restore" data-press>Restore</button>`}<a href="/support" target="_blank" rel="noopener" data-press>Terms</a><a href="/privacy" target="_blank" rel="noopener" data-press>Privacy</a></div>`;
  };
  paintFoot();

  /** Bought: the thank-you takes the page over (the footer and the way out go with it). */
  const showThanks = () => {
    bought = true;
    node.classList.add('bought');
    const t = document.createElement('div');
    t.className = 'pw-thanks pw-over';
    t.innerHTML = thanksHTML(ctx, !!trial());
    node.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
  };

  let closed = false, showX = 0;
  const onKey = e => { if (e.key === 'Escape') close(); };
  const off = account.onChange(() => { if (!closed && !bought) paintFoot(); });
  function close() {
    if (closed) return; closed = true;
    // TODO(web): iOS leaves through the one-time 25%-off gift (GiftSheet, reason .paywall: once ever, a
    // ten-minute clock) when nothing was bought. It needs a Stripe price for the gift plan, which
    // doesn't exist yet; until then the page just closes.
    document.removeEventListener('keydown', onKey);
    clearTimeout(showX);
    if (typeof off === 'function') off();
    popView(node);
    opts.onClose?.();
  }
  document.addEventListener('keydown', onKey);
  pushView(node);
  Funnel.log('sheet', door);
  // The page's parts settle in one after another on the first frame (reveal: 0.45 s, a beat later each step).
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('shown')));
  // The way out fades in a beat after the page, so the headline is read first.
  showX = setTimeout(() => node.classList.add('x-on'), 1400);
  if (knob('paywallBought')) showThanks();

  node.addEventListener('click', async e => {
    const t = e.target.closest('[data-plan], [data-act]'); if (!t) return;
    sound?.click?.();
    if (t.dataset.plan) {
      if (plan === t.dataset.plan) return;
      plan = t.dataset.plan;
      // In place, so the radio and the border ease over (easeOut 0.18 s).
      node.querySelectorAll('.pw-plan').forEach(b => { const on = b.dataset.plan === plan; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      return paintFoot();
    }
    const act = t.dataset.act;
    if (act === 'close' || act === 'play') return close();
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
      rememberDoor(door, plan);
      const msg = await startCheckout(ctx, plan);
      if (msg) { working = false; error = msg; paintFoot(); Funnel.log('failed', door); }
    }
  });
  return { node, body: node, close };
}
