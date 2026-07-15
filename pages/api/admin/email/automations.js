import { getAutomations, updateAutomation } from '../../../../lib/automationsStore';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const automations = await getAutomations();
      return res.status(200).json({ automations });
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

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}
