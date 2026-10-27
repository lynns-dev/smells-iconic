// "Bring it back" votes for archived products (components/Archived.jsx,
// via pages/api/bring-back.js). Same Upstash KV store as the inbox. One
// set per product, of the voters' browser ids (lib/session.js
// getVisitorId), so the same browser voting twice still counts once:
//   bringback:<productId> -> set of visitor ids

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function command(args) {
  if (!KV_URL || !KV_TOKEN) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'KV request failed.');
  return data.result;
}

// Returns { added, count }: added is false when this voter already voted.
export async function addBringBackVote(productId, voterId) {
  const key = `bringback:${productId}`;
  const added = (await command(['SADD', key, voterId])) === 1;
  const count = await command(['SCARD', key]);
  return { added, count };
}

export async function getBringBackCount(productId) {
  return command(['SCARD', `bringback:${productId}`]);
}
