import React from 'react';
import PolicyLayout, { PolicySection } from '../components/PolicyLayout';

export default function TermsOfService() {
  return (
    <PolicyLayout title="Terms & Conditions" updated="July 2026">
      <p>
        These terms govern your use of this site and any purchase you make from us. By using this site or placing
        an order, you agree to these terms.
      </p>

      <PolicySection title="Use of this site">
        <p>
          You may use this site to browse and purchase products for personal, non-commercial use. You agree not to
          misuse the site — including attempting to disrupt it, scrape it for commercial purposes, or use it for any
          unlawful purpose.
        </p>
      </PolicySection>

      <PolicySection title="Products and pricing">
        <p>
          We describe our products as accurately as we can, but product images are illustrative and may vary
          slightly from the item you receive. We reserve the right to correct pricing or description errors, limit
          order quantities, and discontinue products at any time without notice.
        </p>
      </PolicySection>

      <PolicySection title="Orders and payment">
        <p>
          Placing an order is an offer to purchase, which we may accept or decline (for example, if a product is out
          of stock or we suspect fraud). Payment is processed by QuickBooks Payments or PayPal at the time of
          purchase. You confirm that any payment details you provide are your own or that you're authorized to use
          them.
        </p>
      </PolicySection>

      <PolicySection title="Shipping and returns">
        <p>
          Orders ship within 1–2 business days and typically arrive within 3–7 business days. If you're not happy
          with your purchase, contact us within 30 days of delivery and we'll make it right.
        </p>
      </PolicySection>

      <PolicySection title="Product use and disclaimer">
        <p>
          The Sculpt Wand is a personal massage and skincare tool, not a medical device, and is not intended to
          diagnose, treat, cure, or prevent any medical condition. Results vary from person to person. Consult a
          physician before use if you are pregnant, have a medical condition, or have concerns about whether this
          product is right for you.
        </p>
      </PolicySection>

      <PolicySection title="Intellectual property">
        <p>
          All content on this site — including text, graphics, logos, and product photography — belongs to The
          Sculpt Wand or its licensors and may not be copied or reused without permission.
        </p>
      </PolicySection>

      <PolicySection title="Limitation of liability">
        <p>
          Our products are provided "as is." To the fullest extent permitted by law, The Sculpt Wand is not liable
          for any indirect, incidental, or consequential damages arising from your use of this site or our
          products. Nothing here limits liability that cannot be limited under applicable law.
        </p>
      </PolicySection>

      <PolicySection title="Changes to these terms">
        <p>
          We may update these terms from time to time. Continuing to use the site after a change means you accept
          the updated terms.
        </p>
      </PolicySection>

      <PolicySection title="Contact">
        <p>
          Questions about these terms? Email{' '}
          <a href="mailto:hello@thesculptwand.com" style={{ textDecoration: 'underline' }}>hello@thesculptwand.com</a>.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}
