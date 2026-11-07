// ChatGPT Plus custom GPT Actions bridge for the Smells Iconic customer inbox.
// Uses the same bearer key as the MCP server. Never expose the key in the schema.
import crypto from 'crypto';
import { createSession, deleteSession } from '../../../lib/adminAuth';

async function authorized(req) {
  const header = String(req.headers.authorization || '');
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!supplied || !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return false;
  const response = await fetch(`${process.env.KV_REST_API_URL}/get/chatgpt_mcp_key_hash`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  if (!response.ok) return false;
  const stored = (await response.json()).result;
  if (!stored) return false;
  const expected = Buffer.from(String(stored).replace(/^"|"$/g, ''), 'hex');
  const actual = crypto.createHash('sha256').update(supplied).digest();
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    if (!(await authorized(req))) return res.status(401).json({ error: 'Unauthorized' });
    if (req.method === 'POST') {
      const id = req.body?.id;
      const reply = req.body?.reply;
      if (typeof id !== 'string' || !id || typeof reply !== 'string' || !reply.trim() || reply.length > 5000) {
        return res.status(400).json({ error: 'A message id and a reply of 1–5000 characters are required.' });
      }
    }
    const session = await createSession();
    try {
      const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.smellsiconic.com');
      const upstream = await fetch(new URL('/api/admin/inbox', base), {
        method: req.method,
        headers: {
          Cookie: `admin_session=${session}`,
          ...(req.method === 'POST' ? { 'Content-Type': 'application/json' } : {})
        },
        ...(req.method === 'POST' ? { body: JSON.stringify({ id: req.body.id, reply: req.body.reply }) } : {})
      });
      const data = await upstream.json().catch(() => ({ error: 'Unexpected admin response' }));
      return res.status(upstream.status).json(data);
    } finally {
      await deleteSession(session).catch(() => {});
    }
  } catch (error) {
    return res.status(500).json({ error: 'Inbox connection failed.' });
  }
}
