// Shared post-payment side effects for every checkout path (Square card and
// wallet charges, Afterpay / Cash App Pay captures, PayPal, QuickBooks,
// Stripe): order ledger entry, funnel counters, admin push notification, and
// the server-side Meta Purchase event (lib/metaPurchase.js). Failures here
// are logged but never thrown — a successful charge/capture must not be
// undone or reported as failed just because a notification write hiccuped.

import { recordOrder, incrementEvent, logEvent, updateJourney, visitorIdForSession } from './analyticsStore';
import { sendPushToAdmins } from './webPush';
import { getBrowserContext } from './metaCapi';
import { initialMetaRecord, sendOrderPurchase } from './metaPurchase';
import { upsertSubscriber } from './subscribersStore';
import { easyshipConfig, sendOrderToEasyship } from './easyship';
import { recordJourneyStep, EVENT_LABELS } from './journeys';
import { nextOrderNumber } from './orderNumbers';
import { sendOrderConfirmationEmail } from './orderConfirmationEmail';
import { emailLogEntry } from './emailLog';

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

export async function fulfillOrder({ id, amount, items, eventId, url, req, paymentMethod, attribution, email, shipping, processor, captureId, sessionId, browser: capturedBrowser }) {
  // capturedBrowser: pass {} when the request isn't the shopper's own (the
  // Stripe webhook), so Stripe's server IP/user agent aren't sent to Meta as
  // the buyer's. Everywhere else the request comes from the shopper.
  const browser = capturedBrowser || getBrowserContext(req);
  // Short #1001-style number shown in admin and the customer's emails
  // (lib/orderNumbers.js). Null only if KV is unreachable.
  const orderNumber = await nextOrderNumber();
  const order = {
    id, orderNumber, amount, items,
    paymentMethod: paymentMethod || 'Unknown',
    attribution: attribution || fallbackAttributionFromCookies(req) || null,
    createdAt: new Date().toISOString(),
    email: email || '',
    shipping: shipping || null,
    processor: processor || null,
    captureId: captureId || null,
    status: 'paid',
  };

  // Sent before anything else and on its own, so a failure in the ledger or
  // notification work below can never stop Meta hearing about a real sale.
  // The outcome is saved on the order (order.meta); an order Meta didn't
  // accept is retried by pages/api/meta/resend-purchases.js.
  // Created as a shipment in Easyship (lib/easyship.js)
  // alongside the Meta Purchase; the outcome is saved on the order, and a
  // failed send is retried by pages/api/cron/easyship-retry.js. Skipped
  // until EASYSHIP_API_TOKEN is set. Never throws.
  // The order confirmation email (lib/orderConfirmationEmail.js) goes out
  // alongside them; its outcome is saved in the order's emailLog for admin
  // to see, and a failed send can be retried from the order. Never throws.
  const [meta, easyship, confirmation] = await Promise.all([
    sendOrderPurchase(order, initialMetaRecord({ orderId: id, eventId, url, browser, sessionId })),
    easyshipConfig().configured ? sendOrderToEasyship(order, {}) : null,
    email ? sendOrderConfirmationEmail({ order, idempotencyKey: `confirmation/${id}` }) : null,
  ]);

  try {
    await recordOrder({
      ...order,
      meta,
      easyship: easyship || null,
      emailLog: confirmation ? [emailLogEntry('order_confirmation', email, confirmation)] : [],
    });
    await incrementEvent('purchase');
    await logEvent('purchase', { amount });
    if (email || shipping?.phone) {
      await upsertSubscriber({ email, phone: shipping?.phone, name: shipping?.name, address: shipping, source: 'order' })
        .catch((err) => console.error('Contact list update failed:', err.message));
    }
    if (sessionId) {
      const visitorId = await visitorIdForSession(sessionId);
      await updateJourney(visitorId || sessionId, { purchased: { amount } });
      // Ends this visitor's path in admin's Paths tab (lib/journeys.js).
      if (visitorId) await recordJourneyStep(visitorId, { sessionId, label: EVENT_LABELS.purchase, value: amount });
    }
    const itemCount = items.length;
    await sendPushToAdmins({
      title: 'New order',
      body: `${orderNumber ? `#${orderNumber} · ` : ''}$${Number(amount).toFixed(2)} — ${itemCount} item${itemCount === 1 ? '' : 's'}`,
      url: '/admin',
    });
  } catch (err) {
    console.error('Order/analytics recording failed:', err);
  }
}
