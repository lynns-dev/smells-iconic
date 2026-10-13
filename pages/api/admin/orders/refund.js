// Admin's Refund button: issues a full refund through whichever company took
// the payment, then marks the order refunded. Admin-only (middleware.js
// guards /api/admin/*). The order is looked up server-side, so the amount
// and payment ids come from the saved order, not from the browser.

import { getOrders, dateKeysForRange, updateOrderStatus } from '../../../../lib/analyticsStore';
import { refundCharge as refundSquareCharge } from '../../../../lib/squareServer';
import { refundPayment as refundAfterpayPayment } from '../../../../lib/afterpay';
import { refundCapture as refundPaypalCapture } from '../../../../lib/paypal';
import { getStripe } from '../../../../lib/stripeServer';

async function findOrder(orderId) {
  const perDay = await Promise.all(dateKeysForRange('45d').map((key) => getOrders(key)));
  return perDay.flat().find((o) => o.id === orderId) || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'Missing order id' });
    const order = await findOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'refunded') return res.status(200).json({ order });

    const processor = order.processor || (/paypal|venmo/i.test(order.paymentMethod || '') ? 'paypal' : null);
    if (processor === 'square') {
      await refundSquareCharge(order.id, order.amount);
    } else if (processor === 'afterpay') {
      await refundAfterpayPayment(order.id, order.amount);
    } else if (processor === 'paypal') {
      if (!order.captureId) {
        return res.status(400).json({ error: 'This PayPal order was saved before refunds were supported — refund it in your PayPal account instead.' });
      }
      await refundPaypalCapture(order.captureId);
    } else if (processor === 'stripe') {
      await getStripe().refunds.create({ payment_intent: order.id });
    } else if (processor === 'quickbooks') {
      return res.status(400).json({ error: 'Refund QuickBooks card orders in QuickBooks, then mark this order cancelled.' });
    } else {
      return res.status(400).json({ error: 'This order doesn\'t say which company took the payment — refund it there, then mark it cancelled.' });
    }

    const updated = await updateOrderStatus(orderId, { status: 'refunded', refundedAt: new Date().toISOString() });
    return res.status(200).json({ order: updated || { ...order, status: 'refunded' } });
  } catch (err) {
    console.error('Order refund error:', err);
    return res.status(500).json({ error: err.message });
  }
}
