// Admin → Tests: results of the store's split tests (lib/experiments.js).
// Per variant: visitors who saw it, how many added to cart, reached
// checkout and bought, and revenue per visitor. "Confidence" is a two-sided
// test on the purchase rate (add-to-cart rate while purchases are few).
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

function confidence(a, b, key) {
  const n1 = a.visitors || 0, n2 = b.visitors || 0;
  const x1 = a[key] || 0, x2 = b[key] || 0;
  if (n1 < 30 || n2 < 30) return null;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  const z = Math.abs(x1 / n1 - x2 / n2) / se;
  // Normal CDF approximation.
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Math.round((1 - 2 * tail) * 100);
}

export default function Tests() {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    fetch('/api/admin/experiments')
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d.tests)))
      .catch(() => setError('Could not load test results.'));
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 960, margin: '0 auto', padding: '28px 16px', color: '#1f1f1f' }}>
      <Head><title>Split tests · Smells Iconic Admin</title></Head>
      <Link href="/admin" style={{ fontSize: 13, color: '#5f6368' }}>← Admin</Link>
      <h1 style={{ fontSize: 26, margin: '8px 0 4px' }}>Split tests</h1>
      <p style={{ fontSize: 13, color: '#5f6368', margin: '0 0 20px' }}>
        Each visitor sees one version of each test, 50/50. Checkout results count sessions and confirmed payments. Allow a full business cycle and sufficient purchases before choosing a winner.
      </p>
      {error && <p style={{ color: '#d93025' }}>{error}</p>}
      {!data && !error && <p>Loading…</p>}
      {data && data.filter((t) => !t.winner).map((t) => {
        const [a, b] = t.variants;
        const key = t.checkout ? 'purchased' : (a.purchased || 0) + (b?.purchased || 0) >= 20 ? 'purchased' : 'added';
        const conf = !t.checkout && b ? confidence(a, b, key) : null;
        const leader = b && a.visitors && b.visitors ? ((b[key] || 0) / b.visitors > (a[key] || 0) / a.visitors ? b.variant : a.variant) : null;
        return (
          <section key={t.id} style={{ border: '1px solid #e1e3e1', borderRadius: 12, padding: 16, marginBottom: 16, overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>{t.name}</h2>
              <span style={{ fontSize: 12, color: '#5f6368' }}>
                {t.winner ? `Ended: "${t.winner}" for everyone` : `Running since ${t.started}`}
              </span>
            </div>
            {t.checkout && <p style={{ fontSize: 13 }}>50/50 assignment per visitor. Conversion = payment-confirmed purchasing sessions ÷ enrolled checkout sessions. Reloads count once; revenue includes repeat orders. Failures = sessions with a reported payment error. No automatic winner.</p>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 10, minWidth: 560 }}>
              <thead>
                <tr style={{ textAlign: 'right', color: '#5f6368' }}>
                  {['Version', t.checkout ? 'Checkout sessions' : 'Visitors', 'Added to cart', 'Reached checkout', 'Bought', 'Buy rate', 'Revenue', 'Per visitor', 'Payment failures', 'Average order'].map((h, i) => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: i ? 'right' : 'left', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.variants.map((v) => (
                  <tr key={v.variant} style={{ borderTop: '1px solid #e1e3e1', textAlign: 'right' }}>
                    <td style={{ padding: '6px 8px', textAlign: 'left' }}>{v.variant}{leader === v.variant && conf >= 90 ? ' ★' : ''}</td>
                    <td style={{ padding: '6px 8px' }}>{v.visitors || 0}</td>
                    <td style={{ padding: '6px 8px' }}>{v.added || 0} ({pct(v.added || 0, v.visitors)})</td>
                    <td style={{ padding: '6px 8px' }}>{v.checkout_view || 0} ({pct(v.checkout_view || 0, v.visitors)})</td>
                    <td style={{ padding: '6px 8px' }}>{v.purchased || 0}</td>
                    <td style={{ padding: '6px 8px' }}>{pct(v.purchased || 0, v.visitors)}</td>
                    <td style={{ padding: '6px 8px' }}>{money(v.revenue)}</td>
                    <td style={{ padding: '6px 8px' }}>{v.visitors ? money((v.revenue || 0) / v.visitors) : '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{t.checkout ? pct(v.pay_failed || 0, v.visitors) : '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{t.checkout && v.orders ? money(v.revenue / v.orders) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 12, color: '#5f6368', margin: '8px 0 0' }}>
              {conf == null
                ? (t.checkout ? 'Keep running until a planned sample size is reached; no automatic winner.' : 'Not enough visitors yet to call it.')
                : `Leading: ${leader} · ${conf}% confidence on ${key === 'purchased' ? 'buy rate' : 'add-to-cart rate'}${conf >= 90 ? ' (ready to call)' : ''}`}
            </p>
          </section>
        );
      })}
    </div>
  );
}
