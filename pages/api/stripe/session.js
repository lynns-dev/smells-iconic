import crypto from 'crypto';
import { getStripe } from '../../../lib/stripeServer';
import { validateCheckout } from '../../../lib/validateCheckout';
import { getBrowserContext } from '../../../lib/metaCapi';
import { stripeCheckoutEnabled, stripeKV } from '../../../lib/stripeCheckout';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!stripeCheckoutEnabled()) return res.status(503).json({ error: 'Stripe checkout is not available.' });
  try {
    const origin = new URL(process.env.STRIPE_CHECKOUT_ORIGIN).origin;
    if (req.headers.origin !== origin) return res.status(403).json({ error: 'Checkout request origin not allowed.' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const rateKey = `stripe:rate:${crypto.createHash('sha256').update(ip).digest('hex')}:${Math.floor(Date.now() / 3600000)}`;
    const count = await stripeKV(['INCR', rateKey]);
    if (count === 1) await stripeKV(['EXPIRE', rateKey, 3600]);
    if (count > 20) return res.status(429).json({ error: 'Too many checkout attempts. Please wait before trying again.' });
    const body = req.body || {};
    let quote;
    try { quote = await validateCheckout(body); } catch (e) { return res.status(400).json({ error: e.message }); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email || '') || !body.shipping?.address || !body.shipping?.city || !body.shipping?.zip || !body.shipping?.state || !body.shipping?.name) return res.status(400).json({ error: 'Enter your email and complete shipping address first.' });
    if (!origin.startsWith('https://')) throw new Error('Secure checkout origin required');
    const reference = crypto.randomUUID();
    const pending = { origin, amount: quote.total, items: quote.items, email: body.email, shipping: body.shipping, eventId: body.eventId, url: body.url, attribution: body.attribution, sessionId: body.sessionId, shippingProtection: Number(body.shippingProtection || 0), browser: getBrowserContext(req) };
    await stripeKV(['SET', `stripe:pending:${reference}`, JSON.stringify(pending), 'EX', 60 * 60 * 24 * 30]);
    const session = await getStripe().checkout.sessions.create({ mode: 'payment', ui_mode: 'embedded_page', payment_method_types: ['card'], customer_email: body.email, client_reference_id: reference, line_items: [{ price_data: { currency: 'usd', unit_amount: Math.round(quote.total * 100), product_data: { name: 'Your order', description: quote.items.map(i => `${i.quantity} × ${i.name}`).join(', ').slice(0, 500) } }, quantity: 1 }], return_url: `${origin}/stripe-return?session_id={CHECKOUT_SESSION_ID}`, metadata: { reference, origin }, payment_intent_data: { metadata: { reference, origin } } }, { idempotencyKey: reference });
    await stripeKV(['SET', `stripe:pending:${reference}`, JSON.stringify({ ...pending, stripeSessionId: session.id }), 'EX', 60 * 60 * 24 * 30]);
    res.status(200).json({ clientSecret: session.client_secret });
  } catch (e) { console.error('Stripe checkout session failed:', e.message); res.status(500).json({ error: 'Could not start secure checkout. Please refresh and try again.' }); }
}
