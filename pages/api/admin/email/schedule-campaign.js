import { getCampaign, updateCampaign } from '../../../../lib/email/campaignsStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, scheduledAt } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Campaign id is required.' });
  const timestamp = Number(scheduledAt);
  if (!timestamp || timestamp <= Date.now()) return res.status(400).json({ error: 'Pick a time in the future.' });

  try {
    const existing = await getCampaign(id);
    if (!existing) return res.status(404).json({ error: 'Campaign not found.' });
    if (existing.status !== 'draft') return res.status(400).json({ error: 'Only draft campaigns can be scheduled.' });

    const campaign = await updateCampaign(id, { status: 'scheduled', scheduledAt: timestamp });
    return res.status(200).json({ campaign });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
