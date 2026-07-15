import { startSubscription } from '../../../lib/subscribersStore';
import { sendEmail } from '../../../lib/sesEmail';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  try {
    const subscriber = await startSubscription(email, 'newsletter');
    if (subscriber.status === 'subscribed') {
      return res.status(200).json({ ok: true, alreadySubscribed: true });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    const confirmUrl = `${baseUrl}/api/email/confirm?token=${subscriber.confirmToken}`;
    await sendEmail({
      to: subscriber.email,
      subject: 'Confirm your email — Smells Iconic',
      html: `<p>One click to get 15% off and first access to restocks.</p><p><a href="${confirmUrl}">Confirm your email</a></p>`,
      fromName: 'Smells Iconic',
      unsubToken: subscriber.unsubToken,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
