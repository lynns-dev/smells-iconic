// Email campaigns, stored in the same KV store as everything else.
// Key: email_campaigns -> JSON array of campaign objects.

import { randomUUID } from 'crypto';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'email_campaigns';

const EMPTY_STATS = { sent: 0, delivered: 0, bounced: 0, complained: 0, clicked: 0, unsubscribed: 0 };

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  }
}

export async function getCampaigns() {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/${KEY}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}

async function saveCampaigns(campaigns) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(campaigns),
  });
  if (!res.ok) throw new Error('Failed to save campaigns.');
}

export async function getCampaign(id) {
  const campaigns = await getCampaigns();
  return campaigns.find((c) => c.id === id) || null;
}

export async function createCampaign({ subject, fromName, html, segment }) {
  const campaigns = await getCampaigns();
  const campaign = {
    id: randomUUID(),
    subject,
    fromName,
    html,
    segment: segment || 'all',
    status: 'draft',
    scheduledAt: null,
    sentAt: null,
    stats: { ...EMPTY_STATS },
    createdAt: Date.now(),
  };
  await saveCampaigns([...campaigns, campaign]);
  return campaign;
}

export async function updateCampaign(id, patch) {
  const campaigns = await getCampaigns();
  const idx = campaigns.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error('Campaign not found.');
  const definedPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  campaigns[idx] = { ...campaigns[idx], ...definedPatch };
  await saveCampaigns(campaigns);
  return campaigns[idx];
}

export async function incrementCampaignStat(id, statKey, by = 1) {
  const campaigns = await getCampaigns();
  const idx = campaigns.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const stats = { ...campaigns[idx].stats, [statKey]: (campaigns[idx].stats[statKey] || 0) + by };
  campaigns[idx] = { ...campaigns[idx], stats };
  await saveCampaigns(campaigns);
  return campaigns[idx];
}

export async function deleteCampaign(id) {
  const campaigns = await getCampaigns();
  const updated = campaigns.filter((c) => c.id !== id);
  await saveCampaigns(updated);
  return updated;
}

// Per-campaign send log, one key per campaign: email_sends:<campaignId> ->
// JSON array of { sendId, email, sentAt }. Kept separate from the
// campaign record itself since this is the piece click tracking and
// unsubscribe/bounce webhooks need to look up by sendId or email.
export async function logSend(campaignId, entries) {
  assertConfigured();
  const key = `email_sends:${campaignId}`;
  const existing = await getSendLog(campaignId);
  const updated = [...existing, ...entries];
  const res = await fetch(`${KV_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(updated),
  });
  if (!res.ok) throw new Error('Failed to log campaign sends.');
}

export async function getSendLog(campaignId) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/email_sends:${campaignId}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}

export async function findSend(campaignId, sendId) {
  const log = await getSendLog(campaignId);
  return log.find((s) => s.sendId === sendId) || null;
}
