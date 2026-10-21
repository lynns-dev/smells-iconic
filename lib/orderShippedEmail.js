// "Your order has shipped" email, sent through Resend when ShippingEasy
// reports a printed label (pages/api/shippingeasy/callback.js via
// lib/orderShipping.js). Transactional — about an order the customer
// placed — so it goes out regardless of marketing consent and carries no
// unsubscribe link. Same look as the abandoned-checkout email
// (lib/abandonedCheckout.js).

import { siteUrl } from './abandonedCheckout';

const INK = '#15110D';
const SOFT = '#7A6E66';
const CREAM = '#FBF5F1';
const LINE = '#E8DCD4';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderOrderShippedEmail({ order, carrier, trackingNumber, trackingUrl }) {
  const firstName = String(order.shipping?.name || '').trim().split(/\s+/)[0];
  const items = (order.items || []).map((i) => `${escapeHtml(i.name)}${Number(i.quantity) > 1 ? ` × ${Number(i.quantity)}` : ''}`);
  const subject = 'Your order has shipped!';
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${LINE};font-family:Helvetica,Arial,sans-serif;">
        <tr><td align="center" style="padding:28px 24px;border-bottom:1px solid ${LINE};font-size:22px;font-weight:900;letter-spacing:0.02em;color:${INK};">SMELLS — ICONIC</td></tr>
        <tr><td style="padding:28px 24px 8px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:${INK};">${firstName ? `${escapeHtml(firstName)}, your` : 'Your'} order is on its way.</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${SOFT};">Good news — it just shipped. Here's how to follow it.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;color:${INK};">
            ${carrier ? `<tr><td style="padding:8px 0;border-top:1px solid ${LINE};color:${SOFT};">Carrier</td><td align="right" style="padding:8px 0;border-top:1px solid ${LINE};">${escapeHtml(carrier)}</td></tr>` : ''}
            <tr><td style="padding:8px 0;border-top:1px solid ${LINE};color:${SOFT};">Tracking number</td><td align="right" style="padding:8px 0;border-top:1px solid ${LINE};font-weight:700;">${escapeHtml(trackingNumber)}</td></tr>
            ${items.length ? `<tr><td style="padding:8px 0;border-top:1px solid ${LINE};color:${SOFT};vertical-align:top;">Items</td><td align="right" style="padding:8px 0;border-top:1px solid ${LINE};">${items.join('<br/>')}</td></tr>` : ''}
          </table>
        </td></tr>
        <tr><td align="center" style="padding:24px 24px 32px;">
          ${trackingUrl ? `<a href="${escapeHtml(trackingUrl)}" style="display:inline-block;background:${INK};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:14px;">Track your package</a>` : ''}
          <p style="margin:16px 0 0;font-size:13px;color:${SOFT};">Questions? Just reply to this email.</p>
        </td></tr>
      </table>
      <p style="max-width:520px;margin:18px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${SOFT};text-align:center;">
        You're getting this because you placed an order at <a href="${siteUrl()}" style="color:${SOFT};">smellsiconic.com</a>.
      </p>
    </td></tr>
  </table>
</body></html>`;
  const text = [
    `${firstName ? `${firstName}, your` : 'Your'} order is on its way.`,
    '',
    carrier ? `Carrier: ${carrier}` : null,
    `Tracking number: ${trackingNumber}`,
    trackingUrl ? `Track it: ${trackingUrl}` : null,
  ].filter((l) => l !== null).join('\n');
  return { subject, html, text };
}

export async function sendOrderShippedEmail({ order, carrier, trackingNumber, trackingUrl }) {
  if (!order.email) return { ok: false, error: 'This order has no email on file.' };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not set.' };
  const { subject, html, text } = renderOrderShippedEmail({ order, carrier, trackingNumber, trackingUrl });
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `shipped/${order.id}/${trackingNumber}`.slice(0, 256),
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Smells Iconic <hello@smellsiconic.com>',
        to: [order.email],
        reply_to: process.env.RESEND_REPLY_TO || 'hello@smellsiconic.com',
        subject,
        html,
        text,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.message || `Resend returned ${res.status}.` };
    return { ok: true, id: data.id || null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
