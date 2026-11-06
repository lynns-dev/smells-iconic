import { getSubscribers, suppressByEmail, addSubscriberManually } from '../../../../lib/email/subscribersStore';
import { engagementTier } from '../../../../lib/email/emailEngagement';
import { computeGrade, gradeSummary } from '../../../../lib/email/listGrading';
import { getAutomations } from '../../../../lib/email/automationsStore';
import { getSubscribers as getContacts } from '../../../../lib/subscribersStore';

const SUPERSEDED_STEP = 999;

// Every email this person has had, newest first: flow steps from the email
// list's automation state, plus the abandoned-checkout emails, which run on
// their own cron and are logged on the store contact (lib/abandonedCheckout.js).
function emailHistory(s, contact, flows) {
  const out = [];
  for (const [flowId, state] of Object.entries(s.automationState || {})) {
    const flow = flows.find((f) => f.id === flowId);
    const sent = Math.min(state?.step || 0, flow?.steps?.length || 0);
    if (!flow || !sent || state.step >= SUPERSEDED_STEP) continue;
    for (let i = 0; i < sent; i += 1) {
      out.push({ label: flow.name, subject: flow.steps[i]?.subject || `Email ${i + 1}`, at: i === sent - 1 && state.sentAt ? new Date(state.sentAt).toISOString() : null });
    }
  }
  for (const e of contact?.automationsSent || []) {
    out.push({ label: e.flow || 'Abandoned checkout', subject: e.subject || '', at: e.sentAt || null });
  }
  return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

// A checkout this person left without ordering, from the store contact —
// the one the abandoned-checkout email (and its manual send) works from.
function openCheckout(contact) {
  if (!contact?.lastCheckoutAt || !contact.cart?.length) return null;
  const at = Date.parse(contact.lastCheckoutAt);
  if (contact.lastOrderAt && Date.parse(contact.lastOrderAt) >= at - 60 * 60 * 1000) return null;
  return {
    key: contact.key,
    at: contact.lastCheckoutAt,
    items: contact.cart.map((i) => ({ name: i.name || i.id, quantity: i.quantity || 1, price: i.price ?? null })),
    value: contact.cart.reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0),
    emailedAt: contact.abandonedEmailFor === contact.lastCheckoutAt ? contact.abandonedEmailSentAt : null,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toCsv(subscribers) {
  const header = ['email', 'status', 'tier', 'grade', 'source', 'createdAt', 'confirmedAt', 'lastClickAt', 'ordersCount', 'totalSpent'];
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = subscribers.map((s) =>
    [s.email, s.status, engagementTier(s), computeGrade(s).grade, s.source, s.createdAt || '', s.confirmedAt || '', s.lastClickAt || '', s.ordersCount || '', s.totalSpent || '']
      .map(escape)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const subscribers = await getSubscribers();

      if (req.query.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
        return res.status(200).send(toCsv(subscribers));
      }

      const [flows, contacts] = await Promise.all([getAutomations().catch(() => []), getContacts().catch(() => [])]);
      const contactByEmail = new Map(contacts.filter((c) => c.email).map((c) => [String(c.email).trim().toLowerCase(), c]));
      const withTiers = subscribers.map((s) => {
        const contact = contactByEmail.get(String(s.email).toLowerCase());
        return { ...s, tier: engagementTier(s), grade: computeGrade(s).grade, emailHistory: emailHistory(s, contact, flows), openCheckout: openCheckout(contact) };
      });
      return res.status(200).json({ subscribers: withTiers, gradeSummary: gradeSummary(subscribers) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { email, action } = req.body || {};

    if (action === 'add') {
      if (!email || !EMAIL_RE.test(String(email).trim())) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }
      try {
        const subscriber = await addSubscriberManually(email);
        return res.status(200).json({ subscriber });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    if (action === 'suppress') {
      if (!email) return res.status(400).json({ error: 'Invalid request.' });
      try {
        const subscriber = await suppressByEmail(email, 'manual');
        if (!subscriber) return res.status(404).json({ error: 'Subscriber not found.' });
        return res.status(200).json({ subscriber });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(400).json({ error: 'Invalid request.' });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
