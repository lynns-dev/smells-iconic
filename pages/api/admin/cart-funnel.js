// Admin → Dashboard's Cart drop-off report (lib/cartFunnel.js). Protected by
// the admin session check in middleware.js like every /api/admin route.
import { getCartFunnel } from '../../../lib/cartFunnel';

export default async function handler(req, res) {
  const range = ['today', '7d', '30d'].includes(req.query.range) ? req.query.range : 'today';
  try {
    return res.status(200).json(await getCartFunnel(range));
  } catch (err) {
    console.error('Cart funnel report failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
