// Admin's Easyship controls (lib/easyship.js):
// - GET: whether the token is set, whether the tracking webhook is
//   connected, how many orders still need sending, and the outcome of the
//   latest label webhook (pages/api/easyship/webhook.js) — shown on Orders.
// - POST { action: 'connect-webhook' }: registers + activates the label
//   webhook for this site through the API (saved as easyship_webhook).
// - POST { orderId }: sends that order to Easyship now and saves the
//   outcome on the order — for orders placed before the keys were added,
//   or one the automatic send and hourly retry couldn't get through.
// - POST { all: true }: the same for every order from the last 45 days that
//   isn't in Easyship yet and still needs shipping (paid, no tracking),
//   up to BULK_LIMIT per click, saved one day at a time.

import { getOrders, dateKeysForRange, updateOrderStatus, saveOrdersForDay } from '../../../../lib/analyticsStore';
import { easyshipConfig, sendOrderToEasyship, registerWebhook, webhookUrl } from '../../../../lib/easyship';

const BULK_LIMIT = 40;

const needsEasyship = (o) => (o.status || 'paid') === 'paid' && !o.trackingNumber && !o.easyship?.sent && Boolean(o.shipping?.address);

// KV is read as process.env.KV_REST_API_URL / _TOKEN written out in full:
// next.config.js maps this store's Upstash variable names onto those, and
// that only reaches code that names them literally (not destructuring).
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const data = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.json())
    .catch(() => ({}));
  try {
    return data.result ? JSON.parse(data.result) : null;
  } catch {
    return null;
  }
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  await fetch(`${url}/set/${key}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(value) });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const orders = (await Promise.all(dateKeysForRange('45d').map((key) => getOrders(key)))).flat();
    return res.status(200).json({
      configured: easyshipConfig().configured,
      webhook: await kvGet('easyship_webhook'),
      lastWebhook: await kvGet('easyship_last_webhook'),
      unsent: orders.filter(needsEasyship).length,
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.body?.action === 'connect-webhook') {
    if (!easyshipConfig().configured) return res.status(400).json({ error: 'Easyship is not set up yet — add EASYSHIP_API_TOKEN in Vercel and redeploy.' });
    try {
      const webhook = await registerWebhook(webhookUrl(req.headers['x-forwarded-host'] || req.headers.host));
      await kvSet('easyship_webhook', webhook);
      return res.status(200).json({ webhook });
    } catch (err) {
      return res.status(502).json({ error: `Easyship didn't accept the webhook: ${err.message}` });
    }
  }

  if (req.body?.all) {
    if (!easyshipConfig().configured) return res.status(400).json({ error: 'Easyship is not set up yet.' });
    try {
      let budget = BULK_LIMIT;
      let sent = 0;
      const failed = [];
      for (const key of dateKeysForRange('45d')) {
        if (budget <= 0) break;
        const orders = await getOrders(key);
        let changed = false;
        for (let i = 0; i < orders.length && budget > 0; i += 1) {
          if (!needsEasyship(orders[i])) continue;
          budget -= 1;
          const easyship = await sendOrderToEasyship(orders[i]);
          orders[i] = { ...orders[i], easyship };
          changed = true;
          if (easyship.sent) sent += 1;
          else failed.push({ id: orders[i].id, error: easyship.lastError });
        }
        if (changed) await saveOrdersForDay(key, orders);
      }
      return res.status(200).json({ sent, failed, more: budget <= 0 });
    } catch (err) {
      console.error('Bulk send to Easyship failed:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'Missing order id' });

    const orders = (await Promise.all(dateKeysForRange('45d').map((key) => getOrders(key)))).flat();
    const order = orders.find((o) => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const easyship = await sendOrderToEasyship(order);
    const updated = await updateOrderStatus(orderId, { easyship });
    const result = updated || { ...order, easyship };
    if (!easyship.sent) return res.status(502).json({ error: easyship.lastError || 'Easyship did not accept it.', order: result });
    return res.status(200).json({ order: result });
  } catch (err) {
    console.error('Send order to Easyship failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
