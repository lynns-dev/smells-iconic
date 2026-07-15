// Verifies the signature on an incoming SNS message so the SES
// bounce/complaint webhook can't be spoofed by a third party POSTing fake
// "Complaint" events to suppress someone else's subscribers. Implements
// SNS's documented signing scheme (both SignatureVersion 1 and 2) without
// pulling in the full AWS SDK for it.

import { createVerify } from 'crypto';

const CERT_URL_RE = /^https:\/\/sns\.[a-zA-Z0-9-]{3,}\.amazonaws\.com(\.cn)?\/SimpleNotificationService-[a-zA-Z0-9]+\.pem$/;

const NOTIFICATION_FIELDS = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'];
const SUBSCRIBE_FIELDS = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];

function buildStringToSign(msg) {
  const fields = msg.Type === 'Notification' ? NOTIFICATION_FIELDS : SUBSCRIBE_FIELDS;
  let str = '';
  for (const field of fields) {
    if (msg[field] === undefined) continue; // Subject is optional on Notification
    str += `${field}\n${msg[field]}\n`;
  }
  return str;
}

const certCache = new Map();

async function fetchCert(url) {
  if (certCache.has(url)) return certCache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch SNS signing certificate.');
  const pem = await res.text();
  certCache.set(url, pem);
  return pem;
}

export async function verifySnsMessage(msg) {
  if (!msg || !msg.SigningCertURL || !msg.Signature) return false;
  if (!CERT_URL_RE.test(msg.SigningCertURL)) return false;

  const algorithm = msg.SignatureVersion === '2' ? 'sha256' : 'sha1';
  const pem = await fetchCert(msg.SigningCertURL);
  const stringToSign = buildStringToSign(msg);

  const verifier = createVerify(algorithm === 'sha256' ? 'RSA-SHA256' : 'RSA-SHA1');
  verifier.update(stringToSign, 'utf8');
  return verifier.verify(pem, msg.Signature, 'base64');
}
