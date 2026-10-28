import React, { useEffect, useState } from 'react';
import { T } from '../lib/theme';
import { activePromo } from '../lib/promos';

// The running holiday sale (lib/promos.js), or null. Checked after mount
// since storefront pages are statically built.
export function useActivePromo() {
  const [promo, setPromo] = useState(null);
  useEffect(() => { setPromo(activePromo()); }, []);
  return promo;
}

// Holiday sale box for the cart and checkout: shows the code with a
// one-tap Apply, or confirms it once it's on the order. onApply(code)
// should apply the code and resolve to the validate-discount response.
export default function SaleCallout({ appliedDiscount, onApply, style }) {
  const promo = useActivePromo();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!promo) return null;

  const applied = appliedDiscount?.code?.toUpperCase() === promo.code;
  const apply = async () => {
    setBusy(true);
    setFailed(false);
    const data = await Promise.resolve(onApply(promo.code)).catch(() => null);
    setBusy(false);
    if (!data?.valid) setFailed(true);
  };

  return (
    <div style={{ ...box, ...style }}>
      {applied ? (
        <p style={text}>✓ <strong>{promo.code}</strong> applied — {promo.value}% off your order.</p>
      ) : (
        <>
          <p style={text}>{promo.banner}</p>
          <button type="button" style={button} onClick={apply} disabled={busy}>{busy ? '…' : 'Apply'}</button>
        </>
      )}
      {failed && <p style={{ ...text, flexBasis: '100%', fontSize: 12, color: '#a13d2b' }}>Couldn’t apply it — try entering {promo.code} as your discount code.</p>}
    </div>
  );
}

const box = {
  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px',
  background: T.paper, border: `1px solid ${T.line}`, padding: '10px 14px',
};
const text = { margin: 0, flex: 1, fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.ink, lineHeight: 1.35 };
const button = {
  flexShrink: 0, height: 32, padding: '0 16px', background: T.ink, color: T.white, border: 'none', cursor: 'pointer',
  fontFamily: T.sans, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
};
