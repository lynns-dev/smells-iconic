// Abandoned-checkout email, sent through Resend ~10 minutes after a shopper
// stops interacting with checkout without ordering. Run every minute by
// pages/api/cron/abandoned-checkout.js (vercel.json).
//
// "Left checkout" is the subscriber record's lastCheckoutAt (lib/
// subscribersStore.js), which checkout bumps on every edit, every couple of
// minutes while the tab is open, and once more when the tab is hidden or
// closed (pages/checkout.jsx's saveContact). So it's ~the moment they left.
//
// Who gets it: an email address, marketing consent (the "Email me with news
// and offers" box), a cart, no order since that checkout, and no reminder for
// this same checkout or in the last day. Checkouts older than MAX_AGE_MS are
// never emailed, so switching this on doesn't mail every old abandoned cart.

import crypto from 'crypto';
import { getProductById } from './products';
import { getSubscribers, markAbandonedEmailSent, claimOnce } from './subscribersStore';
import { getOrders, dateKeysForRange } from './analyticsStore';

export const DELAY_MS = 10 * 60 * 1000;
const MAX_AGE_MS = 3 * 60 * 60 * 1000;
const MIN_GAP_MS = 24 * 60 * 60 * 1000;

const INK = '#15110D';
const SOFT = '#7A6E66';
const CREAM = '#FBF5F1';
const LINE = '#E8DCD4';

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://smellsiconic.com').replace(/\/$/, '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Unsubscribe links are signed with CRON_SECRET so nobody can unsubscribe
// someone else by guessing their key. Changing CRON_SECRET invalidates links
// in emails already sent.
export function unsubscribeToken(key) {
  return crypto.createHmac('sha256', process.env.CRON_SECRET || '').update(`unsubscribe:${key}`).digest('hex').slice(0, 32);
}

