import { confirmSubscriber, updateAutomationState } from '../../../lib/subscribersStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.query;
  const subscriber = token ? await confirmSubscriber(String(token)) : null;

  if (!subscriber) {
    return res.redirect(302, '/?confirmed=0');
  }

  // Kicks off the welcome series — the cron in pages/api/cron/automations.js
  // picks up step 0 on its next run since dueAt (confirmedAt + delayDays)
  // is already in the past for a delayDays: 0 first step.
  await updateAutomationState(subscriber.email, 'welcome_series', { step: 0 });

  return res.redirect(302, '/?confirmed=1');
}
