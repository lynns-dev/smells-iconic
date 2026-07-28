// Thin wrapper around the Meta Graph API for reading and moderating
// comments on Facebook/Instagram ad posts. Needs a Page access token with
// pages_read_engagement + pages_manage_engagement.

const GRAPH_VERSION = 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function token() {
  const t = process.env.META_PAGE_ACCESS_TOKEN;
  if (!t) throw new Error('META_PAGE_ACCESS_TOKEN is not set.');
  return t;
}

export function monitoredPostIds() {
  return (process.env.META_MONITORED_POST_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function fetchComments(postId) {
  const url = `${GRAPH_BASE}/${postId}/comments?fields=id,message,from,created_time,permalink_url&filter=stream&limit=100&access_token=${token()}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Graph API error fetching comments for ${postId}: ${data.error.message}`);
  return data.data || [];
}

export async function replyToComment(commentId, message) {
  const url = `${GRAPH_BASE}/${commentId}/comments`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message, access_token: token() }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Graph API error replying to ${commentId}: ${data.error.message}`);
  return data;
}

export async function deleteComment(commentId) {
  const url = `${GRAPH_BASE}/${commentId}?access_token=${token()}`;
  const res = await fetch(url, { method: 'DELETE' });
  const data = await res.json();
  if (data.error) throw new Error(`Graph API error deleting ${commentId}: ${data.error.message}`);
  return data;
}
