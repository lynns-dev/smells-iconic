import React from 'react';
import PolicyLayout, { PolicySection } from '../components/PolicyLayout';

export default function ReturnPolicy() {
  return (
    <PolicyLayout title="Return Policy" updated="October 2026">
      <p>We want you to love what you ordered. If something's not right, here's how returns and exchanges work.</p>

      <PolicySection title="45-day guarantee">
        <p>
          If you're not happy with your order for any reason, you can return it within 45 days of delivery for a full
          refund to your original payment method — opened or unopened.
        </p>
      </PolicySection>

      <PolicySection title="Damaged or defective items">
        <p>
          If your order arrives damaged or defective, email us at{' '}
          <a href="mailto:hello@smellsiconic.com" style={{ textDecoration: 'underline' }}>hello@smellsiconic.com</a> within 14
          days of delivery with your order number and a photo, and we'll send a replacement or refund at no cost to
          you.
        </p>
      </PolicySection>

      <PolicySection title="How to start a return">
        <p>
          Email <a href="mailto:hello@smellsiconic.com" style={{ textDecoration: 'underline' }}>hello@smellsiconic.com</a>{' '}
          with your order number and we'll send return instructions. Please don't send anything back before hearing
          from us.
        </p>
      </PolicySection>

      <PolicySection title="Refunds">
        <p>
          Once we receive and inspect your return, we'll process your refund to the original payment method.
          Depending on your bank or card issuer, it can take several business days for the refund to appear.
        </p>
      </PolicySection>

      <PolicySection title="Return shipping">
        <p>
          Returns are free: we'll email you a prepaid return label, so sending your order back costs you nothing.
        </p>
      </PolicySection>

      <PolicySection title="Exchanges">
        <p>
          Want a different scent instead? Follow the return process above for the original item and place a new
          order for the one you'd like.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}
