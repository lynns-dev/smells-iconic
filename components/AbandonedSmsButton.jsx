// "Send abandoned checkout text" — admin → Visitors and admin → Email →
// Subscribers. Texts the shopper a link back to checkout with their cart
// (pages/api/admin/abandoned-sms-send.js). Anyone who typed a phone
// number can be texted, except numbers that replied STOP; numbers with no
// text consent on file get an extra warning before sending.
import React from 'react';
import { T, S } from '../lib/adminTheme';

function ago(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AbandonedSmsButton({ contactKey, phone, smsStatus, sentAt: initialSentAt, hasCart = true }) {
  const [state, setState] = React.useState({ busy: false, sentAt: null, error: '' });
  if (!phone) return null;
  const sentAt = state.sentAt || initialSentAt;
  if (smsStatus === 'unsubscribed') return <span style={{ fontSize: 12, color: T.soft }}>Opted out of texts (STOP)</span>;
  if (!hasCart) return null;
  const consented = smsStatus === 'subscribed';

  const post = (confirmNoConsent) => fetch('/api/admin/abandoned-sms-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: contactKey, confirmNoConsent }),
  }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

  const send = async () => {
    const warn = consented ? '' : '\n\nThis number has NOT opted in to texts (they didn’t tick “Text me” at checkout). Texting marketing without written consent is a TCPA risk (fines per text). Only send if you’re comfortable with that.';
    if (!window.confirm(`Text ${phone} a link back to their checkout now? Uses 1 ResendSMS credit.${warn}`)) return;
    setState({ busy: true, sentAt: null, error: '' });
    try {
      const { ok, data } = await post(!consented);
      if (!ok) throw new Error(data.error || 'Could not send the text.');
      setState({ busy: false, sentAt: data.sentAt, error: '' });
    } catch (err) {
      setState({ busy: false, sentAt: null, error: err.message });
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" onClick={send} disabled={state.busy} style={{ ...S.btnOutline, height: 32, padding: '0 12px', fontSize: 12, opacity: state.busy ? 0.6 : 1 }}>
        {state.busy ? 'Texting…' : sentAt ? 'Text again' : 'Send abandoned checkout text'}
      </button>
      {!consented && <span style={{ fontSize: 11, color: T.soft }}>no text consent</span>}
      {sentAt && <span style={{ fontSize: 12, color: T.ink }}>Texted {ago(sentAt)}</span>}
      {state.error && <span style={{ fontSize: 12, color: '#a13d2b' }}>{state.error}</span>}
    </span>
  );
}
