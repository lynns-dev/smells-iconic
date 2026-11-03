// Thin wrapper around Resend's send API. Every email carries a
// List-Unsubscribe header pointing at the human unsubscribe page and a
// List-Unsubscribe-Post header so mail clients (Gmail, Apple Mail, Yahoo)
// can offer true one-click unsubscribe (RFC 8058) — required to keep the
// complaint rate under Gmail/Yahoo's bulk-sender threshold, since a
// "report spam" click hurts deliverability far more than an unsubscribe.
//
// Plain fetch, no SDK dependency — Resend's REST API is simple enough
// that pulling in their Node SDK isn't worth it, same call as everywhere
// else external in this codebase (lib/shopify.js, lib/cors.js's callers).
// See DEPLOYMENT.md for the one-time domain verification (DKIM/SPF) this
// depends on.

import { getSettings } from './settingsStore';
import { getEmailBaseUrl } from './emailBaseUrl';
import { BRAND } from './brand';

// RESEND_FROM_EMAIL here may already be a full "Name <address>" (it's what
// lib/abandonedCheckout.js sends as-is), so it's only wrapped with a name
// when it's a bare address. Falls back to the store's own sender.
function resolveFrom(settings, fromName) {
  const fromEmail = settings?.senderEmail || process.env.RESEND_FROM_EMAIL || BRAND.defaultFrom;
  const name = fromName || settings?.senderName || process.env.RESEND_FROM_NAME;
  if (fromEmail.includes('<')) return name ? fromEmail.replace(/^[^<]*</, `${name} <`) : fromEmail;
  return name ? `${name} <${fromEmail}>` : fromEmail;
}

// Sender identity comes from the Settings UI (lib/settingsStore.js) when
// configured there, falling back to the env vars set at deploy time —
// keeps existing deployments working without requiring anyone to visit
// Settings first.
export async function sendEmail({ to, subject, html, fromName, unsubToken }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set.');

  const settings = await getSettings().catch(() => null);
  const from = resolveFrom(settings, fromName);

  const baseUrl = getEmailBaseUrl();
  const unsubUrl = `${baseUrl}/api/email/unsubscribe?token=${unsubToken}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      reply_to: process.env.RESEND_REPLY_TO || BRAND.replyTo,
      to: [to],
      subject,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }

  return res.json();
}

// Order-status notices (shipping, etc.) — no List-Unsubscribe headers,
// unlike sendEmail() above. These are transactional (triggered by the
// recipient's own order, not commercial/marketing content), so CAN-SPAM's
// unsubscribe requirement doesn't apply, and there's no unsubToken to
// build one from anyway since the recipient may never have been a
// marketing subscriber (guest checkout).
export async function sendTransactionalEmail({ to, subject, html, fromName }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set.');

  const settings = await getSettings().catch(() => null);
  const from = resolveFrom(settings, fromName);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      reply_to: process.env.RESEND_REPLY_TO || BRAND.replyTo,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }

  return res.json();
}
