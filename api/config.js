// What the premium sheet needs to know: is Stripe set up, and the prices to show.
import { stripeReady, send } from './_lib.js';
export default function handler(req, res) {
  send(res, 200, {
    stripe: stripeReady(),
    monthly: process.env.PREMIUM_LABEL_MONTHLY || '$4.99',
    lifetime: process.env.PREMIUM_LABEL_LIFETIME || '$14.99',
  });
}
