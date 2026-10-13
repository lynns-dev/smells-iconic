// Everyone who has given the store a way to reach them: the newsletter form,
// the contact/delivery fields at checkout (even if they never paid), and
// completed orders. One record per email (or per phone when there's no
// email), merged as more is learned. Shown in admin's Subscribers tab, which
// works out customer / abandoned-checkout status by matching orders.
//
// Stored in one KV hash (HSET subscribers <key> <json>), so the whole list
// is one read. No expiry — this is the store's contact list.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const HASH = 'subscribers';

async function redis(command) {
  if (!KV_URL || !KV_TOKEN) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'KV command failed.');
  return data.result;
}

function clip(value, max) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

export function normalizeEmail(value) {
  const e = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200 ? e : null;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

// contact: { email, phone, name, consent, source, cart, address, seenAt }
// seenAt: when this actually happened (backfilled orders); defaults to now.
// source: 'newsletter' | 'cart' (cart drawer's unlock-a-discount form) | 'checkout' | 'order'
export async function upsertSubscriber(contact) {
  const email = normalizeEmail(contact.email);
  const phone = normalizePhone(contact.phone);
  if (!email && !phone) return null;
  const key = email || `phone:${phone}`;
  const raw = await redis(['HGET', HASH, key]);
  let s = {};
  try { s = raw ? JSON.parse(raw) : {}; } catch { s = {}; }
  const now = contact.seenAt || new Date().toISOString();
  const source = ['newsletter', 'cart', 'checkout', 'order'].includes(contact.source) ? contact.source : 'checkout';
  const next = {
    ...s,
    key,
    email: email || s.email || null,
    phone: phone || s.phone || null,
    name: clip(contact.name, 80) || s.name || null,
    city: clip(contact.address?.city, 60) || s.city || null,
    state: clip(contact.address?.state, 20) || s.state || null,
    firstSeen: s.firstSeen && s.firstSeen < now ? s.firstSeen : now,
    lastSeen: s.lastSeen && s.lastSeen > now ? s.lastSeen : now,
    sources: [...new Set([...(s.sources || []), source])],
    // Once someone opts in they stay opted in until they unsubscribe; an
    // unticked box on a later checkout doesn't silently opt them out.
    consent: Boolean(s.consent || contact.consent === true || source === 'newsletter' || source === 'cart'),
  };
  if (source === 'checkout') {
    next.lastCheckoutAt = now;
    if (Array.isArray(contact.cart) && contact.cart.length) {
      next.cart = contact.cart.slice(0, 10).map((i) => ({
        id: clip(String(i.id || ''), 60), name: clip(String(i.name || ''), 80), quantity: Number(i.quantity) || 1, price: Number(i.price) || 0,
      }));
    }
  }
  await redis(['HSET', HASH, key, JSON.stringify(next)]);
  return next;
}

export async function getSubscribers() {
  const flat = (await redis(['HGETALL', HASH])) || [];
  // Upstash returns HGETALL as [field, value, field, value, ...].
  const list = [];
  for (let i = 1; i < flat.length; i += 2) {
    try { list.push(JSON.parse(flat[i])); } catch { /* skip malformed */ }
  }
  return list;
}

export async function setSubscriberConsent(key, consent) {
  const raw = await redis(['HGET', HASH, key]);
  if (!raw) return null;
  const s = { ...JSON.parse(raw), consent: Boolean(consent), ...(consent ? {} : { unsubscribedAt: new Date().toISOString() }) };
  await redis(['HSET', HASH, key, JSON.stringify(s)]);
  return s;
}
