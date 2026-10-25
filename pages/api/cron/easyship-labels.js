// Every morning (vercel.json, 14:00 UTC = 7 am Pacific in summer, 6 am in
// winter): buys Easyship labels for the oldest orders in the queue, up to
// the daily limit, each only if its label is confirmed at or under the cap
// (lib/easyshipLabels.js). Does nothing until admin switches auto-buy on.

import { getAutobuySettings, autoBoughtToday, buyLabels } from '../../../lib/easyshipLabels';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('Easyship labels: CRON_SECRET is not set — refusing to run.');
    return res.status(500).json({ error: 'Not configured' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const settings = await getAutobuySettings();
    if (!settings.enabled) return res.status(200).json({ skipped: 'Auto-buy is off' });
    const remaining = settings.dailyLimit - (await autoBoughtToday());
    if (remaining <= 0) return res.status(200).json({ skipped: 'Daily limit already reached' });
    const summary = await buyLabels({ limit: remaining, trigger: 'auto', capUsd: settings.capUsd });
    return res.status(200).json(summary);
  } catch (err) {
    console.error('Easyship labels run failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
