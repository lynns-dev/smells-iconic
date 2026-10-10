// Meta Conversions API — server-side event sends, paired with the browser
// Pixel (lib/fbPixel.js) via a shared event_id so Meta dedupes a pixel+CAPI
// pair instead of double-counting. Wired into pages/api/track/event.js
// (AddToCart, InitiateCheckout) and lib/orderFulfillment.js (Purchase).

import crypto from 'crypto';

// Meta retires Marketing API versions on a schedule (v19.0, which this used
// to call, was retired Feb 2025; everything before v24.0 on June 9, 2026),
// and a call to a retired version can be rejected outright — silently
// losing every server-side event. Overridable with META_GRAPH_API_VERSION
// so the next bump doesn't need a code change; check
// developers.facebook.com/docs/graph-api/changelog/versions.
export const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || 'v25.0';

// Last accepted / last failed send, kept in KV so admin's dashboard can
// show whether Meta is actually receiving server events (Events Manager's
// "data freshness" goes blank when it isn't). Best-effort: a KV hiccup
// never affects the event send itself.
const STATUS_KEY = { ok: 'meta_capi:last_ok', error: 'meta_capi:last_error' };

async function recordStatus(kind, payload) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/set/${STATUS_KEY[kind]}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...payload, at: new Date().toISOString(), graphVersion: GRAPH_VERSION }),
    });
  } catch {
    // best-effort — see above
  }
}

export async function getCapiStatus() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const read = async (key) => {
    if (!url || !token) return null;
    try {
      const res = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      return data.result ? JSON.parse(data.result) : null;
    } catch {
      return null;
    }
  };
  const [lastOk, lastError] = await Promise.all([read(STATUS_KEY.ok), read(STATUS_KEY.error)]);
  return {
    configured: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID && process.env.META_CAPI_ACCESS_TOKEN),
    graphVersion: GRAPH_VERSION,
    testMode: Boolean(process.env.META_CAPI_TEST_EVENT_CODE),
    lastOk,
    lastError,
  };
}

// Meta's own match-quality guidance: hash email/phone (lowercased/trimmed
// first — an unnormalized value hashes to a different digest and simply
// fails to match), never external_id (Events Manager explicitly flags it
// as "Not hashed — no hash required" since it's already a random,
// non-PII per-session id, not something identifying on its own).
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashEmail(email) {
  if (!email) return undefined;
  return sha256(email.trim().toLowerCase());
}

// Meta expects digits only, no symbols/leading '+', country code included —
// this store is US-only (AddressFields has no country selector), so a bare
// 10-digit number gets a '1' prepended; anything already longer is assumed
// to include its country code and is left alone.
function hashPhone(phone) {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return undefined;
  const withCountryCode = digits.length === 10 ? `1${digits}` : digits;
  return sha256(withCountryCode);
}

// Strips the wrappers proxies add — [::1]:443 brackets-and-port, a %eth0
// zone id — and unwraps IPv4-mapped IPv6 (::ffff:1.2.3.4), which is an IPv4
// address wearing a colon and must not be mistaken for a real IPv6 one.
function normalizeIp(raw) {
  let ip = String(raw || '').trim();
  const bracketed = ip.match(/^\[(.+)\](?::\d+)?$/);
  if (bracketed) ip = bracketed[1];
  // A bare "1.2.3.4:5678" — an IPv6 address has more than one colon, so a
  // single one here is always a port.
  else if ((ip.match(/:/g) || []).length === 1 && ip.includes('.')) ip = ip.split(':')[0];
  ip = ip.split('%')[0];
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped ? mapped[1] : ip;
}

function isIpv6(ip) {
  return ip.includes(':');
}

