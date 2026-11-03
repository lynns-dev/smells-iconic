import { createDomain, getDomainStatus } from '../../../../lib/email/resendIdentity';
import { getSettings, updateSettings } from '../../../../lib/email/settingsStore';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { domain } = req.body || {};
    if (!domain || !domain.trim()) return res.status(400).json({ error: 'Domain is required.' });
    try {
      const result = await createDomain(domain.trim());
      await updateSettings({ sendingDomain: result.domain, sendingDomainId: result.id });
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'GET') {
    try {
      const settings = await getSettings();
      const envConfigured = { webhookSecret: Boolean(process.env.RESEND_WEBHOOK_SECRET) };
      if (!settings.sendingDomainId) return res.status(200).json({ domain: null, envConfigured });
      const result = await getDomainStatus(settings.sendingDomainId).catch((err) => ({ domain: settings.sendingDomain, error: err.message }));
      return res.status(200).json({ ...result, envConfigured });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
