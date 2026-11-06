// ResendSMS (resendsms.com) — the store's text-message sender.
//   POST https://resendsms.com/api/v1/send   { to: ['+1…'], message, sender_id? }
//   GET  https://resendsms.com/api/v1/balance -> { credits, credits_used }
// Bearer auth with RESENDSMS_API_KEY (ResendSMS dashboard → API Keys).
// Prepaid: 1 credit per text (a long text can use more), nothing sends at
// 0 credits. RESENDSMS_SENDER_ID is optional — US carriers usually ignore
// alphanumeric sender IDs and show the provider's number instead.

const API = 'https://resendsms.com/api/v1';

export function smsConfigured() {
  return Boolean(process.env.RESENDSMS_API_KEY);
}

function headers() {
  const key = process.env.RESENDSMS_API_KEY;
  if (!key) throw new Error('RESENDSMS_API_KEY is not set.');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function parse(res) {
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.success === false) {
    throw new Error(data?.error || `ResendSMS returned ${res.status}.`);
  }
  return data;
}

// to: one E.164 number or an array of them.
export async function sendSms(to, message) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) throw new Error('No recipients.');
  if (!String(message || '').trim()) throw new Error('Message is empty.');
  const body = { to: recipients, message: String(message) };
  if (process.env.RESENDSMS_SENDER_ID) body.sender_id = process.env.RESENDSMS_SENDER_ID;
  const res = await fetch(`${API}/send`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  return parse(res);
}

export async function getSmsBalance() {
  const res = await fetch(`${API}/balance`, { headers: headers() });
  const data = await parse(res);
  return { credits: Number(data.credits) || 0, creditsUsed: Number(data.credits_used) || 0 };
}

// GSM-7 texts are 160 characters per segment (153 when split); anything
// with an emoji or curly quote switches to UCS-2, 70 (67). Used to show
// the cost of a message before it's saved or sent.
const GSM = /^[\n\r @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;
export function smsSegments(text) {
  const s = String(text || '');
  const gsm = GSM.test(s);
  const len = gsm ? [...s].reduce((n, c) => n + ('^{}\\[~]|€'.includes(c) ? 2 : 1), 0) : [...s].length;
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return { length: len, encoding: gsm ? 'GSM-7' : 'Unicode', segments: len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi) };
}
