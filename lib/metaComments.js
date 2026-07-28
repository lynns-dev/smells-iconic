// Thin wrapper around the Meta Graph API for reading and moderating
// comments on Facebook/Instagram ad posts. Needs a Page access token with
// pages_read_engagement + pages_manage_engagement + ads_read (a System
// User token covering the Page and the ad account is the easiest way to
// get all three on one token).

const GRAPH_VERSION = 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Every status an ad can be in without being permanently gone — comments
// can still be coming in on paused/under-review ads, so those are covered
// too, not just ACTIVE.
const LIVE_AD_STATUSES = [
  'ACTIVE',
  'PAUSED',
  'PENDING_REVIEW',
  'DISAPPROVED',
  'PREAPPROVED',
  'PENDING_BILLING_INFO',
  'CAMPAIGN_PAUSED',
  'ADSET_PAUSED',
  'IN_PROCESS',
];

function token() {
  const t = process.env.META_PAGE_ACCESS_TOKEN;
  if (!t) throw new Error('META_PAGE_ACCESS_TOKEN is not set.');
  return t;
}

// Any post IDs added manually as a supplement (e.g. boosted organic posts
// that never went through the ad account this token can see).
function extraPostIds() {
  return (process.env.META_MONITORED_POST_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

// Auto-discovers every ad post behind the configured ad account — no
// per-ad setup needed. Each Meta ad's underlying page post is exposed as
// effective_object_story_id; that's what carries the actual comments.
async function discoverAdPostIds() {
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!accountId) return [];

  const ids = new Set();
  const statusFilter = encodeURIComponent(JSON.stringify(LIVE_AD_STATUSES));
  let url = `${GRAPH_BASE}/${accountId}/ads?fields=effective_object_story_id&effective_status=${statusFilter}&limit=200&access_token=${token()}`;

  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(`Graph API error listing ads for ${accountId}: ${data.error.message}`);
    for (const ad of data.data || []) {
      if (ad.effective_object_story_id) ids.add(ad.effective_object_story_id);
    }
    url = data.paging?.next || null;
  }

  return [...ids];
}

export async function monitoredPostIds() {
  const [discovered, extra] = await Promise.all([discoverAdPostIds(), Promise.resolve(extraPostIds())]);
  return [...new Set([...discovered, ...extra])];
}

export async function fetchComments(postId) {
  const comments = [];
  let url = `${GRAPH_BASE}/${postId}/comments?fields=id,message,from,created_time,permalink_url&filter=stream&limit=100&access_token=${token()}`;

  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(`Graph API error fetching comments for ${postId}: ${data.error.message}`);
    comments.push(...(data.data || []));
    url = data.paging?.next || null;
  }

  return comments;
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
