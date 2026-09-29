// What the premium sheet needs to know: is Stripe set up, and the prices to show.
import { stripeReady, send } from './_lib.js';
export default function handler(req, res) {
  send(res, 200, {
    stripe: stripeReady(),
    monthly: process.env.PREMIUM_LABEL_MONTHLY || '$6.99',
    yearly: process.env.STRIPE_PRICE_YEARLY ? (process.env.PREMIUM_LABEL_YEARLY || '$29.99') : null,
    yearlyPerMonth: process.env.PREMIUM_LABEL_YEARLY_MONTH || '$2.50',
    trialDays: Number(process.env.PREMIUM_TRIAL_DAYS || 3),
    lifetime: process.env.PREMIUM_LABEL_LIFETIME || '$49.99',
  });
}
