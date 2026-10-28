// Admin → Visitors "Send abandoned checkout email": sends one shopper the
// abandoned-checkout email (lib/abandonedCheckout.js) with their saved cart,
// right now, skipping the automatic email's timing rules. Still never mails
// someone who unsubscribed. Recorded like an automatic send, so the cron
// won't email the same checkout again.

import { renderAbandonedEmail, sendViaResend } from '../../../lib/abandonedCheckout';
import { getSubscriber, markAbandonedEmailSent, claimOnce } from '../../../lib/subscribersStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const s = await getSubscriber(req.body?.key);
    if (!s) return res.status(404).json({ error: 'No contact found for this visitor.' });
    if (!s.email) return res.status(400).json({ error: 'This visitor left a phone number but no email.' });
    if (s.unsubscribedAt && !s.consent) return res.status(400).json({ error: 'This shopper unsubscribed from emails.' });
    if (!s.cart?.length) return res.status(400).json({ error: 'No saved cart for this shopper.' });
    // Stops a double click sending two emails.
    if (!(await claimOnce(`abandoned_email_manual:${s.key}`, 60))) {
      return res.status(429).json({ error: 'Already sending — try again in a minute.' });
    }
    const email = renderAbandonedEmail({ key: s.key, name: s.name, cart: s.cart });
    await sendViaResend({ to: s.email, ...email });
    const saved = await markAbandonedEmailSent(s.key, s.lastCheckoutAt || s.abandonedEmailFor || null, email.subject, 'Abandoned checkout (sent manually)');
    return res.status(200).json({ ok: true, sentAt: saved?.abandonedEmailSentAt || new Date().toISOString() });
  } catch (err) {
    console.error('Manual abandoned-checkout email failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
