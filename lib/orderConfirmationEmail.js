// "Thanks for your order" receipt email, sent through Resend at checkout
// (lib/orderFulfillment.js) and again from the Orders tab
// (pages/api/admin/orders/confirmation.js). Transactional —
// about an order the customer placed — so no unsubscribe link. Same look
// as the shipped email (lib/orderShippedEmail.js).

import { siteUrl } from './abandonedCheckout';

const INK = '#15110D';
const SOFT = '#7A6E66';
const CREAM = '#FBF5F1';
const LINE = '#E8DCD4';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

// "#1001", or the processor's id for an order without a number.
const orderRef = (order) => (order.orderNumber ? `#${order.orderNumber}` : order.id);

export function renderOrderConfirmationEmail({ order }) {
  const firstName = String(order.shipping?.name || '').trim().split(/\s+/)[0];
  const s = order.shipping || {};
  const items = order.items || [];
  const address = s.address
    ? [s.name, [s.address, s.apt].filter(Boolean).join(', '), `${s.city || ''}${s.state ? `, ${s.state}` : ''} ${s.zip || ''}`.trim()].filter(Boolean)
    : [];
  const subject = `Your Smells Iconic order ${orderRef(order)} is confirmed`;
  const row = (left, right, extra = '') => `<tr><td style="padding:8px 0;border-top:1px solid ${LINE};${extra}">${left}</td><td align="right" style="padding:8px 0;border-top:1px solid ${LINE};${extra}">${right}</td></tr>`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${LINE};font-family:Helvetica,Arial,sans-serif;">
        <tr><td align="center" style="padding:28px 24px;border-bottom:1px solid ${LINE};font-size:22px;font-weight:900;letter-spacing:0.02em;color:${INK};">SMELLS — ICONIC</td></tr>
        <tr><td style="padding:28px 24px 8px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:${INK};">${firstName ? `Thank you, ${escapeHtml(firstName)}!` : 'Thank you for your order!'}</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${SOFT};">We've got your order ${escapeHtml(orderRef(order))} and we're getting it ready. We'll email you tracking as soon as it ships.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;color:${INK};">
            ${items.map((i) => row(`${escapeHtml(i.name)}${Number(i.quantity) > 1 ? ` × ${Number(i.quantity)}` : ''}`, i.price != null ? money(Number(i.price) * (Number(i.quantity) || 1)) : '')).join('')}
            ${row('Total', money(order.amount), 'font-weight:700;')}
          </table>
          ${address.length ? `<p style="margin:22px 0 4px;font-size:13px;color:${SOFT};">Shipping to</p><p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${INK};">${address.map(escapeHtml).join('<br/>')}</p>` : ''}
        </td></tr>
        <tr><td align="center" style="padding:16px 24px 32px;">
          <p style="margin:0;font-size:13px;color:${SOFT};">Questions? Just reply to this email.</p>
        </td></tr>
      </table>
      <p style="max-width:520px;margin:18px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${SOFT};text-align:center;">
        You're getting this because you placed an order at <a href="${siteUrl()}" style="color:${SOFT};">smellsiconic.com</a>.
      </p>
    </td></tr>
  </table>
</body></html>`;
  const text = [
    firstName ? `Thank you, ${firstName}!` : 'Thank you for your order!',
    '',
    `We've got your order ${orderRef(order)} and we're getting it ready. We'll email you tracking as soon as it ships.`,
    '',
    ...items.map((i) => `${i.name}${Number(i.quantity) > 1 ? ` × ${Number(i.quantity)}` : ''}`),
    `Total: ${money(order.amount)}`,
    ...(address.length ? ['', 'Shipping to:', ...address] : []),
  ].join('\n');
  return { subject, html, text };
}

// Resolves to { ok, id, error } — never throws — so the outcome can be
// logged on the order (lib/emailLog.js). `to` defaults to the order's email.
// idempotencyKey (checkout's send) stops a retried payment webhook from
// emailing the same order twice; a manual resend passes none.
export async function sendOrderConfirmationEmail({ order, to, idempotencyKey }) {
  const email = to || order.email;
  if (!email) return { ok: false, error: 'This order has no email on file.' };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not set.' };
  const { subject, html, text } = renderOrderConfirmationEmail({ order });
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Smells Iconic <hello@smellsiconic.com>',
        to: [email],
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
