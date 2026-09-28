// Stripe → premium. Verifies the signature, then writes (or takes back) the
// player's row in Supabase premium_grants with source 'stripe'. Monthly
// grants carry an expiry a few days past the paid period, so a missed
// webhook can never leave premium on for ever; lifetime grants carry none.
// A grant from another source (an App Store purchase, a gift) is never
// overwritten or removed from here.
import { stripeReady, send, stripe, db, readRaw, verifyStripe } from './_lib.js';

const GRACE = 3 * 86400;
const LIVE = new Set(['active', 'trialing', 'past_due']);

async function currentGrant(userId) {
  const rows = await db('GET', `premium_grants?user_id=eq.${userId}&select=user_id,source,note,expires_at`);
  return rows?.[0] || null;
}
async function grant(userId, { note, expires, ref }) {
  const now = await currentGrant(userId);
  if (now && now.source !== 'stripe') return;                    // already premium another way
  if (now && now.note === 'lifetime' && note !== 'lifetime') return;   // lifetime beats a subscription
  await db('POST', 'premium_grants', { user_id: userId, source: 'stripe', transaction_id: ref, note, expires_at: expires ? new Date(expires * 1000).toISOString() : null, at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
}
async function revoke(userId, which) {
  const now = await currentGrant(userId);
  if (!now || now.source !== 'stripe') return;
  if (which === 'monthly' && now.note === 'lifetime') return;
  await db('DELETE', `premium_grants?user_id=eq.${userId}&source=eq.stripe`, null, 'return=minimal');
}
const periodEnd = sub => sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? (Date.now() / 1000 + 31 * 86400);
async function userForCustomer(customer) {
  if (!customer) return null;
  const rows = await db('GET', `stripe_customers?customer_id=eq.${customer}&select=user_id`);
  return rows?.[0]?.user_id || null;
}
async function syncSubscription(sub) {
  // The customer link first: it follows a guest's purchase to the profile they made after paying.
  const userId = (await userForCustomer(sub.customer)) || sub.metadata?.user_id;
  if (!userId) return;
  await db('POST', 'stripe_customers', { user_id: userId, customer_id: sub.customer, subscription_id: sub.id, status: sub.status, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal').catch(() => {});
  if (LIVE.has(sub.status)) await grant(userId, { note: 'monthly', expires: periodEnd(sub) + GRACE, ref: sub.id });
  else await revoke(userId, 'monthly');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const raw = await readRaw(req);
  if (!verifyStripe(raw, req.headers['stripe-signature'], (process.env.STRIPE_WEBHOOK_SECRET || '').trim())) return send(res, 400, { error: 'bad signature' });
  if (!stripeReady()) return send(res, 503, { error: 'not configured' });
  let event; try { event = JSON.parse(raw.toString('utf8')); } catch (e) { return send(res, 400, { error: 'bad json' }); }
  const o = event.data?.object || {};
  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const userId = (await userForCustomer(o.customer)) || o.metadata?.user_id || o.client_reference_id;
        if (!userId) break;
        if (o.customer) await db('POST', 'stripe_customers', { user_id: userId, customer_id: o.customer, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal').catch(() => {});
        if (o.mode === 'payment' && o.payment_status === 'paid') await grant(userId, { note: 'lifetime', expires: null, ref: o.payment_intent || o.id });
        if (o.mode === 'subscription' && o.subscription) await syncSubscription(await stripe('GET', `subscriptions/${o.subscription}`));
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(o);
        break;
      case 'invoice.paid': {
        const subId = typeof o.subscription === 'string' ? o.subscription : o.parent?.subscription_details?.subscription;
        if (subId) await syncSubscription(await stripe('GET', `subscriptions/${subId}`));
        break;
      }
      case 'charge.refunded': {
        if (!o.refunded) break;                                    // only a full refund takes lifetime back
        const pi = o.payment_intent && await stripe('GET', `payment_intents/${o.payment_intent}`);
        const userId = (await userForCustomer(pi?.customer || o.customer)) || pi?.metadata?.user_id; if (userId && pi?.metadata?.plan === 'lifetime') await revoke(userId, 'lifetime');
        break;
      }
      default: break;
    }
  } catch (e) {
    console.error('webhook', event.type, e);
    return send(res, 500, { error: 'failed' });                    // Stripe retries
  }
  return send(res, 200, { received: true });
}
