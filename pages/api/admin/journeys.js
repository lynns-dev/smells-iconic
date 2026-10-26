// Admin's Paths tab: visitor paths to purchase as a counted tree
// (lib/journeys.js). GET ?days=7|30 &buyers=1 (only visitors who bought).
import { getJourneys, buildTree } from '../../../lib/journeys';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const days = [1, 7, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
    const journeys = await getJourneys(days);
    return res.status(200).json({ days, ...buildTree(journeys, { buyersOnly: req.query.buyers === '1' }) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
