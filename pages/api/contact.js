// Public endpoint behind the Contact page (pages/contact.jsx). Stores the
// message in the admin Inbox (lib/inboxStore.js) and pings admins' phones
// (lib/webPush.js). The hidden `website` field is a honeypot — real
// visitors never see or fill it, so anything that does is a bot and gets
// a fake success.

import crypto from 'crypto';
import { addInboxEntry } from '../../lib/inboxStore';
import { sendPushToAdmins } from '../../lib/webPush';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, name, email, orderNumber, website } = req.body || {};
  if (website) return res.status(200).json({ ok: true });

  const body = String(text || '').trim();
  const cleanEmail = String(email || '').trim();
  if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Add your email so we can write back.' });
  if (body.length < 5) return res.status(400).json({ error: 'Tell us a little more first.' });
  if (body.length > 3000) return res.status(400).json({ error: 'That one’s a bit long — keep it under 3,000 characters.' });

  const entry = {
    id: crypto.randomUUID(),
    type: 'message',
    text: body,
    name: String(name || '').trim().slice(0, 80),
    email: cleanEmail.slice(0, 200),
    orderNumber: String(orderNumber || '').trim().slice(0, 60),
    status: 'new',
    createdAt: new Date().toISOString(),
  };
  try {
    await addInboxEntry(entry);
  } catch (err) {
    console.error('Inbox save failed:', err);
    return res.status(500).json({ error: 'Something went wrong on our end. Try again in a minute, or email hello@smellsiconic.com.' });
  }
  await sendPushToAdmins({ title: 'New message', body: `${entry.name || entry.email}: ${body.slice(0, 80)}`, url: '/admin#inbox' }).catch(() => {});
  return res.status(200).json({ ok: true });
}
