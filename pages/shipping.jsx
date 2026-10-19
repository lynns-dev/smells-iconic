import React from 'react';
import PolicyLayout, { PolicySection } from '../components/PolicyLayout';

export default function ShippingPolicy() {
  return (
    <PolicyLayout title="Shipping Policy" updated="July 2026">
      <p>We currently ship to addresses within the United States only.</p>

      <PolicySection title="Processing time">
        <p>
          Orders are typically processed and handed off to the carrier within 1 business day. You'll receive a
          confirmation email as soon as your order ships.
        </p>
      </PolicySection>

      <PolicySection title="Shipping cost">
        <p>Standard Shipping is free on every order — no minimum.</p>
      </PolicySection>

      <PolicySection title="Delivery estimates">
        <p>
          Most orders arrive within 3–5 business days of being placed. This is an estimate, not a guarantee — carrier
          delays can occasionally push delivery outside this window.
        </p>
      </PolicySection>

      <PolicySection title="Order tracking">
        <p>
          A tracking link is included in your shipping confirmation email so you can follow your package to your
          door.
        </p>
      </PolicySection>

      <PolicySection title="Lost, delayed, or damaged packages">
        <p>
          If your order hasn't arrived within the expected window, or arrives damaged, email us at{' '}
          <a href="mailto:hello@smellsiconic.com" style={{ textDecoration: 'underline' }}>hello@smellsiconic.com</a> with your
          order number and we'll help sort it out.
        </p>
      </PolicySection>

      <PolicySection title="Incorrect address">
        <p>
          Please double-check your shipping address at checkout — we're not able to reroute a package once it's been
          handed to the carrier, and re-shipping to a corrected address may incur an additional shipping charge.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}
