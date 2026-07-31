import React from 'react';
import Head from 'next/head';
import Header from './Header';
import Footer from './Footer';
import CartDrawer from './CartDrawer';
import { useCart } from '../lib/useCart';
import { T, S } from '../lib/theme';

export default function PolicyLayout({ title, updated, children }) {
  const c = useCart();
  return (
    <div>
      <Head>
        <title>{title} — The Sculpt Wand</title>
      </Head>
      <Header cartCount={c.count} onCartClick={() => c.setOpen(true)} />

      <section style={{ ...S.wrap, maxWidth: 760, padding: '80px 40px 100px' }}>
        <p style={S.label}>Legal</p>
        <h1 style={{ ...S.h2, fontSize: 'clamp(32px,4vw,48px)', marginTop: 14 }}>{title}</h1>
        {updated && <p style={{ color: T.soft, fontSize: 13, marginTop: 12 }}>Last updated {updated}</p>}
        <div style={body}>{children}</div>
      </section>

      <Footer />
      <CartDrawer {...c} onClose={() => c.setOpen(false)} />
    </div>
  );
}

export function PolicySection({ title, children }) {
  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontFamily: T.display, fontWeight: 400, fontSize: 21, marginBottom: 10 }}>{title}</h2>
      <div style={{ color: T.soft }}>{children}</div>
    </div>
  );
}

const body = {
  marginTop: 40,
  color: T.ink,
  fontSize: 15,
  lineHeight: 1.8,
};

