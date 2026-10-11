import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { PRODUCTS } from '../../lib/products';
import { parseCsv } from '../../lib/csv';
import WorldMap from '../../components/WorldMap';
import { T, S } from '../../lib/theme';
import AdminFonts from '../../components/AdminFonts';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Flexible header matching — review export files from different platforms
// (Judge.me, Loox, Yotpo, Stamped, ...) all name these columns differently.
// No "product" entry: which product a CSV belongs to is now chosen once in
// the admin UI before upload, rather than matched per-row from a column.
const FIELD_ALIASES = {
  rating: ['rating', 'stars', 'score'],
  text: ['text', 'review', 'body', 'content', 'review_text', 'review_body', 'comment'],
  author: ['author', 'name', 'reviewer', 'reviewer_name', 'customer', 'customer_name'],
};

function pickField(row, key) {
  for (const alias of FIELD_ALIASES[key]) {
    if (row[alias] !== undefined && row[alias] !== '') return row[alias];
  }
  return '';
}

const LIVE_POLL_MS = 5000;
const FUNNEL_RANGE_LABELS = {
  today: "Today's funnel",
  yesterday: "Yesterday's funnel",
  '7d': 'Funnel — last 7 days',
  '30d': 'Funnel — last 30 days',
};
const STAGE_LABELS = {
  browsing: 'Browsing',
  cart_open: 'Cart open',
  checkout: 'At checkout',
  purchased: 'Just purchased',
};
const EMPTY_ACTIVITY = { counts: { addtocart: 0, checkout_start: 0, purchase: 0, revenue: 0 }, buckets: [], recent: [] };
const ACTIVITY_LABELS = {
  addtocart: 'Added to cart',
  checkout_start: 'Started checkout',
  purchase: 'Purchased',
};

