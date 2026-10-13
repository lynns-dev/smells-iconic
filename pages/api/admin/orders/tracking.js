// Saves a shipment (carrier, tracking number, optional link) on an order
// from the Orders tab, which then shows it as shipped. Saving again
// replaces it; an empty tracking number clears it.

import { updateOrderStatus } from '../../../../lib/analyticsStore';

function clip(value, max) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { orderId, carrier, trackingNumber, trackingUrl } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'Missing order id' });
    const number = clip(trackingNumber, 80);
    const url = clip(trackingUrl, 500);
    if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Tracking link must start with http:// or https://' });
    const updated = await updateOrderStatus(orderId, number
      ? { trackingNumber: number, carrier: clip(carrier, 40), trackingUrl: url, shippedAt: new Date().toISOString() }
      : { trackingNumber: null, carrier: null, trackingUrl: null, shippedAt: null });
    if (!updated) return res.status(404).json({ error: 'Order not found' });
    return res.status(200).json({ order: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
