// Public: adds or updates someone on the store's contact list
// (lib/subscribersStore.js) — from the homepage newsletter form, and from
// checkout as soon as a shopper fills in their email or phone (so an
// abandoned checkout is still on the list). Never errors to the visitor.
// journeyId (the device's visitor id) links the contact to that visitor in
// admin → Visitors, which can then send them the abandoned-checkout email.
import { upsertSubscriber } from '../../lib/subscribersStore';
import { updateJourney } from '../../lib/analyticsStore';
import { isExcludedTraffic } from '../../lib/ipFilter';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const { email, phone, name, consent, source, cart, address, journeyId } = req.body || {};
  if (isExcludedTraffic(req)) return res.status(200).json({ ok: true });
  try {
    const saved = await upsertSubscriber({
      email, phone, name, consent: consent === true, source: ['newsletter', 'cart'].includes(source) ? source : 'checkout', cart, address,
    });
    if (saved && typeof journeyId === 'string') await updateJourney(journeyId, { contactKey: saved.key });
    return res.status(200).json({ ok: Boolean(saved) });
  } catch (err) {
    console.error('Subscribe failed:', err.message);
    return res.status(200).json({ ok: false });
  }
}
