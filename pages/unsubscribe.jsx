import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { T } from '../lib/theme';

export default function UnsubscribePage() {
  const router = useRouter();
  const [status, setStatus] = React.useState('idle'); // idle | submitting | done | error

  const token = router.query.token;

  const onUnsubscribe = async () => {
    setStatus('submitting');
    try {
      const res = await fetch(`/api/email/unsubscribe?token=${encodeURIComponent(String(token))}`, { method: 'POST' });
      if (!res.ok) throw new Error();
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paper }}>
      <Head>
        <title>Unsubscribe</title>
      </Head>

      <div style={{ maxWidth: 440, padding: 40, textAlign: 'center' }}>
        {status === 'done' ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>You're unsubscribed.</h1>
            <p style={{ color: T.soft, marginTop: 14 }}>You won't get any more emails from this sender.</p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Unsubscribe from these emails?</h1>
            <p style={{ color: T.soft, marginTop: 14 }}>One click and we'll stop emailing you.</p>
            <button
              onClick={onUnsubscribe}
              disabled={!token || status === 'submitting'}
              style={{
                marginTop: 24, background: T.ink, color: T.white, border: 'none', padding: '12px 28px',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {status === 'submitting' ? 'Unsubscribing…' : 'Unsubscribe'}
            </button>
            {status === 'error' && <p style={{ color: T.soft, marginTop: 14, fontSize: 13 }}>Something went wrong — try again.</p>}
          </>
        )}
      </div>
    </div>
  );
}
