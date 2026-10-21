// Admin's ShippingEasy controls (lib/shippingEasy.js):
// - GET: whether the keys are set, and the outcome of the latest label
//   callback (pages/api/shippingeasy/callback.js) — shown on the Orders tab.
// - POST { orderId }: sends that order to ShippingEasy now and saves the
//   outcome on the order — for orders placed before the keys were added,
//   or one the automatic send and hourly retry couldn't get through.

import { getOrders, dateKeysForRange, updateOrderStatus } from '../../../../lib/analyticsStore';
import { shippingEasyConfig, sendOrderToShippingEasy } from '../../../../lib/shippingEasy';

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
    return res.status(200).json({ configured: shippingEasyConfig().configured, lastCallback: await lastCallback() });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
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
