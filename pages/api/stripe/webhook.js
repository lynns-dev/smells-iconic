import { getStripe } from '../../../lib/stripeServer';
import { completeStripeSession } from '../../../lib/stripeCheckout';
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).end();
  let event;
  try { const chunks = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); event = getStripe().webhooks.constructEvent(Buffer.concat(chunks), req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return res.status(400).json({ error: 'Invalid signature' }); }
  if (event.data.object.metadata?.origin !== process.env.STRIPE_CHECKOUT_ORIGIN?.replace(/\/$/, '')) return res.status(200).json({ received: true, ignored: true });
  try { if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) await completeStripeSession(event.data.object, req); res.status(200).json({ received: true }); }
  catch (e) { console.error('Stripe fulfillment requires retry:', e.message); res.status(503).json({ error: 'Order recording pending; retry' }); }
}
