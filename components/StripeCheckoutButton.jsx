import React from 'react';
import { paymentFetch } from '../lib/paymentFetch';
export default function StripeCheckoutButton({ getPayload, disabled, onError, onBusy }) {
  const [busy, setBusy] = React.useState(false);
  if (process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED !== 'true') return null;
  return <button id="stripe-checkout-button" type="button" disabled={disabled || busy} style={{ width: '100%', padding: 15, marginTop: 16, cursor: 'pointer' }} onClick={async () => {
    setBusy(true); onBusy?.(true);
    try { const response = await paymentFetch('/api/stripe/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getPayload()) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); const target = new URL(data.url); if (target.protocol !== 'https:' || target.hostname !== 'checkout.stripe.com') throw new Error('Invalid secure checkout address'); window.location.assign(target.href); }
    catch (e) { onError(e.message || 'Could not start secure checkout.'); setBusy(false); onBusy?.(false); }
  }}>{busy ? 'Opening secure checkout…' : 'Pay securely with Stripe'}</button>;
}
