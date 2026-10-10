// Meta click ID (the `fbc` parameter) — shared by the browser and the server.
//
// When someone clicks a Meta ad, the landing URL carries `fbclid`. Meta wants
// that click ID back on every event, Purchase above all, as
// `fb.1.<time the click was seen, ms>.<fbclid>`: it is the strongest signal
// tying a sale to the ad that produced it, and it is what Events Manager's
// "Send Meta Click ID" recommendation is measuring.
//
// The Pixel stores it in a `_fbc` cookie itself, but that cookie alone loses
// the click in several ordinary situations:
//   - Safari/iOS caps cookies written by JavaScript at 7 days, and at 24
//     hours when the visit arrived through a tagged ad link — so a shopper
//     who clicks an ad and buys a few days later arrives at checkout with no
//     click ID at all.
//   - An ad blocker that stops fbevents.js stops the cookie being written.
//   - This site's own record of the click (lib/attribution.js) was replaced
//     by any later tagged visit, e.g. a link in one of our own emails.
//
// So the click is also kept in the site's own storage, and the cookie is
// re-issued by the server (pages/api/track/event.js), which browsers do not
// subject to the JavaScript-cookie cap.

export const FBC_COOKIE = '_fbc';

// Meta treats a click ID as expired after 90 days.
export const CLICK_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

// fbclid values are URL-safe tokens. Anything else is not written into a
// cookie (it would not be a real click ID, and it must never be able to
// break out of the Set-Cookie header).
const FBCLID_RE = /^[A-Za-z0-9_.-]{8,1000}$/;
const FBC_RE = /^fb\.\d\.(\d{10,13})\.([A-Za-z0-9_.-]{8,1000})$/;

export function isFbclid(value) {
  return typeof value === 'string' && FBCLID_RE.test(value);
}

// The click ID is passed through exactly as received — Meta rejects one
// that has been altered in any way, including its letter case.
export function buildFbc(fbclid, at = Date.now()) {
  if (!isFbclid(fbclid)) return null;
  return `fb.1.${Math.floor(Number(at) || Date.now())}.${fbclid}`;
}

// -> { fbclid, at } or null. `at` is always milliseconds.
export function parseFbc(fbc) {
  const match = typeof fbc === 'string' ? fbc.match(FBC_RE) : null;
  if (!match) return null;
  const stamp = Number(match[1]);
  return { fbclid: match[2], at: match[1].length <= 10 ? stamp * 1000 : stamp };
}

// A click that is neither expired nor dated in the future (Meta flags both).
export function isLiveClick(at, now = Date.now()) {
  return Number.isFinite(at) && at <= now + 5 * 60 * 1000 && now - at < CLICK_MAX_AGE_MS;
}

// The Pixel writes `_fbc` on the registrable domain (example.com, covering
// www.example.com). Ours has to land on the same one: a cookie with the same
// name on a different domain would sit beside the Pixel's rather than
// replace it. Returns null where a Domain attribute can't be used — local
// development and Vercel's preview hosts — which leaves the cookie on the
// exact host.
export function cookieDomainForHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/:\d+$/, '');
  if (!host || host === 'localhost' || host.includes(':') || /^[\d.]+$/.test(host) || !host.includes('.')) return null;
  if (host.endsWith('.vercel.app')) return null;
  return host.replace(/^www\./, '');
}

// The Set-Cookie header that (re)issues `_fbc` from the server, or null when
// the value isn't a live, well-formed click ID. Not HttpOnly: the Pixel has
// to read it to attach it to the browser's own events.
export function fbcSetCookieHeader(fbc, { hostname, secure = true, now = Date.now() } = {}) {
  const click = parseFbc(fbc);
  if (!click || !isLiveClick(click.at, now)) return null;
  const maxAge = Math.max(60, Math.floor((click.at + CLICK_MAX_AGE_MS - now) / 1000));
  const domain = cookieDomainForHost(hostname);
  return [
    `${FBC_COOKIE}=${buildFbc(click.fbclid, click.at)}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'SameSite=Lax',
    ...(domain ? [`Domain=${domain}`] : []),
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
