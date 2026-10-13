import React from 'react';
import Link from 'next/link';
import { T, S } from '../lib/theme';

export default function Footer() {
  return (
    <footer style={footer}>
      <div style={{ ...S.wrap, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 18 }}>
        <span style={{ fontFamily: T.display, fontWeight: 400, fontSize: 16 }}>SMELLS — ICONIC</span>
        <div style={{ display: 'flex', gap: 24, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.soft }}>
          <Link href="/shop">Shop</Link>
          <Link href="/#notes">Scent</Link>
          <Link href="/#reviews">Reviews</Link>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.soft, width: '100%', paddingTop: 20, borderTop: `1px solid ${T.line}`, marginTop: 4 }}>
          <Link href="/terms">Terms & Conditions</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/returns">Return Policy</Link>
          <Link href="/shipping">Shipping Policy</Link>
        </div>
        <small style={{ width: '100%', color: T.soft, fontSize: 11 }}>
          Body mist · Smells Iconic, an archive.
        </small>
      </div>
    </footer>
  );
}

const footer = { borderTop: `1px solid ${T.line}`, padding: '36px 0' };
