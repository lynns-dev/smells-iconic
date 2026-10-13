import { getOrders, dateKeysForRange } from '../../../lib/analyticsStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Everything kept in the order ledger (45 days), newest first, for the
    // Orders tab — it filters by date range, status and search itself.
    const perDay = await Promise.all(dateKeysForRange('45d').map((key) => getOrders(key)));
    const orders = perDay.flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 1000);
    return res.status(200).json({ orders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
