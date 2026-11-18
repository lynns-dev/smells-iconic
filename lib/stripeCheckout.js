import { recordStripeExperimentPurchase } from './stripeExperimentPurchase';
import { getStripe } from './stripeServer';
import { fulfillOrder } from './orderFulfillment';
import { getOrders } from './analyticsStore';

export const stripeCheckoutEnabled = () => process.env.STRIPE_CHECKOUT_ENABLED === 'true' && Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_CHECKOUT_ORIGIN && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
export async function stripeKV(command) {
  const response = await fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('Payment order storage unavailable');
  return data.result;
}
export async function completeStripeSession(session, req) {
  if (session.metadata?.origin !== new URL(process.env.STRIPE_CHECKOUT_ORIGIN).origin) throw new Error('Checkout belongs to another store');
  if (typeof session.livemode !== 'boolean' || session.livemode !== (process.env.STRIPE_CHECKOUT_MODE !== 'test')) throw new Error('Checkout mode mismatch');
  if (session.payment_status !== 'paid') return null;
  const pendingRaw = await stripeKV(['GET', `stripe:pending:${session.client_reference_id}`]);
  if (!pendingRaw) throw new Error('Payment order details unavailable');
  const pending = typeof pendingRaw === 'string' ? JSON.parse(pendingRaw) : pendingRaw;
  if (pending.origin !== session.metadata.origin || pending.stripeSessionId !== session.id) throw new Error('Checkout identity mismatch');
  if (session.currency !== 'usd' || session.amount_total !== Math.round(pending.amount * 100)) throw new Error('Payment total mismatch');
  const id = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (!id) throw new Error('Missing confirmed payment identifier');
  const purchase = { orderId: id, amount: pending.amount, eventId: pending.eventId, contentIds: pending.items.map(i => i.id), contents: pending.items.map(i => ({ id: i.id, quantity: i.quantity, item_price: i.price })) };
  if (await stripeKV(['GET', `stripe:fulfilled:${id}`])) { await recordStripeExperimentPurchase(pending); return purchase; }
  const lockKey = `stripe:lock:${id}`;
  const lock = await stripeKV(['SET', lockKey, '1', 'NX', 'EX', 120]);
  if (!lock) throw new Error('Payment confirmation in progress; retry shortly');
  try {
    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const fulfillmentDate = pending.fulfillmentDate || dateKey;
    const exists = async () => (await Promise.all([...new Set([fulfillmentDate, dateKey])].map(day => getOrders(day)))).flat().some(order => order.id === id);
    if (!(await exists())) {
      if (!pending.fulfillmentDate) {
        pending.fulfillmentDate = dateKey;
        await stripeKV(['SET', `stripe:pending:${session.client_reference_id}`, JSON.stringify(pending), 'EX', 60 * 60 * 24 * 30]);
      }
      await fulfillOrder({ ...pending, id, processor: 'stripe', paymentMethod: 'Stripe', req });
    }
    // Existing fulfillment suppresses errors. Never acknowledge the webhook
    // until we can read the paid order back from the durable ledger.
    if (!(await exists())) throw new Error('Paid order is not yet recorded');
    await recordStripeExperimentPurchase(pending);
    await stripeKV(['SET', `stripe:fulfilled:${id}`, '1', 'EX', 60 * 60 * 24 * 180]);
    return purchase;
  } finally { await stripeKV(['DEL', lockKey]); }
}
export async function retrieveStripePurchase(sessionId, req) {
  if (!/^cs_(test_|live_)?[a-zA-Z0-9_]+$/.test(sessionId || '')) throw new Error('Invalid checkout session');
  return completeStripeSession(await getStripe().checkout.sessions.retrieve(sessionId, {}, { apiVersion: '2026-10-28.endive' }), req);
}
