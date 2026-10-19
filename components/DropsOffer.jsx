import React from 'react';
import { useRouter } from 'next/router';
import { getProductById } from '../lib/products';
import { useCart } from '../lib/useCart';
import { T } from '../lib/theme';

// Limited-time offer block for The Current Drops Set, shown on product
// pages in place of the reviews headline. The countdown runs to a real
// deadline (OFFER_ENDS_AT) and the whole block disappears once it passes,
// so "limited time" is never a loop that quietly restarts. To run another
// offer, set a new OFFER_ENDS_AT.
//
// Everything shown is real: price and savings come from lib/products.js,
// the rating line only appears once the set has approved reviews.

const SET_ID = 'current-drops-set';
export const OFFER_ENDS_AT = Date.parse('2026-10-24T23:59:59-07:00'); // Oct 24, 11:59pm Pacific

const BENEFITS = [
  'Three full-size 100ml body mists',
  'Babygirl · Ginger Crème · Cherry Afterglow',
  '25% less than buying them separately',
  'Free shipping on every order',
];
const PAYMENTS = ['Visa', 'Mastercard', 'Amex', 'Apple Pay', 'Google Pay', 'PayPal', 'Afterpay', 'Cash App Pay'];

function remaining(now) {
  const ms = Math.max(0, OFFER_ENDS_AT - now);
  const s = Math.floor(ms / 1000);
  return { ms, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

export default function DropsOffer() {
  const router = useRouter();
  const cart = useCart();
  const set = getProductById(SET_ID);
  // Rendered only after mount, so the server and browser clocks can't
  // disagree about the countdown.
  const [now, setNow] = React.useState(null);
  const [rating, setRating] = React.useState(null);

  React.useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    fetch(`/api/reviews?productId=${SET_ID}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.count > 0) setRating({ average: d.average, count: d.count }); })
      .catch(() => {});
  }, []);

  if (!set || now === null) return null;
  const left = remaining(now);
  if (left.ms <= 0) return null;

  const savings = (set.originalPrice || set.price) - set.price;
  const endsLabel = new Date(OFFER_ENDS_AT).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });

  const buyNow = () => {
    cart.add(set, 1);
    router.push('/checkout');
  };

  return (
    <section style={wrap} aria-label="Limited time offer">
      <div style={{ textAlign: 'center' }}>
        <span style={banner}>— Limited time offer —</span>
        <h2 style={headline}>
          {savings > 0 && <span style={{ color: T.soft }}>Get ${savings} off </span>}
          {set.name}
        </h2>
        <div style={clockRow} role="timer" aria-live="off" aria-label={`Offer ends in ${left.days} days, ${left.hours} hours`}>
          {[['Days', left.days], ['Hours', left.hours], ['Minutes', left.minutes], ['Seconds', left.seconds]].map(([label, value]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={clockBox}>{String(value).padStart(2, '0')}</div>
              <div style={clockLabel}>{label}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: T.soft, marginTop: 10 }}>Offer ends {endsLabel} at 11:59pm PT</p>
      </div>

      <div className="drops-offer-grid" style={grid}>
        <div style={imageBox}>
          <img src={set.images[0]} alt={set.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>

        <div>
          {rating && (
            <p style={{ fontSize: 13, margin: '0 0 10px' }}>
              <span style={{ letterSpacing: '1.5px' }}>{'★'.repeat(Math.round(rating.average))}{'☆'.repeat(5 - Math.round(rating.average))}</span>
              {' '}{rating.average.toFixed(1)}/5 from {rating.count} review{rating.count === 1 ? '' : 's'}
            </p>
          )}
          <h3 style={title}>{set.name}</h3>
          <p style={{ fontSize: 15, lineHeight: 1.55, margin: '0 0 16px', maxWidth: '44ch' }}>
            All three current drops in one collectible set — a scent for every mood, for 25% less.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            {set.originalPrice > set.price && <s style={{ color: T.soft, fontSize: 16 }}>${set.originalPrice}</s>}
            <span style={{ fontFamily: T.display, fontSize: 26 }}>${set.price}</span>
            {savings > 0 && <span style={savingsPill}>Today’s savings: ${savings}</span>}
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px' }}>
            {BENEFITS.map((b) => (
              <li key={b} style={{ display: 'flex', gap: 10, fontSize: 14, padding: '5px 0' }}>
                <span aria-hidden="true">✓</span>{b}
              </li>
            ))}
          </ul>

          <button type="button" onClick={buyNow} style={cta}>
            <span style={{ fontSize: 15, letterSpacing: '0.16em' }}>Buy now — ${set.price}</span>
            <span style={{ fontSize: 10, letterSpacing: '0.12em', opacity: 0.75, marginTop: 4 }}>Secure checkout · Free shipping</span>
          </button>

          <p style={{ fontSize: 12, color: T.soft, margin: '12px 0 14px' }}>Ships in 2–4 days · Free shipping on every order</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label="Ways to pay">
            {PAYMENTS.map((p) => <span key={p} style={payChip}>{p}</span>)}
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 760px) {
          .drops-offer-grid { grid-template-columns: 1fr !important; gap: 22px !important; }
        }
      `}</style>
    </section>
  );
}

const wrap = { maxWidth: 980, margin: '0 auto', padding: '56px 40px 40px' };
const banner = { display: 'inline-block', background: T.paper, padding: '7px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase' };
const headline = { fontFamily: T.display, fontWeight: 400, fontSize: 'clamp(26px,3.4vw,40px)', lineHeight: 1.1, margin: '16px 0 18px' };
const clockRow = { display: 'flex', justifyContent: 'center', gap: 10 };
const clockBox = { minWidth: 56, padding: '10px 8px', background: T.ink, color: T.white, fontFamily: T.display, fontSize: 28, lineHeight: 1 };
const clockLabel = { fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.soft, marginTop: 6 };
const grid = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 40, alignItems: 'start', marginTop: 36 };
const imageBox = { aspectRatio: '4/5', background: T.paper, overflow: 'hidden', border: `1px solid ${T.line}` };
const title = { fontFamily: T.display, fontWeight: 400, fontSize: 28, lineHeight: 1.15, margin: '0 0 10px' };
const savingsPill = { border: `1px solid ${T.ink}`, borderRadius: 999, padding: '4px 12px', fontSize: 12 };
const cta = { width: '100%', minHeight: 60, background: T.ink, color: T.white, border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: T.sans, fontWeight: 700, textTransform: 'uppercase', padding: '10px 16px' };
const payChip = { border: `1px solid ${T.line}`, padding: '4px 9px', fontSize: 11, background: T.white };
