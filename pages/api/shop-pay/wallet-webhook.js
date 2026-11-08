import crypto from 'crypto';
import { safeEqual, loadCheckout, reconcileCheckout } from '../../../lib/shopPayWallet';
import { STORE_KEY } from '../../../lib/shopPayQuote';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const secret = process.env.SHOP_PAY_WEBHOOK_SECRET;
  if (!secret) return res.status(503).end();
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) return res.status(413).end();
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  if (!safeEqual(expected, req.headers['x-shopify-hmac-sha256'])) return res.status(401).end();
  if (req.headers['x-shopify-shop-domain'] !== process.env.SHOP_PAY_STORE_DOMAIN) return res.status(401).end();
  try {
    const payload = JSON.parse(raw.toString('utf8'));
    const id = payload.source_identifier;
    // One Shopify account serves three sites. Never import another brand's
    // order or any order not created by this checkout.
    if (!id || !id.startsWith(`${STORE_KEY}-`)) return res.status(200).end();
    const record = await loadCheckout(id);
    // Query Shopify to confirm PAID and the expected amount. The webhook's
    // existence, and a client-side success callback, are not proof of payment.
    await reconcileCheckout(record);
    return res.status(200).end();
  } catch (err) { console.error('Shop Pay webhook reconciliation failed:', err.message); return res.status(500).end(); }
}
