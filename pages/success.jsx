import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import Marquee from '../components/Marquee';
import Footer from '../components/Footer';
import { fbTrack } from '../lib/fbPixel';
import { useCart } from '../lib/useCart';
import { T, S } from '../lib/theme';

export default function SuccessPage() {
  const router = useRouter();
  const { clear } = useCart();

  React.useEffect(() => {
    if (!router.isReady) return;

    // Redirect-based "or pay another way" methods (Cash App Pay, Klarna,
    // Afterpay, Affirm) land here with a redirect_status query param —
    // card/PayPal never set one. Anything other than "succeeded" means the
    // customer bailed on or was declined by the provider; send them back to
    // checkout (their cart is untouched) instead of showing a thank-you.
    const { redirect_status: redirectStatus } = router.query;
    if (redirectStatus && redirectStatus !== 'succeeded') {
      router.replace('/checkout?payment_error=1');
      return;
    }

    clear();

    const raw = sessionStorage.getItem('si-purchase');
    if (!raw) return;
    sessionStorage.removeItem('si-purchase');
    try {
      const purchase = JSON.parse(raw);
      fbTrack('Purchase', {
        content_ids: purchase.contentIds,
        contents: purchase.contents,
        value: purchase.amount,
        currency: 'USD',
      }, purchase.eventId);
    } catch {
      // malformed sessionStorage value — nothing to track
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  return (
    <div>
      <Header cartCount={0} onCartClick={() => {}} />
      <section style={{ maxWidth: 640, margin: '0 auto', padding: '120px 40px', textAlign: 'center' }}>
        <p style={S.label}>Thank you</p>
        <h1 style={{ fontFamily: T.sans, fontWeight: 700, fontSize: 'clamp(32px,5vw,48px)', margin: '16px 0 20px', color: T.ink }}>Your Sculpt Wand is <span style={S.it}>on its way.</span></h1>
        <p style={{ color: T.soft, fontSize: 16, marginBottom: 34 }}>We’ve received your order and sent a confirmation to your email. Your five-minute ritual starts soon.</p>
        <Link href="/" style={S.btnOutline}>Return home</Link>
      </section>
      <Marquee />
      <Footer />
    </div>
  );
}
