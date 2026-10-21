// Admin's ShippingEasy controls (lib/shippingEasy.js):
// - GET: whether the keys are set, how many orders still need sending, and
//   the outcome of the latest label
//   callback (pages/api/shippingeasy/callback.js) — shown on the Orders tab.
// - POST { orderId }: sends that order to ShippingEasy now and saves the
//   outcome on the order — for orders placed before the keys were added,
//   or one the automatic send and hourly retry couldn't get through.
// - POST { all: true }: the same for every order from the last 45 days that
//   isn't in ShippingEasy yet and still needs shipping (paid, no tracking),
//   up to BULK_LIMIT per click, saved one day at a time.

import { getOrders, dateKeysForRange, updateOrderStatus, saveOrdersForDay } from '../../../../lib/analyticsStore';
import { shippingEasyConfig, sendOrderToShippingEasy } from '../../../../lib/shippingEasy';

const BULK_LIMIT = 40;

const needsShippingEasy = (o) => (o.status || 'paid') === 'paid' && !o.trackingNumber && !o.shippingEasy?.sent && Boolean(o.shipping?.address);

async function lastCallback() {
  const { KV_REST_API_URL: url, KV_REST_API_TOKEN: token } = process.env;
  if (!url || !token) return null;
  const data = await fetch(`${url}/get/shippingeasy_last_callback`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.json())
    .catch(() => ({}));
  try {
    return data.result ? JSON.parse(data.result) : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const orders = (await Promise.all(dateKeysForRange('45d').map((key) => getOrders(key)))).flat();
    return res.status(200).json({
      configured: shippingEasyConfig().configured,
      lastCallback: await lastCallback(),
      unsent: orders.filter(needsShippingEasy).length,
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.body?.all) {
    if (!shippingEasyConfig().configured) return res.status(400).json({ error: 'ShippingEasy is not set up yet.' });
    try {
      let budget = BULK_LIMIT;
      let sent = 0;
      const failed = [];
      for (const key of dateKeysForRange('45d')) {
        if (budget <= 0) break;
        const orders = await getOrders(key);
        let changed = false;
        for (let i = 0; i < orders.length && budget > 0; i += 1) {
          if (!needsShippingEasy(orders[i])) continue;
          budget -= 1;
          const shippingEasy = await sendOrderToShippingEasy(orders[i]);
          orders[i] = { ...orders[i], shippingEasy };
          changed = true;
          if (shippingEasy.sent) sent += 1;
          else failed.push({ id: orders[i].id, error: shippingEasy.lastError });
        }
        if (changed) await saveOrdersForDay(key, orders);
      }
      return res.status(200).json({ sent, failed, more: budget <= 0 });
    } catch (err) {
      console.error('Bulk send to ShippingEasy failed:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'Missing order id' });

    const orders = (await Promise.all(dateKeysForRange('45d').map((key) => getOrders(key)))).flat();
    const order = orders.find((o) => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const shippingEasy = await sendOrderToShippingEasy(order);
    const updated = await updateOrderStatus(orderId, { shippingEasy });
    const result = updated || { ...order, shippingEasy };
    if (!shippingEasy.sent) return res.status(502).json({ error: shippingEasy.lastError || 'ShippingEasy did not accept it.', order: result });
    return res.status(200).json({ order: result });
  } catch (err) {
    console.error('Send order to ShippingEasy failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
