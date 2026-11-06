import { getAutomations, updateAutomation, updateStepContent, setStepAbTest, syncAutomationDesign } from '../../../../lib/email/automationsStore';
import { getFlowStats } from '../../../../lib/email/flowStats';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const automations = await getAutomations();
      // The scheduled sender (pages/api/cron/email-automations.js) refuses
      // to run without these, so admin warns that "Enabled" flows aren't
      // actually going out.
      const sendingReady = { cronSecret: Boolean(process.env.CRON_SECRET), resendKey: Boolean(process.env.RESEND_API_KEY) };
      return res.status(200).json({ automations, sendingReady });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    const { id, enabled, steps } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Automation id is required.' });
    try {
      // Steps go through updateStepContent, which only takes the editable
      // fields and keeps the stored stats/link targets — posting the page's
      // (possibly hours-old) copy back used to wipe click counts.
      let automation = null;
      if (steps !== undefined) automation = await updateStepContent(id, steps);
      if (enabled !== undefined) automation = await updateAutomation(id, { enabled: Boolean(enabled) });
      if (!automation) return res.status(400).json({ error: 'Nothing to update.' });
      return res.status(200).json({ automation });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { action, id, stepIndex, subject, html, winner } = req.body || {};
    // A/B tests: { action: 'ab-start', id, stepIndex, subject, html } and
    // { action: 'ab-end', id, stepIndex, winner: 'a'|'b' }.
    if (action === 'ab-start' || action === 'ab-end') {
      try {
        const idx = Number(stepIndex);
        let results = null;
        if (action === 'ab-end') {
          const flow = (await getAutomations()).find((a) => a.id === id);
          const testId = flow?.steps?.[idx]?.abTest?.testId;
          if (testId) results = (await getFlowStats([{ flowId: id, stepIndex: idx }])).get(`${id}:${idx}`)?.tests?.[testId] || null;
        }
        const automation = await setStepAbTest(String(id), idx, action === 'ab-start' ? 'start' : 'end', { subject, html, winner, results });
        return res.status(200).json({ automation });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }
    if (action !== 'sync-design') return res.status(400).json({ error: 'Unknown action.' });
    try {
      const automations = await syncAutomationDesign();
      return res.status(200).json({ automations });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', 'GET, PUT, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
