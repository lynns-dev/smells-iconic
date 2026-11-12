// Automated texts, sent through Twilio (lib/sms/provider.js) by
// pages/api/cron/sms-automations.js every 15 minutes. Only ever to numbers
// on the text list with consent on file and status 'subscribed'
// (lib/email/smsStore.js). Every flow ships switched OFF.
//
// Flows (KV key sms_automations, editable in admin → Texts):
//   sms_welcome            — right after someone opts in to texts
//   sms_abandoned_checkout — after they leave checkout without ordering
// {{LINK}} becomes a short tracked link (smellsiconic.com/t/<id>), so each
// text's clicks are counted (lib/email/flowStats.js, step 0 of the flow id).
// {{PRODUCT}} is the first item in their checkout.

import { randomBytes } from 'crypto';
import { getEmailBaseUrl } from '../email/emailBaseUrl';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'sms_automations';
const LINK_TTL_SECONDS = 90 * 24 * 60 * 60;

export const SMS_FLOW_IDS = ['sms_welcome', 'sms_abandoned_checkout'];

const SEED = [
  {
    id: 'sms_welcome',
    name: 'Welcome text',
    enabled: false,
    delayMinutes: 0,
    link: '/shop',
    message: "Smells Iconic: you're in! Take 15% off with code ICONIC15 {{LINK}} Reply STOP to opt out",
  },
  {
    id: 'sms_abandoned_checkout',
    name: 'Abandoned checkout text',
    enabled: false,
    delayMinutes: 60,
    link: '/checkout',
    message: 'Smells Iconic: your {{PRODUCT}} is still in your bag. Finish checking out {{LINK}} Reply STOP to opt out',
  },
];

export const SMS_FLOW_DESCRIPTIONS = {
  sms_welcome: 'Sent once, shortly after someone ticks the text box at checkout. People who opted in more than 3 days before this was switched on are skipped.',
  sms_abandoned_checkout: 'For text subscribers who leave checkout without ordering: sent after the delay, for checkouts up to 24 hours old, at most once every 3 days per number. The link reopens checkout with their cart.',
};

// US quiet hours: texts only go out 11am–8pm Eastern (8am–5pm Pacific),
// so nobody anywhere in the US gets one before 8am or after 8pm.
export const SEND_WINDOW = { startHour: 11, endHour: 20, timeZone: 'America/New_York' };
export function inSendWindow(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: SEND_WINDOW.timeZone }).format(now));
  return hour >= SEND_WINDOW.startHour && hour < SEND_WINDOW.endHour;
}

async function redis(command) {
  if (!KV_URL || !KV_TOKEN) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'KV command failed.');
  return data.result;
}

export async function getSmsAutomations() {
  const raw = await redis(['GET', KEY]);
  const stored = raw ? JSON.parse(raw) : [];
  // Seeds plus whatever's been edited; a flow added later shows up on its own.
  return SEED.map((seed) => ({ ...seed, ...(stored.find((f) => f.id === seed.id) || {}) }));
}

export async function updateSmsAutomation(id, patch) {
  const flows = await getSmsAutomations();
  const idx = flows.findIndex((f) => f.id === id);
  if (idx === -1) throw new Error('Text flow not found.');
  const next = { ...flows[idx] };
  if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled);
  if (patch.message !== undefined) {
    const message = String(patch.message).trim();
    if (!message) throw new Error('Message is empty.');
    if (!/stop/i.test(message)) throw new Error('Keep the opt-out line (e.g. "Reply STOP to opt out") in every marketing text.');
    if (message.length > 480) throw new Error('Keep texts under 480 characters.');
    next.message = message;
  }
  if (patch.delayMinutes !== undefined) {
    const d = Number(patch.delayMinutes);
    if (!Number.isFinite(d) || d < 0 || d > 24 * 60) throw new Error('Delay must be 0–1440 minutes.');
    next.delayMinutes = Math.round(d);
  }
  flows[idx] = next;
  await redis(['SET', KEY, JSON.stringify(flows)]);
  return next;
}

// SET NX lock so overlapping cron runs (or a re-run) never text the same
// person twice for the same thing.
export async function claimOnce(lockKey, ttlSeconds) {
  return (await redis(['SET', lockKey, '1', 'NX', 'EX', String(ttlSeconds)])) === 'OK';
}
export async function releaseClaim(lockKey) {
  await redis(['DEL', lockKey]).catch(() => {});
}

// A short tracked link for one text: /t/<id> → pages/api/sms/click.js.
// Only site paths are stored, so it can't be turned into an open redirect.
export async function createTrackedLink(flowId, path) {
  const safePath = String(path || '/').startsWith('/') && !String(path).startsWith('//') ? String(path) : '/';
  const id = randomBytes(6).toString('base64url');
  await redis(['SET', `sms_link:${id}`, JSON.stringify({ flowId, path: safePath }), 'EX', String(LINK_TTL_SECONDS)]);
  return { id, url: `${getEmailBaseUrl()}/t/${id}` };
}

export async function resolveTrackedLink(id) {
  if (!/^[A-Za-z0-9_-]{4,16}$/.test(String(id || ''))) return null;
  const raw = await redis(['GET', `sms_link:${id}`]);
  return raw ? JSON.parse(raw) : null;
}

export function fillMessage(template, { link = '', product = '' } = {}) {
  return String(template)
    .split('{{LINK}}').join(link)
    .split('{{PRODUCT}}').join(product || 'pick')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Recent sends and broadcasts for admin, newest first (capped).
export async function logSmsEvent(entry) {
  const raw = await redis(['GET', 'sms_log']);
  const list = raw ? JSON.parse(raw) : [];
  list.unshift({ ...entry, at: new Date().toISOString() });
  await redis(['SET', 'sms_log', JSON.stringify(list.slice(0, 200))]);
}
export async function getSmsLog() {
  const raw = await redis(['GET', 'sms_log']);
  return raw ? JSON.parse(raw) : [];
}
