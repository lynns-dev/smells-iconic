import { getOrders, getEventCounts, dateKeysForRange } from '../../../lib/analyticsStore';
import { getCapiStatus } from '../../../lib/metaCapi';

const VALID_FUNNEL_RANGES = new Set(['today', 'yesterday', '7d', '30d']);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const funnelRange = VALID_FUNNEL_RANGES.has(req.query.range) ? req.query.range : 'today';

  try {
    const [orders, events, capi] = await Promise.all([getOrders(), getEventCounts(dateKeysForRange(funnelRange)), getCapiStatus()]);
    const revenue = orders.reduce((sum, o) => sum + Number(o.amount || 0), 0);

    const rate = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

    const methodTotals = new Map();
    for (const o of orders) {
      const method = o.paymentMethod || 'Unknown';
      const entry = methodTotals.get(method) || { count: 0, revenue: 0 };
      entry.count += 1;
      entry.revenue += Number(o.amount || 0);
      methodTotals.set(method, entry);
    }
    const paymentMethods = [...methodTotals.entries()]
      .map(([method, { count, revenue }]) => ({ method, count, revenue }))
      .sort((a, b) => b.count - a.count);

    return res.status(200).json({
      revenueToday: revenue,
      ordersToday: orders.length,
      paymentMethods,
      funnelRange,
      capi,
      funnel: {
        pageviews: events.pageview,
        addToCart: events.addtocart,
        checkoutStarts: events.checkout_start,
        purchases: events.purchase,
        addToCartRate: rate(events.addtocart, events.pageview),
        checkoutRate: rate(events.checkout_start, events.addtocart),
        conversionRate: rate(events.purchase, events.pageview),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
