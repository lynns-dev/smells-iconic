// Manual checkout recovery requires recorded SMS consent.
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
  if (!consented) return <span style={{ fontSize: 12, color: T.soft }}>SMS opt-in required</span>;

  const post = () => fetch('/api/admin/abandoned-sms-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: contactKey }),
  }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

  const send = async () => {
    if (!window.confirm(`Text ${phone} a checkout recovery link? Twilio messaging charges apply.`)) return;
    setState({ busy: true, sentAt: null, error: '' });
    try {
      const { ok, data } = await post();
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
