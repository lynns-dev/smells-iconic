// Public, fire-and-forget funnel event tracking. Never throws in a way that
// would surface to the visitor — a lost analytics ping shouldn't affect
// their experience.

import { incrementEvent, logEvent } from '../../../lib/analyticsStore';
import { sendCapiEvent, getRequestUserData } from '../../../lib/metaCapi';
import { isExcludedTraffic } from '../../../lib/ipFilter';
import { fbcSetCookieHeader } from '../../../lib/metaClickId';

const ALLOWED = ['pageview', 'addtocart', 'checkout_start'];
// Logged to the timestamped recent-events feed for the live-activity view.
// pageview is excluded — too high-volume to be useful there.
const LOGGED = ['addtocart', 'checkout_start'];

// Maps our internal event names to Meta's standard event names for CAPI,
// paired with the browser Pixel call sharing the same eventId (see
// lib/useCart.js, pages/checkout.jsx) so Meta dedupes instead of
// double-counting.
const CAPI_EVENT_NAMES = { addtocart: 'AddToCart', checkout_start: 'InitiateCheckout' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const { event, productName, eventId, contentId, contentIds, contents, value, url, sessionId, email, phone, fbc } = req.body || {};

  // Re-issue the Meta click ID cookie from the server. The browser sends its
  // click ID on the first page view of a visit (pages/_app.jsx); setting the
  // same value back in a response header is what lets it outlive Safari's
  // 24-hour/7-day cap on cookies written by JavaScript, so it is still there
  // when the shopper comes back to buy — see lib/metaClickId.js.
  if (fbc) {
    const cookie = fbcSetCookieHeader(fbc, {
      hostname: req.headers.host,
      secure: String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() !== 'http',
    });
    if (cookie) res.setHeader('Set-Cookie', cookie);
  }
  if (ALLOWED.includes(event) && !isExcludedTraffic(req)) {
    try {
      await incrementEvent(event, sessionId);
      if (LOGGED.includes(event)) {
        await logEvent(event, {
          ...(productName ? { productName } : {}),
          ...(sessionId ? { sessionId } : {}),
        });
      }

      const capiEventName = CAPI_EVENT_NAMES[event];
      if (capiEventName && eventId) {
        await sendCapiEvent({
          eventName: capiEventName,
          eventId,
          eventSourceUrl: url,
          // email/phone ride along whenever the shopper has already given
          // them (lib/identity.js remembers them across the visit), so an
          // AddToCart or InitiateCheckout carries the same identifiers
          // Purchase does. They're hashed in getRequestUserData before sending.
          userData: getRequestUserData(req, {
            email,
            phone,
            externalId: sessionId || undefined,
          }),
          customData: {
            currency: 'USD',
            value,
            content_ids: contentIds || (contentId ? [contentId] : undefined),
            content_type: 'product',
            contents,
          },
        });
      }
    } catch (err) {
      console.error('Event tracking failed:', err);
    }
  }

  return res.status(204).end();
}
