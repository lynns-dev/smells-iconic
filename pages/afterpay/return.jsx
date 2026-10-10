// Where Afterpay sends the shopper back after approving (or cancelling)
// (lib/afterpay.js). Captures the payment, then hands off to /success the
// same way the card checkout does — including the browser Pixel Purchase,
// which shares its event id with the server-side one.
//
// Cash App Pay on a phone also lands here (?cashapppay=1) after the
// Cash App app: afterpay.js is started again for the same checkout so it
// can report the result, then the order is finished the same way.

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCart } from '../../lib/useCart';
import { loadAfterpayConfig, loadAfterpayScript, finishAfterpayOrder } from '../../lib/afterpayClient';
import { T, S } from '../../lib/theme';

const PURCHASE_KEY = 'si-purchase';

export default function AfterpayReturn() {
  const router = useRouter();
  const { clear } = useCart();
  const [error, setError] = React.useState('');
  const started = React.useRef(false);
  const cashApp = router.query.cashapppay === '1';

  React.useEffect(() => {
    if (!router.isReady || started.current) return;
    started.current = true;
    const { ref, orderToken, status } = router.query;
    const finish = (token) => finishAfterpayOrder({
      ref, orderToken: token, purchaseKey: PURCHASE_KEY, router, clearCart: clear,
    });

    (async () => {
      try {
        if (orderToken && status === 'SUCCESS') { await finish(orderToken); return; }
        if (router.query.cashapppay !== '1') { setError('Afterpay checkout was cancelled.'); return; }
        // Cash App Pay mobile return: ask afterpay.js for the result.
        const [config, tokenRes] = await Promise.all([loadAfterpayConfig(), fetch(`/api/afterpay/token?ref=${encodeURIComponent(ref || '')}`)]);
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) throw new Error(tokenData.error || 'This checkout has expired. Please start again.');
        const AfterPay = await loadAfterpayScript(config.script);
        AfterPay.initializeForCashAppPay({
          countryCode: 'US',
          token: tokenData.token,
          cashAppPayOptions: {
            onComplete: (event) => {
              const result = event?.data || {};
              if (result.status !== 'SUCCESS') { setError('Cash App Pay was not completed.'); return; }
              finish(result.orderToken || tokenData.token).catch((err) => setError(err.message || 'Something went wrong with Cash App Pay.'));
            },
          },
        });
      } catch (err) {
        setError(err.message || 'Something went wrong with Afterpay.');
      }
    })();
  }, [router, clear]);

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '120px 24px', textAlign: 'center', fontFamily: T.sans }}>
      {error ? (
        <>
          <p style={{ fontSize: 16, color: '#a13d2b', marginBottom: 24 }}>{error}</p>
          <p style={{ fontSize: 14, color: T.soft, marginBottom: 24 }}>{cashApp ? 'You have not been charged unless Cash App shows a payment.' : 'You have not been charged unless Afterpay emails you a confirmation.'}</p>
          <Link href="/checkout" style={S.btnOutline}>Back to checkout</Link>
        </>
      ) : (
        <p style={{ fontSize: 16, color: T.soft }}>{cashApp ? 'Confirming your Cash App payment…' : 'Confirming your Afterpay payment…'}</p>
      )}
    </div>
  );
}
