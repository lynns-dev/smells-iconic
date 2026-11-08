import { enrollWalletTest } from '../../../lib/shopPayExperiment';
import { walletConfigured, shopify, SHOP_ID, createCheckout, loadCheckout, paymentRequest, submitCheckout, reconcileCheckout, redis } from '../../../lib/shopPayWallet';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    if (req.query?.health === '1') {
      if (!walletConfigured()) return res.status(200).json({ ready: false });
      try {
        const data = await shopify(`query WalletReadiness {
          shop { id }
          shopPayPaymentRequestReceipts(first: 1, query: "source_identifier:'wallet-readiness-probe'") { nodes { sourceIdentifier } }
        }`, {}, true);
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60');
        return res.status(200).json({ ready: data.shop?.id === `gid://shopify/Shop/${SHOP_ID}` && Array.isArray(data.shopPayPaymentRequestReceipts?.nodes) });
      } catch { return res.status(502).json({ ready: false, error: 'Shopify order verification API is unavailable.' }); }
    }
    return res.status(200).json({ enabled: walletConfigured() });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  if (!walletConfigured() && req.body?.action !== 'status') return res.status(503).json({ error: 'Shop Pay is not available yet.' });
  // Requests are same-origin; no third-party script can submit a payment.
  if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return res.status(403).end();
  try {
    const body = req.body || {};
    if (body.action === 'enroll') {
      return res.status(200).json({ variant: await enrollWalletTest(body.visitorId, body.sessionId, body.device) });
    }
    if (body.action === 'create') {
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0];
      const bucket = `shop-pay-wallet:rate:${ip}:${Math.floor(Date.now() / 60000)}`;
      const count = await redis('INCR', bucket);
      if (count === 1) await redis('EXPIRE', bucket, 120);
      if (count > 20) return res.status(429).json({ error: 'Please wait a moment before reopening Shop Pay.' });
      return res.status(200).json(await createCheckout(body, req));
    }
    const record = await loadCheckout(body.id, String(body.access || ''));
    if (body.action === 'address') {
      if (body.shippingAddress?.countryCode !== 'US') {
        const updated = paymentRequest(record.quote); updated.deliveryMethods = [];
        return res.status(200).json({ paymentRequest: updated, errors: [{ type: 'shippingAddressError', message: 'We currently ship to US addresses only.' }] });
      }
      // Flat-rate shipping and no additional tax, matching regular checkout.
      return res.status(200).json({ paymentRequest: paymentRequest(record.quote) });
    }
    if (body.action === 'submit') {
      const lockKey = `shop-pay-wallet:submit:${record.id}`;
      if (!await redis('SET', lockKey, '1', 'NX', 'EX', 30)) return res.status(409).json({ error: 'Your payment is already being processed.' });
      try { return res.status(200).json(await submitCheckout(record, body)); }
      finally { await redis('DEL', lockKey); }
    }
    if (body.action === 'status') return res.status(200).json(await reconcileCheckout(record));
    return res.status(400).json({ error: 'Unsupported Shop Pay action.' });
  } catch (err) {
    console.error('Shop Pay checkout error:', err.message);
    return res.status(400).json({ error: err.message || 'Shop Pay is temporarily unavailable.' });
  }
}
