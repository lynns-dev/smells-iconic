// Text-message (SMS) marketing opt-ins, collected by the site's signup
// popup (components/SignupPopup.jsx). This store doesn't send texts itself
// — the list is kept with each person's consent record so it can be
// exported to an SMS provider (admin → Email → Subscribers → Text alerts).
//
// Key: sms_subscribers -> JSON array, one row per phone number (E.164).
// consentText is the exact disclosure the person agreed to, kept with the
// opt-in since SMS marketing law (TCPA) puts the burden of proving consent
// on the sender.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'sms_subscribers';

export const SMS_CONSENT_TEXT =
  'By entering your number, you agree to receive recurring automated marketing text messages from Smells Iconic at this number. '
  + 'Consent is not a condition of purchase. Message frequency varies. Message and data rates may apply. '
  + 'Reply STOP to cancel, HELP for help.';

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
}

export async function getSmsSubscribers() {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/${KEY}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}

async function save(list) {
  const res = await fetch(`${KV_URL}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(list),
  });
  if (!res.ok) throw new Error('Failed to save SMS subscribers.');
}

// US numbers only (the site ships to the US): 10 digits, or 11 with a
// leading 1. Returns E.164 (+1XXXXXXXXXX) or null.
export function normalizeUsPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10 || /^[01]/.test(ten)) return null;
  return `+1${ten}`;
}

export async function addSmsSubscriber({ phone, email, source, consentText, ip, userAgent }) {
  const normalized = normalizeUsPhone(phone);
  if (!normalized) throw new Error('Enter a valid US mobile number.');
  const list = await getSmsSubscribers();
  const now = new Date().toISOString();
  const idx = list.findIndex((s) => s.phone === normalized);
  const record = {
    phone: normalized,
    email: email || list[idx]?.email || null,
    status: 'subscribed',
    source: source || 'popup',
    consentText,
    consentAt: now,
    consentIp: ip || null,
    consentUserAgent: userAgent || null,
    createdAt: list[idx]?.createdAt || now,
  };
  if (idx === -1) list.push(record);
  else list[idx] = { ...list[idx], ...record };
  await save(list);
  return record;
}
