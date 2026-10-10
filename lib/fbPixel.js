// Meta Pixel — client-side event firing. Paired with server-side
// Conversions API calls (lib/metaCapi.js) via a shared event_id so Meta
// dedupes a pixel+CAPI pair instead of double-counting the same action.
// Wiring: PageView/init in pages/_app.jsx, ViewContent in
// pages/product/[id].jsx, AddToCart in lib/useCart.js, InitiateCheckout in
// pages/checkout.jsx, Purchase in pages/success.jsx.

import { getIdentity } from './identity';
import { getSessionId } from './session';

export function generateEventId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Advanced Matching — the identifiers Meta attaches to every browser-side
// event. Without these the Pixel matches on cookies alone, which is what
// Events Manager reports as missing External ID / Email / Phone.
//
// Values are passed in plain form on purpose: fbevents.js normalizes and
// SHA-256 hashes each one in the browser before anything is sent, so the
// raw value never leaves the device. (Pre-hashing here would double-hash
// and silently match nothing.) external_id is the exception Meta calls out
// — it's a random per-session id, not personal data, and is sent as-is.
function advancedMatching() {
  const { email, phone } = getIdentity();
  const externalId = getSessionId();
  return {
    ...(email ? { em: email } : {}),
    ...(phone ? { ph: phone } : {}),
    ...(externalId ? { external_id: externalId } : {}),
  };
}

// Re-init with whatever is known now. Meta supports calling init again on
// the same pixel id to widen the matching data, so this is how an email
// typed at checkout starts riding along on subsequent events in the same
// visit rather than only being picked up on the next page load.
export function refreshPixelIdentity(pixelId) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function' || !pixelId) return;
  window.fbq('init', pixelId, advancedMatching());
}

export function loadPixel(pixelId) {
  if (typeof window === 'undefined' || !pixelId || window.fbq) return;

  const n = function (...args) {
    n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
  };
  window.fbq = n;
  window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);

  n('init', pixelId, advancedMatching());
}

export function fbTrack(eventName, params, eventId) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  window.fbq('track', eventName, params || {}, eventId ? { eventID: eventId } : undefined);
}
