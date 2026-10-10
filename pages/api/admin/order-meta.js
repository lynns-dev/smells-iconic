// Admin's per-order "Send to Meta" button: sends this order's Purchase to
// Meta now (lib/metaPurchase.js) and saves the outcome on the order.
//
// - Order Meta hasn't accepted yet: resent with its own saved event id and
//   match data — the same send the hourly retry would make.
// - Order from before per-order tracking existed (no order.meta): sent with
//   event id `order_<id>` as action_source "other", since no browser user
//   agent or page URL was saved for it (Meta requires both for "website").
// - Order Meta already has: nothing is sent, so it can't count twice.
//
// Meta only accepts purchases up to 7 days old; older ones come back with
// Meta's error, shown on the order.

import { getOrders, dateKeysForRange, updateOrderStatus } from '../../../lib/analyticsStore';
import { backfillMetaRecord, sendOrderPurchase } from '../../../lib/metaPurchase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'Missing order id' });

    const orders = (await Promise.all(dateKeysForRange('45d').map((key) => getOrders(key)))).flat();
    const order = orders.find((o) => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.meta?.sent) return res.status(200).json({ order });

    const meta = await sendOrderPurchase(order, order.meta || backfillMetaRecord(order));
    const updated = await updateOrderStatus(orderId, { meta });
    if (!meta.sent) return res.status(502).json({ error: meta.lastError || 'Meta did not accept it.', order: updated || { ...order, meta } });
    return res.status(200).json({ order: updated || { ...order, meta } });
  } catch (err) {
    console.error('Send order to Meta failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
