// Reusable campaign starting points, stored in the same KV store as
// everything else. Key: email_templates -> JSON array. A template is
// just a saved HTML string plus a name — starting a campaign "from" one
// copies its HTML in, it isn't a live link back to the template (matches
// how most ESPs treat templates).

import { randomUUID } from 'crypto';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'email_templates';

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  }
}

export async function getTemplates() {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/${KEY}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}

async function saveTemplates(templates) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(templates),
  });
  if (!res.ok) throw new Error('Failed to save templates.');
}

export async function createTemplate({ name, contentHtml }) {
  const templates = await getTemplates();
  const template = { id: randomUUID(), name, contentHtml, createdAt: Date.now() };
  await saveTemplates([...templates, template]);
  return template;
}

export async function deleteTemplate(id) {
  const templates = await getTemplates();
  const updated = templates.filter((t) => t.id !== id);
  await saveTemplates(updated);
  return updated;
}
