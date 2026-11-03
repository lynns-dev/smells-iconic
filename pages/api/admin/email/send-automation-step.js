import { getSubscribers } from '../../../../lib/email/subscribersStore';
import { sendAutomationStepNow } from '../../../../lib/email/automationSend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, flowId, stepIndex } = req.body || {};
  if (!email || !flowId) return res.status(400).json({ error: 'Email and flowId are required.' });

  try {
    const subscribers = await getSubscribers();
    const subscriber = subscribers.find((s) => s.email === email);
    if (!subscriber) return res.status(404).json({ error: 'Subscriber not found.' });
    if (subscriber.status !== 'subscribed') {
      return res.status(400).json({ error: 'Only subscribed contacts can be sent an automation email.' });
    }

    if (flowId === 'abandoned_checkout' && !subscriber.checkoutStartedAt) {
      return res.status(400).json({ error: 'This subscriber has no abandoned checkout.' });
    }

    const result = await sendAutomationStepNow(flowId, subscriber, stepIndex ?? undefined);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
