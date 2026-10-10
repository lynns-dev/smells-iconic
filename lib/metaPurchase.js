// Every paid order is reported to Meta as a server-side Purchase, and the
// outcome is kept on the order itself (order.meta) so nothing is lost
// silently: lib/orderFulfillment.js sends it at checkout, and
// pages/api/meta/resend-purchases.js (hourly cron) retries any order Meta
// didn't accept.
//
// Deduplication: the event_id is the same one the browser Pixel's Purchase
// on /success used, so Meta counts a pixel+server pair once; an order with
// no browser event id gets a stable `order_<id>` instead. A retry only ever
// resends an order whose earlier send was never accepted, and always with
// the same event_id, so it can't add a second Purchase for the same order.
//
// action_source is "website" for every order placed since order.meta was
// added — they're website orders, and that's what lets Meta dedupe them
// against the Pixel. The one exception is admin's per-order "Send to Meta"
// button (pages/api/admin/order-meta.js) on older orders saved without
// the shopper's user agent or page URL: Meta requires both for website
// events and may discard events missing them, so those go as "other"
// instead, still matched to the buyer by hashed email/phone (and the ad
// click id, where the order recorded one).

import { sendCapiEvent, buildUserData } from './metaCapi';
import { parseFbc, buildFbc } from './metaClickId';

// Meta rejects website events whose event_time is more than 7 days old; a
// small margin keeps a retry from racing that cutoff.
export const RESEND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000;
export const MAX_ATTEMPTS = 24;

// What's stored on the order for a later resend: the event id plus the
// shopper's own match data (IP, user agent, _fbp/_fbc) captured from the
// checkout request, since a retry's own request is the cron's, not theirs.
export function initialMetaRecord({ orderId, eventId, url, browser, sessionId }) {
  return {
    eventId: eventId || `order_${orderId}`,
    url: url || null,
    browser: browser || null,
    sessionId: sessionId || null,
    sent: false,
    attempts: 0,
  };
}

// For an order saved before order.meta existed (see the header comment).
export function backfillMetaRecord(order) {
  return {
    eventId: `order_${order.id}`,
    actionSource: 'other',
    url: null,
    browser: null,
    sessionId: null,
    sent: false,
    attempts: 0,
    backfilled: true,
  };
}

// The click ID for an order whose request didn't carry the _fbc cookie,
// taken from what the browser recorded with the order (lib/attribution.js):
// the stored click ID itself where there is one, otherwise Meta's fbc format
// rebuilt from the fbclid on the order's ad touch. The timestamp is when the
// click was seen, which is what Meta asks for — falling back to the order
// time only for orders saved before that was recorded.
export function fbcFromAttribution(order) {
  const attr = order.attribution;
  if (!attr) return null;
  const stored = parseFbc(attr.fbc);
  if (stored) return buildFbc(stored.fbclid, stored.at);
  if (!attr.fbclid) return null;
  const orderTime = new Date(order.createdAt || Date.now()).getTime();
  const seenAt = Date.parse(attr.capturedAt);
  const at = Number.isFinite(seenAt) && seenAt <= orderTime ? seenAt : orderTime;
  return `fb.1.${at}.${attr.fbclid}`;
}

// Sends the Purchase for an order and resolves to its updated meta record.
// Never throws.
export async function sendOrderPurchase(order, meta) {
  const items = order.items || [];
  const actionSource = meta.actionSource || 'website';
  const browser = { ...(meta.browser || {}) };
  if (!browser.fbc) browser.fbc = fbcFromAttribution(order);
  const result = await sendCapiEvent({
    eventName: 'Purchase',
    eventId: meta.eventId,
    actionSource,
    eventSourceUrl: actionSource === 'website' ? (meta.url || undefined) : undefined,
    eventTime: Math.floor(new Date(order.createdAt || Date.now()).getTime() / 1000),
    userData: buildUserData(browser, {
      email: order.email,
      phone: order.shipping?.phone,
      externalId: meta.sessionId || undefined,
    }),
    customData: {
      currency: 'USD',
      value: order.amount,
      // order_id, content_type, and num_items were the gap Meta's own
      // Purchase-event diagnostic flagged (a low match/parameter-
      // completeness score) — order_id in particular also lets Meta dedupe
      // against Shop/catalog-sourced orders of the same purchase, not just
      // against this event's own pixel/CAPI pair.
      order_id: order.id,
      content_type: 'product',
      content_ids: items.map((i) => i.id),
      contents: items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
      num_items: items.reduce((sum, i) => sum + i.quantity, 0),
    },
  });
  return {
    ...meta,
    sent: result.ok,
    attempts: (meta.attempts || 0) + 1,
    ...(result.ok ? { sentAt: new Date().toISOString(), lastError: null } : { lastError: result.error || 'unknown error' }),
  };
}
