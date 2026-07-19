// Loads Stripe.js once and caches the promise, mirroring the lazy-load
// pattern used for the PayPal SDK (lib/paypalSdk.js).

import { loadStripe } from '@stripe/stripe-js';

let stripePromise;

export function getStripeClient() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}
