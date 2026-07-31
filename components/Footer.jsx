import React from 'react';
import Link from 'next/link';
import { T, S } from '../lib/theme';

export default function Footer() {
  return (
    <footer style={footer}>
      <div style={{ ...S.wrap, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 18 }}>
        <span style={{ fontFamily: T.display, fontStyle: 'italic', fontWeight: 600, fontSize: 18, color: T.ink }}>The Sculpt Wand</span>
        <Link href="/terms" style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.soft }}>Terms &amp; Conditions</Link>
        <small style={{ width: '100%', color: T.soft, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
          © {new Date().getFullYear()} The Sculpt Wand. All rights reserved.
        </small>
      </div>
    </footer>
  );
}

const footer = { borderTop: `1px solid ${T.line}`, padding: '32px 0' };
