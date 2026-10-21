// Hourly (vercel.json): resends paid orders from the last 7 days that
// didn't make it into ShippingEasy at checkout (lib/shippingEasy.js), up to
// MAX_ATTEMPTS tries each. Orders placed before the keys were set have no
// order.shippingEasy record and are left alone — admin's "Send to
// ShippingEasy" button covers those.

import { getOrders, dateKeysForRange, updateOrderStatus } from '../../../lib/analyticsStore';
import { shippingEasyConfig, sendOrderToShippingEasy, MAX_ATTEMPTS } from '../../../lib/shippingEasy';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('ShippingEasy retry: CRON_SECRET is not set — refusing to run.');
    return res.status(500).json({ error: 'Not configured' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!shippingEasyConfig().configured) return res.status(200).json({ skipped: 'ShippingEasy keys are not set' });

  const orders = (await Promise.all(dateKeysForRange('7d').map((key) => getOrders(key)))).flat();
  const pending = orders.filter((o) =>
    o.shippingEasy && !o.shippingEasy.sent
    && (o.shippingEasy.attempts || 0) < MAX_ATTEMPTS
    && o.status === 'paid'
    && !o.trackingNumber
  );

  let sent = 0;
  const failed = [];
  for (const order of pending) {
    const shippingEasy = await sendOrderToShippingEasy(order);
    if (shippingEasy.sent) sent += 1;
    else failed.push({ id: order.id, error: shippingEasy.lastError });
    await updateOrderStatus(order.id, { shippingEasy }).catch((err) =>
      console.error('ShippingEasy retry: could not save result for', order.id, err.message));
  }
  return res.status(200).json({ checked: orders.length, retried: pending.length, sent, failed });
}
