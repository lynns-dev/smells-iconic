import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { T } from '../lib/theme';
import TopBanner from './TopBanner';

export default function Header({ cartCount = 0, onCartClick, overlay = false, scrolled = false }) {
  const router = useRouter();
  const active = (p) => router.pathname === p;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const closeMenu = () => setMenuOpen(false);

  const transparent = overlay && !scrolled;
  const linkColor = transparent ? T.white : T.ink;

  return (
    <header
      style={{
        ...styles.header,
        position: overlay ? (scrolled ? 'fixed' : 'absolute') : 'sticky',
        background: transparent ? 'transparent' : 'rgba(251,245,241,0.9)',
        backdropFilter: transparent ? 'none' : 'blur(10px)',
        borderBottom: transparent ? '1px solid transparent' : `1px solid ${T.line}`,
        transition: 'background .35s ease, border-color .35s ease',
      }}
    >
      <TopBanner />
      <div style={styles.nav}>
        <div style={styles.side}>
          <div className="desktop-links" style={styles.desktopLinks}>
            <Link href="/shop" style={{ ...styles.navLink, color: linkColor, opacity: active('/shop') ? 1 : 0.7 }}>Shop</Link>
            <a href="/#notes" style={{ ...styles.navLink, color: linkColor }}>Scent</a>
          </div>
          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen((o) => !o)}
            style={styles.hamburgerBtn}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <span style={{ ...styles.hamburgerLine, background: linkColor }} />
            <span style={{ ...styles.hamburgerLine, background: linkColor }} />
            <span style={{ ...styles.hamburgerLine, background: linkColor }} />
          </button>
        </div>
        <Link href="/" style={{ ...styles.logoLink, ...styles.wordmark, color: linkColor }}>
          SMELLS — ICONIC
        </Link>
        <div style={{ ...styles.side, justifyContent: 'flex-end' }}>
          <a href="/#reviews" className="reviews-link" style={{ ...styles.navLink, color: linkColor }}>Reviews</a>
          <button onClick={onCartClick} style={{ ...styles.cartBtn, color: linkColor }} aria-label="Open cart">
            Cart{cartCount > 0 ? ` (${cartCount})` : ''}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="mobile-menu" style={styles.mobileMenu}>
          <Link href="/shop" onClick={closeMenu} style={styles.mobileMenuLink}>Shop</Link>
          <a href="/#notes" onClick={closeMenu} style={styles.mobileMenuLink}>Scent</a>
          <a href="/#reviews" onClick={closeMenu} style={styles.mobileMenuLink}>Reviews</a>
        </div>
      )}

      <style jsx>{`
        .desktop-links { display: flex; }
        .hamburger-btn { display: none; }
        @media (max-width: 680px) {
          .desktop-links { display: none; }
          .hamburger-btn { display: flex; }
          .reviews-link { display: none; }
        }
      `}</style>
    </header>
  );
}

const styles = {
  header: {
    top: 0, left: 0, right: 0, zIndex: 100,
  },
  nav: {
    maxWidth: T.maxw, margin: '0 auto', padding: '14px 40px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  side: { display: 'flex', gap: 30, flex: 1, alignItems: 'center' },
  desktopLinks: { gap: 30, alignItems: 'center' },
  navLink: {
    fontFamily: T.sans, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
    transition: 'color .35s ease',
  },
  hamburgerBtn: {
    flexDirection: 'column', justifyContent: 'center', gap: 5,
    width: 22, height: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  },
  hamburgerLine: { display: 'block', width: '100%', height: 1, transition: 'background .35s ease' },
  cartBtn: {
    fontFamily: T.sans, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
    background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color .35s ease',
  },
  logoLink: { flex: '0 0 auto' },
  wordmark: {
    fontFamily: T.display, fontSize: 15, letterSpacing: '0.01em', whiteSpace: 'nowrap',
    transition: 'color .35s ease',
  },
  mobileMenu: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    background: T.white, borderBottom: `1px solid ${T.line}`,
    display: 'flex', flexDirection: 'column', padding: '20px 40px', gap: 20,
  },
  mobileMenuLink: {
    fontFamily: T.sans, fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.ink,
  },
};
