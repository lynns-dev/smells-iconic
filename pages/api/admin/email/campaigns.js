import { getCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign } from '../../../../lib/campaignsStore';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const campaigns = await getCampaigns();
      return res.status(200).json({ campaigns });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { subject, fromName, html, segment } = req.body || {};
    if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required.' });
    if (!html || !html.trim()) return res.status(400).json({ error: 'Email body is required.' });
    try {
      const campaign = await createCampaign({ subject: subject.trim(), fromName: fromName?.trim() || 'Smells Iconic', html, segment });
      return res.status(200).json({ campaign });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    const { id, subject, fromName, html, segment } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Campaign id is required.' });
    try {
      const existing = await getCampaign(id);
      if (existing && existing.status !== 'draft') {
        return res.status(400).json({ error: 'Only draft campaigns can be edited.' });
      }
      const campaign = await updateCampaign(id, { subject, fromName, html, segment });
      return res.status(200).json({ campaign });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Campaign id is required.' });
    try {
      const campaigns = await deleteCampaign(id);
      return res.status(200).json({ campaigns });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', 'GET, POST, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
