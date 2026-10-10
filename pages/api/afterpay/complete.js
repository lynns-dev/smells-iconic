// Afterpay sends the shopper back to /afterpay/return, which calls this
// with the order token. Captures the payment and records the order through
// the same fulfillOrder() pipeline as card orders — this request comes
// from the shopper's own browser, so the Meta Purchase carries their real
// IP/user agent/cookies.
//
// Safe to call twice (a refresh of the return page): the pending record is
// marked resolved once, and a resolved ref just returns the same order.
import { afterpayConfig, loadPending, savePending, capturePayment } from '../../../lib/afterpay';
import { fulfillOrder } from '../../../lib/orderFulfillment';

function normalizeShipping(s) {
  if (!s) return null;
  return {
    name: s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim(),
    address: s.address || '', apt: s.apt || '', city: s.city || '',
    state: s.state || '', zip: s.zip || '', phone: s.phone || '',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!afterpayConfig().enabled) return res.status(404).json({ error: 'Afterpay is not available.' });

  const { ref, orderToken } = req.body || {};
  try {
    const pending = await loadPending(ref);
    if (!pending) return res.status(404).json({ error: 'This checkout has expired. Please start again.' });
    // The token must be the one this checkout created — a return URL with
    // someone else's token can't attach their payment to this order.
    if (!orderToken || orderToken !== pending.token) return res.status(400).json({ error: 'This Afterpay checkout does not match your order.' });
    const summary = (orderId) => ({ orderId, eventId: pending.eventId, amount: pending.amount, items: pending.items });
    if (pending.resolved) return res.status(200).json(summary(pending.orderId));

    const payment = await capturePayment(orderToken, ref);
    const orderId = String(payment.id);
    await fulfillOrder({
      id: orderId,
      amount: pending.amount,
      items: pending.items,
      eventId: pending.eventId,
      url: pending.url,
      req,
      paymentMethod: pending.cashAppPay ? 'Cash App Pay' : 'Afterpay',
      attribution: pending.attribution,
      email: pending.email,
      shipping: normalizeShipping(pending.shipping),
      processor: 'afterpay',
      captureId: orderToken,
    });
    await savePending(ref, { ...pending, resolved: true, orderId });
    return res.status(200).json(summary(orderId));
  } catch (err) {
    console.error('Afterpay complete error:', err.message);
    return res.status(err.declined ? 402 : 500).json({ error: err.message || 'Afterpay could not complete this payment.' });
  }
}
