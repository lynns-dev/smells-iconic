// Records cart activity for a shopper this device already knows the email
// of (lib/identity.js), so the add_to_cart automation can follow up on a
// cart that never reached checkout. Called by lib/emailPlatform.js's
// reportCartActivity from lib/useCart.js. Only acts on people already on
// the email list (subscribersStore.updateCartActivity no-ops otherwise),
// so it never adds anyone or changes their consent. Fire-and-forget.

import { updateCartActivity } from '../../../lib/email/subscribersStore';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 25;

// Untrusted client input — same shape and limits as checkout-capture.js.
function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_ITEMS).map((item) => ({
    id: String(item?.id ?? '').slice(0, 100),
    name: String(item?.name ?? 'Item').slice(0, 200),
    quantity: Math.max(1, Math.min(99, Number(item?.quantity) || 1)),
    price: item?.price != null ? Number(item.price) || 0 : null,
    image: item?.image ? String(item.image).slice(0, 500) : null,
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const { email, items } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email).trim())) return res.status(204).end();
  const clean = sanitizeItems(items);
  const value = clean.reduce((sum, i) => sum + (Number(i.price) || 0) * i.quantity, 0);
  try {
    await updateCartActivity(email, value, clean);
  } catch (err) {
    console.error('Cart activity capture failed:', err.message);
  }
  return res.status(204).end();
}
