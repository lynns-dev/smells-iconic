// Creates a PayPal order for the express-checkout button. Called from the
// button's createOrder callback, before the buyer approves anything.

import { createOrder } from '../../../lib/paypal';

export default async function handler(req, res) {
  if (process.env.STRIPE_ONLY_ENABLED === 'true') return res.status(410).json({ error: 'Please refresh and use secure Stripe checkout.' });
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount } = req.body || {};
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const id = await createOrder(amount);
    return res.status(200).json({ id });
  } catch (err) {
    console.error('PayPal create-order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
