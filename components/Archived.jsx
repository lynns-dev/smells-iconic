// Archived products (`archived: true` in lib/products.js): a big black X
// drawn over the product image, and a one-click "Bring it back" vote in
// place of Add to cart. Votes go to the admin Inbox via
// pages/api/bring-back.js.

import React from 'react';
import { getVisitorId } from '../lib/session';
import { T, S } from '../lib/theme';

// Place inside a position: relative image wrapper.
export function ArchivedX({ stamp = true }) {
  return (
    <div style={overlay} aria-label="Archived">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
        <line className="archived-x-line" x1="8" y1="8" x2="92" y2="92" pathLength="1" style={stroke} />
        <line className="archived-x-line archived-x-line-2" x1="92" y1="8" x2="8" y2="92" pathLength="1" style={stroke} />
      </svg>
      {stamp && <span style={stampStyle}>Archived</span>}
      <style jsx>{`
        .archived-x-line {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: archived-x-draw 0.45s cubic-bezier(0.6, 0, 0.2, 1) 0.15s forwards;
        }
        .archived-x-line-2 { animation-delay: 0.5s; }
        @keyframes archived-x-draw { to { stroke-dashoffset: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .archived-x-line { animation: none; stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}

const STORAGE_PREFIX = 'si-bringback-';

// One click votes; the browser remembers it so the button stays "voted".
export function BringBackButton({ product, dark = false, compact = false, style }) {
  const [voted, setVoted] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [count, setCount] = React.useState(null);
  const [error, setError] = React.useState('');

  // Keep every button for this product in step (product page + sticky bar).
  React.useEffect(() => {
    const onVote = (ev) => {
      if (ev.detail?.id !== product.id) return;
      setVoted(true);
      setCount(ev.detail.count);
    };
    window.addEventListener('si-bringback', onVote);
    return () => window.removeEventListener('si-bringback', onVote);
  }, [product.id]);

  React.useEffect(() => {
    try { setVoted(window.localStorage.getItem(STORAGE_PREFIX + product.id) === '1'); } catch {}
    if (compact) return;
    fetch(`/api/bring-back?productId=${encodeURIComponent(product.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (typeof d?.count === 'number') setCount(d.count); })
      .catch(() => {});
  }, [product.id, compact]);

  const vote = async () => {
    if (voted || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/bring-back', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, voterId: getVisitorId() || `anon-${Math.random().toString(36).slice(2)}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'That didn’t go through.');
      window.dispatchEvent(new CustomEvent('si-bringback', { detail: { id: product.id, count: data.count } }));
      try { window.localStorage.setItem(STORAGE_PREFIX + product.id, '1'); } catch {}
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const base = dark ? { ...S.btnFill, background: T.white, color: T.ink } : S.btnFill;
  const votedStyle = dark
    ? { background: 'transparent', color: T.white, border: `1px solid ${T.dline}` }
    : { background: 'transparent', color: T.ink, border: `1px solid ${T.ink}` };

  return (
    <div style={{ textAlign: 'center', ...style }}>
      <button
        onClick={vote}
        disabled={voted || sending}
        style={{ ...base, width: '100%', justifyContent: 'center', ...(voted ? votedStyle : {}), cursor: voted ? 'default' : 'pointer', opacity: sending ? 0.6 : 1 }}
      >
        {voted ? 'Voted ✓ — we’re listening' : sending ? 'Sending…' : 'Vote to bring it back'}
      </button>
      {!compact && (
        <div style={{ fontSize: 12, color: dark ? 'rgba(251,245,241,0.7)' : T.soft, marginTop: 8, minHeight: 16 }}>
          {error || (count > 0 ? `${count} ${count === 1 ? 'vote' : 'votes'} to bring it back` : 'Archived — one click tells us you want it back.')}
        </div>
      )}
      {compact && error && <div style={{ fontSize: 12, color: '#a13d2b', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const overlay = {
  position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
  background: 'rgba(251,245,241,0.18)', backdropFilter: 'grayscale(1)', WebkitBackdropFilter: 'grayscale(1)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
// In viewBox units, so the X scales with the image it covers.
const stroke = { stroke: T.ink, strokeWidth: 2.2, strokeLinecap: 'square' };
const stampStyle = {
  position: 'relative', background: T.ink, color: T.white, transform: 'rotate(-8deg)',
  fontFamily: T.display, fontSize: 'clamp(13px, 1.6vw, 20px)', letterSpacing: '0.22em', textTransform: 'uppercase',
  padding: '8px 16px', boxShadow: `0 0 0 3px ${T.white}`,
};
