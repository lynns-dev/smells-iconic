import React from 'react';
import { useRouter } from 'next/router';
import { clearCheckoutProgress } from '../lib/checkoutProgress';
export default function StripeReturn() {
  const router = useRouter();
  const [message, setMessage] = React.useState('Confirming your payment…');
  React.useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false; let timer; let attempts = 0;
    async function check() {
      try { const response = await fetch(`/api/stripe/status?session_id=${encodeURIComponent(router.query.session_id || '')}`); const data = await response.json(); if (cancelled) return;
        if (response.ok && data.purchase) { sessionStorage.setItem('si-purchase', JSON.stringify(data.purchase)); clearCheckoutProgress(); router.replace('/success'); return; }
        setMessage('We are confirming your payment. Please wait; do not pay again.');
      } catch { if (!cancelled) setMessage('We are confirming your payment. Please do not pay again.'); }
      if (!cancelled && ++attempts < 12) timer = setTimeout(check, 5000);
      else if (!cancelled) setMessage('Confirmation is taking longer than usual. Please contact customer support before trying another payment.');
    }
    check(); return () => { cancelled = true; clearTimeout(timer); };
  }, [router.isReady, router.query.session_id]);
  return <main style={{ padding: 60, textAlign: 'center' }}><h1>{message}</h1><a href="/">Return to store</a></main>;
}
