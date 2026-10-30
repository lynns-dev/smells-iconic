import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { T, S } from '../../lib/adminTheme';
import AdminFonts from '../../components/AdminFonts';

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed.');
      await router.push('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paper }}>
      <Head>
        <title key="title">Smells Iconic Admin</title>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <meta name="theme-color" content={T.ink} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Smells Iconic Admin" />
      </Head>
      <AdminFonts />
      <form onSubmit={handleSubmit} style={{ width: 340, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', padding: '40px 32px', background: T.white, borderRadius: 22, boxShadow: T.shadow }}>
        <span className="admin-serif" style={{ fontSize: 32, display: 'block', marginBottom: 4, textAlign: 'center' }}>Smells Iconic</span>
        <p style={{ ...S.label, fontWeight: 500, marginBottom: 28, textAlign: 'center' }}>Sign in to Admin</p>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: '100%', height: 46, padding: '0 14px', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 12, background: T.white,
            fontFamily: T.sans, fontSize: 14, color: T.ink, outline: 'none', boxSizing: 'border-box',
          }}
          autoFocus
          required
        />
        {error && <p style={{ color: '#a13d2b', fontSize: 13, marginTop: 12 }}>{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          style={{ ...S.btnFill, width: '100%', height: 46, fontSize: 15, justifyContent: 'center', marginTop: 16, opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