// Loopback, LAN, and link-local addresses identify a proxy hop rather than
// the shopper, so they're worthless to Meta as match data — and one of them
// arriving from req.socket would otherwise beat a real client IPv4 in the
// "prefer IPv6" check below and get sent instead.
function isRoutable(ip) {
  if (!ip) return false;
  if (isIpv6(ip)) return !/^(::1|fe80:|f[cd])/i.test(ip);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  return !/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

// Picks the client's real IP from every source Vercel/Next can offer, and
// prefers a routable IPv6 address when one's available among them — Meta's
// own Events Manager recommends IPv6 client_ip_address over IPv4 where
// possible (many mobile carriers are IPv6-only, so an IPv4-only proxy hop
// upstream of this app would otherwise silently discard that signal).
//
// Preference order: public IPv6, then public IPv4, then whatever's left, so
// a request that only ever sees a private address still sends something
// rather than nothing.
function pickClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const candidates = [
    ...(forwardedFor ? forwardedFor.split(',') : []),
    req.headers['x-real-ip'],
    req.socket?.remoteAddress,
  ]
    .filter(Boolean)
    .map(normalizeIp)
    .filter(Boolean);

  return (
    candidates.find((ip) => isIpv6(ip) && isRoutable(ip)) ||
    candidates.find(isRoutable) ||
    candidates[0] ||
    null
  );
}

// fbp/fbc cookies, IP, and user agent all improve Meta's match quality —
// none of this is sensitive PII, so no hashing is needed (unlike email/phone
// below). Split out from getRequestUserData so a Purchase can be stored on
// its order (lib/metaPurchase.js) and resent later with the shopper's own
// match data — the retry runs from a cron, whose own request says nothing
// about the buyer.
export function getBrowserContext(req) {
  const cookies = req?.cookies || {};
  return {
    clientIp: req ? pickClientIp(req) : null,
    userAgent: req?.headers?.['user-agent'] || null,
    fbp: cookies._fbp || null,
    fbc: cookies._fbc || null,
  };
}

// email/phone/externalId are optional — pass whatever's actually known at
// the call site (e.g. Purchase has them, a bare AddToCart usually doesn't)
// and this only includes the fields it actually got.
export function buildUserData(browser, { email, phone, externalId } = {}) {
  const em = hashEmail(email);
  const ph = hashPhone(phone);
  return {
    ...(browser?.clientIp ? { client_ip_address: browser.clientIp } : {}),
    ...(browser?.userAgent ? { client_user_agent: browser.userAgent } : {}),
    ...(browser?.fbp ? { fbp: browser.fbp } : {}),
    ...(browser?.fbc ? { fbc: browser.fbc } : {}),
    ...(em ? { em } : {}),
    ...(ph ? { ph } : {}),
    ...(externalId ? { external_id: externalId } : {}),
  };
}

export function getRequestUserData(req, identifiers) {
  return buildUserData(getBrowserContext(req), identifiers);
}

// Resolves to { ok, error } and never throws. eventTime (unix seconds)
// defaults to now; a resend passes the original purchase time instead —
// Meta rejects website events older than 7 days. actionSource defaults to
// 'website'; a backfill of orders saved without browser data uses 'other'
// (see lib/metaPurchase.js).
export async function sendCapiEvent({ eventName, eventId, eventSourceUrl, userData, customData, eventTime, actionSource = 'website' }) {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    console.error('NEXT_PUBLIC_META_PIXEL_ID / META_CAPI_ACCESS_TOKEN are not set — skipping CAPI event.');
    await recordStatus('error', { eventName, error: 'NEXT_PUBLIC_META_PIXEL_ID / META_CAPI_ACCESS_TOKEN are not set.' });
    return { ok: false, error: 'NEXT_PUBLIC_META_PIXEL_ID / META_CAPI_ACCESS_TOKEN are not set.' };
  }

  const body = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime || Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: actionSource,
        ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
        user_data: userData,
        custom_data: customData,
      },
    ],
  };
  const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE;
  if (testEventCode) body.test_event_code = testEventCode;

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('Meta CAPI event failed:', res.status, text);
      let message = text.slice(0, 300);
      try { message = JSON.parse(text)?.error?.message || message; } catch { /* not JSON */ }
      await recordStatus('error', { eventName, status: res.status, error: message });
      return { ok: false, error: message };
    }
    await recordStatus('ok', { eventName });
    return { ok: true };
  } catch (err) {
    console.error('Meta CAPI request failed:', err.message);
    await recordStatus('error', { eventName, error: err.message });
    return { ok: false, error: err.message };
  }
}
