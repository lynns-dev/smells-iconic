// Sends any campaign whose scheduledAt has arrived. Separate from
// pages/api/cron/automations.js since scheduling wants much finer
// granularity than the daily automations sweep — see DEPLOYMENT.md for
// why this route in particular wants an hourly (or better) external
// pinger on Vercel's Hobby plan: a campaign scheduled for a specific time
// landing up to a day late defeats the point of scheduling it.

import { getCampaigns } from '../../../lib/email/campaignsStore';
import { sendCampaign } from '../../../lib/email/emailSend';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Not authorized.' });
  }

  try {
    const campaigns = await getCampaigns();
    const due = campaigns.filter((c) => c.status === 'scheduled' && c.scheduledAt && c.scheduledAt <= Date.now());

    const results = [];
    for (const campaign of due) {
      try {
        const result = await sendCampaign(campaign.id);
        results.push({ id: campaign.id, ...result });
      } catch (err) {
        results.push({ id: campaign.id, error: err.message });
      }
    }

    return res.status(200).json({ ok: true, sent: results.length, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
