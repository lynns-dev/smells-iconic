import React from 'react';
import Head from 'next/head';
import Header from '../components/Header';
import Footer from '../components/Footer';
import CartDrawer from '../components/CartDrawer';
import { useCart } from '../lib/useCart';
import { T, S } from '../lib/theme';

// Contact form → admin Inbox (pages/api/contact.js). Replies come back by
// email from hello@smellsiconic.com.
export default function Contact() {
  const c = useCart();
  const [form, setForm] = React.useState({ name: '', email: '', orderNumber: '', text: '', website: '' });
  const [status, setStatus] = React.useState('idle');
  const [error, setError] = React.useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again?');
      setStatus('sent');
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  };

  return (
    <div>
      <Head>
        <title key="title">Contact — Smells Iconic</title>
      </Head>
      <Header cartCount={c.count} onCartClick={() => c.setOpen(true)} />

      <section style={{ ...S.wrap, maxWidth: 640, padding: '80px 24px 100px' }}>
        <p style={S.label}>Contact</p>
        <h1 style={{ ...S.h2, fontSize: 'clamp(32px,4vw,48px)', marginTop: 14 }}>Talk to us.</h1>
        <p style={{ color: T.soft, fontSize: 15, lineHeight: 1.7, marginTop: 12 }}>
          Questions about your order, a scent, or anything else — send it here and we&rsquo;ll reply by email, usually within a day.
        </p>

        {status === 'sent' ? (
          <div style={{ marginTop: 36, padding: 24, background: T.paper }}>
            <p style={{ fontFamily: T.display, fontSize: 21, margin: 0 }}>Got it — thank you.</p>
            <p style={{ color: T.soft, fontSize: 15, margin: '8px 0 0' }}>We&rsquo;ll write back to {form.email} soon.</p>
          </div>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 36, display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <input placeholder="Name" value={form.name} onChange={set('name')} style={field} autoComplete="name" />
              <input placeholder="Email *" type="email" required value={form.email} onChange={set('email')} style={field} autoComplete="email" />
            </div>
            <input placeholder="Order number (if it’s about an order)" value={form.orderNumber} onChange={set('orderNumber')} style={field} />
            <textarea placeholder="Your message *" required rows={7} value={form.text} onChange={set('text')} style={{ ...field, height: 'auto', padding: 14, resize: 'vertical', fontFamily: 'inherit' }} />
            {/* Honeypot — hidden from people, filled by bots (pages/api/contact.js). */}
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
            {error && <p style={{ color: '#a13d2b', fontSize: 14, margin: 0 }}>{error}</p>}
            <div>
              <button type="submit" disabled={status === 'sending'} style={{ ...S.btnFill, opacity: status === 'sending' ? 0.6 : 1 }}>
                {status === 'sending' ? 'Sending…' : 'Send message'}
              </button>
            </div>
            <p style={{ color: T.soft, fontSize: 13, margin: 0 }}>
              Prefer email? <a href="mailto:hello@smellsiconic.com" style={{ textDecoration: 'underline' }}>hello@smellsiconic.com</a>
            </p>
          </form>
        )}
      </section>

      <Footer />
      <CartDrawer {...c} onClose={() => c.setOpen(false)} />
    </div>
  );
}

const field = { height: 48, padding: '0 14px', border: `1px solid ${T.line}`, background: '#FFFFFF', fontSize: 15, color: T.ink, width: '100%', boxSizing: 'border-box' };
