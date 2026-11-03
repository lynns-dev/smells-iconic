import { getAutomations, updateAutomation, syncAutomationDesign } from '../../../../lib/email/automationsStore';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const automations = await getAutomations();
      // The scheduled sender (pages/api/cron/email-automations.js) refuses
      // to run without these, so admin warns that "Enabled" flows aren't
      // actually going out.
      const sendingReady = { cronSecret: Boolean(process.env.CRON_SECRET), resendKey: Boolean(process.env.RESEND_API_KEY) };
      return res.status(200).json({ automations, sendingReady });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    const { id, enabled, steps } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Automation id is required.' });
    try {
      const patch = {};
      if (enabled !== undefined) patch.enabled = enabled;
      if (steps !== undefined) patch.steps = steps;
      const automation = await updateAutomation(id, patch);
      return res.status(200).json({ automation });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { action } = req.body || {};
    if (action !== 'sync-design') return res.status(400).json({ error: 'Unknown action.' });
    try {
      const automations = await syncAutomationDesign();
      return res.status(200).json({ automations });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', 'GET, PUT, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
