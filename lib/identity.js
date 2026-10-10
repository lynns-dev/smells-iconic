// What we know about the person browsing, for ad-match quality.
//
// Meta scores an event on how many identifiers it carries. Until now the
// browser Pixel sent none at all (see lib/fbPixel.js — `fbq('init')` was
// called with no Advanced Matching object), and the server-side CAPI events
// carried email/phone only on Purchase. So every AddToCart, InitiateCheckout
// and PageView went out effectively anonymous, which is what Events Manager
// keeps flagging.
//
// This is the single place that remembers a shopper's email and phone once
// they've typed them, so every later event on this device can carry them.
//
// Scope and privacy:
//   - Stored in localStorage on the shopper's own device — their own contact
//     details, which they entered themselves, not data about anyone else.
//   - Cleared by clearIdentity() so a shared device can be reset.
//   - Values are kept in plain form here because Meta's Pixel hashes
//     Advanced Matching client-side before it sends anything, and the server
//     hashes with SHA-256 before it sends anything (lib/metaCapi.js). The
//     plain value never leaves the device.

const KEY = 'si-identity';

function read() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

// Meta matches on a normalized value — an unnormalized one hashes to a
// different digest and simply fails to match, so normalize once, here,
// rather than at each call site.
function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value.includes('@') ? value : '';
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  // US-only store, so a bare 10-digit number gets its country code; anything
  // longer is assumed to already carry one.
  return digits.length === 10 ? `1${digits}` : digits;
}

export function getIdentity() {
  const stored = read();
  return {
    email: stored.email || '',
    phone: stored.phone || '',
  };
}

// Merges in whatever is now known, keeping anything already stored — a
// shopper who gives an email on one visit and a phone on the next ends up
// with both. Ignores blank and unparseable values rather than overwriting
// good data with them.
export function rememberIdentity({ email, phone } = {}) {
  if (typeof window === 'undefined') return getIdentity();
  const next = read();
  const cleanEmail = normalizeEmail(email);
  const cleanPhone = normalizePhone(phone);
  if (cleanEmail) next.email = cleanEmail;
  if (cleanPhone) next.phone = cleanPhone;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures (private browsing quota)
  }
  return { email: next.email || '', phone: next.phone || '' };
}

export function clearIdentity() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
