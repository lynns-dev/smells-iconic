import React from 'react';
import SaleCallout from './SaleCallout';
import { T } from '../lib/theme';

export default function CheckoutDiscount({ discountCode, setDiscountCode, discountMessage, setDiscountMessage, appliedDiscount, clearDiscount, handleApplyDiscount }) {
  const id = React.useId();
  const pending = discountMessage === 'Checking…';
  const failed = Boolean(discountMessage && /not valid|isn.t valid|no longer valid|could not|couldn.t|expired|enter a|order total changed|reapply.*discount|discount.*error/i.test(discountMessage));
  const apply = () => {
    if (!discountCode.trim()) { setDiscountMessage('Enter a discount code.'); return; }
    handleApplyDiscount();
  };
  const remove = () => {
    clearDiscount();
    setDiscountCode('');
    setDiscountMessage('Discount removed.');
  };
  return <div style={{ marginTop: 6 }}>
    <SaleCallout appliedDiscount={appliedDiscount} onApply={handleApplyDiscount} style={{ marginBottom: 10 }} />
    {appliedDiscount && <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 13, color: T.ink }}><strong>{appliedDiscount.code}</strong> applied</span>
      <button type="button" onClick={remove} disabled={pending} aria-label={`Remove discount code ${appliedDiscount.code}`} style={{ border: 0, background: 'transparent', textDecoration: 'underline', color: T.ink, cursor: 'pointer', padding: '8px 0 8px 12px', minHeight: 44, fontSize: 13 }}>Remove</button>
    </div>}
    <label htmlFor={id} style={{ display: 'block', marginBottom: 6, fontSize: 13, color: T.ink, fontWeight: 600 }}>Discount code</label>
    <div style={{ display: 'flex', gap: 8 }}>
      <input id={id} placeholder="Enter a code" value={discountCode} disabled={pending} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={failed || undefined} aria-describedby={discountMessage ? `${id}-message` : undefined}
        onChange={e => { setDiscountCode(e.target.value); if (appliedDiscount) clearDiscount(); setDiscountMessage(''); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
        style={{ flex: 1, minWidth: 0, width: '100%', height: 46, border: `1px solid ${failed ? '#a13d2b' : '#8c8179'}`, borderRadius: 8, padding: '0 12px', background: '#fff', color: T.ink, fontFamily: T.sans, fontSize: 16 }} />
      <button type="button" disabled={pending} onClick={apply} style={{ flexShrink: 0, height: 46, padding: '0 16px', border: `1px solid ${T.ink}`, borderRadius: 8, background: '#fff', color: T.ink, cursor: pending ? 'wait' : 'pointer', fontFamily: T.sans, fontSize: 13, fontWeight: 600 }}>{pending ? 'Checking…' : appliedDiscount ? 'Replace' : 'Apply'}</button>
    </div>
    {discountMessage && <p id={`${id}-message`} role={failed ? 'alert' : 'status'} style={{ fontSize: 12, lineHeight: 1.5, color: failed ? '#a13d2b' : T.ink, marginTop: 8 }}>{discountMessage}</p>}
  </div>;
}
