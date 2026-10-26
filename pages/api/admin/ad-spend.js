// Admin dashboard's Ad spend section: this store's Meta ad spend for a
// range (lib/metaAds.js), next to the store's own revenue and order count
// for the same days, so return on ad spend is one glance.
// GET ?range=today|yesterday|7d|30d
import { getCampaignSpend } from '../../../lib/metaAds';
import { getOrders, dateKeysForRange } from '../../../lib/analyticsStore';

const RANGES = new Set(['today', 'yesterday', '7d', '30d']);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const range = RANGES.has(req.query.range) ? req.query.range : '7d';
  const keys = dateKeysForRange(range);
  const since = keys[keys.length - 1];
  const until = keys[0];

  let store = { revenue: 0, orders: 0 };
  try {
    const orders = (await Promise.all(keys.map((k) => getOrders(k)))).flat()
      .filter((o) => o.status !== 'cancelled' && o.status !== 'refunded');
    store = {
      revenue: Math.round(orders.reduce((n, o) => n + Number(o.amount || 0), 0) * 100) / 100,
      orders: orders.length,
    };
  } catch (err) {
    console.error('Ad spend: could not read orders:', err.message);
  }

  try {
    const meta = await getCampaignSpend(since, until);
    return res.status(200).json({ range, since, until, store, ...meta });
  } catch (err) {
    return res.status(200).json({ range, since, until, store, configured: true, error: err.message });
  }
}
