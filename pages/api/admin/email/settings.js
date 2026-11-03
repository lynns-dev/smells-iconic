import { getSettings, updateSettings } from '../../../../lib/email/settingsStore';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const settings = await getSettings();
      return res.status(200).json({ settings });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    const { senderEmail, senderName, companyName, physicalAddress, logoUrl, emailFont } = req.body || {};
    try {
      const settings = await updateSettings({ senderEmail, senderName, companyName, physicalAddress, logoUrl, emailFont });
      return res.status(200).json({ settings });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}
