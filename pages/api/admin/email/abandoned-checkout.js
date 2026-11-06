// Send numbers for this store's abandoned-checkout email (lib/abandonedCheckout.js),
// which runs on its own cron rather than as an editable flow — shown
// read-only in admin → Email → Automations. Counted from each contact's
// automationsSent log (lib/subscribersStore.js markAbandonedEmailSent).

import { getAbandonedStats } from '../../../../lib/abandonedStats';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const stats = await getAbandonedStats();
    return res.status(200).json({
      enabled: Boolean(process.env.CRON_SECRET && process.env.RESEND_API_KEY),
      subject: 'You left something behind',
      ...stats,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
