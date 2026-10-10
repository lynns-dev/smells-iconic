// Shared post-payment side effects for every checkout path (Square card and
// wallet charges, Afterpay / Cash App Pay captures, PayPal, ...): order ledger entry, funnel counters, admin
// push notification, and the server-side Meta Purchase event. Failures here
// are logged but never thrown — a successful charge/capture must not be
// undone or reported as failed just because a notification write hiccuped.

import { recordOrder, incrementEvent, logEvent } from './analyticsStore';
import { sendPushToAdmins } from './webPush';
import { sendCapiEvent, getRequestUserData } from './metaCapi';

// Meta's own Pixel sets this first-party cookie the instant it sees fbclid
// in the URL, independent of our own client-side capture (lib/attribution.js)
// -- a useful fallback when that capture is missing or got lost (ad blocker
// delaying our script, a race on a very fast redirect, etc). Format is
// fb.<subdomain_index>.<creation_time>.<fbclid>. This can't fix the more
// common gap of someone clicking the ad in an in-app browser and buying
// later in a different one entirely — no first-party signal survives that
// hop, only Meta's own device/account-graph matching can.
function fallbackAttributionFromCookies(req) {
  const fbc = req?.cookies?._fbc;
  if (!fbc) return null;
  const parts = fbc.split('.');
  const fbclid = parts.length >= 4 ? parts.slice(3).join('.') : null;
  return fbclid ? { fbclid } : null;
}

export async function fulfillOrder({ id, amount, items, eventId, url, req, paymentMethod, attribution, email, shipping, processor, captureId }) {
  try {
    await recordOrder({
      id, amount, items,
      paymentMethod: paymentMethod || 'Unknown',
      attribution: attribution || fallbackAttributionFromCookies(req) || null,
      createdAt: new Date().toISOString(),
      email: email || '',
      shipping: shipping || null,
      processor: processor || null,
      captureId: captureId || null,
    });
    await incrementEvent('purchase');
    await logEvent('purchase', { amount });
    const itemCount = items.length;
    await sendPushToAdmins({
      title: 'New order',
      body: `$${Number(amount).toFixed(2)} — ${itemCount} item${itemCount === 1 ? '' : 's'}`,
      url: '/admin',
    });
    if (eventId) {
      await sendCapiEvent({
        eventName: 'Purchase',
        eventId,
        eventSourceUrl: url,
        userData: getRequestUserData(req),
        customData: {
          currency: 'USD',
          value: amount,
          content_ids: items.map((i) => i.id),
          contents: items.map((i) => ({ id: i.id, quantity: i.quantity })),
        },
      });
    }
  } catch (err) {
    console.error('Order/analytics recording failed:', err);
  }
}
