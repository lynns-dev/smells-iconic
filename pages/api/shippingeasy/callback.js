// ShippingEasy's Callback URL (set on the API store in ShippingEasy):
// https://smellsiconic.com/api/shippingeasy/callback. Called when a label is
// printed, with the shipment's tracking number and the store order ids it
// covers. Each order is marked shipped and the customer emailed their
// tracking (lib/orderShipping.js). A repeat call for a tracking number the
// order already has is ignored, so ShippingEasy retrying doesn't re-email.
//
// The request is signed with this account's API secret
// (lib/shippingEasy.js verifyCallback), which needs the raw body — hence
// bodyParser is off. The latest callback's outcome is kept in KV
// (shippingeasy_last_callback) and shown in admin, since a rejected
// callback is otherwise invisible.

import { getOrders, dateKeysForRange } from '../../../lib/analyticsStore';
import { markOrderShipped } from '../../../lib/orderShipping';
import { verifyCallback, parseShipment, trackingUrlFor, carrierLabel } from '../../../lib/shippingEasy';

export const config = { api: { bodyParser: false } };

const LAST_CALLBACK_KEY = 'shippingeasy_last_callback';

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function saveLastCallback(entry) {
  const { KV_REST_API_URL: url, KV_REST_API_TOKEN: token } = process.env;
  if (!url || !token) return;
  await fetch(`${url}/set/${LAST_CALLBACK_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ at: new Date().toISOString(), ...entry }),
  }).catch(() => {});
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await readRawBody(req);
  const path = String(req.url || '').split('?')[0];
  const check = verifyCallback({ method: 'POST', path, query: req.query || {}, rawBody });
  if (!check.ok) {
    console.error('ShippingEasy callback rejected:', check.reason);
    await saveLastCallback({ ok: false, error: `Rejected: ${check.reason}` });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let body;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    await saveLastCallback({ ok: false, error: 'Body was not JSON.' });
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const shipment = parseShipment(body);
  if (!shipment.trackingNumber || shipment.orderIds.length === 0) {
    await saveLastCallback({ ok: false, error: 'No tracking number or order id in the callback.', keys: Object.keys(body?.shipment || body || {}) });
    return res.status(200).json({ ok: true, ignored: true });
  }

  const orders = (await Promise.all(dateKeysForRange('45d').map((key) => getOrders(key)))).flat();
  const carrier = carrierLabel(shipment.carrier);
  const results = [];
  for (const orderId of shipment.orderIds) {
    const order = orders.find((o) => String(o.id) === orderId);
    if (!order) {
      results.push({ orderId, status: 'not found' });
      continue;
    }
    if (order.trackingNumber === shipment.trackingNumber) {
      results.push({ orderId, status: 'already shipped' });
      continue;
    }
    try {
      const result = await markOrderShipped(order.id, {
        carrier,
        trackingNumber: shipment.trackingNumber,
        trackingUrl: trackingUrlFor(shipment.carrier, shipment.trackingNumber),
        source: 'shippingeasy',
      });
      results.push({ orderId, status: 'shipped', emailSent: Boolean(result?.emailSent), emailError: result?.emailError || null });
    } catch (err) {
      results.push({ orderId, status: 'error', error: err.message });
    }
  }

  await saveLastCallback({ ok: true, trackingNumber: shipment.trackingNumber, carrier, results });
  return res.status(200).json({ ok: true, results });
}
