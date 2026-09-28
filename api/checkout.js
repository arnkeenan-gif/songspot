// POST /api/checkout { plan: 'monthly' | 'lifetime' } with the player's
// Supabase access token → a Stripe Checkout Session URL. Monthly is a
// subscription, lifetime a one-off payment; both carry the Supabase user id
// so the webhook knows whose premium to switch on.
import { stripeReady, prices, send, userFrom, stripe, db, readJSON, safeReturn } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!stripeReady()) return send(res, 503, { error: 'Premium on the web is coming soon.' });
  const user = await userFrom(req);
  if (!user) return send(res, 401, { error: 'Sign in first.' });
  // Premium belongs to a real account: a guest (anonymous) one is lost with the browser's storage.
  if (user.is_anonymous) return send(res, 403, { error: 'Sign in to buy premium.' });
  const body = await readJSON(req);
  const plan = body.plan === 'lifetime' ? 'lifetime' : 'monthly';
  const back = safeReturn(req, body.return);
  try {
    // One Stripe customer per player, remembered so the billing portal can find it.
    const rows = await db('GET', `stripe_customers?user_id=eq.${user.id}&select=customer_id`);
    let customer = rows?.[0]?.customer_id;
    if (!customer) {
      const c = await stripe('POST', 'customers', { email: user.email || undefined, metadata: { supabase_user_id: user.id } });
      customer = c.id;
      await db('POST', 'stripe_customers', { user_id: user.id, customer_id: customer }, 'resolution=merge-duplicates');
    }
    const common = {
      customer, client_reference_id: user.id, allow_promotion_codes: 'true',
      line_items: [{ price: prices()[plan], quantity: 1 }],
      metadata: { user_id: user.id, plan },
      success_url: `${back}?checkout=success`, cancel_url: `${back}?checkout=cancel`,
    };
    const session = await stripe('POST', 'checkout/sessions', plan === 'monthly'
      ? { ...common, mode: 'subscription', subscription_data: { metadata: { user_id: user.id, plan } } }
      : { ...common, mode: 'payment', payment_intent_data: { metadata: { user_id: user.id, plan } } });
    return send(res, 200, { url: session.url });
  } catch (e) {
    console.error('checkout', e);
    return send(res, 500, { error: 'Could not start checkout.' });
  }
}
