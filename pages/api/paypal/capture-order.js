// Captures an approved PayPal order and runs the same post-purchase
// fulfillment as the QuickBooks card flow. Shipping address and email come
// from PayPal's own capture response, not the on-page form — a customer
// using the express PayPal button may never have typed anything into the
// Contact/Delivery section, since PayPal collects that from their account.

import { captureOrder } from '../../../lib/paypal';
import { fulfillOrder } from '../../../lib/orderFulfillment';

function addressFromCapture(data) {
  const unit = data.purchase_units?.[0];
  const addr = unit?.shipping?.address;
  if (!addr) return null;
  return {
    firstName: unit.shipping?.name?.full_name || '',
    lastName: '',
    address: addr.address_line_1 || '',
    apt: addr.address_line_2 || '',
    city: addr.admin_area_2 || '',
    state: addr.admin_area_1 || '',
    zip: addr.postal_code || '',
    phone: '',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderId, items, eventId, url, attribution, paymentMethod, sessionId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'Missing PayPal order id' });
    if (!items || items.length === 0) return res.status(400).json({ error: 'No items in cart' });

    const data = await captureOrder(orderId);
    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];

    if (!capture || capture.status !== 'COMPLETED') {
      return res.status(402).json({ error: `PayPal payment not completed (${capture?.status || 'unknown'})` });
    }

    const amount = Number(capture.amount.value);
    const email = data.payer?.email_address || '';
    const shipping = addressFromCapture(data);

    await fulfillOrder({ id: data.id, amount, items, eventId, url, req, paymentMethod: paymentMethod || 'PayPal', attribution, email, shipping, processor: 'paypal', sessionId });

    return res.status(200).json({ id: data.id, status: capture.status, amount, email, shipping });
  } catch (err) {
    console.error('PayPal capture-order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
