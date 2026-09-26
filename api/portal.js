// POST /api/portal with the player's Supabase access token → a Stripe billing
// portal URL, where a monthly subscriber cancels or changes their card.
import { stripeReady, send, userFrom, stripe, db, readJSON, safeReturn } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!stripeReady()) return send(res, 503, { error: 'Billing is not set up yet.' });
  const user = await userFrom(req);
  if (!user) return send(res, 401, { error: 'Sign in first.' });
  const body = await readJSON(req);
  try {
    const rows = await db('GET', `stripe_customers?user_id=eq.${user.id}&select=customer_id`);
    const customer = rows?.[0]?.customer_id;
    if (!customer) return send(res, 404, { error: 'No purchases on the web for this account.' });
    const s = await stripe('POST', 'billing_portal/sessions', { customer, return_url: safeReturn(req, body.return) });
    return send(res, 200, { url: s.url });
  } catch (e) {
    console.error('portal', e);
    return send(res, 500, { error: 'Could not open billing.' });
  }
}
