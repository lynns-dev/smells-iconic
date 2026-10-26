import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { CartProvider, useCart } from '../lib/useCart';
import { loadPixel, fbTrack } from '../lib/fbPixel';
import { loadClarity } from '../lib/clarity';
import { captureAttribution, fbcToSync, markFbcSynced } from '../lib/attribution';
import { getSessionId, getVisitorId } from '../lib/session';
import { firstTimeThisSession } from '../lib/funnelTracking';

const HEARTBEAT_MS = 10000;
const PIXEL_ID = String(process.env.NEXT_PUBLIC_META_PIXEL_ID || '').replace(/^[\s'"]+|[\s'"]+$/g, '');
const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

// Fire-and-forget analytics pings live here (inside CartProvider, so it can
// read cart-open state) rather than duplicated across every page.
function Tracking() {
  const router = useRouter();
  const cart = useCart();
  const sessionIdRef = React.useRef(null);
  const journeyRef = React.useRef({ path: null, scrollPct: 0, field: null, sentSig: null });
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
    // Admin pages aren't store visits — they'd count the owner as traffic.
    if (isAdmin) return;
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
      body: JSON.stringify({ event: 'pageview', sessionId: getSessionId(), visitorId: getVisitorId(), path: window.location.pathname, ...(fbc ? { fbc } : {}), ...(visit ? { visit } : {}) }),
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

    // For admin's Visitors tab: the page they're on, how far down it they've
    // scrolled (deepest point), and the last form field they typed into —
    // sent only when one of those changes.
    const touch = () => {
      const t = journeyRef.current;
      // The first ping on a new page can run before the scroll tracker below
      // has noted the page, so read the path directly.
      if (t.path !== window.location.pathname) { t.path = window.location.pathname; t.scrollPct = 0; }
      const sig = `${t.path}|${t.scrollPct}|${t.field}`;
      if (sig === t.sentSig) return undefined;
      t.sentSig = sig;
      return { path: t.path, scrollPct: t.scrollPct, field: t.field };
    };

    const sendHeartbeat = () => {
      // An open admin tab isn't a live shopper.
      if (!sessionIdRef.current || router.pathname.startsWith('/admin')) return;
      fetch('/api/track/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, visitorId: getVisitorId(), stage: currentStage(), touch: touch() }),
        keepalive: true,
      }).catch(() => {});
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_MS);
    // Leaving or switching away: send what they last did straight away.
    const onHide = () => { if (document.visibilityState === 'hidden') sendHeartbeat(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [router.pathname, cart.open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deepest scroll on the current page, and the last field typed into.
  React.useEffect(() => {
    if (isAdmin) return undefined;
    const t = journeyRef.current;
    t.path = window.location.pathname;
    t.scrollPct = 0;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const pct = doc.scrollHeight <= window.innerHeight ? 100 : Math.round((window.scrollY / max) * 100);
      if (pct > t.scrollPct) t.scrollPct = Math.min(100, pct);
    };
    const fieldLabel = (el) => {
      if (!el) return null;
      if (el.tagName === 'IFRAME') return el.closest('#square-card-container') ? 'Card details' : null;
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.type === 'checkbox' || el.type === 'radio') return null;
      return el.getAttribute('aria-label') || el.placeholder || (el.tagName === 'SELECT' ? el.options?.[0]?.text : null) || el.name || null;
    };
    const onField = (e) => { const label = fieldLabel(e.target); if (label) t.field = label; };
    // Focus moving into the card form's iframe only shows up as the window
    // losing focus with the iframe as the active element.
    const onBlur = () => setTimeout(() => { const label = fieldLabel(document.activeElement); if (label) t.field = label; }, 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('focusin', onField);
    document.addEventListener('input', onField);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('focusin', onField);
      document.removeEventListener('input', onField);
      window.removeEventListener('blur', onBlur);
    };
  }, [router.asPath, isAdmin]);

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
