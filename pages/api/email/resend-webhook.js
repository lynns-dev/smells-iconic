// Resend bounce/complaint webhook: suppresses the address so it's never
// emailed again. Verified with RESEND_WEBHOOK_SECRET (Standard Webhooks
// signature). Resend webhooks are account-wide, so with one Resend account
// serving several stores this receives other stores' events too — those
// are ignored by checking the sender domain against this store's own.

import { suppressByEmail } from '../../../lib/email/subscribersStore';
import { getSettings } from '../../../lib/email/settingsStore';
import { verifyWebhookSignature } from '../../../lib/email/webhookVerify';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const domainOf = (address) => String(address || '').replace(/^.*</, '').replace(/>.*$/, '').split('@')[1]?.toLowerCase() || '';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const rawBody = await readRawBody(req);
  if (!verifyWebhookSignature(rawBody, req.headers, process.env.RESEND_WEBHOOK_SECRET)) return res.status(403).end();

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).end();
  }

  const settings = await getSettings().catch(() => ({}));
  const ownDomain = domainOf(settings.senderEmail || process.env.RESEND_FROM_EMAIL);
  const fromDomain = domainOf(event.data?.from);
  if (ownDomain && fromDomain && fromDomain !== ownDomain) return res.status(200).end();

  const recipients = event.data?.to || [];
  if (event.type === 'email.bounced') {
    await Promise.all(recipients.map((email) => suppressByEmail(email, 'bounce')));
  } else if (event.type === 'email.complained') {
    await Promise.all(recipients.map((email) => suppressByEmail(email, 'complaint')));
  }
  return res.status(200).end();
}
