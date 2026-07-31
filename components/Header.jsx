import React from 'react';
import Link from 'next/link';
import { T } from '../lib/theme';

export default function Header({ cartCount = 0, onCartClick, overlay = false, scrolled = false }) {
  const transparent = overlay && !scrolled;
  const linkColor = transparent ? T.white : T.ink;

  return (
    <header
      style={{
        ...styles.header,
        position: overlay ? (scrolled ? 'fixed' : 'absolute') : 'sticky',
        background: transparent ? 'transparent' : 'rgba(255,253,251,0.92)',
        backdropFilter: transparent ? 'none' : 'blur(10px)',
        borderBottom: transparent ? '1px solid transparent' : `1px solid ${T.line}`,
        transition: 'background .35s ease, border-color .35s ease',
      }}
    >
      <div style={styles.nav}>
        <Link href="/" style={{ ...styles.logoLink, ...styles.wordmark, color: linkColor }}>
          The Sculpt Wand
        </Link>
        <button onClick={onCartClick} style={{ ...styles.cartBtn, color: linkColor, borderColor: linkColor }} aria-label="Open cart">
          Cart{cartCount > 0 ? ` (${cartCount})` : ''}
        </button>
      </div>
    </header>
  );
}

const styles = {
  header: {
    top: 0, left: 0, right: 0, zIndex: 100,
  },
  nav: {
    maxWidth: T.maxw, margin: '0 auto', padding: '16px 32px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  cartBtn: {
    fontFamily: T.sans, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
    background: 'none', border: '1.5px solid', borderRadius: 999, padding: '8px 18px',
    cursor: 'pointer', transition: 'color .35s ease, border-color .35s ease',
  },
  logoLink: { flex: '0 0 auto' },
  wordmark: {
    fontFamily: T.display, fontStyle: 'italic', fontWeight: 600, fontSize: 22, letterSpacing: '0.01em', whiteSpace: 'nowrap',
    transition: 'color .35s ease',
  },
};
