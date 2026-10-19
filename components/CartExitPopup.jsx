import React from 'react';
import { useRouter } from 'next/router';
import { T, S } from '../lib/theme';
import { trackCart } from '../lib/cartTracking';
import { grantFreeShipping } from '../lib/shippingPerk';

// Shown once (per device, every few days) when a shopper closes their cart
// without checking out: "What's holding you back?" with quick answers, then
// a nudge that fits the answer — free shipping, a discount code, reviews,
// the ways to pay. Every answer is recorded for admin's Cart drop-off report
// (lib/cartFunnel.js, "Told us: …").
//
// Opened by components/CartDrawer.jsx. Store-specific bits come in as props:
// discountCode/discountLabel (must exist in admin → Discounts), payments
// (the ways to pay, as shown), freeShipAt.

const ASKED_KEY = 'cart-exit-asked-at';
const ASK_EVERY_MS = 3 * 24 * 60 * 60 * 1000;

const ANSWERS = [
  ['shipping', 'Shipping cost'],
  ['price', 'The price'],
  ['reviews', 'Want to read reviews first'],
  ['payment', 'My way to pay isn’t here'],
  ['browsing', 'Just browsing for now'],
  ['other', 'Something else'],
];

// Whether to ask this shopper now (not asked in the last few days).
export function shouldAskCartExit() {
  try {
    return Date.now() - Number(window.localStorage.getItem(ASKED_KEY) || 0) > ASK_EVERY_MS;
  } catch {
    return false;
  }
}

function markAsked() {
  try { window.localStorage.setItem(ASKED_KEY, String(Date.now())); } catch { /* storage blocked */ }
}

export default function CartExitPopup({ open, onClose, cart, applyDiscount, discountCode, discountLabel, payments, freeShipAt }) {
  const router = useRouter();
  const [answer, setAnswer] = React.useState(null);
  const [otherText, setOtherText] = React.useState('');
  const [result, setResult] = React.useState(null); // { title, body, primary?, link? }

  React.useEffect(() => {
    if (!open) return;
    markAsked();
    setAnswer(null);
    setOtherText('');
    setResult(null);
  }, [open]);

  if (!open) return null;

  const firstItem = cart[0];
  const reviewsHref = firstItem ? `/product/${firstItem.id}#reviews` : '/';

  const checkout = () => {
    trackCart('checkout_click');
    onClose();
    router.push('/checkout');
  };

  const choose = async (key) => {
    setAnswer(key);
    if (key === 'other') return; // waits for their text
    trackCart('exit_answer', { answer: key });
    if (key === 'shipping') {
      grantFreeShipping();
      setResult({ title: 'Done — shipping’s on us', body: `Free shipping is on for your order for the next 24 hours${freeShipAt ? `, no $${freeShipAt} minimum` : ''}.`, primary: true });
    } else if (key === 'price') {
      const data = discountCode ? await applyDiscount(discountCode).catch(() => null) : null;
      if (data?.valid) {
        setResult({ title: `${discountLabel || 'A discount'} is yours`, body: `Code ${data.code} is applied to your bag.`, primary: true });
      } else {
        grantFreeShipping();
        setResult({ title: 'Here’s something to help', body: 'Free shipping is on for your order for the next 24 hours.', primary: true });
      }
    } else if (key === 'reviews') {
      setResult({ title: 'See what customers say', body: 'Real reviews from verified buyers are on the product page.', link: { href: reviewsHref, label: 'Read reviews' }, primary: true });
    } else if (key === 'payment') {
      setResult({ title: 'More ways to pay than you might think', body: `At checkout you can pay with ${payments}.`, primary: true });
    } else {
      setResult({ title: 'No rush', body: 'Your bag is saved on this device — it’ll be here when you come back.' });
    }
  };

  const sendOther = (e) => {
    e.preventDefault();
    trackCart('exit_answer', { answer: 'other', text: otherText });
    setResult({ title: 'Thank you', body: 'That really helps us. Your bag is saved on this device.' });
  };

  return (
    <div style={overlay} onClick={onClose} role="presentation">
      <div style={card} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Before you go">
        <button type="button" onClick={onClose} aria-label="Close" style={closeBtn}>×</button>

        {!result && answer !== 'other' && (
          <>
            <p style={{ ...S.label, margin: '0 0 10px' }}>Before you go</p>
            <h2 style={title}>What’s holding you back?</h2>
            <p style={sub}>One tap — it helps us (and we might be able to help you).</p>
            <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
              {ANSWERS.map(([key, label]) => (
                <button key={key} type="button" onClick={() => choose(key)} style={answerBtn}>{label}</button>
              ))}
            </div>
          </>
        )}

        {!result && answer === 'other' && (
          <form onSubmit={sendOther}>
            <h2 style={title}>Tell us what’s up</h2>
            <textarea
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="What would make you check out?"
              rows={3}
              maxLength={300}
              autoFocus
              style={textarea}
            />
            <button type="submit" disabled={!otherText.trim()} style={{ ...S.btnFill, width: '100%', justifyContent: 'center', marginTop: 12, opacity: otherText.trim() ? 1 : 0.5 }}>Send</button>
          </form>
        )}

        {result && (
          <>
            <h2 style={title}>{result.title}</h2>
            <p style={sub}>{result.body}</p>
            <div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
              {result.link && <a href={result.link.href} onClick={onClose} style={{ ...S.btnOutline, justifyContent: 'center', textAlign: 'center' }}>{result.link.label}</a>}
              {result.primary && cart.length > 0 && <button type="button" onClick={checkout} style={{ ...S.btnFill, width: '100%', justifyContent: 'center' }}>Check out now</button>}
              <button type="button" onClick={onClose} style={{ ...S.btnOutline, width: '100%', justifyContent: 'center' }}>Keep shopping</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(21,17,13,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const card = {
  position: 'relative', width: '100%', maxWidth: 400, background: T.white, padding: '30px 26px 24px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
};
const closeBtn = { position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: T.ink, lineHeight: 1 };
const title = { fontFamily: T.sans, fontWeight: 600, fontSize: 22, margin: 0, color: T.ink, lineHeight: 1.25 };
const sub = { fontSize: 14, color: T.ink, opacity: 0.75, margin: '8px 0 0', lineHeight: 1.5 };
const answerBtn = {
  width: '100%', textAlign: 'left', padding: '13px 14px', background: T.white, border: `1px solid ${T.line}`,
  fontFamily: T.sans, fontSize: 15, color: T.ink, cursor: 'pointer',
};
const textarea = {
  width: '100%', marginTop: 14, padding: 12, border: `1px solid ${T.line}`, fontFamily: T.sans, fontSize: 16,
  color: T.ink, boxSizing: 'border-box', resize: 'vertical',
};
