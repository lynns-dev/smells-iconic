import crypto from 'crypto';
import { createSession, deleteSession } from '../../../lib/adminAuth';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const PROTOCOL_VERSION = '2025-03-26';

const tools = [
  { name: 'admin_dashboard', description: 'Read sales, orders, payment-method and conversion dashboard metrics. Read-only.', inputSchema: { type: 'object', properties: { range: { type: 'string', enum: ['today', 'yesterday', '7d', '30d'] } } } },
  { name: 'admin_orders', description: 'Search and inspect the latest order ledger. Read-only; does not issue refunds or change orders.', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_live_activity', description: 'Read current live visitors and the recent activity feed. Read-only.', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_visitors', description: 'Read recent visitor journeys and linked contact details. Read-only.', inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 1000 } } } },
  { name: 'admin_inbox', description: 'Read customer contact messages and conversation history. Read-only.', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_reply_inbox', description: 'Send a customer email reply to an inbox message. Sends a real email; only call when the user explicitly asks to send the reply.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, reply: { type: 'string', minLength: 1, maxLength: 5000 } }, required: ['id', 'reply'] } },
  { name: 'admin_set_inbox_status', description: 'Change inbox message status to new, answered, or archived.', inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1 }, status: { type: 'string', enum: ['new', 'answered', 'archived'] } }, required: ['ids', 'status'] } },
  { name: 'admin_delete_inbox', description: 'Permanently delete inbox entries. Destructive; only call when the user explicitly confirms deletion.', inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1 } }, required: ['ids'] } },
  { name: 'admin_reviews', description: 'Read all product reviews and approval statuses. Read-only.', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_approve_review', description: 'Approve a customer product review for publication.', inputSchema: { type: 'object', properties: { productId: { type: 'string' }, reviewId: { type: 'string' } }, required: ['productId', 'reviewId'] } },
  { name: 'admin_delete_review', description: 'Permanently delete a product review. Destructive; only call when the user explicitly confirms deletion.', inputSchema: { type: 'object', properties: { productId: { type: 'string' }, reviewId: { type: 'string' } }, required: ['productId', 'reviewId'] } },
  { name: 'admin_subscribers', description: 'Read the customer and subscriber list, including consent status and order summaries. Read-only.', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_set_subscriber_consent', description: 'Update email marketing consent for a subscriber. Use only according to the customer\'s recorded request or explicit user instruction.', inputSchema: { type: 'object', properties: { key: { type: 'string' }, consent: { type: 'boolean' } }, required: ['key', 'consent'] } },
  { name: 'admin_discounts', description: 'Read active admin-managed discount codes. Read-only.', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_create_discount', description: 'Create an admin-managed discount code.', inputSchema: { type: 'object', properties: { code: { type: 'string' }, type: { type: 'string', enum: ['percent', 'fixed'] }, value: { type: 'number', exclusiveMinimum: 0 } }, required: ['code', 'type', 'value'] } },
  { name: 'admin_delete_discount', description: 'Remove an admin-managed discount code. Only call when the user explicitly asks to remove it.', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'admin_email_overview', description: 'Read email marketing subscribers, campaigns, automations, analytics, templates and settings. Read-only; does not send campaigns or change settings.', inputSchema: { type: 'object', properties: { section: { type: 'string', enum: ['subscribers', 'campaigns', 'analytics', 'automations', 'templates', 'settings', 'abandoned-checkout'] } }, required: ['section'] } },
  { name: 'admin_sms_overview', description: 'Read SMS subscriber and automation information. Read-only; does not send texts.', inputSchema: { type: 'object', properties: {} } }
];

const routes = {
  admin_dashboard: (a) => ({ path: '/api/admin/dashboard', query: { range: a.range || 'today' } }),
  admin_orders: () => ({ path: '/api/admin/orders' }),
  admin_live_activity: () => ({ path: '/api/admin/live' }),
  admin_visitors: (a) => ({ path: '/api/admin/visitors', query: { limit: String(a.limit || 300) } }),
  admin_inbox: () => ({ path: '/api/admin/inbox' }),
  admin_reply_inbox: (a) => ({ path: '/api/admin/inbox', method: 'POST', body: { id: a.id, reply: a.reply } }),
  admin_set_inbox_status: (a) => ({ path: '/api/admin/inbox', method: 'PATCH', body: { ids: a.ids, status: a.status } }),
  admin_delete_inbox: (a) => ({ path: '/api/admin/inbox', method: 'DELETE', body: { ids: a.ids } }),
  admin_reviews: () => ({ path: '/api/admin/reviews' }),
  admin_approve_review: (a) => ({ path: '/api/admin/reviews', method: 'PATCH', body: { productId: a.productId, reviewId: a.reviewId, action: 'approve' } }),
  admin_delete_review: (a) => ({ path: '/api/admin/reviews', method: 'DELETE', body: { productId: a.productId, reviewId: a.reviewId } }),
  admin_subscribers: () => ({ path: '/api/admin/subscribers' }),
  admin_set_subscriber_consent: (a) => ({ path: '/api/admin/subscribers', method: 'POST', body: { key: a.key, consent: a.consent } }),
  admin_discounts: () => ({ path: '/api/admin/discounts' }),
  admin_create_discount: (a) => ({ path: '/api/admin/discounts', method: 'POST', body: a }),
  admin_delete_discount: (a) => ({ path: '/api/admin/discounts', method: 'DELETE', body: { code: a.code } }),
  admin_email_overview: (a) => ({ path: `/api/admin/email/${a.section}` }),
  admin_sms_overview: () => ({ path: '/api/admin/sms' })
};

async function authorized(req) {
  const header = String(req.headers.authorization || '');
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!supplied || !KV_URL || !KV_TOKEN) return false;
  const stored = await fetch(`${KV_URL}/get/chatgpt_mcp_key_hash`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } }).then(r => r.json());
  if (!stored.result) return false;
  const digest = crypto.createHash('sha256').update(supplied).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(String(stored.result).replace(/^"|"$/g, ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function callAdmin(req, spec) {
  const session = await createSession();
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    if (!base) throw new Error('Set NEXT_PUBLIC_SITE_URL to the production site URL.');
    const url = new URL(spec.path, base);
    for (const [k, v] of Object.entries(spec.query || {})) url.searchParams.set(k, v);
    const response = await fetch(url, {
      method: spec.method || 'GET',
      headers: { Cookie: `admin_session=${session}`, ...(spec.body ? { 'Content-Type': 'application/json' } : {}) },
      ...(spec.body ? { body: JSON.stringify(spec.body) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Admin API returned ${response.status}`);
    return payload;
  } finally {
    await deleteSession(session).catch(() => {});
  }
}

function jsonRpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST for MCP requests.' });
  }
  try {
    if (!(await authorized(req))) return res.status(401).json({ error: 'Unauthorized' });
    const body = req.body || {};
    const { id, method, params = {} } = body;
    if (method === 'initialize') {
      return res.status(200).json(jsonRpc(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'smells-iconic-admin', version: '1.0.0' } }));
    }
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') return res.status(202).end();
    if (method === 'ping') return res.status(200).json(jsonRpc(id, {}));
    if (method === 'tools/list') return res.status(200).json(jsonRpc(id, { tools }));
    if (method === 'tools/call') {
      const name = params.name;
      const specFn = routes[name];
      if (!specFn) return res.status(200).json(jsonRpc(id, { isError: true, content: [{ type: 'text', text: 'Unknown admin tool.' }] }));
      try {
        const data = await callAdmin(req, specFn(params.arguments || {}));
        return res.status(200).json(jsonRpc(id, { content: [{ type: 'text', text: JSON.stringify(data) }] }));
      } catch (error) {
        return res.status(200).json(jsonRpc(id, { isError: true, content: [{ type: 'text', text: error.message }] }));
      }
    }
    return res.status(200).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: 'Method not found' } });
  } catch (error) {
    return res.status(500).json({ jsonrpc: '2.0', id: req.body?.id ?? null, error: { code: -32603, message: error.message } });
  }
}
