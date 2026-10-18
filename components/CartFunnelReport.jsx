import React from 'react';
import { T } from '../lib/theme';

// Admin → Dashboard: where shoppers stop between adding to cart and paying,
// and the reasons recorded when they do (lib/cartFunnel.js,
// /api/admin/cart-funnel). refreshKey reloads it with the rest of admin.

const RANGES = [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']];

function ago(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CartFunnelReport({ refreshKey }) {
  const [range, setRange] = React.useState('today');
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    setError('');
    fetch(`/api/admin/cart-funnel?range=${range}`, { cache: 'no-store' })
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || 'Could not load the report.')))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [range, refreshKey]);

  const steps = data?.steps || [];
  const added = steps[0]?.count || 0;
  // The step with the most people lost on the way to the next one.
  let worst = null;
  steps.forEach((s, i) => {
    const next = steps[i + 1];
    if (!next) return;
    const lost = s.count - next.count;
    if (lost > 0 && (!worst || lost > worst.lost)) worst = { from: s.label, to: next.label, lost };
  });

  return (
    <div style={card}>
      <div style={head}>
        <p style={{ margin: 0, fontSize: 19, fontWeight: 500, color: T.ink }}>Cart drop-off</p>
        <select value={range} onChange={(e) => setRange(e.target.value)} style={select}>
          {RANGES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      {error && <p style={{ color: '#a13d2b', fontSize: 14 }}>{error}</p>}
      {!data && !error && <p style={{ color: T.soft, fontSize: 14 }}>Loading…</p>}

      {data && added === 0 && (
        <p style={{ color: T.soft, fontSize: 14 }}>No add-to-carts recorded for this period yet. Steps are counted from now on, once per shopper per day.</p>
      )}

      {data && added > 0 && (
        <>
          {worst && (
            <p style={{ fontSize: 14, margin: '0 0 16px' }}>
              Biggest drop: <strong>{worst.lost}</strong> {worst.lost === 1 ? 'shopper' : 'shoppers'} stopped after <strong>{worst.from.toLowerCase()}</strong>, before {worst.to.toLowerCase()}.
            </p>
          )}
          <div>
            {steps.map((s, i) => {
              const next = steps[i + 1];
              const lost = next ? s.count - next.count : 0;
              return (
                <div key={s.key} style={stepRow}>
                  <div className="cf-label" style={{ flex: '0 0 200px', fontSize: 13 }}>{s.label}</div>
                  <div style={{ flex: 1, height: 22, background: T.paper, position: 'relative' }}>
                    <div style={{ height: '100%', width: `${added ? (s.count / added) * 100 : 0}%`, background: i === steps.length - 1 ? '#1a7a3c' : T.ink, transition: 'width .3s' }} />
                  </div>
                  <div style={{ flex: '0 0 44px', textAlign: 'right', fontSize: 14, fontWeight: 600 }}>{s.count}</div>
                  <div style={{ flex: '0 0 130px', textAlign: 'right', fontSize: 12, color: lost > 0 ? '#a13d2b' : T.soft }}>
                    {next ? (lost > 0 ? `−${lost} stopped here` : 'no drop') : `${added ? Math.round((s.count / added) * 100) : 0}% of carts`}
                  </div>
                </div>
              );
            })}
          </div>

          <p style={subhead}>Why they stopped</p>
          {data.reasons.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 13 }}>No drop-off reasons recorded yet (cart closed, item removed, code rejected, payment failed).</p>
          ) : (
            <div>
              {data.reasons.map((r) => (
                <div key={r.label} style={reasonRow}>
                  <span>{r.label}</span>
                  <span style={{ fontWeight: 600 }}>{r.count}</span>
                </div>
              ))}
            </div>
          )}

          {data.recent.length > 0 && (
            <>
              <p style={subhead}>Latest drop-offs</p>
              <div>
                {data.recent.slice(0, 12).map((e) => (
                  <div key={`${e.ts}-${e.visitorId}-${e.kind}`} style={recentRow}>
                    <div style={{ fontSize: 13 }}>{e.reason}</div>
                    <div style={{ fontSize: 12, color: T.soft, marginTop: 2 }}>
                      {[
                        ago(e.ts),
                        e.cart?.length ? e.cart.join(', ') : null,
                        Number.isFinite(e.subtotal) ? `$${e.subtotal.toFixed(2)}` : null,
                        Number.isFinite(e.dwellSec) ? `cart open ${e.dwellSec}s` : null,
                        e.device,
                        e.path,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <style jsx>{`
        @media (max-width: 600px) {
          :global(.cf-label) { flex: 1 1 100% !important; }
        }
      `}</style>
    </div>
  );
}

const card = { background: T.white, border: `1px solid ${T.line}`, padding: 24, marginBottom: 24 };
const head = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12, flexWrap: 'wrap' };
const select = { height: 34, padding: '0 10px', border: `1px solid ${T.line}`, background: T.white, fontFamily: T.sans, fontSize: 12, color: T.ink, outline: 'none' };
const stepRow = { display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', flexWrap: 'wrap' };
const subhead = { fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.soft, margin: '24px 0 8px' };
const reasonRow = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13 };
const recentRow = { padding: '8px 0', borderBottom: `1px solid ${T.line}` };
