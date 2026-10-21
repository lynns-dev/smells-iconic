// Admin → Subscribers "Send test reminder": sends the abandoned-checkout email
// (lib/abandonedCheckout.js) with a sample cart to any address, to check
// Resend is set up and see what customers get. Doesn't touch the contact list.

import { renderAbandonedEmail, sendViaResend } from '../../../lib/abandonedCheckout';
import { normalizeEmail } from '../../../lib/subscribersStore';
import { getFeaturedProducts } from '../../../lib/products';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const to = normalizeEmail(req.body?.to);
  if (!to) return res.status(400).json({ error: 'Enter a valid email address.' });
  const cart = getFeaturedProducts().slice(0, 2).map((p, i) => ({ id: p.id, name: p.name, price: p.price, quantity: i + 1 }));
  try {
    const email = renderAbandonedEmail({ key: `test:${to}`, name: '', cart });
    const id = await sendViaResend({ to, ...email, subject: `[Test] ${email.subject}` });
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
