// Creates a Stripe PaymentIntent scoped to a single non-card method (Cash
// App Pay, Klarna, Afterpay, Affirm) for the "or pay another way" radio
// group on /checkout. The client confirms it directly with Stripe.js
// (lib/stripeClient.js) — order fulfillment happens later, from
// pages/api/stripe-webhook.js, once Stripe reports the charge actually
// succeeded (these are redirect-based methods; the customer may abandon
// the authorization step on the provider's own site).

import { getStripe } from '../../lib/stripeServer';
import { getAltPaymentMethod } from '../../lib/altPaymentMethods';

// Stripe metadata values are capped at 500 chars — trim to id+quantity if
// the full item list (name/price included) doesn't fit, rather than fail
// the whole checkout over a metadata limit.
function compactItemsForMetadata(items) {
  const full = JSON.stringify(items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })));
  if (full.length <= 500) return full;
  return JSON.stringify(items.map((i) => ({ id: i.id, quantity: i.quantity })));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { method, amount, items, email, shipping, eventId, url, attribution } = req.body || {};

    const methodDef = getAltPaymentMethod(method);
    if (!methodDef) return res.status(400).json({ error: 'Unsupported payment method' });
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (!items || items.length === 0) return res.status(400).json({ error: 'No items in cart' });

    const stripe = getStripe();

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: 'usd',
      payment_method_types: [methodDef.stripeType],
      receipt_email: email || undefined,
      shipping: shipping?.address
        ? {
            name: `${shipping.firstName} ${shipping.lastName}`.trim() || email || 'Customer',
            address: {
              line1: shipping.address,
              line2: shipping.apt || undefined,
              city: shipping.city,
              state: shipping.state,
              postal_code: shipping.zip,
              country: 'US',
            },
          }
        : undefined,
      metadata: {
        items: compactItemsForMetadata(items),
        eventId: eventId || '',
        url: url || '',
        attribution: attribution ? JSON.stringify(attribution).slice(0, 500) : '',
      },
    });

    return res.status(200).json({ clientSecret: intent.client_secret, id: intent.id });
  } catch (err) {
    console.error('Stripe payment-intent error:', err);
    return res.status(500).json({ error: err.message });
  }
}
