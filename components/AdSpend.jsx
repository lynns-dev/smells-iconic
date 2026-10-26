import React from 'react';
import { T } from '../lib/theme';

// Admin dashboard: this store's Meta ad spend (pages/api/admin/ad-spend.js,
// lib/metaAds.js) next to the store's own revenue for the same days.
// "Blended" ROAS divides all store revenue — ad-driven or not — by ad
// spend; Meta's own purchase count is shown alongside as the attributed view.

// Meta's ad-spend error is hidden for now (owner's request) — flip to
// true to show it again.
const SHOW_META_ERRORS = false;

const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']];
const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdSpend() {
  const [range, setRange] = React.useState('7d');
  const [data, setData] = React.useState(null);
  const [loadError, setLoadError] = React.useState('');

  React.useEffect(() => {
    setData(null);
    setLoadError('');
    fetch(`/api/admin/ad-spend?range=${range}`)
      .then((r) => r.json())
      .then(setData)
      .catch((err) => setLoadError(err.message || 'Could not load ad spend'));
  }, [range]);

  const t = data?.totals;
  const spend = t?.spend || 0;
  const roas = spend > 0 ? (data.store.revenue / spend).toFixed(2) : null;
  const costPerOrder = spend > 0 && data?.store.orders > 0 ? spend / data.store.orders : null;
  const cpc = spend > 0 && t?.linkClicks > 0 ? spend / t.linkClicks : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {RANGES.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setRange(key)} style={{ ...chip, ...(range === key ? chipOn : {}) }}>{label}</button>
        ))}
      </div>

      {loadError && <p style={errorText}>{loadError}</p>}
      {!data && !loadError && <p style={softText}>Loading…</p>}

      {data && data.configured === false && (
        <p style={softText}>
          Not connected yet. Add <code>META_AD_ACCOUNT_ID</code> (this store&rsquo;s Meta ad account) and <code>META_ADS_ACCESS_TOKEN</code> (a Meta token with the <code>ads_read</code> permission) in Vercel and redeploy.
        </p>
      )}

      {SHOW_META_ERRORS && data?.error && (
        <p style={errorText}>
          Meta didn&rsquo;t return ad spend: {data.error}. The token in <code>META_ADS_ACCESS_TOKEN</code> needs the <code>ads_read</code> permission for ad account {data.account || 'act_…'}.
        </p>
      )}

      {t && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <Tile value={money(spend)} label="Ad spend" />
            <Tile value={money(data.store.revenue)} label={`Store revenue · ${data.store.orders} order${data.store.orders === 1 ? '' : 's'}`} />
            <Tile value={roas ? `${roas}×` : '—'} label="Blended ROAS (revenue ÷ spend)" />
            <Tile value={costPerOrder ? money(costPerOrder) : '—'} label="Ad spend per order" />
            <Tile value={`${t.purchases}${t.purchaseValue ? ` · ${money(t.purchaseValue)}` : ''}`} label="Purchases Meta credits to ads" />
            <Tile value={`${t.linkClicks}${cpc ? ` · ${money(cpc)}` : ''}`} label="Link clicks · cost per click" />
          </div>

          {data.campaigns.length === 0 ? (
            <p style={softText}>No ad spend for this store in this period.</p>
          ) : (
            <div className="table-scroll">
              <div style={{ minWidth: 560 }}>
                <div style={{ ...row, ...headRow }}>
                  <span style={{ flex: 1 }}>Campaign</span>
                  <span style={num}>Spend</span>
                  <span style={num}>Clicks</span>
                  <span style={num}>Purchases</span>
                  <span style={num}>Cost / purchase</span>
                </div>
                {data.campaigns.map((c) => (
                  <div key={c.id} style={row}>
                    <span style={{ flex: 1, minWidth: 0 }}>{c.name}</span>
                    <span style={num}>{money(c.spend)}</span>
                    <span style={num}>{c.linkClicks}</span>
                    <span style={num}>{c.purchases}</span>
                    <span style={num}>{c.purchases > 0 ? money(c.spend / c.purchases) : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p style={{ ...softText, fontSize: 12, marginTop: 12 }}>
            From Meta ({data.since === data.until ? data.since : `${data.since} – ${data.until}`}), this store&rsquo;s campaigns only. Meta reports days in the ad account&rsquo;s time zone and can take a few hours to finalise today&rsquo;s numbers.
          </p>
        </>
      )}
    </div>
  );
}

function Tile({ value, label }) {
  return (
    <div style={tile}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>{label}</div>
    </div>
  );
}

const chip = { border: `1px solid ${T.line}`, background: T.white, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontFamily: T.sans, color: T.ink };
const chipOn = { background: T.ink, color: T.white, borderColor: T.ink };
const tile = { border: `1px solid ${T.line}`, padding: '12px 18px', minWidth: 150, background: T.white };
const row = { display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, padding: '9px 0', borderBottom: `1px solid ${T.line}` };
const headRow = { fontSize: 11, color: T.soft, textTransform: 'uppercase', letterSpacing: '0.06em' };
const num = { flex: '0 0 100px', textAlign: 'right' };
const softText = { color: T.soft, fontSize: 14, lineHeight: 1.6 };
const errorText = { color: '#a13d2b', fontSize: 14, lineHeight: 1.6 };

