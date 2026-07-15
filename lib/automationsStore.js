// Automation flow definitions, stored in the same KV store as everything
// else. Key: email_automations -> JSON array. Two built-in flows, seeded
// on first read the same way discountsStore.js seeds its default codes.
// Per-subscriber progress through a flow lives on the subscriber record
// (subscribersStore.updateAutomationState), not here — this store only
// holds the editable flow definitions.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'email_automations';

const SEED_AUTOMATIONS = [
  {
    id: 'welcome_series',
    name: 'Welcome series',
    trigger: 'confirmed',
    enabled: true,
    steps: [
      { delayDays: 0, subject: 'Welcome to Smells Iconic — here\'s 15% off', html: '<p>Welcome! Use code WELCOME10 at checkout.</p>' },
      { delayDays: 2, subject: 'The ritual: three soft motions', html: '<p>Fresh out the shower, where you\'d get kissed, reapply whenever.</p>' },
      { delayDays: 5, subject: 'Restocks and new characters first', html: '<p>You\'re on the list — new drops land here before anywhere else.</p>' },
    ],
  },
  {
    id: 'sunset_winback',
    name: 'Sunset / win-back',
    trigger: 'inactive',
    enabled: true,
    steps: [
      { delayDays: 90, subject: 'Still want to hear from us?', html: '<p>We haven\'t seen you click in a while — stick around for 15% off, or we\'ll assume you\'d rather not hear from us.</p>' },
      { delayDays: 180, subject: null, html: null },
    ],
  },
];

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  }
}

async function saveAutomations(automations) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(automations),
  });
  if (!res.ok) throw new Error('Failed to save automations.');
}

export async function getAutomations() {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/${KEY}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  if (data.result) return JSON.parse(data.result);
  await saveAutomations(SEED_AUTOMATIONS);
  return SEED_AUTOMATIONS;
}

export async function getAutomation(id) {
  const automations = await getAutomations();
  return automations.find((a) => a.id === id) || null;
}

export async function updateAutomation(id, patch) {
  const automations = await getAutomations();
  const idx = automations.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('Automation not found.');
  automations[idx] = { ...automations[idx], ...patch };
  await saveAutomations(automations);
  return automations[idx];
}
