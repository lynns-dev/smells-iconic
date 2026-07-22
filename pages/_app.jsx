import React from 'react';
import { useRouter } from 'next/router';
import { CartProvider, useCart } from '../lib/useCart';
import { loadPixel, fbTrack } from '../lib/fbPixel';
import { loadClarity } from '../lib/clarity';
import { captureAttribution } from '../lib/attribution';
import { getSessionId } from '../lib/session';

const HEARTBEAT_MS = 10000;
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

// Fire-and-forget analytics pings live here (inside CartProvider, so it can
// read cart-open state) rather than duplicated across every page.
function Tracking() {
  const router = useRouter();
  const cart = useCart();
  const sessionIdRef = React.useRef(null);
  const isAdmin = router.pathname.startsWith('/admin');

  React.useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  // Meta Pixel — never on /admin, that traffic isn't customer activity.
  React.useEffect(() => {
    if (isAdmin || !PIXEL_ID) return;
    loadPixel(PIXEL_ID);
  }, [isAdmin]);

  // Microsoft Clarity — session recording/heatmaps, same admin exclusion.
  React.useEffect(() => {
    if (isAdmin || !CLARITY_PROJECT_ID) return;
    loadClarity(CLARITY_PROJECT_ID);
  }, [isAdmin]);

  React.useEffect(() => {
    if (isAdmin) return;
    fbTrack('PageView');
  }, [router.asPath, isAdmin]);

  // Which ad/campaign brought this visitor in — captured on every page load
  // so a landing page deep in the site (not just "/") still gets credit.
  React.useEffect(() => {
    if (isAdmin) return;
    captureAttribution();
  }, [router.asPath, isAdmin]);

  React.useEffect(() => {
    fetch('/api/track/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'pageview' }),
      keepalive: true,
    }).catch(() => {});
  }, [router.asPath]);

  // ?discount=CODE auto-applies a code from a shareable/email link, then
  // strips it from the URL so it doesn't linger or get re-applied on a
  // later navigation within the same page. Waits on cart.hydrated so this
  // can't race the effect in useCart.js that restores a previously-saved
  // discount from localStorage on first mount.
  React.useEffect(() => {
    if (isAdmin || !cart.hydrated) return;
    const code = router.query.discount;
    if (!code || Array.isArray(code)) return;
    cart.applyDiscount(code).then(() => {
      const { discount, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    });
  }, [isAdmin, cart.hydrated, cart.applyDiscount, router.query.discount, router.pathname]);

  React.useEffect(() => {
    const currentStage = () => {
      if (router.pathname === '/success') return 'purchased';
      if (router.pathname === '/checkout') return 'checkout';
      if (cart.open) return 'cart_open';
      return 'browsing';
    };

    const sendHeartbeat = () => {
      if (!sessionIdRef.current) return;
      fetch('/api/track/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, stage: currentStage() }),
        keepalive: true,
      }).catch(() => {});
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [router.pathname, cart.open]);

  return null;
}

export default function App({ Component, pageProps }) {
  const router = useRouter();

  return (
    <CartProvider>
      <Tracking />
      <div key={router.asPath} className="page-fade">
        <Component {...pageProps} />
      </div>
      <style jsx global>{`
        .page-fade {
          animation: page-fade-in 0.28s ease both;
        }
        @keyframes page-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .page-fade { animation: none; }
        }
      `}</style>
    </CartProvider>
  );
}
