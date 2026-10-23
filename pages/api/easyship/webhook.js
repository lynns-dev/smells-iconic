// Easyship's label webhook (registered from admin → Orders → "Connect
// tracking", lib/easyship.js registerWebhook): called when a label is
// bought, with the shipment id and tracking number. The body is only a
// hint — the shipment is fetched again through the API with this store's
// token, and only a real shipment that belongs to one of this store's
// orders is marked shipped, so a forged request can't mark anything
// shipped. The customer is then emailed their tracking
// (lib/orderShipping.js); a repeat for a tracking number the order already
// has is ignored. The latest outcome is kept in KV (easyship_last_webhook)
// and shown in admin.

import { getOrders, dateKeysForRange } from '../../../lib/analyticsStore';
import { markOrderShipped } from '../../../lib/orderShipping';
import { easyshipConfig, getShipment, trackingFromShipment, parseWebhook, trackingUrlFor, carrierLabel } from '../../../lib/easyship';

const LAST_WEBHOOK_KEY = 'easyship_last_webhook';

async function saveLastWebhook(entry) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  await fetch(`${url}/set/${LAST_WEBHOOK_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ at: new Date().toISOString(), ...entry }),
  }).catch(() => {});
}

export default async function handler(req, res) {
  // Easyship may ping the endpoint when it's registered.
  if (req.method === 'GET' || req.method === 'HEAD') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const hint = parseWebhook(req.body || {});
  if (!hint.shipmentId) return res.status(200).json({ ok: true, ignored: 'no shipment id' });
  if (!easyshipConfig().configured) {
    await saveLastWebhook({ ok: false, error: 'EASYSHIP_API_TOKEN is not set.' });
    return res.status(200).json({ ok: true, ignored: 'not configured' });
  }

  let shipment;
  try {
    shipment = await getShipment(hint.shipmentId);
  } catch (err) {
    await saveLastWebhook({ ok: false, shipmentId: hint.shipmentId, error: `Couldn't look the shipment up in Easyship: ${err.message}` });
    // A failed lookup may be temporary — let Easyship retry.
    return res.status(502).json({ error: 'Lookup failed' });
  }
  if (!shipment) {
    await saveLastWebhook({ ok: false, shipmentId: hint.shipmentId, error: 'Easyship has no such shipment.' });
    return res.status(200).json({ ok: true, ignored: 'unknown shipment' });
  }

  const orders = (await Promise.all(dateKeysForRange('45d').map((key) => getOrders(key)))).flat();
  const orderNumber = shipment.order_data?.platform_order_number || shipment.platform_order_number || null;
  const order = orders.find((o) => orderNumber && String(o.id) === String(orderNumber))
    || orders.find((o) => o.easyship?.shipmentId === hint.shipmentId);
  if (!order) {
    await saveLastWebhook({ ok: false, shipmentId: hint.shipmentId, error: `No order here matches shipment ${hint.shipmentId}${orderNumber ? ` (order ${orderNumber})` : ''}.` });
    return res.status(200).json({ ok: true, ignored: 'no matching order' });
  }

  const fromApi = trackingFromShipment(shipment);
  const trackingNumber = fromApi.trackingNumber || hint.trackingNumber;
  if (!trackingNumber) {
    await saveLastWebhook({ ok: false, shipmentId: hint.shipmentId, orderId: order.id, error: 'No tracking number on the shipment yet.' });
    return res.status(200).json({ ok: true, ignored: 'no tracking yet' });
  }
  if (order.trackingNumber === trackingNumber) {
    return res.status(200).json({ ok: true, status: 'already shipped' });
  }

  const carrier = carrierLabel(fromApi.carrier);
  try {
    const result = await markOrderShipped(order.id, {
      carrier,
      trackingNumber,
      trackingUrl: fromApi.trackingUrl || hint.trackingUrl || trackingUrlFor(fromApi.carrier, trackingNumber),
      source: 'easyship',
    });
    await saveLastWebhook({ ok: true, shipmentId: hint.shipmentId, orderId: order.id, trackingNumber, carrier, emailSent: Boolean(result?.emailSent) });
    return res.status(200).json({ ok: true, status: 'shipped' });
  } catch (err) {
    await saveLastWebhook({ ok: false, shipmentId: hint.shipmentId, orderId: order.id, error: err.message });
    return res.status(500).json({ error: err.message });
  }
}
