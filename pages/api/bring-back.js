// Public endpoint behind the "Bring it back" button on archived products
// (components/Archived.jsx). Counts the vote (lib/bringBackStore.js), keeps
// one running entry per product in the admin Inbox ("N people want Ginger
// Crème back") and pings admins' phones (lib/webPush.js) on each new vote.
//
// GET ?productId= returns the current count; POST { productId, voterId }
// adds a vote.

import crypto from 'crypto';
import { PRODUCTS } from '../../lib/products';
import { addBringBackVote, getBringBackCount } from '../../lib/bringBackStore';
import { getInbox, addInboxEntry, updateInboxEntry } from '../../lib/inboxStore';
import { sendPushToAdmins } from '../../lib/webPush';

const archived = (id) => PRODUCTS.find((p) => p.id === id && p.archived);

async function recordInInbox(product, count) {
  const text = `${count} ${count === 1 ? 'person wants' : 'people want'} ${product.name} back.`;
  const existing = (await getInbox()).find((e) => e.type === 'vote' && e.productId === product.id);
  // Each new vote moves it back to New, so it surfaces again.
  if (existing) return updateInboxEntry(existing.id, { text, count, status: 'new', updatedAt: new Date().toISOString() });
  return addInboxEntry({
    id: crypto.randomUUID(),
    type: 'vote',
    productId: product.id,
    text,
    count,
    status: 'new',
    createdAt: new Date().toISOString(),
  });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const product = archived(String(req.query.productId || ''));
      if (!product) return res.status(404).json({ error: 'Not an archived product.' });
      return res.status(200).json({ count: await getBringBackCount(product.id) });
    }
    if (req.method === 'POST') {
      const { productId, voterId } = req.body || {};
      const product = archived(String(productId || ''));
      if (!product) return res.status(404).json({ error: 'Not an archived product.' });
      const voter = String(voterId || '').slice(0, 80);
      if (!voter) return res.status(400).json({ error: 'Missing voter id.' });

      const { added, count } = await addBringBackVote(product.id, voter);
      if (added) {
        await recordInInbox(product, count);
        await sendPushToAdmins({ title: 'Bring it back vote', body: `${product.name} — ${count} vote${count === 1 ? '' : 's'} so far`, url: '/admin#inbox' }).catch(() => {});
      }
      return res.status(200).json({ ok: true, count });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Bring-back vote failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Try again in a minute.' });
  }
}
