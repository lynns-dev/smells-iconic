// Public, fire-and-forget funnel event tracking. Never throws in a way that
// would surface to the visitor — a lost analytics ping shouldn't affect
// their experience.

import { incrementEvent, logEvent, logVisitor } from '../../../lib/analyticsStore';
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

function clip(value, max) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

// Only well-formed, bounded values are stored — this is a public endpoint.
function cleanParams(params) {
  if (!params || typeof params !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(params).slice(0, 30)) {
    const k = clip(key, 60);
    const v = clip(String(value ?? ''), 300);
    if (k && v) out[k] = v;
  }
  return out;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// A readable "where they came from" label, from the URL parameters first
// (they say exactly which ad/link it was), then the referring site.
function sourceLabel(params, referrer, ownHost) {
  if (params.utm_source) return params.utm_source;
  if (params.fbclid) return 'Facebook/Instagram ad';
  if (params.gclid || params.gbraid || params.wbraid) return 'Google ad';
  if (params.ttclid) return 'TikTok ad';
  const host = hostOf(referrer);
  if (host && host !== ownHost) {
    if (/(^|\.)google\./.test(host)) return 'Google (organic)';
    if (/(^|\.)bing\./.test(host)) return 'Bing (organic)';
    if (/(facebook|instagram)\./.test(host)) return 'Facebook/Instagram';
    if (/tiktok\./.test(host)) return 'TikTok';
    if (/pinterest\./.test(host)) return 'Pinterest';
    return host;
  }
  return 'Direct';
}

function deviceLabel(ua) {
  if (!ua) return null;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone/iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Other';
}

function describeVisit(req, sessionId, visit) {
  const params = cleanParams(visit.params);
  const referrer = clip(visit.referrer, 500);
  const ownHost = String(req.headers.host || '').replace(/^www\./, '').replace(/:\d+$/, '');
  const city = req.headers['x-vercel-ip-city'];
  return {
    sessionId: clip(String(sessionId), 60),
    source: sourceLabel(params, referrer, ownHost),
    landing: clip(visit.landing, 200) || '/',
    referrer,
    params,
    city: city ? decodeURIComponent(city) : null,
    region: req.headers['x-vercel-ip-country-region'] || null,
    country: req.headers['x-vercel-ip-country'] || null,
    device: deviceLabel(req.headers['user-agent']),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const { event, productName, eventId, contentId, contentIds, contents, value, url, sessionId, email, phone, fbc, visit } = req.body || {};

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
      // First page of a visit: record where the visitor came from for
      // admin's Visitors tab (lib/analyticsStore.js logVisitor).
      if (event === 'pageview' && sessionId && visit && typeof visit === 'object') {
        await logVisitor(describeVisit(req, sessionId, visit));
      }
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
