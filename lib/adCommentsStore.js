// Log of ad-comment moderation actions, backed by the same Upstash KV store
// used elsewhere. Single key holding a JSON array, newest first, capped so
// it doesn't grow unbounded.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const LOG_KEY = 'ad_comments_log';
const MAX_ENTRIES = 500;

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  }
}

export async function getModerationLog() {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/${LOG_KEY}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}

export async function appendModerationEntries(entries) {
  if (!entries.length) return getModerationLog();
  const existing = await getModerationLog();
  const updated = [...entries, ...existing].slice(0, MAX_ENTRIES);
  const res = await fetch(`${KV_URL}/set/${LOG_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(updated),
  });
  if (!res.ok) throw new Error('Failed to save moderation log.');
  return updated;
}

export async function seenCommentIds() {
  const log = await getModerationLog();
  return new Set(log.map((e) => e.commentId));
}
