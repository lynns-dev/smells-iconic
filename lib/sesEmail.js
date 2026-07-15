// Thin wrapper around Amazon SES (SESv2 SendEmail). Every email carries a
// List-Unsubscribe header pointing at the human unsubscribe page and a
// List-Unsubscribe-Post header so mail clients (Gmail, Apple Mail, Yahoo)
// can offer true one-click unsubscribe (RFC 8058) — required to keep the
// complaint rate under Gmail/Yahoo's bulk-sender threshold, since a
// "report spam" click hurts deliverability far more than an unsubscribe.
//
// SESv2's Content.Simple.Headers lets us set these without hand-building
// raw MIME. See DEPLOYMENT.md for the one-time AWS/DNS setup (domain
// verification, DKIM, SPF, DMARC, production access) this depends on.

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

let client = null;
function getClient() {
  if (client) return client;
  const region = process.env.AWS_REGION;
  if (!region || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set.');
  }
  client = new SESv2Client({ region });
  return client;
}

export async function sendEmail({ to, subject, html, fromName, unsubToken }) {
  const fromEmail = process.env.SES_FROM_EMAIL;
  if (!fromEmail) throw new Error('SES_FROM_EMAIL is not set.');
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  const unsubUrl = `${baseUrl}/api/email/unsubscribe?token=${unsubToken}`;

  const headers = [
    { Name: 'List-Unsubscribe', Value: `<${unsubUrl}>` },
    { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
  ];
  if (process.env.SES_CONFIGURATION_SET) {
    headers.push({ Name: 'X-SES-CONFIGURATION-SET', Value: process.env.SES_CONFIGURATION_SET });
  }

  const command = new SendEmailCommand({
    FromEmailAddress: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
        Headers: headers,
      },
    },
    ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined,
  });

  return getClient().send(command);
}
