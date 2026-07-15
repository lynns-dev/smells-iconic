// GET is what mail-client link-scanners / image prefetchers (the same
// Apple Mail Privacy Protection behavior that poisons open tracking) might
// hit automatically — so GET never unsubscribes on its own, it just sends
// a human to the confirmation page. POST is the RFC 8058 one-click target
// mail clients (Gmail, Yahoo, Apple Mail) call when a person clicks their
// built-in "Unsubscribe" button, and is also what the confirmation page's
// button calls — both cases are a real user action, so POST unsubscribes
// immediately with no further confirmation, per spec.

import { unsubscribeByToken } from '../../../lib/subscribersStore';

export default async function handler(req, res) {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'Missing token.' });

  if (req.method === 'GET') {
    return res.redirect(302, `/unsubscribe?token=${encodeURIComponent(String(token))}`);
  }

  if (req.method === 'POST') {
    try {
      const subscriber = await unsubscribeByToken(String(token));
      if (!subscriber) return res.status(404).json({ error: 'Subscriber not found.' });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
