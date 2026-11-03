// Sends arbitrary composer/step content to an arbitrary address for
// visual QA — deliberately separate from send-campaign.js and
// send-automation-step.js, neither of which fit: both require an
// existing subscriber (for personalization/unsub tokens) and both
// mutate real state (campaign stats, automationState step counters,
// send/click logs). A test send does none of that — same preview-mode
// rendering the composer's own live iframe already uses (sample
// {{CART_ITEMS}}, '#' for {{UNSUB_URL}}), just mailed instead of shown
// in an iframe. Real links in the content are left untouched (not
// wrapped for click-tracking), so a tester can actually click through.

import { renderEmailHtml } from '../../../../lib/email/emailBlocks';
import { getSettings } from '../../../../lib/email/settingsStore';
import { sendEmail } from '../../../../lib/email/resendEmail';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, subject, contentHtml } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!contentHtml || !contentHtml.trim()) {
    return res.status(400).json({ error: 'No content to send — paste some HTML first.' });
  }

  try {
    const settings = await getSettings();
    const html = renderEmailHtml(contentHtml, settings, { preview: true });
    await sendEmail({
      to: email.trim(),
      subject: subject?.trim() ? `[TEST] ${subject.trim()}` : '[TEST] Email preview',
      html,
      unsubToken: 'test-send',
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
