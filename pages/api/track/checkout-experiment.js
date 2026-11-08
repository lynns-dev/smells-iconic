import { enrollCheckout } from '../../../lib/checkoutExperimentStore';
import { isExcludedTraffic } from '../../../lib/ipFilter';
const ID_RE = /^[A-Za-z0-9_-]{6,100}$/;
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  const { visitorId, sessionId } = req.body || {};
  if (![visitorId, sessionId].every((id) => typeof id === 'string' && ID_RE.test(id))) return res.status(400).json({ error: 'Invalid checkout identity' });
  if (isExcludedTraffic(req) || process.env.CHECKOUT_EXPERIMENT_DISABLED === '1') return res.json({ variant: 'control' });
  try { return res.json({ variant: await enrollCheckout(visitorId, sessionId) }); }
  catch (err) { console.error('Checkout experiment enrollment failed:', err.message); return res.status(503).json({ variant: 'control' }); }
}
