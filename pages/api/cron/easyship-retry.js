// Hourly (vercel.json): resends paid orders from the last 7 days that
// didn't make it into Easyship at checkout (lib/easyship.js), up to
// MAX_ATTEMPTS tries each. Orders placed before the keys were set have no
// order.easyship record and are left alone — admin's "Send to
// Easyship" button covers those.

import { getOrders, dateKeysForRange, updateOrderStatus } from '../../../lib/analyticsStore';
import { easyshipConfig, sendOrderToEasyship, MAX_ATTEMPTS } from '../../../lib/easyship';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('Easyship retry: CRON_SECRET is not set — refusing to run.');
    return res.status(500).json({ error: 'Not configured' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!easyshipConfig().configured) return res.status(200).json({ skipped: 'EASYSHIP_API_TOKEN is not set' });

  const orders = (await Promise.all(dateKeysForRange('7d').map((key) => getOrders(key)))).flat();
  const pending = orders.filter((o) =>
    o.easyship && !o.easyship.sent
    && (o.easyship.attempts || 0) < MAX_ATTEMPTS
    && o.status === 'paid'
    && !o.trackingNumber
  );

  let sent = 0;
  const failed = [];
  for (const order of pending) {
    const easyship = await sendOrderToEasyship(order);
    if (easyship.sent) sent += 1;
    else failed.push({ id: order.id, error: easyship.lastError });
    await updateOrderStatus(order.id, { easyship }).catch((err) =>
      console.error('Easyship retry: could not save result for', order.id, err.message));
  }
  return res.status(200).json({ checked: orders.length, retried: pending.length, sent, failed });
}
