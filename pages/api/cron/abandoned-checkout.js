// Every minute (vercel.json): emails shoppers who left checkout ~10 minutes
// ago without ordering. All the rules live in lib/abandonedCheckout.js.
//
// Guarded by CRON_SECRET — Vercel Cron sends `Authorization: Bearer
// <CRON_SECRET>` automatically.

import { runAbandonedCheckoutEmails } from '../../../lib/abandonedCheckout';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('Abandoned-checkout emails: CRON_SECRET is not set — refusing to run.');
    return res.status(500).json({ error: 'Not configured' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({ ok: false, skipped: 'RESEND_API_KEY is not set' });
  }
  try {
    const result = await runAbandonedCheckoutEmails();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('Abandoned-checkout emails failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