function timeAgo(ts) {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

const countryNames = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

function countryFlag(code) {
  if (!code || code === 'XX' || code.length !== 2) return '🌐';
  const codePoints = [...code.toUpperCase()].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function countryName(code) {
  if (!code || code === 'XX') return 'Unknown';
  try {
    return countryNames?.of(code) || code;
  } catch {
    return code;
  }
}

// Which ad/campaign brought the buyer in, from whatever was captured at
// their first click-through (lib/attribution.js). Falls back to the raw
// click id if a platform's utm params weren't present, since fbclid/gclid
// alone still proves the visit came from a paid click.
function attributionSource(order) {
  const attr = order.attribution;
  if (!attr) return { source: 'Direct / organic', campaign: null };
  if (attr.utm_source) return { source: attr.utm_source, campaign: attr.utm_campaign || null };
  if (attr.fbclid) return { source: 'Facebook/Instagram ad', campaign: null };
  if (attr.gclid) return { source: 'Google ad', campaign: null };
  return { source: 'Direct / organic', campaign: null };
}

export default function AdminDashboard() {
  const router = useRouter();
  const [dashboard, setDashboard] = React.useState(null);
  const [funnelRange, setFunnelRange] = React.useState('today');
  const [live, setLive] = React.useState({ count: 0, byStage: {}, byCountry: {}, activity: EMPTY_ACTIVITY });
  const [reviews, setReviews] = React.useState([]);
  const [reviewsLoading, setReviewsLoading] = React.useState(true);
  const [importForm, setImportForm] = React.useState({ productId: PRODUCTS[0]?.id || '', rating: 5, text: '', author: '' });
  const [importMessage, setImportMessage] = React.useState('');
  const [csvProductId, setCsvProductId] = React.useState(PRODUCTS[0]?.id || '');
  const [csvStatus, setCsvStatus] = React.useState('idle'); // idle | processing
  const [csvSummary, setCsvSummary] = React.useState(null);
  const [discounts, setDiscounts] = React.useState([]);
  const [discountForm, setDiscountForm] = React.useState({ code: '', type: 'percent', value: 10 });
  const [discountFormMessage, setDiscountFormMessage] = React.useState('');
  const [notifStatus, setNotifStatus] = React.useState('unsupported'); // unsupported | denied | off | on | busy
  const [notifMessage, setNotifMessage] = React.useState('');
  const [hoveredCountry, setHoveredCountry] = React.useState(null);
  const [orders, setOrders] = React.useState([]);
  const [ordersLoading, setOrdersLoading] = React.useState(true);
  const [tab, setTab] = React.useState('dashboard'); // dashboard | visitors
  const [metaBusy, setMetaBusy] = React.useState({});
  const [metaError, setMetaError] = React.useState({});

  // Per-order "Send to Meta" (pages/api/admin/order-meta.js). New orders are
  // sent automatically at checkout and retried by the Meta resend cron.
  const handleSendToMeta = async (order) => {
    setMetaBusy((prev) => ({ ...prev, [order.id]: true }));
    setMetaError((prev) => ({ ...prev, [order.id]: '' }));
    try {
      const res = await fetch('/api/admin/order-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json();
      if (data.order) setOrders((prev) => prev.map((o) => (o.id === order.id ? data.order : o)));
      if (!res.ok) throw new Error(data.error || 'Meta did not accept it.');
    } catch (err) {
      setMetaError((prev) => ({ ...prev, [order.id]: err.message }));
    } finally {
      setMetaBusy((prev) => ({ ...prev, [order.id]: false }));
    }
  };

  React.useEffect(() => {
    fetch('/api/admin/orders')
      .then((r) => r.json())
      .then((data) => setOrders(data.orders || []))
      .catch(() => {})
      .finally(() => setOrdersLoading(false));
  }, []);

  const mapCounts = React.useMemo(
    () => Object.fromEntries(Object.entries(live.byCountry).map(([code, data]) => [code.toLowerCase(), data.count])),
    [live.byCountry]
  );

  React.useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.register('/sw.js').then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      if (existing) setNotifStatus('on');
      else if (Notification.permission === 'denied') setNotifStatus('denied');
      else setNotifStatus('off');
    }).catch(() => setNotifStatus('unsupported'));
  }, []);

  const handleEnableNotifications = async () => {
    setNotifMessage('');
    setNotifStatus('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotifStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });
      await fetch('/api/admin/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });
      setNotifStatus('on');
      setNotifMessage('Notifications enabled on this device.');
    } catch (err) {
      setNotifStatus('off');
      setNotifMessage(err.message || 'Could not enable notifications.');
    }
  };

  const handleDisableNotifications = async () => {
    setNotifStatus('busy');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/admin/push-unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setNotifStatus('off');
      setNotifMessage('Notifications turned off on this device.');
    } catch (err) {
      setNotifStatus('on');
      setNotifMessage(err.message || 'Could not disable notifications.');
    }
  };

  const loadDashboard = React.useCallback((range) => {
    fetch(`/api/admin/dashboard?range=${range}`).then((r) => r.json()).then(setDashboard).catch(() => {});
  }, []);

  const loadReviews = React.useCallback(() => {
    setReviewsLoading(true);
    fetch('/api/admin/reviews')
      .then((r) => r.json())
      .then((data) => setReviews(data.reviews || []))
      .finally(() => setReviewsLoading(false));
  }, []);

  const loadDiscounts = React.useCallback(() => {
    fetch('/api/admin/discounts').then((r) => r.json()).then((data) => setDiscounts(data.discounts || [])).catch(() => {});
  }, []);

  React.useEffect(() => {
    loadReviews();
    loadDiscounts();
  }, [loadReviews, loadDiscounts]);

  // Covers both the initial load and refetching when the funnel time
  // filter changes.
  React.useEffect(() => {
    loadDashboard(funnelRange);
  }, [loadDashboard, funnelRange]);

  React.useEffect(() => {
    // Keep the last good data if a poll fails, rather than replacing it with
    // the error body (which used to blank the whole admin page).
    const poll = () => fetch('/api/admin/live')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data && data.byCountry && data.byStage) setLive(data); })
      .catch(() => {});
    poll();
    const interval = setInterval(poll, LIVE_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const handleDeleteReview = async (productId, reviewId) => {
    if (!confirm('Delete this review?')) return;
    await fetch('/api/admin/reviews', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, reviewId }),
    });
    loadReviews();
  };

  const handleApproveReview = async (productId, reviewId) => {
    await fetch('/api/admin/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, reviewId, action: 'approve' }),
    });
    loadReviews();
  };

  const pendingReviews = reviews.filter((r) => r.status !== 'approved');
  const approvedReviews = reviews.filter((r) => r.status === 'approved');

  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !csvProductId) return;

    setCsvStatus('processing');
    setCsvSummary(null);

    const text = await file.text();
    const rows = parseCsv(text);

    let imported = 0;
    const skipped = [];

    // Sequential on purpose — addReview does a read-then-write against the
    // same KV key per product, so parallel rows for the same product would
    // race and clobber each other.
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rating = Number(pickField(row, 'rating'));
      const text = pickField(row, 'text');
      const author = pickField(row, 'author');

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        skipped.push({ row: i + 2, reason: `Invalid rating "${pickField(row, 'rating')}"` });
        continue;
      }
      if (!text.trim()) {
        skipped.push({ row: i + 2, reason: 'Missing review text' });
        continue;
      }

      try {
        const res = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: csvProductId, rating, text, author, source: 'imported' }),
        });
        if (!res.ok) {
          const data = await res.json();
          skipped.push({ row: i + 2, reason: data.error || 'Server rejected this row' });
        } else {
          imported++;
        }
      } catch {
        skipped.push({ row: i + 2, reason: 'Network error' });
      }
    }

    const productName = PRODUCTS.find((p) => p.id === csvProductId)?.name || csvProductId;
    setCsvSummary({ imported, skipped, productName });
    setCsvStatus('idle');
    loadReviews();
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    setImportMessage('');
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...importForm, source: 'imported' }),
    });
    const data = await res.json();
    if (!res.ok) {
      setImportMessage(data.error || 'Failed to add review.');
      return;
    }
    setImportForm({ productId: importForm.productId, rating: 5, text: '', author: '' });
    setImportMessage('Added.');
    loadReviews();
  };

  const handleAddDiscount = async (e) => {
    e.preventDefault();
    setDiscountFormMessage('');
    const res = await fetch('/api/admin/discounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discountForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setDiscountFormMessage(data.error || 'Failed to add code.');
      return;
    }
    setDiscounts(data.discounts);
    setDiscountForm({ code: '', type: 'percent', value: 10 });
    setDiscountFormMessage('Added.');
  };

  const handleRemoveDiscount = async (code) => {
    if (!confirm(`Remove code "${code}"?`)) return;
    const res = await fetch('/api/admin/discounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (res.ok) setDiscounts(data.discounts);
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  return (
    <div style={{ minHeight: '100vh', background: T.paper, padding: '32px 24px 80px' }}>
      <Head>
        <title key="title">Smells Iconic Admin</title>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <meta name="theme-color" content={T.ink} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Smells Iconic Admin" />
      </Head>
      <AdminFonts />

      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <span className="admin-serif" style={{ fontWeight: 500, fontSize: 26 }}>Smells Iconic admin</span>
          <button onClick={handleLogout} style={S.btnOutline}>Sign out</button>
        </div>

        <div style={tabBar}>
          {[['dashboard', 'Dashboard'], ['visitors', 'Visitors']].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} style={tab === key ? tabActive : tabButton}>{label}</button>
          ))}
        </div>

        {tab === 'visitors' && <VisitorsTab />}

        {tab === 'dashboard' && (<>

        {/* NOTIFICATIONS */}
        <Section title="Order notifications">
          {notifStatus === 'unsupported' && (
            <p style={{ color: T.soft, fontSize: 14 }}>Push notifications aren't supported in this browser. On iPhone, add this page to your Home Screen first (Share → Add to Home Screen), then open it from there — iOS only allows push notifications for installed home-screen apps.</p>
          )}
          {notifStatus === 'denied' && (
            <p style={{ color: T.soft, fontSize: 14 }}>Notifications are blocked for this site — enable them in your browser/device settings, then reload this page.</p>
          )}
          {(notifStatus === 'off' || notifStatus === 'busy') && (
            <button onClick={handleEnableNotifications} disabled={notifStatus === 'busy'} style={{ ...S.btnFill, opacity: notifStatus === 'busy' ? 0.6 : 1 }}>
              {notifStatus === 'busy' ? 'Working…' : 'Enable notifications on this device'}
            </button>
          )}
          {notifStatus === 'on' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 14 }}>Notifications are on for this device.</span>
              <button onClick={handleDisableNotifications} style={S.btnOutline}>Turn off</button>
            </div>
          )}
          {notifMessage && <p style={{ fontSize: 12, color: T.soft, marginTop: 12 }}>{notifMessage}</p>}
        </Section>

        {/* TOP STATS */}
        <div className="stat-grid" style={statGrid}>
          <StatCard label="Revenue today" value={dashboard ? `$${dashboard.revenueToday.toFixed(2)}` : '—'} />
          <StatCard label="Orders today" value={dashboard ? dashboard.ordersToday : '—'} />
          <StatCard label="Live visitors" value={live.count} highlight />
        </div>

        {/* LIVE FUNNEL */}
        <Section title="Live visitors by stage">
          {live.count === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No one on the site right now.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
                {Object.entries(STAGE_LABELS).map(([key, label]) => (
                  <div key={key} style={{ textAlign: 'center' }}>
                    <div className="admin-serif" style={{ fontSize: 32 }}>{live.byStage[key] || 0}</div>
                    <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.soft }}>{label}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>

        {/* LIVE LOCATIONS */}
        <Section title="Live visitors by location">
          {live.count === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No one on the site right now.</p>
          ) : (
            <>
              <div style={{ position: 'relative', marginBottom: 24 }}>
                <WorldMap counts={mapCounts} onHoverCountry={setHoveredCountry} />
                <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 12, color: T.soft, background: T.paper, padding: hoveredCountry ? '4px 8px' : 0 }}>
                  {hoveredCountry && (
                    <span>
                      {countryFlag(hoveredCountry.toUpperCase())} {countryName(hoveredCountry.toUpperCase())} — {live.byCountry[hoveredCountry.toUpperCase()]?.count ?? mapCounts[hoveredCountry]}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {Object.entries(live.byCountry)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([code, data]) => (
                  <div key={code} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 18, width: 24, flexShrink: 0 }}>{countryFlag(code)}</span>
                      <span style={{ fontSize: 13, width: 140, flexShrink: 0 }}>{countryName(code)}</span>
                      <div style={{ flex: 1, height: 8, background: T.paper }}>
                        <div style={{ height: '100%', width: `${(data.count / live.count) * 100}%`, background: T.ink }} />
                      </div>
                      <span style={{ fontSize: 13, color: T.soft, width: 20, textAlign: 'right', flexShrink: 0 }}>{data.count}</span>
                    </div>
                    {data.cities.length > 0 && (
                      <p style={{ fontSize: 11, color: T.soft, margin: 0, paddingLeft: 36 }}>
                        {data.cities.map((c) => `${c.city} (${c.count})`).join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>

        {/* LIVE ACTIVITY */}
        <Section title="Live activity (last 5 minutes)">
          <div style={{ display: 'flex', gap: 32, marginBottom: 24, flexWrap: 'wrap' }}>
            <FunnelStep label="Added to cart" value={live.activity.counts.addtocart} />
            <FunnelStep label="Checkouts started" value={live.activity.counts.checkout_start} />
            <FunnelStep label="Purchases" value={live.activity.counts.purchase} rate={live.activity.counts.revenue > 0 ? `$${live.activity.counts.revenue.toFixed(2)}` : null} />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90, marginBottom: 8 }}>
            {live.activity.buckets.map((bucket, i) => {
              const total = bucket.addtocart + bucket.checkout_start + bucket.purchase;
              const barHeight = Math.min(90, total * 14);
              return (
                <div key={i} style={{ flex: 1, height: 90, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  {total > 0 ? (
                    <div style={{ height: barHeight, display: 'flex', flexDirection: 'column-reverse' }}>
                      {bucket.addtocart > 0 && <div style={{ flex: bucket.addtocart, background: 'rgba(21,17,13,0.25)' }} />}
                      {bucket.checkout_start > 0 && <div style={{ flex: bucket.checkout_start, background: 'rgba(21,17,13,0.55)' }} />}
                      {bucket.purchase > 0 && <div style={{ flex: bucket.purchase, background: T.ink }} />}
                    </div>
                  ) : (
                    <div style={{ height: 2, background: T.line }} />
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.soft, marginBottom: 24 }}>
            <span>5m ago</span>
            <span>now</span>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: T.soft, marginBottom: 24 }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(21,17,13,0.25)', marginRight: 6 }} />Added to cart</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(21,17,13,0.55)', marginRight: 6 }} />Checkout started</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: T.ink, marginRight: 6 }} />Purchased</span>
          </div>

          {live.activity.recent.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No activity in the last 5 minutes.</p>
          ) : (
            <div>
              {live.activity.recent.map((ev, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.line}` }}>
                  <span>
                    {ACTIVITY_LABELS[ev.type] || ev.type}
                    {ev.productName && ` — ${ev.productName}`}
                    {ev.type === 'purchase' && ev.amount != null && ` — $${Number(ev.amount).toFixed(2)}`}
                  </span>
                  <span style={{ color: T.soft }}>{timeAgo(ev.ts)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* PAYMENT METHODS */}
        <Section title="Payment methods today">
          {!dashboard || dashboard.paymentMethods.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No orders yet today.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dashboard.paymentMethods.map(({ method, count, revenue }) => {
                const maxCount = Math.max(...dashboard.paymentMethods.map((m) => m.count));
                return (
                  <div key={method} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, width: 110, flexShrink: 0 }}>{method}</span>
                    <div style={{ flex: 1, height: 8, background: T.paper }}>
                      <div style={{ height: '100%', width: `${(count / maxCount) * 100}%`, background: T.ink }} />
                    </div>
                    <span style={{ fontSize: 13, color: T.soft, width: 90, textAlign: 'right', flexShrink: 0 }}>
                      {count} order{count === 1 ? '' : 's'} · ${revenue.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* FUNNEL / CONVERSION */}
        <Section
          title={FUNNEL_RANGE_LABELS[funnelRange]}
          action={
            <select value={funnelRange} onChange={(e) => setFunnelRange(e.target.value)} style={funnelRangeSelect}>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          }
        >
          {dashboard && (
            <div className="funnel-grid" style={funnelGrid}>
              <FunnelStep label="Page views" value={dashboard.funnel.pageviews} />
              <FunnelStep label="Added to cart" value={dashboard.funnel.addToCart} rate={`${dashboard.funnel.addToCartRate}% of views`} />
              <FunnelStep label="Started checkout" value={dashboard.funnel.checkoutStarts} rate={`${dashboard.funnel.checkoutRate}% of adds`} />
              <FunnelStep label="Purchased" value={dashboard.funnel.purchases} rate={`${dashboard.funnel.conversionRate}% of views`} />
            </div>
          )}
        </Section>

        {dashboard?.capi && <CapiStatus capi={dashboard.capi} />}

        {/* RECENT ORDERS */}
        <Section title={`Recent orders (${orders.length})`}>
          {ordersLoading ? (
            <p style={{ color: T.soft, fontSize: 14 }}>Loading…</p>
          ) : orders.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No orders in the last 30 days.</p>
          ) : (
            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
              <div style={orderHeadRow}>
                <span style={{ flex: '0 0 130px' }}>Date</span>
                <span style={{ flex: 1 }}>Items</span>
                <span style={{ flex: '0 0 90px' }}>Amount</span>
                <span style={{ flex: '0 0 100px' }}>Payment</span>
                <span style={{ flex: '0 0 160px' }}>Source</span>
                <span style={{ flex: '0 0 120px' }}>Meta</span>
              </div>
              {orders.map((o) => {
                const { source, campaign } = attributionSource(o);
                const itemSummary = (o.items || []).map((i) => `${i.name} ×${i.quantity}`).join(', ');
                return (
                  <div key={o.id} style={orderRow}>
                    <span style={{ flex: '0 0 130px', color: T.soft }}>
                      {new Date(o.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <span style={{ flex: 1 }} title={itemSummary}>{itemSummary}</span>
                    <span style={{ flex: '0 0 90px' }}>${Number(o.amount).toFixed(2)}</span>
                    <span style={{ flex: '0 0 100px', color: T.soft }}>{o.paymentMethod || 'Unknown'}</span>
                    <span style={{ flex: '0 0 160px' }}>
                      {source}
                      {campaign && <span style={{ color: T.soft }}> · {campaign}</span>}
                    </span>
                    <span style={{ flex: '0 0 120px' }}>
                      {o.meta?.sent ? (
                        <span style={{ fontWeight: 700 }}>Sent</span>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(metaBusy[o.id])}
                          onClick={() => handleSendToMeta(o)}
                          style={{ ...S.btnOutline, height: 30, padding: '0 10px', fontSize: 11, opacity: metaBusy[o.id] ? 0.5 : 1 }}
                        >
                          {metaBusy[o.id] ? 'Sending…' : 'Send to Meta'}
                        </button>
                      )}
                      {!o.meta?.sent && (metaError[o.id] || o.meta?.lastError) && (
                        <div style={{ fontSize: 11, color: '#a13d2b', marginTop: 4 }}>{metaError[o.id] || o.meta.lastError}</div>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* PENDING REVIEWS */}
        <Section title={`Pending approval (${pendingReviews.length})`}>
          {reviewsLoading ? (
            <p style={{ color: T.soft, fontSize: 14 }}>Loading…</p>
          ) : pendingReviews.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>Nothing waiting on approval.</p>
          ) : (
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {pendingReviews.map((r) => (
                <div key={`${r.productId}-${r.id}`} style={reviewRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: T.soft, marginBottom: 4 }}>
                      {r.productName} · {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} · {r.author} · {new Date(r.createdAt).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: 14 }}>{r.text}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => handleApproveReview(r.productId, r.id)} style={S.btnOutline}>Approve</button>
                    <button onClick={() => handleDeleteReview(r.productId, r.id)} style={deleteBtn}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* PUBLISHED REVIEWS */}
        <Section title={`Published reviews (${approvedReviews.length})`}>
          {reviewsLoading ? (
            <p style={{ color: T.soft, fontSize: 14 }}>Loading…</p>
          ) : approvedReviews.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No published reviews yet.</p>
          ) : (
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {approvedReviews.map((r) => (
                <div key={`${r.productId}-${r.id}`} style={reviewRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: T.soft, marginBottom: 4 }}>
                      {r.productName} · {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} · {r.author} · {new Date(r.createdAt).toLocaleDateString()}
                      {r.source === 'imported' && <span style={{ marginLeft: 8, fontStyle: 'italic' }}>(imported)</span>}
                    </div>
                    <div style={{ fontSize: 14 }}>{r.text}</div>
                  </div>
                  <button onClick={() => handleDeleteReview(r.productId, r.id)} style={deleteBtn}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* IMPORT REVIEW */}
        <Section title="Add a review manually">
          <p style={{ fontSize: 12, color: T.soft, marginBottom: 16 }}>Use this to bring over reviews from your other site, one at a time.</p>
          <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
            <select value={importForm.productId} onChange={(e) => setImportForm({ ...importForm, productId: e.target.value })} style={formInput}>
              {PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 12 }}>
              <select value={importForm.rating} onChange={(e) => setImportForm({ ...importForm, rating: Number(e.target.value) })} style={{ ...formInput, width: 100 }}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>)}
              </select>
              <input placeholder="Author name" value={importForm.author} onChange={(e) => setImportForm({ ...importForm, author: e.target.value })} style={{ ...formInput, flex: 1 }} />
            </div>
            <textarea placeholder="Review text" value={importForm.text} onChange={(e) => setImportForm({ ...importForm, text: e.target.value })} style={{ ...formInput, minHeight: 80 }} required />
            {importMessage && <p style={{ fontSize: 12, color: T.ink }}>{importMessage}</p>}
            <button type="submit" style={{ ...S.btnFill, alignSelf: 'flex-start' }}>Add review</button>
          </form>
        </Section>

        {/* CSV IMPORT */}
        <Section title="Import reviews from a CSV">
          <p style={{ fontSize: 12, color: T.soft, marginBottom: 16 }}>
            Choose the product these reviews are for, then upload a CSV. Columns (any order, header names are
            flexible): <strong>rating</strong> (1–5), <strong>text</strong>, <strong>author</strong>. Imported
            reviews publish immediately.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <select
              value={csvProductId}
              onChange={(e) => setCsvProductId(e.target.value)}
              disabled={csvStatus === 'processing'}
              style={{ ...formInput, width: 220 }}
            >
              {PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} disabled={csvStatus === 'processing' || !csvProductId} />
          </div>
          {csvStatus === 'processing' && <p style={{ fontSize: 13, color: T.soft, marginTop: 12 }}>Importing…</p>}
          {csvSummary && (
            <div style={{ marginTop: 16, fontSize: 13 }}>
              <p style={{ color: T.ink, marginBottom: 8 }}>
                Imported {csvSummary.imported} for {csvSummary.productName}{csvSummary.skipped.length > 0 ? `, skipped ${csvSummary.skipped.length}` : ''}.
              </p>
              {csvSummary.skipped.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: 'auto', color: '#a13d2b' }}>
                  {csvSummary.skipped.map((s, i) => (
                    <div key={i}>Row {s.row}: {s.reason}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* DISCOUNT CODES */}
        <Section title={`Discount codes (${discounts.length})`}>
          {discounts.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14, marginBottom: 20 }}>No discount codes yet.</p>
          ) : (
            <div style={{ marginBottom: 20 }}>
              {discounts.map((d) => (
                <div key={d.code} style={reviewRow}>
                  <div style={{ flex: 1, fontSize: 14 }}>
                    <strong>{d.code}</strong> — {d.type === 'percent' ? `${d.value}% off` : `$${d.value} off`}
                  </div>
                  <button onClick={() => handleRemoveDiscount(d.code)} style={deleteBtn}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleAddDiscount} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={formLabel}>Code</label>
              <input
                placeholder="SUMMER20"
                value={discountForm.code}
                onChange={(e) => setDiscountForm({ ...discountForm, code: e.target.value })}
                style={{ ...formInput, width: 160 }}
                required
              />
            </div>
            <div>
              <label style={formLabel}>Type</label>
              <select value={discountForm.type} onChange={(e) => setDiscountForm({ ...discountForm, type: e.target.value })} style={{ ...formInput, width: 120 }}>
                <option value="percent">% off</option>
                <option value="fixed">$ off</option>
              </select>
            </div>
            <div>
              <label style={formLabel}>Value</label>
              <input
                type="number"
                min="1"
                value={discountForm.value}
                onChange={(e) => setDiscountForm({ ...discountForm, value: e.target.value })}
                style={{ ...formInput, width: 100 }}
                required
              />
            </div>
            <button type="submit" style={S.btnFill}>Add code</button>
          </form>
          {discountFormMessage && <p style={{ fontSize: 12, color: T.ink, marginTop: 12 }}>{discountFormMessage}</p>}
        </Section>
        </>)}
      </div>

      <style jsx>{`
        .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .funnel-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        @media (max-width: 640px) {
          .stat-grid { grid-template-columns: 1fr; }
          .funnel-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, highlight }) {
  return (
    <div style={{ ...statCard, ...(highlight ? { borderColor: T.ink } : {}) }}>
      <div className="admin-serif" style={{ fontWeight: 400, fontSize: 34 }}>{value}</div>
      <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.soft, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function FunnelStep({ label, value, rate }) {
  return (
    <div>
      <div className="admin-serif" style={{ fontSize: 28 }}>{value ?? 0}</div>
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.soft }}>{label}</div>
      {rate && <div style={{ fontSize: 12, color: T.ink, marginTop: 2 }}>{rate}</div>}
    </div>
  );
}

// Visitors tab: who came to the site, from where, and with which URL
// parameters (utm_*, fbclid, gclid, ad names…) on their first page.
function VisitorsTab() {
  const [visitors, setVisitors] = React.useState(null);
  const [error, setError] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [onlyTagged, setOnlyTagged] = React.useState(false);

  const load = React.useCallback(() => {
    setError('');
    fetch('/api/admin/visitors')
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || 'Could not load visitors.')))))
      .then((d) => setVisitors(d.visitors || []))
      .catch((err) => setError(err.message));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (visitors || []).filter((v) => {
      const params = v.params || {};
      if (onlyTagged && Object.keys(params).length === 0) return false;
      if (!q) return true;
      const hay = [v.source, v.landing, v.referrer, v.city, v.country, v.device, ...Object.entries(params).map(([k, val]) => `${k}=${val}`)]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [visitors, query, onlyTagged]);

  const topSources = React.useMemo(() => {
    const counts = new Map();
    for (const v of rows) counts.set(v.source || 'Direct', (counts.get(v.source || 'Direct') || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  return (
    <>
      <Section title="Visitors by source" action={<button type="button" onClick={load} style={S.btnOutline}>Refresh</button>}>
        {visitors === null && !error && <p style={{ color: T.soft, fontSize: 14 }}>Loading…</p>}
        {error && <p style={{ color: '#a13d2b', fontSize: 14 }}>{error}</p>}
        {visitors && topSources.length === 0 && <p style={{ color: T.soft, fontSize: 14 }}>No visitors recorded yet. New visits show up here from now on.</p>}
        {topSources.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {topSources.map(([source, count]) => (
              <button key={source} type="button" onClick={() => setQuery(source === query ? '' : source)} style={{ ...chip, cursor: 'pointer', background: query === source ? T.ink : T.white, color: query === source ? T.white : T.ink }}>
                {source} · {count}
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Recent visitors (${rows.length}${visitors && rows.length !== visitors.length ? ` of ${visitors.length}` : ''})`}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <input
            placeholder="Search source, page, city, utm_campaign=…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 220, height: 40, padding: '0 12px', border: `1px solid ${T.line}`, background: T.white, fontSize: 14 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.soft }}>
            <input type="checkbox" checked={onlyTagged} onChange={(e) => setOnlyTagged(e.target.checked)} />
            Only visits with URL parameters
          </label>
        </div>
        <div style={{ maxHeight: 640, overflowY: 'auto' }}>
          {rows.map((v) => {
            const params = Object.entries(v.params || {});
            const place = [v.city, v.region, v.country].filter(Boolean).join(', ');
            return (
              <div key={`${v.sessionId}-${v.ts}`} style={visitorRow}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{v.source || 'Direct'}</span>
                  <span style={{ color: T.soft, fontSize: 13 }}>
                    {new Date(v.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {place && ` · ${place}`}{v.device && ` · ${v.device}`}
                  </span>
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  <span style={{ color: T.soft }}>Landed on </span>{v.landing || '/'}
                  {v.referrer && <span style={{ color: T.soft }}> · from <span title={v.referrer}>{v.referrer.length > 70 ? `${v.referrer.slice(0, 70)}…` : v.referrer}</span></span>}
                </div>
                {params.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {params.map(([k, val]) => (
                      <span key={k} style={chip} title={`${k}=${val}`}>
                        <span style={{ color: T.soft }}>{k}</span>=<span>{val.length > 60 ? `${val.slice(0, 60)}…` : val}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function sinceIso(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

// Whether Meta is actually receiving server-side events (lib/metaCapi.js).
function CapiStatus({ capi }) {
  const okAt = capi.lastOk?.at ? new Date(capi.lastOk.at).getTime() : 0;
  const errAt = capi.lastError?.at ? new Date(capi.lastError.at).getTime() : 0;
  const failing = !capi.configured || errAt > okAt;
  const color = failing ? '#a13d2b' : '#1a7a3c';
  return (
    <Section title="Meta server events (Conversions API)">
      <p style={{ fontSize: 14, margin: '0 0 6px', color, fontWeight: 600 }}>
        {!capi.configured
          ? 'Not configured — set META_CAPI_ACCESS_TOKEN and NEXT_PUBLIC_META_PIXEL_ID in Vercel.'
          : failing
            ? 'Meta rejected the most recent event.'
            : capi.lastOk
              ? 'Meta is receiving server events.'
              : 'No server events sent yet since this check was added.'}
      </p>
      <div style={{ fontSize: 13, color: T.soft, lineHeight: 1.7 }}>
        {capi.lastOk && <div>Last accepted: {capi.lastOk.eventName} · {sinceIso(capi.lastOk.at)}</div>}
        {capi.lastError && (
          <div>Last error: {capi.lastError.eventName || 'event'} · {sinceIso(capi.lastError.at)} — {capi.lastError.error}</div>
        )}
        <div>API version {capi.graphVersion}{capi.testMode ? ' · test mode on (META_CAPI_TEST_EVENT_CODE is set — events only show in Test Events)' : ''}</div>
      </div>
    </Section>
  );
}

function Section({ title, action, children }) {
  return (
    <div style={{ background: T.white, border: `1px solid ${T.line}`, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <p className="admin-serif" style={{ margin: 0, fontSize: 19, fontWeight: 500, color: T.ink }}>{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

const tabBar = { display: 'flex', gap: 8, marginBottom: 24, borderBottom: `1px solid ${T.line}` };
const tabButton = { background: 'none', border: 'none', borderBottom: '2px solid transparent', padding: '10px 14px', fontSize: 15, color: T.soft, cursor: 'pointer', marginBottom: -1 };
const tabActive = { ...tabButton, color: T.ink, fontWeight: 600, borderBottom: `2px solid ${T.ink}` };
const visitorRow = { padding: '14px 0', borderTop: `1px solid ${T.line}`, fontSize: 14 };
const chip = { display: 'inline-block', border: `1px solid ${T.line}`, background: T.white, padding: '3px 8px', fontSize: 12, borderRadius: 999, wordBreak: 'break-all' };
const statGrid = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 };
const statCard = { background: T.white, border: `1px solid ${T.line}`, padding: '24px 20px', textAlign: 'center' };
const funnelGrid = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 };
const funnelRangeSelect = {
  height: 34, padding: '0 10px', border: `1px solid ${T.line}`, background: T.white,
  fontFamily: T.sans, fontSize: 12, color: T.ink, outline: 'none',
};
const orderHeadRow = {
  display: 'flex', gap: 12, padding: '0 0 10px', borderBottom: `1px solid ${T.ink}`,
  fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.soft,
};
const orderRow = {
  display: 'flex', gap: 12, padding: '12px 0', borderBottom: `1px solid ${T.line}`,
  fontSize: 13, alignItems: 'center',
};
const reviewRow = { display: 'flex', gap: 16, alignItems: 'flex-start', padding: '14px 0', borderBottom: `1px solid ${T.line}` };
const deleteBtn = {
  fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', border: `1px solid ${T.line}`,
  background: 'none', padding: '8px 12px', cursor: 'pointer', fontFamily: T.sans, flexShrink: 0, color: '#a13d2b',
};
const formInput = {
  width: '100%', height: 44, padding: '0 12px', border: `1px solid ${T.line}`, background: T.white,
  fontFamily: T.sans, fontSize: 14, color: T.ink, outline: 'none', boxSizing: 'border-box',
};
const formLabel = {
  display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.soft, marginBottom: 6,
};
