import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { CartProvider, useCart } from '../lib/useCart';
import { loadPixel, fbTrack } from '../lib/fbPixel';
import { loadClarity } from '../lib/clarity';
import { captureAttribution, fbcToSync, markFbcSynced } from '../lib/attribution';
import { getSessionId } from '../lib/session';
import { firstTimeThisSession } from '../lib/funnelTracking';

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
    // The Meta click ID, once per visit, so the server can re-issue the _fbc
    // cookie with a lifetime the browser will honor (lib/metaClickId.js).
    // Runs after captureAttribution above, so a fresh ad click is included.
    const fbc = isAdmin ? null : fbcToSync();
    // Once per visit: the landing page with every URL parameter and the
    // referrer, for admin's Visitors tab.
    const visit = !isAdmin && firstTimeThisSession('visit') ? {
      landing: window.location.pathname,
      params: Object.fromEntries(new URLSearchParams(window.location.search)),
      referrer: document.referrer || null,
    } : null;
    fetch('/api/track/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'pageview', sessionId: getSessionId(), ...(fbc ? { fbc } : {}), ...(visit ? { visit } : {}) }),
      keepalive: true,
    }).then((r) => { if (fbc && r.ok) markFbcSynced(fbc); }).catch(() => {});
  }, [router.asPath]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {/* Default browser-tab title; pages with their own (product pages,
          policies, admin) override it via the same key. */}
      <Head>
        <title key="title">Smells Iconic — Smell like the main character</title>
      </Head>
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
