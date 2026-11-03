// Double opt-in confirmation link (kept for subscribers who signed up while
// double opt-in was in use). Confirms, queues the welcome series, and sends
// them back to the homepage.
import { confirmSubscriber, updateAutomationState } from '../../../lib/email/subscribersStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { token } = req.query;
  const subscriber = token ? await confirmSubscriber(String(token)) : null;
  if (!subscriber) return res.redirect(302, '/?confirmed=0');
  await updateAutomationState(subscriber.email, 'welcome_series', { step: 0 });
  return res.redirect(302, '/?confirmed=1');
}
