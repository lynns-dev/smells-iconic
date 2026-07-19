// Server-side Stripe client for the "or pay another way" methods (Cash App
// Pay, Klarna, Afterpay, Affirm). Unlike QuickBooks, Stripe's secret key
// doesn't expire or need refreshing — no token store required.

import Stripe from 'stripe';

let stripe;

export function getStripe() {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set.');
    stripe = new Stripe(key, { apiVersion: '2024-06-20' });
  }
  return stripe;
}
