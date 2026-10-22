// The email a customer gets when admin replies to their Contact-page
// message from the Inbox tab (pages/api/admin/inbox.js). Same look as the
// other Smells Iconic emails (lib/abandonedCheckout.js,
// lib/orderShippedEmail.js); their message is quoted underneath. Sent from
// RESEND_FROM_EMAIL with replies going to RESEND_REPLY_TO, so if they
// answer back it lands in that mailbox.

import { siteUrl } from './abandonedCheckout';

const INK = '#15110D';
const SOFT = '#7A6E66';
const CREAM = '#FBF5F1';
const LINE = '#E8DCD4';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const paragraphs = (text) => escapeHtml(text).replace(/\r?\n/g, '<br/>');

export function renderInboxReplyEmail({ entry, reply }) {
  const firstName = String(entry.name || '').trim().split(/\s+/)[0];
  const asked = new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const subject = entry.orderNumber ? `Re: your message about order ${entry.orderNumber}` : 'Re: your message to Smells Iconic';
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${LINE};font-family:Helvetica,Arial,sans-serif;">
        <tr><td align="center" style="padding:28px 24px;border-bottom:1px solid ${LINE};font-size:22px;font-weight:900;letter-spacing:0.02em;color:${INK};">SMELLS — ICONIC</td></tr>
        <tr><td style="padding:28px 24px 8px;font-size:15px;line-height:1.7;color:${INK};">
          ${firstName ? `<p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>` : ''}
          <p style="margin:0 0 16px;">${paragraphs(reply)}</p>
        </td></tr>
        <tr><td style="padding:8px 24px 28px;">
          <div style="border-left:3px solid ${LINE};padding:4px 0 4px 14px;font-size:13px;line-height:1.6;color:${SOFT};">
            <div style="margin-bottom:4px;">You wrote on ${escapeHtml(asked)}:</div>
            ${paragraphs(entry.text)}
          </div>
        </td></tr>
      </table>
      <p style="max-width:520px;margin:18px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${SOFT};text-align:center;">
        You're getting this because you contacted us at <a href="${siteUrl()}/contact" style="color:${SOFT};">smellsiconic.com</a>. Just reply to keep the conversation going.
      </p>
    </td></tr>
  </table>
</body></html>`;
  const text = [firstName ? `Hi ${firstName},` : null, '', reply, '', `You wrote on ${asked}:`, ...String(entry.text).split('\n').map((l) => `> ${l}`)]
    .filter((l) => l !== null).join('\n');
  return { subject, html, text };
}

export async function sendInboxReply({ entry, reply }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set.');
  const { subject, html, text } = renderInboxReplyEmail({ entry, reply });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'Smells Iconic <hello@smellsiconic.com>',
      to: [entry.email],
      reply_to: process.env.RESEND_REPLY_TO || 'hello@smellsiconic.com',
      subject,
      html,
      text,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Resend returned ${res.status}.`);
  return data;
}
