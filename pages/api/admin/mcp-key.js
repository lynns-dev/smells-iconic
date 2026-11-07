import crypto from 'crypto';
import { timingSafeEqual } from 'crypto';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'chatgpt_mcp_key_hash';

async function kv(command, method = 'GET', body) {
  const res = await fetch(`${KV_URL}/${command}`, {
    method,
    headers: { Authorization: `Bearer ${KV_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body } : {}),
  });
  if (!res.ok) throw new Error('Secure key storage is unavailable.');
  return res.json();
}

export default async function handler(req, res) {
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'Secure storage is not configured.' });
  try {
    if (req.method === 'GET') {
      const data = await kv(`get/${KEY}`);
      return res.status(200).json({ configured: Boolean(data.result) });
    }
    if (req.method === 'POST') {
      const token = `smi_${crypto.randomBytes(32).toString('base64url')}`;
      const digest = crypto.createHash('sha256').update(token).digest('hex');
      await kv(`set/${KEY}`, 'POST', JSON.stringify(digest));
      return res.status(200).json({ token, warning: 'Copy this key now. It will not be shown again.' });
    }
    if (req.method === 'DELETE') {
      await kv(`del/${KEY}`, 'POST');
      return res.status(200).json({ revoked: true });
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
