import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import CartDrawer from '../components/CartDrawer';
import { useCart } from '../lib/useCart';
import { T, S } from '../lib/theme';

export default function UnsubscribePage() {
  const router = useRouter();
  const c = useCart();
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
    <div>
      <Head>
        <title>Unsubscribe — Smells Iconic</title>
      </Head>
      <Header cartCount={c.count} onCartClick={() => c.setOpen(true)} />

      <section style={{ ...S.wrap, maxWidth: 560, padding: '100px 40px', textAlign: 'center' }}>
        {status === 'done' ? (
          <>
            <h1 style={{ ...S.h2, fontSize: 28 }}>You're unsubscribed.</h1>
            <p style={{ color: T.soft, marginTop: 14 }}>You won't get any more emails from us. Sorry to see you go.</p>
          </>
        ) : (
          <>
            <h1 style={{ ...S.h2, fontSize: 28 }}>Unsubscribe from Smells Iconic emails?</h1>
            <p style={{ color: T.soft, marginTop: 14 }}>One click and we'll stop emailing you.</p>
            <button
              onClick={onUnsubscribe}
              disabled={!token || status === 'submitting'}
              style={{
                marginTop: 28, background: T.ink, color: T.white, border: 'none', padding: '14px 32px',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer',
              }}
            >
              {status === 'submitting' ? 'Unsubscribing…' : 'Unsubscribe'}
            </button>
            {status === 'error' && <p style={{ color: T.soft, marginTop: 14, fontSize: 13 }}>Something went wrong — try again.</p>}
          </>
        )}
      </section>

      <Footer />
      <CartDrawer {...c} onClose={() => c.setOpen(false)} />
    </div>
  );
}
