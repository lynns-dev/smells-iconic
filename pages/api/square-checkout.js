// Charges a Square payment token via the Payments API.
//
// Like the QuickBooks integration it replaces, a Square card charge
// completes synchronously in this same request/response — no redirect,
// no webhook — so fulfillment happens directly here.

import { chargeCard } from '../../lib/squareServer';
import { fulfillOrder } from '../../lib/orderFulfillment';
import { sendPushToAdmins } from '../../lib/webPush';

// Same flat shape used by every other checkout path on this site and
// rendered in the admin Orders tab ({ name, address, apt, city, state,
// zip, phone }).
//
// `name` is the field the checkout form sends now (components/
// AddressFields.jsx collapsed First/Last into one input), but the older
// firstName/lastName pair is still accepted: a checkout resumed from
// sessionStorage saved before that change, and Apple Pay contacts (which
// carry givenName/familyName natively), both still arrive in that shape.
function normalizeFormShipping(shipping) {
  if (!shipping?.address || !shipping?.city) return null;
  return {
    name: (shipping.name || `${shipping.firstName || ''} ${shipping.lastName || ''}`).trim(),
    address: shipping.address,
    apt: shipping.apt || '',
    city: shipping.city,
    state: shipping.state || '',
    zip: shipping.zip || '',
    phone: shipping.phone || '',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, amount, items, email, shipping, eventId, url, paymentMethod, attribution, sessionId } = req.body;

    if (!token) return res.status(400).json({ error: 'Missing card token' });
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (!items || items.length === 0) return res.status(400).json({ error: 'No items in cart' });

    const charge = await chargeCard(token, amount, { buyerEmail: email || undefined }).catch((error) => {
      error.fromCharge = true;
      throw error;
    });

    await fulfillOrder({
      id: charge.id,
      amount: Number(amount),
      items,
      eventId,
      url,
      req,
      paymentMethod: paymentMethod || 'Square',
      attribution,
      email: email || '',
      shipping: normalizeFormShipping(shipping),
      processor: 'square',
      sessionId,
    });

    return res.status(200).json({ id: charge.id, status: charge.status });
  } catch (error) {
    console.error('Square Payments error:', error);
    // A declined or mistyped card is the shopper's to fix and is just shown
    // to them. Anything else — Square refusing the charge for a reason on
    // the store's side (credentials revoked, account or location not able
    // to take payments, Square itself failing) — means every shopper is
    // being turned away, so the store's admins are told straight away
    // instead of finding out from a day with no orders. Best-effort: the
    // alert can never change what the shopper is told.
    if (error.fromCharge && error.squareCategory !== 'PAYMENT_METHOD_ERROR') {
      await sendPushToAdmins({
        title: 'Square could not take a payment',
        body: `${String(error.message || 'Unknown error').slice(0, 140)} — card checkout may be down.`,
        url: '/admin',
      }).catch((err) => console.error('Square failure alert not sent:', err.message));
    }
    return res.status(500).json({ error: error.message });
  }
}