export function verifyUnsubscribeToken(key, token) {
  if (!process.env.CRON_SECRET || typeof key !== 'string' || typeof token !== 'string') return false;
  const expected = Buffer.from(unsubscribeToken(key));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function unsubscribeUrl(key) {
  return `${siteUrl()}/api/unsubscribe?k=${encodeURIComponent(key)}&t=${unsubscribeToken(key)}`;
}

// Opens checkout with this cart already in the bag (lib/useCart.js reads
// ?restore=), so the link works on a different device or browser too.
function restoreUrl(cart) {
  const restore = cart.map((i) => `${i.id}:${i.quantity}`).join(',');
  return `${siteUrl()}/checkout?restore=${encodeURIComponent(restore)}&utm_source=email&utm_medium=email&utm_campaign=abandoned_checkout`;
}

export function renderAbandonedEmail({ key, name, cart }) {
  const firstName = String(name || '').trim().split(/\s+/)[0];
  const items = cart.map((item) => {
    const product = getProductById(item.id);
    const image = product?.images?.find((src) => !src.endsWith('.svg'));
    // Today's catalog price — what the restored checkout will actually charge.
    const line = (product?.price ?? (Number(item.price) || 0)) * (Number(item.quantity) || 1);
    return { name: product?.name || item.name, size: product?.size || '', quantity: Number(item.quantity) || 1, line, image: image ? `${siteUrl()}${image}` : null };
  });
  const total = items.reduce((t, i) => t + i.line, 0);
  const link = restoreUrl(cart);
  const unsub = unsubscribeUrl(key);

  const rows = items.map((i) => `
          <tr>
            <td width="72" style="padding:14px 0;border-bottom:1px solid ${LINE};vertical-align:top;">
              ${i.image ? `<img src="${escapeHtml(i.image)}" width="64" height="64" alt="${escapeHtml(i.name)}" style="display:block;width:64px;height:64px;object-fit:cover;border:1px solid ${LINE};" />` : ''}
            </td>
            <td style="padding:14px 12px;border-bottom:1px solid ${LINE};vertical-align:top;font-size:15px;color:${INK};">
              <div style="font-weight:600;">${escapeHtml(i.name)}${i.quantity > 1 ? ` × ${i.quantity}` : ''}</div>
              ${i.size ? `<div style="font-size:13px;color:${SOFT};margin-top:2px;">${escapeHtml(i.size)}</div>` : ''}
            </td>
            <td align="right" style="padding:14px 0;border-bottom:1px solid ${LINE};vertical-align:top;font-size:15px;color:${INK};">$${i.line.toFixed(2)}</td>
          </tr>`).join('');

  const subject = 'You left something behind';
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${LINE};font-family:Helvetica,Arial,sans-serif;">
        <tr><td align="center" style="padding:28px 24px;border-bottom:1px solid ${LINE};font-size:22px;font-weight:900;letter-spacing:0.02em;color:${INK};">SMELLS — ICONIC</td></tr>
        <tr><td style="padding:28px 24px 8px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:${INK};">${firstName ? `${escapeHtml(firstName)}, your` : 'Your'} cart is waiting.</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${SOFT};">You were so close. We saved everything for you — pick up right where you left off.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
            <tr>
              <td></td>
              <td style="padding:14px 12px 0;font-size:15px;font-weight:700;color:${INK};">Subtotal</td>
              <td align="right" style="padding:14px 0 0;font-size:15px;font-weight:700;color:${INK};">$${total.toFixed(2)}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:24px 24px 32px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:${INK};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:14px;">Finish checking out</a>
          <p style="margin:16px 0 0;font-size:13px;color:${SOFT};">Fast shipping · 45-day money-back guarantee</p>
        </td></tr>
      </table>
      <p style="max-width:520px;margin:18px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${SOFT};text-align:center;">
        You're getting this because you started a checkout at smellsiconic.com and agreed to emails.
        <a href="${escapeHtml(unsub)}" style="color:${SOFT};">Unsubscribe</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
  const text = [
    `${firstName ? `${firstName}, your` : 'Your'} cart is waiting.`,
    '',
    ...items.map((i) => `${i.name}${i.quantity > 1 ? ` x ${i.quantity}` : ''} — $${i.line.toFixed(2)}`),
    `Subtotal: $${total.toFixed(2)}`,
    '',
    `Finish checking out: ${link}`,
    '',
    `Unsubscribe: ${unsub}`,
  ].join('\n');
  return { subject, html, text, unsub };
}

export async function sendViaResend({ to, subject, html, text, unsub, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'Smells Iconic <hello@smellsiconic.com>',
      to: [to],
      reply_to: process.env.RESEND_REPLY_TO || 'hello@smellsiconic.com',
      subject,
      html,
      text,
      headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Resend returned ${res.status}.`);
  return data.id;
}

// Why someone isn't due (or null when they are).
export function skipReason(s, now, lastOrderByEmail) {
  if (!s.email) return 'no email';
  if (!s.consent) return 'no consent';
  if (!s.lastCheckoutAt || !s.cart?.length) return 'no checkout';
  const checkoutAt = Date.parse(s.lastCheckoutAt);
  if (now - checkoutAt < DELAY_MS) return 'too soon';
  if (now - checkoutAt > MAX_AGE_MS) return 'too old';
  const ordered = [s.lastOrderAt, lastOrderByEmail.get(s.email)].filter(Boolean).map(Date.parse);
  // An order up to an hour before the last checkout save still counts — a
  // tab-close save can land just after the order went through.
  if (ordered.some((t) => t >= checkoutAt - 60 * 60 * 1000)) return 'ordered';
  if (s.abandonedEmailFor === s.lastCheckoutAt) return 'already sent';
  if (s.abandonedEmailSentAt && now - Date.parse(s.abandonedEmailSentAt) < MIN_GAP_MS) return 'sent recently';
  return null;
}

export async function runAbandonedCheckoutEmails() {
  const now = Date.now();
  const [subscribers, orders] = await Promise.all([
    getSubscribers(),
    Promise.all(dateKeysForRange('7d').slice(0, 2).map((k) => getOrders(k))).then((d) => d.flat()),
  ]);
  const lastOrderByEmail = new Map();
  for (const o of orders) {
    const e = String(o.email || '').trim().toLowerCase();
    if (e && (!lastOrderByEmail.has(e) || o.createdAt > lastOrderByEmail.get(e))) lastOrderByEmail.set(e, o.createdAt);
  }

  const result = { due: 0, sent: 0, failed: [] };
  for (const s of subscribers) {
    if (skipReason(s, now, lastOrderByEmail)) continue;
    result.due += 1;
    if (!(await claimOnce(`abandoned_email_lock:${s.key}:${s.lastCheckoutAt}`, 24 * 60 * 60))) continue;
    try {
      const email = renderAbandonedEmail({ key: s.key, name: s.name, cart: s.cart });
      await sendViaResend({ to: s.email, ...email, idempotencyKey: `abandoned/${s.key}/${s.lastCheckoutAt}`.slice(0, 256) });
      await markAbandonedEmailSent(s.key, s.lastCheckoutAt);
      result.sent += 1;
    } catch (err) {
      console.error(`Abandoned-checkout email to ${s.email} failed:`, err.message);
      result.failed.push({ email: s.email, error: err.message });
    }
  }
  return result;
}
