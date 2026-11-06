// Admin "Send abandoned checkout text" (Visitors tab and Email →
// Subscribers): texts one shopper the abandoned-checkout text
// (admin → Texts → Abandoned checkout text) with a link that reopens
// checkout with their saved cart. One ResendSMS credit per text.
//
// Works for anyone who typed a phone number, but:
// - never to a number marked opted out (STOP) on the text list;
// - only 11am–8pm Eastern (US quiet hours);
// - if the number has no text consent on file (they didn't tick "Text me"
//   at checkout), the admin has to confirm that explicitly
//   (confirmNoConsent) — texting marketing to a number without written
//   consent is a TCPA risk the owner takes on per text.
import { getSubscriber, markAbandonedSmsSent, claimOnce } from '../../../lib/subscribersStore';
import { getSmsSubscribers, normalizeUsPhone } from '../../../lib/email/smsStore';
import { sendSms, smsConfigured } from '../../../lib/sms/resendSms';
import { getSmsAutomations, inSendWindow, createTrackedLink, fillMessage, logSmsEvent } from '../../../lib/sms/smsAutomations';
import { getProductById } from '../../../lib/products';
import { bumpFlowStat } from '../../../lib/email/flowStats';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    if (!smsConfigured()) return res.status(400).json({ error: 'ResendSMS isn’t connected (RESENDSMS_API_KEY).' });
    const s = await getSubscriber(req.body?.key);
    if (!s) return res.status(404).json({ error: 'No contact found.' });
    const phone = normalizeUsPhone(s.phone);
    if (!phone) return res.status(400).json({ error: 'No valid US mobile number for this shopper.' });
    if (!s.cart?.length) return res.status(400).json({ error: 'No saved cart for this shopper.' });

    const listed = (await getSmsSubscribers()).find((x) => x.phone === phone);
    if (listed?.status === 'unsubscribed') return res.status(400).json({ error: 'This number opted out of texts (STOP).' });
    const hasConsent = listed?.status === 'subscribed' && Boolean(listed.consentAt);
    if (!hasConsent && req.body?.confirmNoConsent !== true) {
      return res.status(409).json({ error: 'No text consent on file for this number.', needsConfirm: true });
    }
    if (!inSendWindow()) return res.status(400).json({ error: 'Texts only go out 11am–8pm Eastern. Try again then.' });
    // Stops a double click sending two texts.
    if (!(await claimOnce(`abandoned_sms_manual:${s.key}`, 60))) {
      return res.status(429).json({ error: 'Already sending — try again in a minute.' });
    }

    const flow = (await getSmsAutomations()).find((f) => f.id === 'sms_abandoned_checkout');
    const restore = s.cart.map((i) => `${i.id}:${i.quantity}`).join(',');
    const link = await createTrackedLink(flow.id, `/checkout?restore=${encodeURIComponent(restore)}&utm_source=sms&utm_medium=sms&utm_campaign=abandoned_checkout_manual`);
    const product = getProductById(s.cart[0].id)?.name || s.cart[0].name;
    const message = fillMessage(flow.message, { link: link.url, product });

    await sendSms(phone, message);
    const saved = await markAbandonedSmsSent(s.key);
    await Promise.allSettled([
      bumpFlowStat(flow.id, 0, 'sent'),
      logSmsEvent({ flow: flow.id, phone, manual: true, consent: hasConsent }),
    ]);
    return res.status(200).json({ ok: true, sentAt: saved?.abandonedSmsSentAt || new Date().toISOString(), message });
  } catch (err) {
    console.error('Manual abandoned-checkout text failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
