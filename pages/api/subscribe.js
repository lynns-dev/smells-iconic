// Public: adds or updates someone on the store's contact list
// (lib/subscribersStore.js) — from the homepage newsletter form, and from
// checkout as soon as a shopper fills in their email or phone (so an
// abandoned checkout is still on the list). Never errors to the visitor.
import { upsertSubscriber } from '../../lib/subscribersStore';
import { isExcludedTraffic } from '../../lib/ipFilter';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const { email, phone, name, consent, source, cart, address } = req.body || {};
  if (isExcludedTraffic(req)) return res.status(200).json({ ok: true });
  try {
    const saved = await upsertSubscriber({
      email, phone, name, consent: consent === true, source: source === 'newsletter' ? 'newsletter' : 'checkout', cart, address,
    });
    return res.status(200).json({ ok: Boolean(saved) });
  } catch (err) {
    console.error('Subscribe failed:', err.message);
    return res.status(200).json({ ok: false });
  }
}
