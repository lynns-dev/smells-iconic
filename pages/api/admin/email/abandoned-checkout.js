// Send numbers for this store's abandoned-checkout email (lib/abandonedCheckout.js),
// which runs on its own cron rather than as an editable flow — shown
// read-only in admin → Email → Automations. Counted from each contact's
// automationsSent log (lib/subscribersStore.js markAbandonedEmailSent).

import { getSubscribers } from '../../../../lib/subscribersStore';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const contacts = await getSubscribers();
    const since = Date.now() - WEEK_MS;
    let sentTotal = 0;
    let sent7d = 0;
    let lastSentAt = null;
    for (const c of contacts) {
      for (const e of c.automationsSent || []) {
        if (!/abandoned/i.test(e.flow || '')) continue;
        sentTotal += 1;
        const at = Date.parse(e.sentAt);
        if (at >= since) sent7d += 1;
        if (!lastSentAt || at > Date.parse(lastSentAt)) lastSentAt = e.sentAt;
      }
    }
    return res.status(200).json({
      enabled: Boolean(process.env.CRON_SECRET && process.env.RESEND_API_KEY),
      subject: 'You left something behind',
      sent7d,
      sentTotal,
      lastSentAt,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
