import React from 'react';
import PolicyLayout, { PolicySection } from '../components/PolicyLayout';

export default function PrivacyPolicy() {
  return (
    <PolicyLayout title="Privacy Policy" updated="November 2026">
      <p>
        This policy explains what information Smells Iconic ("we," "us") collects when you visit smellsiconic.com or place an
        order, how we use it, and the choices you have. By using this site, you agree to the collection and use of
        information as described here.
      </p>

      <PolicySection title="Information we collect">
        <p>
          <strong>Information you give us</strong> — name, email, shipping and billing address, phone number, and
          payment details when you place an order, sign up for emails, or leave a review. Card numbers are entered
          directly into our payment processor's systems and never touch our servers.
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>Information collected automatically</strong> — pages viewed, products added to cart, general
          location (city/country, from your IP address), device and browser type, and how you arrived at the site
          (e.g. an ad click). We use cookies and similar technologies to collect this.
        </p>
      </PolicySection>

      <PolicySection title="Optional birthday program">
        <p>If you choose to join our birthday program, we collect your email address and birthday month and day, without a birth year, together with your program consent and the time it was recorded. We associate these details with your email for this brand only. Birthday signup is separate from general email and SMS marketing subscriptions, and no purchase is required.</p>
        <p style={{ marginTop: 12 }}>We are collecting preferences while the program is being planned; gifts and benefits are not guaranteed, and this signup does not activate messages or payments. You can ask us to update or remove your birthday details and withdraw consent using the contact details below. We retain them while your birthday-program consent is active or until you ask us to remove them; a minimal withdrawal record may remain.</p>
      </PolicySection>

      <PolicySection title="How we use it">
        <p>We use your information to:</p>
        <ul style={list}>
          <li>Process orders, payments, and shipping, and to contact you about them</li>
          <li>Respond to customer service requests</li>
          <li>Send marketing emails, if you've opted in — you can unsubscribe at any time</li>
          <li>Measure and improve the site, and show you relevant ads (see "Analytics and advertising" below)</li>
          <li>Detect and prevent fraud</li>
        </ul>
      </PolicySection>

      <PolicySection title="Analytics and advertising">
        <p>We use the following third-party tools:</p>
        <ul style={list}>
          <li>
            <strong>Meta (Facebook/Instagram) Pixel and Conversions API</strong> — helps us measure ad performance
            and show relevant ads on Meta platforms. Meta receives events like page views, cart additions, and
            purchases.
          </li>
          <li>
            <strong>Microsoft Clarity</strong> — session recording and heatmaps that help us understand how visitors
            use the site, so we can fix confusing or broken flows.
          </li>
        </ul>
        <p style={{ marginTop: 12 }}>
          You can limit this tracking using your browser's privacy settings, ad blockers, or Meta's own ad
          preferences at facebook.com/adpreferences.
        </p>
      </PolicySection>

      <PolicySection title="Payment processing">
        <p>
          Payments are processed by QuickBooks Payments (Intuit) and PayPal, Inc. When you check out, your payment
          details are sent directly to whichever processor you choose, under their own privacy policies — we never
          see or store full card numbers.
        </p>
      </PolicySection>

      <PolicySection title="Sharing your information">
        <p>
          We don't sell your personal information. We share it only with the service providers that help us run the
          store — payment processors, shipping carriers, email/marketing tools, and the analytics providers listed
          above — and only as needed for them to do that work, or when required by law.
        </p>
      </PolicySection>

      <PolicySection title="Data retention">
        <p>
          We keep order records as long as needed for accounting, tax, and legal purposes. Analytics data is
          generally retained for a limited window and then aggregated or deleted.
        </p>
      </PolicySection>

      <PolicySection title="Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct, or delete the personal information
          we hold about you, or to opt out of marketing communications. To make a request, email us at{' '}
          <a href="mailto:hello@smellsiconic.com" style={{ textDecoration: 'underline' }}>hello@smellsiconic.com</a>.
        </p>
      </PolicySection>

      <PolicySection title="Children's privacy">
        <p>This site is not directed at children under 13, and we do not knowingly collect information from them.</p>
      </PolicySection>

      <PolicySection title="Changes to this policy">
        <p>
          We may update this policy from time to time. Changes take effect as soon as they're posted here, with the
          "last updated" date above reflecting the most recent revision.
        </p>
      </PolicySection>

      <PolicySection title="Contact">
        <p>
          Questions about this policy? Email{' '}
          <a href="mailto:hello@smellsiconic.com" style={{ textDecoration: 'underline' }}>hello@smellsiconic.com</a>.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}

const list = { paddingLeft: 22, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 };
