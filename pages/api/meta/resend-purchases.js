// Hourly retry for Meta Purchase events (see lib/metaPurchase.js): resends
// every paid order from the last 7 days whose Purchase Meta hasn't accepted
// yet — a Meta outage, an expired access token, a network blip at checkout —
// with the order's original event_id and purchase time, so it can't be
// counted twice. Orders placed before order.meta existed are skipped: they
// carry no stored event_id, so a resend couldn't be deduplicated.
//
// Guarded by CRON_SECRET — Vercel Cron
// sends `Authorization: Bearer <CRON_SECRET>` automatically.

import { getOrders, dateKeysForRange, updateOrderStatus } from '../../../lib/analyticsStore';
import { sendOrderPurchase, RESEND_WINDOW_MS, MAX_ATTEMPTS } from '../../../lib/metaPurchase';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('Meta Purchase resend: CRON_SECRET is not set — refusing to run.');
    return res.status(500).json({ error: 'Not configured' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let orders;
  try {
    orders = (await Promise.all(dateKeysForRange('7d').map((key) => getOrders(key)))).flat();
  } catch (err) {
    console.error('Meta Purchase resend: could not read orders:', err.message);
    return res.status(500).json({ error: err.message });
  }

  const cutoff = Date.now() - RESEND_WINDOW_MS;
  const pending = orders.filter((o) =>
    o.meta && !o.meta.sent
    && (o.meta.attempts || 0) < MAX_ATTEMPTS
    && o.status === 'paid'
    && new Date(o.createdAt).getTime() > cutoff
  );

  let sent = 0;
  const failed = [];
  for (const order of pending) {
    const meta = await sendOrderPurchase(order, order.meta);
    if (meta.sent) sent += 1;
    else failed.push({ id: order.id, error: meta.lastError });
    try {
      await updateOrderStatus(order.id, { meta });
    } catch (err) {
      console.error('Meta Purchase resend: could not save result for', order.id, err.message);
    }
  }

  const unsent = orders.filter((o) => o.meta && !o.meta.sent).length - sent;
  return res.status(200).json({ checked: orders.length, retried: pending.length, sent, failed, stillUnsent: unsent });
}
