// Sender identity + branding, stored as a single KV object (not an array
// — everything else in this app is a list, this is the one "set once,
// apply everywhere" record). Key: email_settings -> JSON object.

import { repairSettings } from './brandRepair';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'email_settings';

const DEFAULT_SETTINGS = {
  senderEmail: '',
  senderName: '',
  companyName: '',
  physicalAddress: '',
  logoUrl: '',
  emailFont: 'Inter',
  sendingDomain: '',
  sendingDomainId: '',
};

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  }
}

export async function getSettings() {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/${KEY}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  if (!data.result) return { ...DEFAULT_SETTINGS };
  // Sender/logo copied in from the other store are cleared back to this
  // store's defaults — lib/email/brandRepair.js.
  const { settings, changed } = repairSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(data.result) });
  if (changed) {
    await fetch(`${KV_URL}/set/${KEY}`, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}` }, body: JSON.stringify(settings) }).catch(() => {});
  }
  return settings;
}

export async function updateSettings(patch) {
  const existing = await getSettings();
  const definedPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const updated = { ...existing, ...definedPatch };
  assertConfigured();
  const res = await fetch(`${KV_URL}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(updated),
  });
  if (!res.ok) throw new Error('Failed to save settings.');
  return updated;
}
