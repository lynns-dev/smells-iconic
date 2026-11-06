// Automated texts (lib/sms/runSmsAutomations.js) — every 15 minutes via
// Vercel Cron (vercel.json). Same CRON_SECRET guard as the email crons.
import { runSmsAutomations } from '../../../lib/sms/runSmsAutomations';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET is not set.' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Not authorized.' });
  try {
    return res.status(200).json({ ok: true, ...(await runSmsAutomations()) });
  } catch (err) {
    console.error('SMS automations failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
