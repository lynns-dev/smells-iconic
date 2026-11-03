// Captures the checkout page's email + marketing consent so the
// abandoned_checkout automation can follow up. Consent-gated: without
// `consent` true nothing is created or tracked, since an abandoned-checkout
// email is itself a marketing send. Called by lib/emailPlatform.js's
// captureCheckoutEmail from this store's own checkout pages.

import { addSubscriberManually, recordCheckoutStarted } from '../../../lib/email/subscribersStore';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 25;

// Untrusted client input — cap the array and keep only the fields
// lib/email/emailBlocks.js's renderCartItemsHtml uses, coerced to type.
function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_ITEMS).map((item) => ({
    id: String(item?.id ?? ''),
    name: String(item?.name ?? 'Item').slice(0, 200),
    quantity: Number(item?.quantity) || 1,
    price: item?.price != null ? Number(item.price) || 0 : null,
    image: item?.image ? String(item.image).slice(0, 500) : null,
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { email, consent, cartValue, items } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email).trim())) return res.status(400).json({ error: 'Invalid email.' });
  if (!consent) return res.status(200).json({ ok: true, skipped: 'no consent' });

  try {
    await addSubscriberManually(email, 'checkout').catch((err) => console.error('Subscriber add failed (checkout):', err.message));
    await recordCheckoutStarted(email, Number(cartValue) || 0, sanitizeItems(items));
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
