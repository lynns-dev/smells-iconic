// Unsubscribe link from marketing emails (lib/abandonedCheckout.js). GET is
// the link a person clicks; POST is the one-click unsubscribe mail apps send
// from the List-Unsubscribe header. Both turn off consent for that contact.

import { setSubscriberConsent } from '../../lib/subscribersStore';
import { verifyUnsubscribeToken } from '../../lib/abandonedCheckout';

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#FBF5F1;font-family:Helvetica,Arial,sans-serif;color:#15110D;">
<div style="max-width:440px;margin:80px auto;padding:0 16px;text-align:center;">
<p style="font-size:22px;font-weight:900;margin:0 0 24px;">SMELLS — ICONIC</p>
<p style="font-size:16px;line-height:1.6;">${body}</p>
<p style="margin-top:28px;"><a href="/" style="color:#15110D;">Back to the shop</a></p>
</div></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  const { k, t } = req.query;
  if (!verifyUnsubscribeToken(k, t)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(page('Link not valid', 'This unsubscribe link isn’t valid. Email hello@smellsiconic.com and we’ll take you off the list.'));
  }
  try {
    await setSubscriberConsent(k, false);
  } catch (err) {
    console.error('Unsubscribe failed:', err.message);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(page('Something went wrong', 'We couldn’t update your preferences. Please try again, or email hello@smellsiconic.com.'));
  }
  if (req.method === 'POST') return res.status(200).json({ ok: true });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(page('Unsubscribed', 'You’re unsubscribed and won’t get marketing emails from us anymore.'));
}
