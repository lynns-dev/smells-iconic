// Verifies Resend's webhook signatures — Resend signs webhooks per the
// open Standard Webhooks spec (their Node SDK depends on the
// `standardwebhooks` package), so this implements that spec directly
// without pulling in a dependency for it.
//
// Header names: the current spec uses `webhook-id`/`webhook-timestamp`/
// `webhook-signature`; Svix-based implementations (which Standard
// Webhooks grew out of) have historically also sent `svix-id`/
// `svix-timestamp`/`svix-signature` for backward compatibility. Both are
// checked here since Resend's docs were unreachable in this environment
// (bot-protected) to confirm which one applies today — if verification
// keeps failing after setup, check the raw request in Resend's webhook
// delivery log (Dashboard → Webhooks → your endpoint → recent deliveries)
// for the actual header names sent and adjust HEADER_NAMES below.
//
// Signing: signed_content = "{id}.{timestamp}.{raw body}", secret is the
// base64 payload after the "whsec_" prefix, signature is
// base64(HMAC-SHA256(secret, signed_content)). The signature header can
// carry multiple space-separated "v1,<sig>" values (key rotation) — a
// match on any of them is valid.

import { createHmac, timingSafeEqual } from 'crypto';

const HEADER_NAMES = [
  { id: 'webhook-id', timestamp: 'webhook-timestamp', signature: 'webhook-signature' },
  { id: 'svix-id', timestamp: 'svix-timestamp', signature: 'svix-signature' },
];

export function verifyWebhookSignature(rawBody, headers, secret) {
  if (!secret) return false;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');

  for (const names of HEADER_NAMES) {
    const id = headers[names.id];
    const timestamp = headers[names.timestamp];
    const signatureHeader = headers[names.signature];
    if (!id || !timestamp || !signatureHeader) continue;

    const signedContent = `${id}.${timestamp}.${rawBody}`;
    const expected = createHmac('sha256', secretBytes).update(signedContent, 'utf8').digest('base64');
    const expectedBuf = Buffer.from(expected);

    const candidates = signatureHeader.split(' ').map((v) => v.split(',')[1]).filter(Boolean);
    for (const candidate of candidates) {
      const candidateBuf = Buffer.from(candidate);
      if (candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf)) {
        return true;
      }
    }
    return false; // Matched a header set but no signature matched — don't fall through.
  }

  return false;
}
