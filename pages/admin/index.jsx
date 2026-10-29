import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { PRODUCTS } from '../../lib/products';
import { parseCsv } from '../../lib/csv';
import WorldMap from '../../components/WorldMap';
import { T, S } from '../../lib/theme';
import AdminFonts from '../../components/AdminFonts';
import CartFunnelReport from '../../components/CartFunnelReport';
import AdminInbox from '../../components/AdminInbox';
import AdSpend from '../../components/AdSpend';
import PathsTree from '../../components/PathsTree';

// Meta error messages are hidden for now (owner's request): the
// Conversions API status box and each order's stored Meta send error.
// Flip to true to bring them back.
const SHOW_META_ERRORS = false;

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
// Dashboard date range: [key, picker label, phrase used in card titles].
const DASH_RANGES = [
  ['today', 'Today', 'today'],
  ['yesterday', 'Yesterday', 'yesterday'],
  ['7d', 'Last 7 days', 'last 7 days'],
  ['30d', 'Last 30 days', 'last 30 days'],
];
const rangePhrase = (range) => DASH_RANGES.find(([k]) => k === range)?.[2] || 'today';
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
  const [dashRange, setDashRange] = React.useState('today');
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
  const [tab, setTab] = React.useState('dashboard');
  // The chosen section rides in the URL (#orders) so a refresh keeps it.
  React.useEffect(() => {
    const fromHash = window.location.hash.replace('#', '');
    if (ADMIN_TABS.some(([k]) => k === fromHash)) setTab(fromHash);
  }, []);
  // Bumped whenever the admin should pull fresh data: picking a section
  // (even the one already open), and coming back to the admin — opening the
  // home-screen app, switching back to the browser tab, or the phone
  // waking it up. Every section reloads when it changes.
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [updatedAt, setUpdatedAt] = React.useState(null);
  const lastRefreshRef = React.useRef(0);
  const refresh = React.useCallback(() => {
    // focus + visibilitychange (+ pageshow) usually fire together.
    if (Date.now() - lastRefreshRef.current < 1500) return;
    lastRefreshRef.current = Date.now();
    setRefreshKey((k) => k + 1);
  }, []);
  React.useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const onPageShow = (e) => { if (e.persisted) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [refresh]);

  const selectTab = (key) => {
    lastRefreshRef.current = 0;
    refresh();
    setTab(key);
    window.history.replaceState(null, '', `#${key}`);
    window.scrollTo(0, 0);
  };

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
    fetch(`/api/admin/dashboard?range=${range}`).then((r) => r.json()).then((d) => { setDashboard(d); setUpdatedAt(new Date()); }).catch(() => {});
  }, []);

  // quiet: a background refresh keeps the current list on screen instead
  // of flashing "Loading…".
  const loadReviews = React.useCallback((quiet) => {
    if (quiet !== true) setReviewsLoading(true);
    fetch('/api/admin/reviews')
      .then((r) => r.json())
      .then((data) => setReviews(data.reviews || []))
      .finally(() => setReviewsLoading(false));
  }, []);

  const loadDiscounts = React.useCallback(() => {
    fetch('/api/admin/discounts').then((r) => r.json()).then((data) => setDiscounts(data.discounts || [])).catch(() => {});
  }, []);

  React.useEffect(() => {
    loadReviews(refreshKey > 0);
    loadDiscounts();
  }, [loadReviews, loadDiscounts, refreshKey]);

  // Covers the initial load, refetching when the dashboard date range
  // changes, and every refresh.
  React.useEffect(() => {
    loadDashboard(dashRange);
  }, [loadDashboard, dashRange, refreshKey]);

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
  }, [refreshKey]);

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
  const [inboxNew, setInboxNew] = React.useState(0);
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
        <title key="title">{`${live.count} live · Smells Iconic Admin`}</title>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <meta name="theme-color" content={T.ink} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Smells Iconic Admin" />
      </Head>
      <AdminFonts />

      <div className="admin-shell">
        <nav className="admin-nav">
          <div style={{ fontWeight: 600, fontSize: 18, padding: '4px 12px 18px' }}>Smells Iconic</div>
          {ADMIN_TABS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => selectTab(key)} className={`admin-nav-item${tab === key ? ' active' : ''}`}>
              {label}
              {key === 'reviews' && pendingReviews.length > 0 && <span className="admin-nav-badge">{pendingReviews.length}</span>}
              {key === 'inbox' && inboxNew > 0 && <span className="admin-nav-badge">{inboxNew}</span>}
            </button>
          ))}
          <button type="button" onClick={handleLogout} className="admin-nav-item admin-nav-signout">Sign out</button>
        </nav>

        <main className="admin-main">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '0 0 24px' }}>
          <h1 style={{ fontWeight: 600, fontSize: 26, margin: 0 }}>{ADMIN_TABS.find(([k]) => k === tab)?.[1]}</h1>
          {updatedAt && (
            <span style={{ fontSize: 12, color: T.soft }}>
              Updated {updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>

        {tab === 'orders' && <OrdersTab refreshKey={refreshKey} />}
        {tab === 'visitors' && <VisitorsTab refreshKey={refreshKey} />}
        {tab === 'subscribers' && <SubscribersTab refreshKey={refreshKey} />}
        {/* Paths to purchase (components/PathsTree.jsx, lib/journeys.js). */}
        {tab === 'paths' && (
          <Section title="Paths to purchase">
            <PathsTree />
          </Section>
        )}
        {/* Mounted (hidden) on every tab so the nav badge counts new messages. */}
        <div style={{ display: tab === 'inbox' ? 'block' : 'none' }}><AdminInbox onCount={setInboxNew} /></div>

        {tab === 'settings' && (<>

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

        {SHOW_META_ERRORS && dashboard?.capi && <CapiStatus capi={dashboard.capi} />}
        </>)}

        {tab === 'dashboard' && (<>
        {/* DATE RANGE — drives revenue, orders, payment methods and the funnel. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <select aria-label="Date range" value={dashRange} onChange={(e) => { setDashboard(null); setDashRange(e.target.value); }} style={rangeSelect}>
            {DASH_RANGES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>

        {/* TOP STATS */}
        <div className="stat-grid" style={statGrid}>
          <StatCard label={`Revenue ${rangePhrase(dashRange)}`} value={dashboard ? `$${dashboard.revenue.toFixed(2)}` : '—'} />
          <StatCard label={`Orders ${rangePhrase(dashRange)}`} value={dashboard ? dashboard.orderCount : '—'} />
          <StatCard label="Live visitors" value={live.count} highlight />
        </div>

        {/* AD SPEND — this store's Meta ad spend vs. revenue (components/AdSpend.jsx). */}
        <Section title="Ad spend (Meta)">
          <AdSpend />
        </Section>

        {/* LIVE FUNNEL */}
        <Section title="Live visitors by stage">
          {live.count === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No one on the site right now.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
                {Object.entries(STAGE_LABELS).map(([key, label]) => (
                  <div key={key} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 32 }}>{live.byStage[key] || 0}</div>
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
        <Section title={`Payment methods ${rangePhrase(dashRange)}`}>
          {!dashboard || dashboard.paymentMethods.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>{dashRange === 'today' ? 'No orders yet today.' : `No orders ${rangePhrase(dashRange)}.`}</p>
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
        <Section title={`Funnel — ${rangePhrase(dashRange)}`}>
          {dashboard && (
            <div className="funnel-grid" style={funnelGrid}>
              <FunnelStep label="Visitors" value={dashboard.funnel.pageviews} />
              <FunnelStep label="Added to cart" value={dashboard.funnel.addToCart} rate={`${dashboard.funnel.addToCartRate}% of visitors`} />
              <FunnelStep label="Started checkout" value={dashboard.funnel.checkoutStarts} rate={`${dashboard.funnel.checkoutRate}% of adds`} />
              <FunnelStep label="Purchased" value={dashboard.funnel.purchases} rate={`${dashboard.funnel.conversionRate}% of visitors`} />
            </div>
          )}
        </Section>

        {/* Where shoppers stop between cart and paying, and why. */}
        <CartFunnelReport refreshKey={refreshKey} />

        </>)}

        {tab === 'reviews' && (<>
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

        </>)}

        {tab === 'discounts' && (<>
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
        </main>
      </div>

      <style jsx>{`
        .admin-shell { display: flex; gap: 32px; max-width: 1240px; margin: 0 auto; align-items: flex-start; }
        .admin-nav { position: sticky; top: 24px; width: 200px; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; }
        .admin-nav-item { display: flex; justify-content: space-between; align-items: center; text-align: left; padding: 10px 12px; border: none; border-radius: 8px; background: none; font-size: 15px; color: ${T.soft}; cursor: pointer; }
        .admin-nav-item:hover { background: rgba(0, 0, 0, 0.04); color: ${T.ink}; }
        .admin-nav-item.active { background: ${T.white}; color: ${T.ink}; font-weight: 600; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06); }
        .admin-nav-badge { min-width: 20px; padding: 1px 6px; border-radius: 999px; background: ${T.ink}; color: ${T.white}; font-size: 11px; text-align: center; }
        .admin-nav-signout { margin-top: 16px; }
        .admin-main { flex: 1; min-width: 0; }
        @media (max-width: 760px) {
          .admin-shell { flex-direction: column; gap: 16px; }
          .admin-nav { position: sticky; top: 0; z-index: 5; width: 100%; flex-direction: row; overflow-x: auto; background: ${T.paper}; padding: 8px 0; }
          .admin-nav > div:first-child { display: none; }
          .admin-nav-item { white-space: nowrap; flex-shrink: 0; }
          .admin-nav-signout { margin-top: 0; }
        }
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
      <div style={{ fontWeight: 400, fontSize: 34 }}>{value}</div>
      <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.soft, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function FunnelStep({ label, value, rate }) {
  return (
    <div>
      <div style={{ fontSize: 28 }}>{value ?? 0}</div>
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.soft }}>{label}</div>
      {rate && <div style={{ fontSize: 12, color: T.ink, marginTop: 2 }}>{rate}</div>}
    </div>
  );
}

const ADMIN_TABS = [
  ['dashboard', 'Dashboard'],
  ['orders', 'Orders'],
  ['visitors', 'Visitors'],
  ['subscribers', 'Subscribers'],
  ['reviews', 'Reviews'],
  ['discounts', 'Discounts'],
  ['inbox', 'Inbox'],
  ['paths', 'Paths'],
  ['settings', 'Settings'],
];

// Subscribers tab: everyone who has given an email or phone — newsletter
// signups, checkouts (paid or abandoned), and customers — with whether they
// bought, what was in an abandoned cart, and whether they opted in to email.
const SUB_FILTERS = [['all', 'All'], ['abandoned', 'Abandoned checkout'], ['customers', 'Customers'], ['newsletter', 'Signups'], ['optedin', 'Emails OK'], ['optedout', 'Not opted in'], ['automated', 'Sent an automation'], ['noautomation', 'No automation yet']];

// Automation emails this person was sent, newest first (subscriber
// automationsSent, from lib/subscribersStore.js's markAbandonedEmailSent).
// Records from before that list existed only kept the last send time.
function automationsSent(s) {
  const list = s.automationsSent?.length ? s.automationsSent
    : s.abandonedEmailSentAt ? [{ flow: 'Abandoned checkout', subject: null, sentAt: s.abandonedEmailSentAt }] : [];
  return [...list].sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
}

function subscriberStatus(s) {
  if (s.orders?.count) return { kind: 'customer', label: `Customer · ${s.orders.count} order${s.orders.count === 1 ? '' : 's'} · $${s.orders.spent.toFixed(2)}`, color: '#1a7a3c' };
  if (s.sources?.includes('order')) return { kind: 'customer', label: 'Customer', color: '#1a7a3c' };
  if (s.lastCheckoutAt) return { kind: 'abandoned', label: 'Abandoned checkout', color: '#a13d2b' };
  return { kind: 'newsletter', label: s.sources?.includes('cart') && !s.sources?.includes('newsletter') ? 'Signed up in cart for 15% off' : 'Newsletter signup', color: T.soft };
}

function SubscribersTab({ refreshKey }) {
  const [list, setList] = React.useState(null);
  const [error, setError] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');

  const load = React.useCallback(() => {
    setError('');
    fetch('/api/admin/subscribers')
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || 'Could not load subscribers.')))))
      .then((d) => setList(d.subscribers || []))
      .catch((err) => setError(err.message));
  }, []);
  React.useEffect(() => { load(); }, [load, refreshKey]);

  const matches = (s, f) => {
    const st = subscriberStatus(s).kind;
    if (f === 'abandoned') return st === 'abandoned';
    if (f === 'customers') return st === 'customer';
    if (f === 'newsletter') return s.sources?.includes('newsletter') || s.sources?.includes('cart');
    if (f === 'optedin') return s.consent && s.email;
    if (f === 'optedout') return !s.consent;
    if (f === 'automated') return automationsSent(s).length > 0;
    if (f === 'noautomation') return Boolean(s.email) && !automationsSent(s).length;
    return true;
  };
  const counts = React.useMemo(() => Object.fromEntries(SUB_FILTERS.map(([k]) => [k, (list || []).filter((s) => matches(s, k)).length])), [list]);
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list || []).filter((s) => matches(s, filter) && (!q || [s.email, s.phone, s.name, s.city, s.state, ...(s.cart || []).map((i) => i.name)].filter(Boolean).join(' ').toLowerCase().includes(q)));
  }, [list, filter, query]);

  const toggleConsent = async (s) => {
    const res = await fetch('/api/admin/subscribers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: s.key, consent: !s.consent }) });
    const d = await res.json();
    if (d.subscriber) setList((prev) => prev.map((x) => (x.key === s.key ? { ...x, ...d.subscriber } : x)));
  };

  // Sends the abandoned-checkout email with a sample cart, to check Resend is
  // set up (pages/api/admin/abandoned-email-test.js).
  const sendTestReminder = async () => {
    const to = window.prompt('Send a test abandoned-checkout email to:');
    if (!to) return;
    const res = await fetch('/api/admin/abandoned-email-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }) });
    const d = await res.json().catch(() => ({}));
    window.alert(res.ok ? `Test email sent to ${to}.` : `Couldn't send: ${d.error || res.status}`);
  };

  const exportCsv = () => {
    const header = ['Email', 'Phone', 'Name', 'City', 'State', 'Status', 'Emails OK', 'Sources', 'Abandoned cart', 'Automations sent', 'First seen', 'Last seen'];
    const lines = rows.map((s) => [s.email, s.phone, s.name, s.city, s.state, subscriberStatus(s).label, s.consent ? 'yes' : 'no', (s.sources || []).join(' '),
      subscriberStatus(s).kind === 'abandoned' ? (s.cart || []).map((i) => `${i.name} x${i.quantity}`).join('; ') : '',
      automationsSent(s).map((a) => `${a.flow} (${new Date(a.sentAt).toLocaleString()})`).join('; '),
      s.firstSeen ? new Date(s.firstSeen).toLocaleString() : '', s.lastSeen ? new Date(s.lastSeen).toLocaleString() : ''].map(csvCell).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `smells-iconic-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Section
      title={list ? `${rows.length} ${rows.length === 1 ? 'person' : 'people'}` : 'Subscribers'}
      action={<div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={sendTestReminder} style={S.btnOutline}>Send test reminder</button>
        <button type="button" onClick={exportCsv} disabled={!rows.length} style={S.btnOutline}>Export CSV</button>
        <button type="button" onClick={load} style={S.btnOutline}>Refresh</button>
      </div>}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {SUB_FILTERS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} style={{ ...chip, cursor: 'pointer', background: filter === key ? T.ink : T.white, color: filter === key ? T.white : T.ink }}>{label} · {counts[key] ?? 0}</button>
        ))}
      </div>
      <input placeholder="Search email, phone, name, city, product…" value={query} onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px', border: `1px solid ${T.line}`, background: T.white, fontSize: 14, marginBottom: 16 }} />

      {list === null && !error && <p style={{ color: T.soft, fontSize: 14 }}>Loading…</p>}
      {error && <p style={{ color: '#a13d2b', fontSize: 14 }}>{error}</p>}
      {list && rows.length === 0 && <p style={{ color: T.soft, fontSize: 14 }}>No one here yet. People appear as soon as they sign up or type their email/phone at checkout.</p>}

      {rows.map((s) => {
        const st = subscriberStatus(s);
        return (
          <div key={s.key} style={{ padding: '14px 0', borderTop: `1px solid ${T.line}`, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span>
                <span style={{ fontWeight: 600 }}>{s.name || s.email || s.phone}</span>
                {s.name && s.email && <span style={{ color: T.soft }}> · {s.email}</span>}
                {s.phone && <span style={{ color: T.soft }}> · {s.phone}</span>}
              </span>
              <span style={{ color: T.soft, fontSize: 13 }}>
                {[s.city, s.state].filter(Boolean).join(', ')}{(s.city || s.state) ? ' · ' : ''}last seen {s.lastSeen ? new Date(s.lastSeen).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
              <span style={{ fontWeight: 600, color: st.color }}>{st.label}</span>
              {st.kind === 'abandoned' && s.cart?.length > 0 && (
                <span style={{ color: T.soft }}>left {s.cart.map((i) => `${i.name} ×${i.quantity}`).join(', ')} (${s.cart.reduce((t, i) => t + i.price * i.quantity, 0).toFixed(2)})</span>
              )}
              <span style={{ color: T.soft, fontSize: 13 }}>via {(s.sources || []).join(', ')}</span>
              <button type="button" onClick={() => toggleConsent(s)} title="Whether they agreed to marketing emails"
                style={{ ...chip, cursor: 'pointer', background: s.consent ? '#e7f4ea' : T.white, color: s.consent ? '#1a7a3c' : T.soft }}>
                {s.consent ? 'Emails OK' : 'Not opted in'}
              </button>
            </div>
            {s.email && (
              <div style={{ marginTop: 6, fontSize: 13, color: T.soft }}>
                {automationsSent(s).length ? (
                  <>
                    <span>Automations sent:</span>
                    {automationsSent(s).map((a) => (
                      <div key={a.sentAt} style={{ paddingLeft: 12 }}>
                        <span style={{ color: T.ink }}>{a.flow}</span>
                        {a.subject && <> · &ldquo;{a.subject}&rdquo;</>} · {new Date(a.sentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    ))}
                  </>
                ) : 'No automation emails sent yet'}
              </div>
            )}
          </div>
        );
      })}
    </Section>
  );
}

// Orders tab: every order kept (45 days) with customer, shipping, items,
// payment, where they came from, Meta status, tracking, and actions
// (refund through the company that took the payment, cancel, archive).
const ORDER_RANGES = [['today', 'Today', 1], ['yesterday', 'Yesterday', 1], ['7d', 'Last 7 days', 7], ['30d', 'Last 30 days', 30], ['all', 'All (45 days)', 45]];
// Calendar day (YYYY-MM-DD) in the store's Pacific timezone — the same days
// the order ledger and dashboard use — so "Today"/"Yesterday" match them.
const storeDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
const storeDayOf = (t) => storeDay.format(new Date(t));
const ORDER_STATUSES = [['open', 'Open'], ['unshipped', 'To ship'], ['shipped', 'Fulfilled'], ['refunded', 'Refunded'], ['cancelled', 'Cancelled'], ['archived', 'Archived'], ['every', 'Everything']];

function orderState(o) {
  if (o.status === 'refunded') return { label: 'Refunded', color: '#a13d2b' };
  if (o.status === 'cancelled') return { label: 'Cancelled', color: T.soft };
  if (o.status === 'archived') return { label: 'Archived', color: T.soft };
  // A tracking number on the order means it has been fulfilled.
  if (o.trackingNumber) return { label: 'Fulfilled', color: '#1a7a3c', icon: '✓ ' };
  return { label: 'To ship', color: '#9a6a12' };
}

function customerName(o) {
  const s = o.shipping || {};
  return (s.name || `${s.firstName || ''} ${s.lastName || ''}`).trim();
}

function csvCell(v) {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function OrdersTab({ refreshKey }) {
  const [orders, setOrders] = React.useState(null);
  const [error, setError] = React.useState('');
  const [range, setRange] = React.useState('30d');
  const [statusFilter, setStatusFilter] = React.useState('open');
  const [query, setQuery] = React.useState('');
  const [openId, setOpenId] = React.useState(null);
  const [busy, setBusy] = React.useState({});
  const [msg, setMsg] = React.useState({});
  const [tracking, setTracking] = React.useState({});

  const load = React.useCallback(() => {
    setError('');
    fetch('/api/admin/orders')
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || 'Could not load orders.')))))
      .then((d) => setOrders(d.orders || []))
      .catch((err) => setError(err.message));
  }, []);
  React.useEffect(() => { load(); }, [load, refreshKey]);

  // Easyship setup, tracking webhook + latest label (pages/api/admin/orders/easyship.js).
  const [easyshipStatus, setEasyshipStatus] = React.useState(null);
  const loadEasyship = React.useCallback(() => {
    fetch('/api/admin/orders/easyship').then((r) => r.json()).then(setEasyshipStatus).catch(() => {});
  }, []);
  React.useEffect(() => { loadEasyship(); }, [loadEasyship, refreshKey]);

  const replace = (order) => setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));

  // Orders ticked in the list, for "Export selected" and "Send to Easyship"
  // (only the ticked orders that can go to Easyship are sent).
  const [selected, setSelected] = React.useState([]);
  const [selectedSending, setSelectedSending] = React.useState(false);
  const [selectedMessage, setSelectedMessage] = React.useState('');
  const canSendToEasyship = (o) => (o.status || 'paid') === 'paid' && !o.trackingNumber && !o.easyship?.sent && Boolean(o.shipping?.address);
  const toggleSelected = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const sendSelected = async () => {
    setSelectedSending(true);
    setSelectedMessage('');
    let sent = 0;
    const problems = [];
    try {
      // 40 per request (the endpoint's batch size).
      const toSend = (orders || []).filter((o) => selected.includes(o.id) && canSendToEasyship(o)).map((o) => o.id);
      for (let i = 0; i < toSend.length; i += 40) {
        const res = await fetch('/api/admin/orders/easyship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderIds: toSend.slice(i, i + 40) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not send.');
        sent += data.sent;
        problems.push(...data.failed.map((f) => `${f.id}: ${f.error}`), ...data.skipped.map((k) => `${k.id}: ${k.reason}`));
      }
      setSelectedMessage(`Sent ${sent} to Easyship.${problems.length ? ` Not sent — ${problems.slice(0, 3).join(' · ')}${problems.length > 3 ? ` (+${problems.length - 3} more)` : ''}` : ''}`);
      setSelected((prev) => prev.filter((id) => !toSend.includes(id)));
    } catch (err) {
      setSelectedMessage(err.message);
    } finally {
      setSelectedSending(false);
      load();
      loadEasyship();
    }
  };

  const act = async (o, key, url, body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy((b) => ({ ...b, [o.id]: key }));
    setMsg((m) => ({ ...m, [o.id]: '' }));
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: o.id, ...body }) });
      const data = await res.json();
      if (data.order) replace(data.order);
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      if (key === 'easyship') loadEasyship();
      setMsg((m) => ({ ...m, [o.id]: { ok: true, text: key === 'refund' ? 'Refunded.' : key === 'track' ? 'Tracking saved.' : key === 'meta' ? 'Sent to Meta.' : key === 'easyship' ? 'Sent to Easyship.' : 'Updated.' } }));
    } catch (err) {
      setMsg((m) => ({ ...m, [o.id]: { ok: false, text: err.message } }));
    } finally {
      setBusy((b) => ({ ...b, [o.id]: null }));
    }
  };

  const rows = React.useMemo(() => {
    const days = ORDER_RANGES.find(([k]) => k === range)?.[2] || 45;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const onlyDay = range === 'today' ? storeDayOf(Date.now()) : range === 'yesterday' ? storeDayOf(Date.now() - 24 * 60 * 60 * 1000) : null;
    const q = query.trim().toLowerCase();
    return (orders || []).filter((o) => {
      if (onlyDay ? storeDayOf(o.createdAt) !== onlyDay : new Date(o.createdAt).getTime() < since) return false;
      const st = o.status || 'paid';
      if (statusFilter === 'open' && !['paid', undefined].includes(o.status) ) return false;
      if (statusFilter === 'unshipped' && (st !== 'paid' || o.trackingNumber)) return false;
      if (statusFilter === 'shipped' && (st !== 'paid' || !o.trackingNumber)) return false;
      if (['refunded', 'cancelled', 'archived'].includes(statusFilter) && st !== statusFilter) return false;
      if (!q) return true;
      const hay = [o.id, o.email, customerName(o), o.paymentMethod, o.trackingNumber, o.shipping?.city, o.shipping?.zip,
        ...(o.items || []).map((i) => i.name), attributionSource(o).source, attributionSource(o).campaign].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [orders, range, statusFilter, query]);

  const totals = React.useMemo(() => {
    const paid = rows.filter((o) => !['refunded', 'cancelled'].includes(o.status));
    return { count: rows.length, revenue: paid.reduce((s, o) => s + Number(o.amount || 0), 0) };
  }, [rows]);

  const downloadCsv = (header, lines, name) => {
    const blob = new Blob([[header.map(csvCell).join(','), ...lines.map((l) => l.map(csvCell).join(','))].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `smells-iconic-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportCsv = () => {
    const header = ['Date', 'Order ID', 'Status', 'Customer', 'Email', 'Phone', 'Address', 'Apt', 'City', 'State', 'ZIP', 'Items', 'Amount', 'Payment', 'Source', 'Campaign', 'Carrier', 'Tracking'];
    const lines = rows.map((o) => {
      const s = o.shipping || {};
      const { source, campaign } = attributionSource(o);
      return [new Date(o.createdAt).toLocaleString(), o.id, orderState(o).label, customerName(o), o.email, s.phone, s.address, s.apt, s.city, s.state, s.zip,
        (o.items || []).map((i) => `${i.name} x${i.quantity}`).join('; '), Number(o.amount || 0).toFixed(2), o.paymentMethod, source, campaign, o.carrier, o.trackingNumber];
    });
    downloadCsv(header, lines, 'orders');
  };

  // Just the ticked orders: who, where to ship, and what's in the order.
  const exportSelected = () => {
    const header = ['Order ID', 'Date', 'Name', 'Email', 'Phone', 'Address', 'Apt', 'City', 'State', 'ZIP', 'Items', 'Total qty'];
    const lines = (orders || []).filter((o) => selected.includes(o.id)).map((o) => {
      const s = o.shipping || {};
      const items = o.items || [];
      return [o.id, new Date(o.createdAt).toLocaleString(), customerName(o), o.email, s.phone, s.address, s.apt, s.city, s.state, s.zip,
        items.map((i) => `${i.name} x${i.quantity || 1}`).join('; '), items.reduce((n, i) => n + Number(i.quantity || 1), 0)];
    });
    downloadCsv(header, lines, `selected-orders-${lines.length}`);
  };

  const field = { height: 40, padding: '0 12px', border: `1px solid ${T.line}`, background: T.white, fontSize: 14 };

  return (
    <Section
      title={orders ? `${totals.count} order${totals.count === 1 ? '' : 's'} · $${totals.revenue.toFixed(2)}` : 'Orders'}
      action={<div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={exportCsv} disabled={!rows.length} style={S.btnOutline}>Export CSV</button>
        <button type="button" onClick={load} style={S.btnOutline}>Refresh</button>
      </div>}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {ORDER_STATUSES.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setStatusFilter(key)} style={{ ...chip, cursor: 'pointer', background: statusFilter === key ? T.ink : T.white, color: statusFilter === key ? T.white : T.ink }}>{label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <input placeholder="Search name, email, order ID, product, tracking…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...field, flex: 1, minWidth: 220 }} />
        <select value={range} onChange={(e) => setRange(e.target.value)} style={field}>
          {ORDER_RANGES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      {easyshipStatus && <EasyshipStatus status={easyshipStatus} onSent={() => { load(); loadEasyship(); }} />}
      {(() => {
        const shown = rows.map((o) => o.id);
        const eligible = rows.filter(canSendToEasyship).map((o) => o.id);
        const all = shown.length > 0 && shown.every((id) => selected.includes(id));
        const sendable = (orders || []).filter((o) => selected.includes(o.id) && canSendToEasyship(o)).length;
        if (!shown.length && !selected.length && !selectedMessage) return null;
        return (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 12px', fontSize: 13 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: shown.length ? 'pointer' : 'default' }}>
              <input type="checkbox" checked={all} disabled={!shown.length} onChange={() => setSelected(all ? selected.filter((id) => !shown.includes(id)) : [...new Set([...selected, ...shown])])} />
              Select all shown ({shown.length})
            </label>
            {eligible.length > 0 && (
              <button type="button" onClick={() => setSelected(eligible)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, color: T.ink, textDecoration: 'underline', cursor: 'pointer' }}>
                Select not in Easyship ({eligible.length})
              </button>
            )}
            {selected.length > 0 && (
              <>
                <button type="button" onClick={exportSelected} style={{ ...S.btnFill, height: 36, padding: '0 16px', fontSize: 13 }}>
                  Export {selected.length} selected to CSV
                </button>
                {sendable > 0 && (
                  <button type="button" onClick={sendSelected} disabled={selectedSending} style={{ ...S.btnOutline, height: 36, padding: '0 16px', fontSize: 13, opacity: selectedSending ? 0.6 : 1 }}>
                    {selectedSending ? 'Sending…' : `Send ${sendable} to Easyship`}
                  </button>
                )}
                <button type="button" onClick={() => setSelected([])} style={{ ...S.btnOutline, height: 36, padding: '0 14px', fontSize: 12 }}>Clear</button>
              </>
            )}
            {selectedMessage && <span>{selectedMessage}</span>}
          </div>
        );
      })()}
      {orders === null && !error && <p style={{ color: T.soft, fontSize: 14 }}>Loading…</p>}
      {error && <p style={{ color: '#a13d2b', fontSize: 14 }}>{error}</p>}
      {orders && rows.length === 0 && <p style={{ color: T.soft, fontSize: 14 }}>No orders match.</p>}

      {rows.map((o) => {
        const state = orderState(o);
        const open = openId === o.id;
        const s = o.shipping || {};
        const { source, campaign } = attributionSource(o);
        const attr = o.attribution || {};
        const t = tracking[o.id] ?? { carrier: o.carrier || 'USPS', trackingNumber: o.trackingNumber || '', trackingUrl: o.trackingUrl || '' };
        const setT = (k, v) => setTracking((prev) => ({ ...prev, [o.id]: { ...t, [k]: v } }));
        const m = msg[o.id];
        return (
          <div key={o.id} style={{ borderTop: `1px solid ${T.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: '0 0 18px' }}>
              <input type="checkbox" aria-label="Select order" checked={selected.includes(o.id)} onChange={() => toggleSelected(o.id)} />
            </span>
            <button type="button" onClick={() => setOpenId(open ? null : o.id)} style={{ display: 'flex', flex: 1, minWidth: 0, gap: 12, alignItems: 'center', padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flexWrap: 'wrap', fontSize: 14, color: T.ink }}>
              <span style={{ flex: '0 0 120px', color: T.soft }}>{new Date(o.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{customerName(o) || o.email || 'Customer'}</span>
                <span style={{ color: T.soft }}> · {(o.items || []).map((i) => `${i.name} ×${i.quantity}`).join(', ')}</span>
              </span>
              <span style={{ flex: '0 0 80px', fontWeight: 600 }}>${Number(o.amount || 0).toFixed(2)}</span>
              <span style={{ flex: '0 0 90px', fontWeight: 600, color: state.color }}>{state.icon}{state.label}</span>
              <span style={{ flex: '0 0 130px', fontSize: 12, color: o.trackingNumber ? '#1a7a3c' : o.easyship?.lastError ? '#a13d2b' : T.soft, wordBreak: 'break-all' }} title={o.trackingNumber ? 'Tracking number' : undefined}>
                {o.trackingNumber ? `${o.carrier ? `${o.carrier} ` : ''}${o.trackingNumber}` : o.easyship?.sent ? '✓ In Easyship' : o.easyship?.lastError ? 'Easyship failed' : (o.status || 'paid') === 'paid' && !o.trackingNumber ? (o.shipping?.address ? 'Not in Easyship' : 'No address') : ''}
              </span>
              <span style={{ flex: '0 0 16px', color: T.soft }}>{open ? '−' : '+'}</span>
            </button>
            </div>

            {open && (
              <div style={{ padding: '4px 0 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, fontSize: 14 }}>
                <div>
                  <div style={orderLabel}>Customer</div>
                  <div>{customerName(o) || '—'}</div>
                  {o.email && <div><a href={`mailto:${o.email}`} style={{ color: T.ink }}>{o.email}</a></div>}
                  {s.phone && <div>{s.phone}</div>}
                </div>
                <div>
                  <div style={orderLabel}>Ship to</div>
                  {s.address ? (
                    <div>{s.address}{s.apt ? `, ${s.apt}` : ''}<br />{s.city}, {s.state} {s.zip}</div>
                  ) : <div style={{ color: T.soft }}>No address saved</div>}
                </div>
                <div>
                  <div style={orderLabel}>Items</div>
                  {(o.items || []).map((i) => (
                    <div key={i.id}>{i.name} × {i.quantity} — ${(Number(i.price || 0) * i.quantity).toFixed(2)}</div>
                  ))}
                  <div style={{ fontWeight: 600, marginTop: 4 }}>Total ${Number(o.amount || 0).toFixed(2)}</div>
                </div>
                <div>
                  <div style={orderLabel}>Payment</div>
                  <div>{o.paymentMethod || 'Unknown'}{o.processor ? ` (${o.processor})` : ''}</div>
                  <div style={{ color: T.soft, fontSize: 12, wordBreak: 'break-all' }}>Order ID {o.id}</div>
                  {o.refundedAt && <div style={{ color: '#a13d2b' }}>Refunded {new Date(o.refundedAt).toLocaleDateString()}</div>}
                </div>
                <div>
                  <div style={orderLabel}>Came from</div>
                  <div>{source}{campaign ? ` · ${campaign}` : ''}</div>
                  {(attr.utm_content || attr.adset_name) && <div style={{ color: T.soft }}>Ad set: {attr.adset_name || attr.utm_content}</div>}
                  {(attr.utm_term || attr.ad_name) && <div style={{ color: T.soft }}>Ad: {attr.ad_name || attr.utm_term}</div>}
                  {attr.landingPage && <div style={{ color: T.soft }}>Landed on {attr.landingPage}</div>}
                </div>
                <div>
                  <div style={orderLabel}>Meta</div>
                  {o.meta?.sent ? <div style={{ color: '#1a7a3c', fontWeight: 600 }}>Purchase sent</div> : (
                    <>
                      <button type="button" disabled={Boolean(busy[o.id])} onClick={() => act(o, 'meta', '/api/admin/order-meta', {})} style={{ ...S.btnOutline, height: 34, padding: '0 12px' }}>
                        {busy[o.id] === 'meta' ? 'Sending…' : 'Send to Meta'}
                      </button>
                      {SHOW_META_ERRORS && o.meta?.lastError && <div style={{ color: '#a13d2b', fontSize: 12, marginTop: 4 }}>{o.meta.lastError}</div>}
                    </>
                  )}
                </div>
                {/* Whether Easyship has this order (lib/easyship.js) —
                    sent automatically at checkout and retried hourly; the
                    button covers older orders and failures. */}
                <div>
                  <div style={orderLabel}>Easyship</div>
                  {o.easyship?.sent ? <div style={{ color: '#1a7a3c', fontWeight: 600 }}>In Easyship</div> : (
                    <>
                      <button type="button" disabled={Boolean(busy[o.id])} onClick={() => act(o, 'easyship', '/api/admin/orders/easyship', {})} style={{ ...S.btnOutline, height: 34, padding: '0 12px' }}>
                        {busy[o.id] === 'easyship' ? 'Sending…' : 'Send to Easyship'}
                      </button>
                      {o.easyship?.lastError && <div style={{ color: '#a13d2b', fontSize: 12, marginTop: 4 }}>{o.easyship.lastError}</div>}
                    </>
                  )}
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={orderLabel}>Tracking</div>
                  {o.trackingNumber && (
                    <div style={{ marginBottom: 8 }}>
                      {o.carrier ? `${o.carrier} · ` : ''}{o.trackingUrl ? <a href={o.trackingUrl} target="_blank" rel="noreferrer" style={{ color: T.ink }}>{o.trackingNumber}</a> : o.trackingNumber}
                      {o.shippedAt && <span style={{ color: T.soft }}> · shipped {new Date(o.shippedAt).toLocaleDateString()}{o.shippedVia === 'easyship' ? ' via Easyship' : ''}</span>}
                      {o.shippedEmail && <div style={{ fontSize: 12, color: o.shippedEmail.ok ? T.soft : '#a13d2b', marginTop: 2 }}>{o.shippedEmail.ok ? 'Shipped email sent to customer.' : `Shipped email failed — ${o.shippedEmail.error}`}</div>}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select value={t.carrier} onChange={(e) => setT('carrier', e.target.value)} style={field}>
                      {['USPS', 'UPS', 'FedEx', 'DHL', 'Other'].map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <input placeholder="Tracking number" value={t.trackingNumber} onChange={(e) => setT('trackingNumber', e.target.value)} style={{ ...field, flex: '1 1 180px' }} />
                    <input placeholder="Tracking link (optional)" value={t.trackingUrl} onChange={(e) => setT('trackingUrl', e.target.value)} style={{ ...field, flex: '1 1 220px' }} />
                    <button type="button" disabled={Boolean(busy[o.id])} onClick={() => act(o, 'track', '/api/admin/orders/tracking', t)} style={S.btnFill}>
                      {busy[o.id] === 'track' ? 'Saving…' : o.trackingNumber ? 'Update' : 'Mark shipped'}
                    </button>
                  </div>
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {o.status !== 'refunded' && (
                    <button type="button" disabled={Boolean(busy[o.id])} style={{ ...S.btnOutline, color: '#a13d2b', borderColor: '#a13d2b' }}
                      onClick={() => act(o, 'refund', '/api/admin/orders/refund', {}, `Refund $${Number(o.amount || 0).toFixed(2)} to ${customerName(o) || o.email || 'this customer'}? This can't be undone.`)}>
                      {busy[o.id] === 'refund' ? 'Refunding…' : `Refund $${Number(o.amount || 0).toFixed(2)}`}
                    </button>
                  )}
                  {(!o.status || o.status === 'paid') && (
                    <button type="button" disabled={Boolean(busy[o.id])} style={S.btnOutline} onClick={() => act(o, 'status', '/api/admin/orders/status', { status: 'cancelled' }, 'Mark this order cancelled? (No money is refunded — use Refund for that.)')}>Cancel</button>
                  )}
                  {o.status !== 'archived' ? (
                    <button type="button" disabled={Boolean(busy[o.id])} style={S.btnOutline} onClick={() => act(o, 'status', '/api/admin/orders/status', { status: 'archived' })}>Archive</button>
                  ) : (
                    <button type="button" disabled={Boolean(busy[o.id])} style={S.btnOutline} onClick={() => act(o, 'status', '/api/admin/orders/status', { status: 'paid' })}>Restore</button>
                  )}
                  {m && <span style={{ fontSize: 13, color: m.ok ? '#1a7a3c' : '#a13d2b' }}>{m.text}</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </Section>
  );
}

const orderLabel = { fontSize: 12, color: T.soft, marginBottom: 4, fontWeight: 600 };

// Which checkout step a form field belongs to, by its label.
function checkoutStepFor(label) {
  const l = String(label || '').toLowerCase();
  if (!l) return null;
  if (l.includes('email')) return 'Contact';
  if (/card|expir|security|cvc|cvv/.test(l)) return 'Payment';
  if (l.includes('discount')) return 'Discount code';
  if (/name|address|apartment|city|state|zip|phone|country/.test(l)) return 'Delivery';
  return null;
}

// One-line outcome for a visitor: bought, where they left checkout, added
// to cart only, or just browsed — with "still here" for recent activity.
function visitorStatus(j) {
  if (!j) return { kind: 'browse', text: 'Browsed only' };
  if (j.purchased) return { kind: 'purchase', text: `Purchased${j.purchased.amount ? ` · $${Number(j.purchased.amount).toFixed(2)}` : ''}` };
  const active = j.lastSeen && Date.now() - j.lastSeen < 2 * 60 * 1000;
  if (j.checkoutAt) {
    const field = j.lastField && (j.lastField.path === '/checkout' || checkoutStepFor(j.lastField.label)) ? j.lastField.label : null;
    const step = checkoutStepFor(field);
    if (active) return { kind: 'checkout', text: `At checkout now${field ? ` · typing in “${field}”` : ''}` };
    return {
      kind: 'checkout',
      text: field
        ? `Abandoned checkout at ${step || 'checkout'} — last typed in “${field}”`
        : 'Abandoned checkout before typing anything',
    };
  }
  if (j.cart?.length) return { kind: 'cart', text: `${active ? 'Has items in cart' : 'Abandoned cart'} — added ${j.cart.join(', ')}` };
  return { kind: 'browse', text: active ? 'Browsing now' : 'Browsed only' };
}

const STATUS_COLORS = { purchase: '#1a7a3c', checkout: '#a13d2b', cart: '#9a6a12', browse: T.soft };
const STATUS_FILTERS = [['all', 'All'], ['cart', 'Added to cart'], ['checkout', 'Reached checkout'], ['purchase', 'Purchased']];

// Visitors tab: who came to the site, from where, and with which URL
// parameters (utm_*, fbclid, gclid, ad names…) on their first page.
// "New" or "3rd visit": how many days this device has visited, this one
// included (lib/analyticsStore.js countVisit). Nothing for visits logged
// before counting began.
function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}

function VisitTag({ n }) {
  if (!n) return null;
  const returning = n > 1;
  return (
    <span style={{
      marginLeft: 8, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, verticalAlign: 'middle',
      background: returning ? '#E3F1E4' : '#F1EEEA', color: returning ? '#1F6B2E' : '#6B625A',
    }}
    >
      {returning ? `${ordinal(n)} visit` : 'New'}
    </span>
  );
}

// Who the visitor is (once they've typed an email at checkout or in the
// cart) and a button that sends them the abandoned-checkout email now
// (pages/api/admin/abandoned-email-send.js).
function VisitorEmailAction({ contact, status }) {
  const [state, setState] = React.useState({ busy: false, sentAt: null, error: '' });
  if (!contact) {
    if (status.kind !== 'cart' && status.kind !== 'checkout') return null;
    return <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>No email captured — can’t send a reminder.</div>;
  }
  const sentAt = state.sentAt || contact.abandonedEmailSentAt;
  const blocked = !contact.email ? 'Phone only — no email to send to.'
    : contact.unsubscribed ? 'Unsubscribed from emails.'
      : !contact.cartCount ? 'No saved cart to remind them about.' : null;
  const send = async () => {
    const consentNote = contact.consent ? '' : '\n\nThey didn’t tick “Email me with news and offers”.';
    if (!window.confirm(`Send the abandoned checkout email to ${contact.email} now?${consentNote}`)) return;
    setState({ busy: true, sentAt: null, error: '' });
    try {
      const res = await fetch('/api/admin/abandoned-email-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: contact.key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send the email.');
      setState({ busy: false, sentAt: data.sentAt, error: '' });
    } catch (err) {
      setState({ busy: false, sentAt: null, error: err.message });
    }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
      <span style={{ fontSize: 13 }}>
        {contact.name ? `${contact.name} · ` : ''}{contact.email || contact.key.replace(/^phone:/, '')}
        {!contact.consent && contact.email && <span style={{ color: T.soft }}> · not opted in</span>}
      </span>
      {blocked ? (
        <span style={{ fontSize: 13, color: T.soft }}>{blocked}</span>
      ) : (
        <button type="button" onClick={send} disabled={state.busy} style={{ ...S.btnOutline, height: 32, padding: '0 12px', fontSize: 12, opacity: state.busy ? 0.6 : 1 }}>
          {state.busy ? 'Sending…' : sentAt ? 'Send again' : 'Send abandoned checkout email'}
        </button>
      )}
      {sentAt && <span style={{ fontSize: 12, color: '#1a7a3c' }}>Reminder sent {sinceIso(sentAt)}</span>}
      {state.error && <span style={{ fontSize: 12, color: '#a13d2b' }}>{state.error}</span>}
    </div>
  );
}

function VisitorsTab({ refreshKey }) {
  const [visitors, setVisitors] = React.useState(null);
  const [error, setError] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [onlyTagged, setOnlyTagged] = React.useState(false);
  const [onlyReturning, setOnlyReturning] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState('all');

  const load = React.useCallback(() => {
    setError('');
    fetch('/api/admin/visitors')
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || 'Could not load visitors.')))))
      .then((d) => setVisitors(d.visitors || []))
      .catch((err) => setError(err.message));
  }, []);
  React.useEffect(() => { load(); }, [load, refreshKey]);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (visitors || []).filter((v) => {
      const params = v.params || {};
      if (onlyTagged && Object.keys(params).length === 0) return false;
      if (onlyReturning && !(v.visitNumber > 1)) return false;
      const j = v.journey;
      if (statusFilter === 'purchase' && !j?.purchased) return false;
      if (statusFilter === 'checkout' && !j?.checkoutAt) return false;
      if (statusFilter === 'cart' && !j?.cart?.length) return false;
      if (!q) return true;
      const hay = [v.source, v.landing, v.referrer, v.city, v.country, v.device, ...Object.entries(params).map(([k, val]) => `${k}=${val}`)]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [visitors, query, onlyTagged, onlyReturning, statusFilter]);

  const statusCounts = React.useMemo(() => {
    const list = visitors || [];
    return {
      all: list.length,
      cart: list.filter((v) => v.journey?.cart?.length).length,
      checkout: list.filter((v) => v.journey?.checkoutAt).length,
      purchase: list.filter((v) => v.journey?.purchased).length,
    };
  }, [visitors]);

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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {STATUS_FILTERS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setStatusFilter(key)} style={{ ...chip, cursor: 'pointer', background: statusFilter === key ? T.ink : T.white, color: statusFilter === key ? T.white : T.ink }}>
              {label} · {statusCounts[key]}
            </button>
          ))}
        </div>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.soft }}>
            <input type="checkbox" checked={onlyReturning} onChange={(e) => setOnlyReturning(e.target.checked)} />
            Only returning visitors
          </label>
        </div>
        <div style={{ maxHeight: 640, overflowY: 'auto' }}>
          {rows.map((v) => {
            const params = Object.entries(v.params || {});
            const place = [v.city, v.region, v.country].filter(Boolean).join(', ');
            const j = v.journey;
            const status = visitorStatus(j);
            const scrolls = Object.entries(j?.scroll || {});
            return (
              <div key={`${v.sessionId}-${v.ts}`} style={visitorRow}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{v.source || 'Direct'}<VisitTag n={v.visitNumber} /></span>
                  <span style={{ color: T.soft, fontSize: 13 }}>
                    {new Date(v.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {place && ` · ${place}`}{v.device && ` · ${v.device}`}
                  </span>
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  <span style={{ color: T.soft }}>Landed on </span>{v.landing || '/'}
                  {v.referrer && <span style={{ color: T.soft }}> · from <span title={v.referrer}>{v.referrer.length > 70 ? `${v.referrer.slice(0, 70)}…` : v.referrer}</span></span>}
                </div>
                <div style={{ fontSize: 14, marginTop: 6, fontWeight: 600, color: STATUS_COLORS[status.kind] }}>{status.text}</div>
                <VisitorEmailAction contact={v.contact} status={status} />
                {j?.cartSteps?.length > 0 && (
                  <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
                    Cart trail: {j.cartSteps.join(' → ')}
                  </div>
                )}
                {scrolls.length > 0 && (
                  <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
                    Scrolled {scrolls.map(([path, pct]) => `${path} ${pct}%`).join(' · ')}
                  </div>
                )}
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
  const [check, setCheck] = React.useState(null);
  const [checking, setChecking] = React.useState(false);
  const runCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/admin/meta-check', { method: 'POST' });
      setCheck(await res.json());
    } catch (err) {
      setCheck({ verdict: `Could not run the check: ${err.message}` });
    } finally {
      setChecking(false);
    }
  };
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
      <button type="button" onClick={runCheck} disabled={checking} style={{ ...S.btnOutline, marginTop: 14, opacity: checking ? 0.6 : 1 }}>
        {checking ? 'Checking…' : 'Check Meta connection'}
      </button>
      {check && (
        <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7, borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: check.pixel && !check.pixel.error && !check.tokenOwner?.error ? '#1a7a3c' : '#a13d2b', marginBottom: 6 }}>{check.verdict}</div>
          {check.pixelId && <div>Pixel id in use: {check.pixelId}{check.pixelIdHadExtraCharacters ? ' (had extra spaces/quotes — now ignored)' : ''}</div>}
          {check.tokenPreview && <div>Access token: {check.tokenPreview}{check.tokenHadExtraCharacters ? ' (had extra spaces/quotes — now ignored)' : ''}</div>}
          {check.tokenOwner && <div>Token belongs to: {check.tokenOwner.error ? `— (${check.tokenOwner.error})` : `${check.tokenOwner.name || ''} (${check.tokenOwner.id})`}</div>}
          {check.pixel && <div>Pixel as Meta sees it: {check.pixel.error ? `not reachable — ${check.pixel.error}` : `${check.pixel.name || ''} (${check.pixel.id})${check.pixel.lastFired ? ` · last fired ${new Date(check.pixel.lastFired).toLocaleString()}` : ''}`}</div>}
        </div>
      )}
    </Section>
  );
}

// Panel above the Orders list: whether Easyship is set up, whether the
// tracking webhook is connected (with a button to connect it), how many
// orders still need sending (with a button to send them all), and what
// happened with the latest label webhook (tracking coming back).
function EasyshipStatus({ status, onSent }) {
  const [busy, setBusy] = React.useState('');
  const [message, setMessage] = React.useState('');
  const fmt = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const last = status.lastWebhook;
  let lastText = 'No labels bought yet.';
  if (last) {
    lastText = last.ok
      ? `Last label: ${last.carrier ? `${last.carrier} ` : ''}${last.trackingNumber} · ${fmt(last.at)}`
      : `Last webhook ${fmt(last.at)} didn't ship an order — ${last.error}`;
  }
  const post = async (kind, body) => {
    setBusy(kind);
    setMessage('');
    try {
      const res = await fetch('/api/admin/orders/easyship', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      return data;
    } catch (err) {
      setMessage(err.message);
      return null;
    } finally {
      setBusy('');
    }
  };
  const sendAll = async () => {
    const data = await post('send', { all: true });
    if (!data) return;
    const parts = [`Sent ${data.sent} order${data.sent === 1 ? '' : 's'} to Easyship.`];
    if (data.failed?.length) parts.push(`${data.failed.length} failed — ${data.failed[0].error}`);
    if (data.more) parts.push('More are waiting — click again.');
    setMessage(parts.join(' '));
    onSent();
  };
  const connect = async () => {
    const data = await post('connect', { action: 'connect-webhook' });
    if (!data) return;
    setMessage('Tracking connected — buying a label in Easyship will now mark the order shipped and email the customer.');
    onSent();
  };
  return (
    <div style={{ border: `1px solid ${T.line}`, padding: '12px 14px', margin: '0 0 16px', fontSize: 13, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 600, color: status.configured ? T.ink : '#a13d2b' }}>
        {status.configured ? 'Easyship connected' : 'Easyship is not set up'}
      </div>
      <div style={{ color: T.soft }}>
        {status.configured
          ? `New orders are created in Easyship automatically. ${status.webhook ? `Tracking comes back when you buy a label. ${lastText}` : 'Tracking isn’t connected yet — connect it so labels mark orders shipped.'}`
          : 'Add EASYSHIP_API_TOKEN (Easyship → Connect → API) to this site in Vercel, then redeploy.'}
      </div>
      {status.configured && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          {!status.webhook && (
            <button type="button" onClick={connect} disabled={Boolean(busy)} style={{ ...S.btnFill, height: 38, padding: '0 16px', fontSize: 13, opacity: busy ? 0.6 : 1 }}>
              {busy === 'connect' ? 'Connecting…' : 'Connect tracking'}
            </button>
          )}
          {status.unsent > 0 ? (
            <button type="button" onClick={sendAll} disabled={Boolean(busy)} style={{ ...(status.webhook ? S.btnFill : S.btnOutline), height: 38, padding: '0 16px', fontSize: 13, opacity: busy ? 0.6 : 1 }}>
              {busy === 'send' ? 'Sending…' : `Send ${status.unsent} unsent order${status.unsent === 1 ? '' : 's'} to Easyship`}
            </button>
          ) : (
            <span style={{ color: T.soft }}>Every order that needs shipping is in Easyship.</span>
          )}
          {message && <span>{message}</span>}
        </div>
      )}
      {status.configured && status.noAddress > 0 && (
        <div style={{ color: T.soft, marginTop: 6 }}>
          {status.noAddress} paid order{status.noAddress === 1 ? ' has' : 's have'} no shipping address saved here, so {status.noAddress === 1 ? 'it' : 'they'} can’t be sent to Easyship from this page.
        </div>
      )}
      {status.configured && status.autobuy && <AutobuyLabels status={status} onChange={onSent} />}
    </div>
  );
}

// Daily label auto-buy (lib/easyshipLabels.js): on/off, "Buy 1 now" to try a
// single label first, and the latest purchases / skips with their cost.
function AutobuyLabels({ status, onChange }) {
  const [busy, setBusy] = React.useState('');
  const [message, setMessage] = React.useState('');
  const { autobuy } = status;
  const post = async (kind, body) => {
    setBusy(kind);
    setMessage('');
    try {
      const res = await fetch('/api/admin/orders/easyship', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      return data;
    } catch (err) {
      setMessage(err.message);
      return null;
    } finally {
      setBusy('');
    }
  };
  const toggle = async () => {
    if (!autobuy.enabled && !confirm(`Turn on auto-buy? Every morning Easyship labels are bought for the ${autobuy.dailyLimit} oldest orders in the queue, each only if it costs $${autobuy.capUsd.toFixed(2)} or less. Your Easyship account is charged for each label.`)) return;
    if (await post('toggle', { action: 'autobuy', enabled: !autobuy.enabled })) onChange();
  };
  const buyOne = async () => {
    if (!confirm(`Buy the label for the oldest order in the queue now (only if it's $${autobuy.capUsd.toFixed(2)} or less)? Your Easyship account is charged.`)) return;
    const data = await post('buy', { action: 'buy-one' });
    if (!data) return;
    if (data.bought?.length) setMessage(`Bought a label for order ${data.bought[0].id} — $${Number(data.bought[0].cost).toFixed(2)}${data.bought[0].courier ? ` (${data.bought[0].courier})` : ''}.`);
    else if (data.failed) setMessage(`Not bought — ${data.failed}`);
    else if (data.skipped?.length) setMessage(`Skipped ${data.skipped.length} — ${data.skipped[0].reason}`);
    else setMessage('No orders waiting for a label.');
    onChange();
  };
  const fmt = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 12, paddingTop: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>Auto-buy labels: {autobuy.enabled ? 'On' : 'Off'}</span>
        <button type="button" onClick={toggle} disabled={Boolean(busy)} style={{ ...(autobuy.enabled ? S.btnOutline : S.btnFill), height: 34, padding: '0 14px', fontSize: 12, opacity: busy ? 0.6 : 1 }}>
          {busy === 'toggle' ? 'Saving…' : autobuy.enabled ? 'Turn off' : 'Turn on'}
        </button>
        <button type="button" onClick={buyOne} disabled={Boolean(busy) || !status.labelQueue} style={{ ...S.btnOutline, height: 34, padding: '0 14px', fontSize: 12, opacity: busy || !status.labelQueue ? 0.5 : 1 }}>
          {busy === 'buy' ? 'Buying…' : 'Buy 1 now'}
        </button>
        {message && <span>{message}</span>}
      </div>
      <div style={{ color: T.soft, marginTop: 4 }}>
        Every morning (7 am Pacific): the {autobuy.dailyLimit} oldest orders in Easyship without a label, using the service your Easyship account selects, each only if it's ${autobuy.capUsd.toFixed(2)} or less — anything over is skipped for you to buy by hand.
        {' '}{status.labelQueue} waiting · {status.boughtToday} of {autobuy.dailyLimit} bought automatically today.
      </div>
      {status.labelLog?.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7 }}>
          {status.labelLog.map((e, i) => (
            <div key={i} style={{ color: e.outcome === 'bought' ? T.ink : e.outcome === 'failed' ? '#a13d2b' : T.soft }}>
              {fmt(e.at)} · order {e.orderId} · {e.outcome === 'bought' ? `bought $${Number(e.price).toFixed(2)}${e.courier ? ` ${e.courier}` : ''}` : e.outcome === 'skipped' ? `skipped — ${e.reason}` : `failed — ${e.error}`}{e.trigger === 'manual' ? ' (Buy 1 now)' : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <div style={{ background: T.white, border: `1px solid ${T.line}`, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 19, fontWeight: 500, color: T.ink }}>{title}</p>
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
const rangeSelect = {
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
