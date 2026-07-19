// Fulfills orders paid through the "or pay another way" methods (Cash App
// Pay, Klarna, Afterpay, Affirm). These are redirect-based — the customer
// leaves to authorize on the provider's own site and may never come back —
// so fulfillment can't happen synchronously from the checkout request the
// way it does for QuickBooks/PayPal. This webhook is the source of truth:
// only a real payment_intent.succeeded event creates an order record.
//
// Register this endpoint's URL (https://YOUR_DOMAIN/api/stripe-webhook) in
// the Stripe Dashboard, subscribed to payment_intent.succeeded, and put the
// signing secret it gives you in STRIPE_WEBHOOK_SECRET.

import { getStripe } from '../../lib/stripeServer';
import { fulfillOrder } from '../../lib/orderFulfillment';

// Signature verification needs the exact raw request body — Next.js's
// built-in JSON body parser would re-serialize it and break the signature.
export const config = {
  api: { bodyParser: false },
};

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

const PAYMENT_METHOD_LABELS = {
  cashapp: 'Cash App Pay',
  klarna: 'Klarna',
  afterpay_clearpay: 'Afterpay',
  affirm: 'Affirm',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set — refusing an unverifiable webhook call.');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const stripe = getStripe();
  let event;
  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    try {
      const items = intent.metadata?.items ? JSON.parse(intent.metadata.items) : [];
      const attribution = intent.metadata?.attribution ? JSON.parse(intent.metadata.attribution) : null;
      const methodType = intent.payment_method_types?.[0];

      await fulfillOrder({
        id: intent.id,
        amount: intent.amount / 100,
        items,
        eventId: intent.metadata?.eventId || undefined,
        url: intent.metadata?.url || undefined,
        req,
        paymentMethod: PAYMENT_METHOD_LABELS[methodType] || 'Alternative payment',
        attribution,
      });
    } catch (err) {
      console.error('Stripe webhook fulfillment error:', err);
    }
  }

  // Always 200 once the signature checks out — a non-2xx here makes Stripe
  // retry the event, which would risk double-fulfilling an already-recorded
  // order if the failure was in our own post-processing, not the payment.
  return res.status(200).json({ received: true });
}
