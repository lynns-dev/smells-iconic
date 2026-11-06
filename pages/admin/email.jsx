import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { T, S } from '../../lib/adminTheme';
import Link from 'next/link';
import { renderEmailHtml, EMAIL_FONTS } from '../../lib/email/emailBlocks';
import { BRAND } from '../../lib/email/brand';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'settings', label: 'Settings' },
  { id: 'subscribers', label: 'Subscribers' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'automations', label: 'Automations' },
];
const FLOW_DESCRIPTIONS = {
  welcome_series: 'Fires when someone signs up or ticks the email box at checkout — step 1 goes out within 15 minutes, later steps on schedule. People already on the list when this launched are skipped.',
  sunset_winback: 'Fires when a subscriber goes quiet — win-back attempt, then auto-suppress if still inactive.',
  add_to_cart: 'For a cart that never reached checkout: someone who gave their email in the cart drawer, or a shopper the site already knows (on this device). Times off their last cart change; anyone who reaches checkout gets the abandoned-checkout email instead.',
  order_received: 'Fires on every completed order — a marketing thank-you and later review nudge, not a receipt.',
};

export default function EmailAdmin() {
  const router = useRouter();
  const [subscribers, setSubscribers] = React.useState([]);
  const [gradeSummary, setGradeSummary] = React.useState(null);
  const [campaigns, setCampaigns] = React.useState([]);
  const [automations, setAutomations] = React.useState([]);
  const [sendingReady, setSendingReady] = React.useState(null);
  const [campaignForm, setCampaignForm] = React.useState({ subject: '', fromName: '', segment: 'all', contentHtml: '' });
  const [campaignFormMessage, setCampaignFormMessage] = React.useState('');
  const [sendingCampaignId, setSendingCampaignId] = React.useState(null);
  const [templates, setTemplates] = React.useState([]);
  const [templateName, setTemplateName] = React.useState('');
  const [templateMessage, setTemplateMessage] = React.useState('');
  const [settings, setSettings] = React.useState(null);
  const [settingsForm, setSettingsForm] = React.useState(null);
  const [settingsMessage, setSettingsMessage] = React.useState('');
  const [domainInput, setDomainInput] = React.useState('');
  const [domainIdentity, setDomainIdentity] = React.useState(null);
  const [domainIdentityLoading, setDomainIdentityLoading] = React.useState(false);
  const [scheduleAt, setScheduleAt] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('overview');
  const [automationMessage, setAutomationMessage] = React.useState({});
  const [syncingDesign, setSyncingDesign] = React.useState(false);
  const [syncDesignMessage, setSyncDesignMessage] = React.useState('');
  const [previewOpen, setPreviewOpen] = React.useState({});
  const [activeAutomationId, setActiveAutomationId] = React.useState(null);
  const [stepSending, setStepSending] = React.useState(null);
  const [stepMessage, setStepMessage] = React.useState({});
  const [testEmail, setTestEmail] = React.useState('');
  const [testSending, setTestSending] = React.useState(null);
  const [testMessage, setTestMessage] = React.useState({});
  const [subscriberSearch, setSubscriberSearch] = React.useState('');
  const [subscriberSort, setSubscriberSort] = React.useState('date-desc');
  const [subscriberFilter, setSubscriberFilter] = React.useState('all');
  const [abandonStep, setAbandonStep] = React.useState({});
  const [newSubscriberEmail, setNewSubscriberEmail] = React.useState('');
  const [addingSubscriber, setAddingSubscriber] = React.useState(false);
  const [addSubscriberMessage, setAddSubscriberMessage] = React.useState('');
  const [emailAnalytics, setEmailAnalytics] = React.useState({ campaigns: {}, automations: {}, aggregate: null });

  // New subscribers over the last 7 / 30 days, by where they came from —
  // the quickest way to see the popup, checkout and orders feeding the list.
  const growth = React.useMemo(() => {
    const now = Date.now();
    const windows = { week: 7, month: 30 };
    const out = {};
    for (const [key, days] of Object.entries(windows)) {
      const since = now - days * 24 * 60 * 60 * 1000;
      const added = subscribers.filter((s) => (s.createdAt || 0) >= since);
      const bySource = {};
      for (const s of added) bySource[s.source || 'unknown'] = (bySource[s.source || 'unknown'] || 0) + 1;
      out[key] = { total: added.length, bySource: Object.entries(bySource).sort((a, b) => b[1] - a[1]) };
    }
    const newest = subscribers.reduce((max, s) => Math.max(max, s.createdAt || 0), 0);
    return { ...out, newest };
  }, [subscribers]);

  const analytics = React.useMemo(() => {
    const totals = campaigns.reduce(
      (acc, c) => {
        acc.sent += c.stats.sent || 0;
        acc.delivered += c.stats.delivered || 0;
        acc.bounced += c.stats.bounced || 0;
        acc.complained += c.stats.complained || 0;
        acc.clicked += c.stats.clicked || 0;
        return acc;
      },
      { sent: 0, delivered: 0, bounced: 0, complained: 0, clicked: 0 }
    );
    const rate = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
    return {
      subscribed: subscribers.filter((s) => s.status === 'subscribed').length,
      totalSent: totals.sent,
      clickRate: rate(totals.clicked, totals.sent),
      bounceRate: rate(totals.bounced, totals.sent),
      complaintRate: rate(totals.complained, totals.sent),
    };
  }, [subscribers, campaigns]);

  const visibleSubscribers = React.useMemo(() => {
    const query = subscriberSearch.trim().toLowerCase();
    const filtered = subscribers.filter((s) => (
      (!query || s.email.toLowerCase().includes(query))
      && (subscriberFilter !== 'abandoned' || s.checkoutStartedAt || s.openCheckout)
    ));
    const direction = subscriberSort === 'date-asc' ? 1 : -1;
    return [...filtered].sort((a, b) => direction * ((a.createdAt || 0) - (b.createdAt || 0)));
  }, [subscribers, subscriberSearch, subscriberSort, subscriberFilter]);
  const abandonedCount = React.useMemo(() => subscribers.filter((s) => s.checkoutStartedAt || s.openCheckout).length, [subscribers]);
  const abandonedFlow = automations.find((a) => a.id === 'abandoned_checkout');

  const loadSubscribers = React.useCallback(() => {
    fetch('/api/admin/email/subscribers')
      .then((r) => r.json())
      .then((data) => {
        setSubscribers(data.subscribers || []);
        setGradeSummary(data.gradeSummary || null);
      })
      .catch(() => {});
  }, []);

  const loadCampaigns = React.useCallback(() => {
    fetch('/api/admin/email/campaigns').then((r) => r.json()).then((data) => setCampaigns(data.campaigns || [])).catch(() => {});
  }, []);

  const loadEmailAnalytics = React.useCallback(() => {
    fetch('/api/admin/email/analytics')
      .then((r) => r.json())
      .then((data) => setEmailAnalytics({ campaigns: data.campaigns || {}, automations: data.automations || {}, aggregate: data.aggregate || null }))
      .catch(() => {});
  }, []);

  const loadAutomations = React.useCallback(() => {
    fetch('/api/admin/email/automations').then((r) => r.json()).then((data) => {
      setAutomations(data.automations || []);
      setSendingReady(data.sendingReady || null);
    }).catch(() => {});
  }, []);

  const loadTemplates = React.useCallback(() => {
    fetch('/api/admin/email/templates').then((r) => r.json()).then((data) => setTemplates(data.templates || [])).catch(() => {});
  }, []);

  const loadSettings = React.useCallback(() => {
    fetch('/api/admin/email/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings || null);
        setSettingsForm(data.settings || null);
      })
      .catch(() => {});
  }, []);

  const loadDomainIdentity = React.useCallback(() => {
    setDomainIdentityLoading(true);
    fetch('/api/admin/email/resend-identity')
      .then((r) => r.json())
      .then(setDomainIdentity)
      .catch(() => {})
      .finally(() => setDomainIdentityLoading(false));
  }, []);

  React.useEffect(() => {
    loadSubscribers();
    loadCampaigns();
    loadEmailAnalytics();
    loadAutomations();
    loadTemplates();
    loadSettings();
    loadDomainIdentity();
  }, [loadSubscribers, loadCampaigns, loadEmailAnalytics, loadAutomations, loadTemplates, loadSettings, loadDomainIdentity]);

  const handleSuppressSubscriber = async (email) => {
    if (!confirm(`Suppress ${email}? They will never receive an email again.`)) return;
    const res = await fetch('/api/admin/email/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action: 'suppress' }),
    });
    if (res.ok) loadSubscribers();
  };

  const handleAddSubscriber = async (e) => {
    e.preventDefault();
    setAddSubscriberMessage('');
    setAddingSubscriber(true);
    try {
      const res = await fetch('/api/admin/email/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newSubscriberEmail.trim(), action: 'add' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddSubscriberMessage(data.error || 'Failed to add subscriber.');
        return;
      }
      setNewSubscriberEmail('');
      setAddSubscriberMessage(`Added ${data.subscriber.email}.`);
      loadSubscribers();
    } finally {
      setAddingSubscriber(false);
    }
  };

  // Manual "send now" for one subscriber's next due step in a given flow
  // — used for both "Send welcome email" and "Send abandoned-cart email"
  // (the latter exists because the cron cadence needed for a 30-minute
  // delay isn't always practical to run, so this is the fallback for
  // sending it right now instead of waiting for the cron to catch it).
  // Keyed by `${email}:${flowId}` so a subscriber can have independent
  // sending/message state per flow.
  // stepIndex is optional — omitted, the subscriber's next due step goes
  // out; given, that exact step does (the abandoned-checkout picker).
  const handleSendAutomationStep = async (email, flowId, stepIndex) => {
    const key = `${email}:${flowId}`;
    setStepSending(key);
    setStepMessage((prev) => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch('/api/admin/email/send-automation-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, flowId, stepIndex }),
      });
      const data = await res.json();
      setStepMessage((prev) => ({ ...prev, [key]: res.ok ? `Sent: "${data.subject}"` : data.error || 'Failed to send.' }));
      if (res.ok) loadSubscribers();
    } finally {
      setStepSending(null);
    }
  };

  // This store's abandoned-checkout email (lib/abandonedCheckout.js) for one
  // subscriber, right now, with the cart they left (/api/admin/abandoned-email-send).
  const handleSendStoreAbandoned = async (s) => {
    const key = `${s.email}:store_abandoned`;
    setStepSending(key);
    setStepMessage((prev) => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch('/api/admin/abandoned-email-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: s.openCheckout?.key }),
      });
      const data = await res.json();
      setStepMessage((prev) => ({ ...prev, [key]: res.ok ? 'Sent: "You left something behind"' : data.error || 'Failed to send.' }));
      if (res.ok) loadSubscribers();
    } finally {
      setStepSending(null);
    }
  };

  // Test send for arbitrary composer/step content — separate from
  // handleSendAutomationStep and handleSendCampaign, neither of which
  // fit here (both require an existing subscriber and mutate real
  // stats/state). Shared across the campaign composer and every
  // automation step card, keyed so each has its own sending/message
  // state; testEmail itself is shared so it only needs typing once.
  const handleSendTest = async (key, subject, contentHtml) => {
    if (!testEmail.trim()) {
      setTestMessage((prev) => ({ ...prev, [key]: 'Enter a test email address first.' }));
      return;
    }
    setTestSending(key);
    setTestMessage((prev) => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch('/api/admin/email/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail.trim(), subject, contentHtml }),
      });
      const data = await res.json();
      setTestMessage((prev) => ({ ...prev, [key]: res.ok ? `Sent to ${testEmail.trim()}` : data.error || 'Failed to send.' }));
    } finally {
      setTestSending(null);
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    setCampaignFormMessage('');
    const res = await fetch('/api/admin/email/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campaignForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setCampaignFormMessage(data.error || 'Failed to create campaign.');
      return;
    }
    setCampaigns((prev) => [...prev, data.campaign]);
    setCampaignForm({ subject: '', fromName: '', segment: 'all', contentHtml: '' });
    setCampaignFormMessage('Draft saved.');
  };

  const handleSaveTemplate = async () => {
    setTemplateMessage('');
    const res = await fetch('/api/admin/email/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateName, contentHtml: campaignForm.contentHtml }),
    });
    const data = await res.json();
    if (!res.ok) {
      setTemplateMessage(data.error || 'Failed to save template.');
      return;
    }
    setTemplates((prev) => [...prev, data.template]);
    setTemplateName('');
    setTemplateMessage('Template saved.');
  };

  const handleUseTemplate = (templateId) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    // A copy, not a live link back to the template — editing this
    // campaign never mutates the saved template, same as starting a
    // campaign from any ESP's template library.
    setCampaignForm((prev) => ({ ...prev, contentHtml: template.contentHtml }));
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Delete this template?')) return;
    const res = await fetch('/api/admin/email/templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (res.ok) setTemplates(data.templates);
  };

  const handleDeleteCampaign = async (id) => {
    if (!confirm('Delete this draft?')) return;
    const res = await fetch('/api/admin/email/campaigns', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (res.ok) setCampaigns(data.campaigns);
  };

  const handleSendCampaign = async (id) => {
    if (!confirm('Send this campaign now? This cannot be undone.')) return;
    setSendingCampaignId(id);
    try {
      const res = await fetch('/api/admin/email/send-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to send campaign.');
        return;
      }
      loadCampaigns();
    } finally {
      setSendingCampaignId(null);
    }
  };

  const handleToggleAutomation = async (automation) => {
    const res = await fetch('/api/admin/email/automations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: automation.id, enabled: !automation.enabled }),
    });
    const data = await res.json();
    if (res.ok) setAutomations((prev) => prev.map((a) => (a.id === automation.id ? data.automation : a)));
  };

  // Edits are applied to local state immediately (so the textarea and
  // preview feel live) and only PUT to the server when "Save changes" is
  // clicked — same pattern as the campaign composer, just addressed by
  // automationId + stepIndex instead of a single draft.
  const updateAutomationStep = (automationId, stepIndex, patch) => {
    setAutomations((prev) =>
      prev.map((a) => {
        if (a.id !== automationId) return a;
        const steps = a.steps.map((s, i) => (i === stepIndex ? { ...s, ...patch } : s));
        return { ...a, steps };
      })
    );
  };

  const handleSaveAutomationSteps = async (automation) => {
    const res = await fetch('/api/admin/email/automations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: automation.id, steps: automation.steps }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to save.');
      return;
    }
    setAutomations((prev) => prev.map((a) => (a.id === automation.id ? data.automation : a)));
    setAutomationMessage((prev) => ({ ...prev, [automation.id]: 'Saved.' }));
  };

  const togglePreview = (key) => {
    setPreviewOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Pushes the current code-level automation content (lib/automationsStore.js's
  // SEED_AUTOMATIONS) into the live store, overwriting every step's
  // subject/html — getAutomations() only ever seeds an empty store, so a
  // design update never reaches an already-provisioned account without this.
  const handleSyncAutomationDesign = async () => {
    if (!window.confirm('This overwrites the subject, HTML, and send timing of every automation step with the latest built-in design. Any manual edits you made to step content or timing will be lost (enabled state and stats are kept). Continue?')) {
      return;
    }
    setSyncingDesign(true);
    setSyncDesignMessage('');
    try {
      const res = await fetch('/api/admin/email/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-design' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncDesignMessage(data.error || 'Sync failed.');
        return;
      }
      setAutomations(data.automations || []);
      setSyncDesignMessage('Design synced.');
    } catch (err) {
      setSyncDesignMessage(err.message || 'Sync failed.');
    } finally {
      setSyncingDesign(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsMessage('');
    const res = await fetch('/api/admin/email/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setSettingsMessage(data.error || 'Failed to save settings.');
      return;
    }
    setSettings(data.settings);
    setSettingsMessage('Saved.');
  };

  const handleVerifyDomain = async () => {
    if (!domainInput.trim()) return;
    setDomainIdentityLoading(true);
    try {
      const res = await fetch('/api/admin/email/resend-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to start verification.');
        return;
      }
      setDomainIdentity(data);
      setDomainInput('');
    } finally {
      setDomainIdentityLoading(false);
    }
  };

  const handleScheduleCampaign = async (id) => {
    if (!scheduleAt) {
      alert('Pick a date and time first.');
      return;
    }
    const timestamp = new Date(scheduleAt).getTime();
    if (!confirm(`Schedule this campaign for ${new Date(timestamp).toLocaleString()}?`)) return;
    const res = await fetch('/api/admin/email/schedule-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, scheduledAt: timestamp }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to schedule campaign.');
      return;
    }
    setScheduleAt('');
    loadCampaigns();
  };

  return (
    <div style={{ minHeight: '100vh', background: T.paper }}>
      <Head>
        <title>{`Email — ${BRAND.name} admin`}</title>
      </Head>
      <style jsx global>{`
        .admin-shell { display: flex; flex-direction: column; max-width: 1200px; margin: 0 auto; }
        @media (min-width: 768px) {
          .admin-shell { flex-direction: row; align-items: flex-start; }
        }
        .admin-sidebar { padding: 16px; border-bottom: 1px solid ${T.line}; box-sizing: border-box; background: rgba(255,255,255,0.72); }
        @media (min-width: 768px) {
          .admin-sidebar {
            width: 228px; flex-shrink: 0; padding: 18px 10px; margin: 24px 0 0 24px;
            border-bottom: none; border-radius: 18px; box-shadow: ${T.shadow};
            -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
            position: sticky; top: 24px; max-height: calc(100vh - 48px); overflow-y: auto;
          }
        }
        .admin-main { flex: 1; min-width: 0; padding: 20px 16px 60px; box-sizing: border-box; }
        @media (min-width: 768px) {
          .admin-main { padding: 32px 24px 80px; }
        }
        .admin-section { padding: 16px; }
        @media (min-width: 768px) {
          .admin-section { padding: 24px; }
        }
        .pill-nav { display: flex; gap: 6px; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; min-width: 0; }
        .pill-nav button { flex-shrink: 0; white-space: nowrap; display: inline-block; }
        @media (min-width: 768px) {
          .pill-nav { display: block; overflow-x: visible; padding-bottom: 0; }
          .pill-nav button { display: block; width: 100%; white-space: normal; }
        }
        .flow-layout { flex-direction: column; align-items: stretch; }
        @media (min-width: 768px) {
          .flow-layout { flex-direction: row; align-items: flex-start; }
        }
        .flow-nav { margin-bottom: 16px; }
        @media (min-width: 768px) {
          .flow-nav { width: 180px; flex-shrink: 0; margin-bottom: 0; }
        }
        .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .col-html, .col-preview { flex: 1 1 100%; min-width: 0; }
        @media (min-width: 700px) {
          .col-html { flex: 1 1 320px; min-width: 320px; }
          .col-preview { flex: 1 1 280px; min-width: 280px; }
        }
      `}</style>

      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div>
              <Link href="/admin" style={{ fontSize: 13, color: T.accent, textDecoration: 'none' }}>&lsaquo; Store admin</Link>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 4 }}>{BRAND.name} email</div>
            </div>
            <button onClick={handleLogout} style={{ ...S.btnOutline, height: 30, padding: '0 12px', fontSize: 13 }}>Sign out</button>
          </div>
          <nav className="pill-nav">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{ ...sidebarLink, ...(activeTab === tab.id ? sidebarLinkActive : {}) }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="admin-main">
        {activeTab === 'overview' && (
        <>
        <Section title="Analytics">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={gradeTile}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.subscribed}</div>
              <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Subscribers</div>
            </div>
            <div style={gradeTile}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{emailAnalytics.aggregate?.sent ?? analytics.totalSent}</div>
              <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Emails sent (all-time, campaigns + automations + abandoned checkout)</div>
            </div>
            <div style={gradeTile}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{emailAnalytics.aggregate?.clickRate ?? analytics.clickRate}%</div>
              <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Click rate</div>
            </div>
            <div style={gradeTile}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{emailAnalytics.aggregate?.conversionRate ?? '—'}{emailAnalytics.aggregate ? '%' : ''}</div>
              <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Conversion rate (clicked → ordered within 7d)</div>
            </div>
            <div style={gradeTile}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.bounceRate}%</div>
              <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Bounce rate</div>
            </div>
            <div style={gradeTile}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.complaintRate}%</div>
              <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Complaint rate</div>
            </div>
          </div>
        </Section>

        <Section title="New subscribers">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[['week', 'Last 7 days'], ['month', 'Last 30 days']].map(([key, label]) => (
              <div key={key} style={{ ...gradeTile, minWidth: 200 }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{growth[key].total}</div>
                <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>{label}</div>
                {growth[key].bySource.length > 0 && (
                  <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
                    {growth[key].bySource.map(([source, n]) => <div key={source}>{source}: {n}</div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: T.soft, margin: '12px 0 0' }}>
            Most recent signup: {growth.newest ? new Date(growth.newest).toLocaleString() : 'none yet'}. Sources: newsletter (site form), checkout (email typed at checkout with the email box ticked), order (completed purchase), lead (cart drawer email form).
          </p>
        </Section>

        {gradeSummary && gradeSummary.total > 0 && (
          <Section title="List health">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {['A', 'B', 'C', 'D', 'F'].map((grade) => (
                <div key={grade} style={gradeTile}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{gradeSummary.counts[grade]}</div>
                  <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Grade {grade} · {gradeSummary.percentages[grade]}%</div>
                </div>
              ))}
            </div>
          </Section>
        )}
        </>
        )}

        {activeTab === 'settings' && (
        <>
        <Section title="Deliverability checklist">
          <div>
            <ChecklistRow ok={domainIdentity?.verified} label="Sending domain verified (DKIM + SPF)" busy={domainIdentityLoading} />
            <ChecklistRow ok={domainIdentity?.envConfigured?.webhookSecret} label="Bounce/complaint webhook configured" busy={domainIdentityLoading} />
            <ChecklistRow ok={Boolean(settings?.physicalAddress)} label="Physical address set (required for the legal footer)" busy={!settings} />
            <ChecklistRow ok label="One-click unsubscribe headers (built in)" />
          </div>
        </Section>

        <Section title="Settings">
          {settingsForm && (
            <form onSubmit={handleSaveSettings}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={formLabel}>Sender email</label>
                  <input value={settingsForm.senderEmail} onChange={(e) => setSettingsForm({ ...settingsForm, senderEmail: e.target.value })} style={formInput} placeholder="hello@yourdomain.com" />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={formLabel}>Sender name</label>
                  <input value={settingsForm.senderName} onChange={(e) => setSettingsForm({ ...settingsForm, senderName: e.target.value })} style={formInput} placeholder="Your store name" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={formLabel}>Company name</label>
                  <input value={settingsForm.companyName} onChange={(e) => setSettingsForm({ ...settingsForm, companyName: e.target.value })} style={formInput} />
                </div>
                <div style={{ flex: 2, minWidth: 260 }}>
                  <label style={formLabel}>Physical address (CAN-SPAM requires this in every send)</label>
                  <input value={settingsForm.physicalAddress} onChange={(e) => setSettingsForm({ ...settingsForm, physicalAddress: e.target.value })} style={formInput} placeholder="123 Main St, City, ST 00000" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={formLabel}>Logo URL (shown at the top of every campaign)</label>
                  <input value={settingsForm.logoUrl} onChange={(e) => setSettingsForm({ ...settingsForm, logoUrl: e.target.value })} style={formInput} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={formLabel}>Email font</label>
                  <select value={settingsForm.emailFont} onChange={(e) => setSettingsForm({ ...settingsForm, emailFont: e.target.value })} style={formInput}>
                    {EMAIL_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" style={S.btnFill}>Save settings</button>
              {settingsMessage && <span style={{ fontSize: 12, color: T.ink, marginLeft: 12 }}>{settingsMessage}</span>}
            </form>
          )}

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.line}` }}>
            <label style={formLabel}>Verify a sending domain</label>
            {domainIdentity?.domain ? (
              <div style={{ fontSize: 13 }}>
                <p><strong>{domainIdentity.domain}</strong> — {domainIdentity.verified ? 'Verified ✓' : `Pending (${domainIdentity.status || 'not started'})`}</p>
                {!domainIdentity.verified && domainIdentity.records?.length > 0 && (
                  <>
                    <p style={{ color: T.soft, marginTop: 8 }}>Add these records at your DNS provider:</p>
                    <ul style={{ marginTop: 6, paddingLeft: 20, color: T.soft }}>
                      {domainIdentity.records.map((r, i) => (
                        <li key={i} style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 4 }}>
                          {r.type} {r.name} → {r.value} {r.status && `(${r.status})`}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <button type="button" onClick={loadDomainIdentity} disabled={domainIdentityLoading} style={{ ...S.btnOutline, marginTop: 12 }}>
                  {domainIdentityLoading ? 'Checking…' : 'Check status'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input placeholder="mail.yourdomain.com" value={domainInput} onChange={(e) => setDomainInput(e.target.value)} style={{ ...formInput, flex: '1 1 200px', width: 'auto' }} />
                <button type="button" onClick={handleVerifyDomain} disabled={domainIdentityLoading} style={S.btnFill}>
                  {domainIdentityLoading ? 'Starting…' : 'Start verification'}
                </button>
              </div>
            )}
          </div>
        </Section>
        </>
        )}


        {activeTab === 'subscribers' && (
        <>
        <SmsSubscribers />
        <Section
          title={`Subscribers (${visibleSubscribers.length}${visibleSubscribers.length !== subscribers.length ? ` of ${subscribers.length}` : ''})`}
          action={<a href="/api/admin/email/subscribers?format=csv" style={S.btnOutline}>Export CSV</a>}
        >
          <form onSubmit={handleAddSubscriber} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <input
              type="email"
              placeholder="Add subscriber by email…"
              value={newSubscriberEmail}
              onChange={(e) => setNewSubscriberEmail(e.target.value)}
              style={{ ...formInput, width: 260, maxWidth: '100%' }}
              required
            />
            <button type="submit" disabled={addingSubscriber} style={S.btnFill}>
              {addingSubscriber ? 'Adding…' : 'Add subscriber'}
            </button>
            {addSubscriberMessage && <span style={{ fontSize: 12, color: T.ink }}>{addSubscriberMessage}</span>}
          </form>
          <p style={{ fontSize: 12, color: T.soft, marginTop: 0, marginBottom: 20 }}>
            Skips double opt-in and marks them subscribed immediately — only add someone here if you already have a lawful basis to email them.
          </p>

          {subscribers.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No subscribers yet.</p>
          ) : (
            <div>
              <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  placeholder="Search by email…"
                  value={subscriberSearch}
                  onChange={(e) => setSubscriberSearch(e.target.value)}
                  style={{ ...formInput, width: 260, maxWidth: '100%' }}
                />
                {[['all', `All (${subscribers.length})`], ['abandoned', `Abandoned checkout (${abandonedCount})`]].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSubscriberFilter(id)}
                    style={{ ...filterChip, ...(subscriberFilter === id ? filterChipActive : {}) }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="table-scroll">
              <div style={{ minWidth: 760 }}>
              <div style={headRow}>
                <div style={{ flex: 2 }}>Email</div>
                <div style={{ flex: 1 }}>Status</div>
                <div style={{ flex: 1 }}>Tier</div>
                <div style={{ width: 60 }}>Grade</div>
                <div style={{ flex: 1 }}>
                  <button
                    type="button"
                    onClick={() => setSubscriberSort((prev) => (prev === 'date-desc' ? 'date-asc' : 'date-desc'))}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}
                  >
                    Joined {subscriberSort === 'date-desc' ? '↓' : '↑'}
                  </button>
                </div>
                <div style={{ width: 280 }} />
              </div>
              {visibleSubscribers.length === 0 ? (
                <p style={{ color: T.soft, fontSize: 13, padding: '16px 0' }}>
                  {subscriberSearch ? `No subscribers match "${subscriberSearch}".` : 'No subscribers with an abandoned checkout.'}
                </p>
              ) : (
              visibleSubscribers.map((s) => (
                <React.Fragment key={s.email}>
                <div style={{ ...row, borderBottom: 'none' }}>
                  <div style={{ flex: 2 }}>{s.email}</div>
                  <div style={{ flex: 1 }}>{s.status}</div>
                  <div style={{ flex: 1 }}>{s.tier}</div>
                  <div style={{ width: 60 }}>{s.grade || '—'}</div>
                  <div style={{ flex: 1 }}>{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}</div>
                  <div style={{ width: 280, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {s.status === 'subscribed' && (
                      <>
                        {stepMessage[`${s.email}:welcome_series`] && <span style={{ fontSize: 11, color: T.soft }}>{stepMessage[`${s.email}:welcome_series`]}</span>}
                        <button
                          onClick={() => handleSendAutomationStep(s.email, 'welcome_series')}
                          disabled={stepSending === `${s.email}:welcome_series`}
                          style={S.btnOutline}
                        >
                          {stepSending === `${s.email}:welcome_series` ? 'Sending…' : 'Send welcome email'}
                        </button>
                      </>
                    )}
                    {s.status !== 'suppressed' && (
                      <button onClick={() => handleSuppressSubscriber(s.email)} style={deleteBtn}>Suppress</button>
                    )}
                  </div>
                </div>
                <EmailHistoryRow
                  subscriber={s}
                  onSendAbandoned={() => handleSendStoreAbandoned(s)}
                  sending={stepSending === `${s.email}:store_abandoned`}
                  message={stepMessage[`${s.email}:store_abandoned`]}
                />
                {s.checkoutStartedAt && (
                  <AbandonedCheckoutPanel
                    subscriber={s}
                    flow={abandonedFlow}
                    selectedStep={abandonStep[s.email]}
                    onSelectStep={(i) => setAbandonStep((prev) => ({ ...prev, [s.email]: i }))}
                    onSend={(i) => handleSendAutomationStep(s.email, 'abandoned_checkout', i)}
                    sending={stepSending === `${s.email}:abandoned_checkout`}
                    message={stepMessage[`${s.email}:abandoned_checkout`]}
                  />
                )}
                </React.Fragment>
              ))
              )}
              </div>
              </div>
            </div>
          )}
        </Section>
        </>
        )}

        {activeTab === 'campaigns' && (
        <>
        <Section title={`Templates (${templates.length})`}>
          {templates.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No saved templates yet — build a campaign below, then "Save as template" to reuse it later.</p>
          ) : (
            templates.map((t) => (
              <div key={t.id} style={listRow}>
                <div style={{ flex: 1, fontSize: 14 }}>{t.name}</div>
                <button onClick={() => handleDeleteTemplate(t.id)} style={deleteBtn}>Delete</button>
              </div>
            ))
          )}
        </Section>

        <Section title={`Campaigns (${campaigns.length})`}>
          {campaigns.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              {[...campaigns].sort((a, b) => (b.sentAt || b.scheduledAt || b.createdAt || 0) - (a.sentAt || a.scheduledAt || a.createdAt || 0)).map((c) => {
                const clickRate = c.stats.sent ? Math.round((c.stats.clicked / c.stats.sent) * 1000) / 10 : 0;
                const bounceRate = c.stats.sent ? Math.round((c.stats.bounced / c.stats.sent) * 1000) / 10 : 0;
                const conversion = emailAnalytics.campaigns[c.id];
                return (
                  <div key={c.id} style={listRow}>
                    <div style={{ flex: 1, fontSize: 14 }}>
                      <strong>{c.subject}</strong> — {c.status} · {c.segment}
                      {c.status === 'scheduled' && c.scheduledAt && <span> · sends {new Date(c.scheduledAt).toLocaleString()}</span>}
                      {c.sentAt && <span> · sent {new Date(c.sentAt).toLocaleDateString()}</span>}
                      <div style={{ fontSize: 12, color: T.soft, marginTop: 4 }}>
                        Sent {c.stats.sent} · Click rate {clickRate}% · Bounce rate {bounceRate}% · Complained {c.stats.complained}
                        {conversion && <span> · Conversion rate {conversion.conversionRate}% ({conversion.converted}/{conversion.uniqueClickers} clickers ordered within 7d)</span>}
                      </div>
                    </div>
                    {(c.status === 'draft' || c.status === 'scheduled') && (
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                        {c.status === 'draft' && (
                          <>
                            <button onClick={() => handleSendCampaign(c.id)} disabled={sendingCampaignId === c.id} style={S.btnFill}>
                              {sendingCampaignId === c.id ? 'Sending…' : 'Send now'}
                            </button>
                            <input
                              type="datetime-local"
                              value={scheduleAt}
                              onChange={(e) => setScheduleAt(e.target.value)}
                              style={{ ...formInput, width: 180, maxWidth: '100%', height: 40 }}
                            />
                            <button onClick={() => handleScheduleCampaign(c.id)} style={S.btnOutline}>Schedule</button>
                          </>
                        )}
                        <button onClick={() => handleDeleteCampaign(c.id)} style={deleteBtn}>{c.status === 'scheduled' ? 'Cancel' : 'Delete'}</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <form onSubmit={handleCreateCampaign}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ flex: 2, minWidth: 220 }}>
                <label style={formLabel}>Subject</label>
                <input
                  value={campaignForm.subject}
                  onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })}
                  style={formInput}
                  required
                />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={formLabel}>From name</label>
                <input
                  value={campaignForm.fromName}
                  onChange={(e) => setCampaignForm({ ...campaignForm, fromName: e.target.value })}
                  style={formInput}
                  placeholder="Your store name"
                />
              </div>
              <div style={{ width: 160 }}>
                <label style={formLabel}>Segment</label>
                <select
                  value={campaignForm.segment}
                  onChange={(e) => setCampaignForm({ ...campaignForm, segment: e.target.value })}
                  style={formInput}
                >
                  <option value="all">All subscribed</option>
                  <option value="no_purchase">Leads / never purchased</option>
                  <option value="engaged">Engaged only</option>
                  <option value="grade:A">Grade A only</option>
                  <option value="grade:A+B">Grade A+B</option>
                  <option value="grade:A+B+C">Grade A+B+C</option>
                </select>
              </div>
            </div>
            {templates.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={formLabel}>Start from template</label>
                <select defaultValue="" onChange={(e) => e.target.value && handleUseTemplate(e.target.value)} style={{ ...formInput, width: 260, maxWidth: '100%' }}>
                  <option value="">— none —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div className="col-html">
                <label style={formLabel}>HTML content</label>
                <textarea
                  placeholder="Paste your email HTML here…"
                  value={campaignForm.contentHtml}
                  onChange={(e) => setCampaignForm({ ...campaignForm, contentHtml: e.target.value })}
                  style={{ ...formInput, height: 360, padding: 12, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}
                />

                <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    placeholder="Template name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    style={{ ...formInput, width: 180, maxWidth: '100%' }}
                  />
                  <button type="button" onClick={handleSaveTemplate} disabled={!templateName.trim() || !campaignForm.contentHtml.trim()} style={S.btnOutline}>
                    Save as template
                  </button>
                  {templateMessage && <span style={{ fontSize: 12, color: T.ink }}>{templateMessage}</span>}
                </div>
              </div>

              <div className="col-preview">
                <label style={formLabel}>Preview</label>
                <iframe
                  title="Campaign preview"
                  srcDoc={renderEmailHtml(campaignForm.contentHtml, settings || {}, { preview: true })}
                  style={{ width: '100%', height: 420, border: `1px solid ${T.line}`, background: T.paper }}
                />
              </div>
            </div>

            <button type="submit" style={{ ...S.btnFill, marginTop: 16 }}>Save draft</button>
            {campaignFormMessage && <span style={{ fontSize: 12, color: T.ink, marginLeft: 12 }}>{campaignFormMessage}</span>}

            <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${T.line}`, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="email"
                placeholder="Test email address"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                style={{ ...formInput, width: 240, maxWidth: '100%' }}
              />
              <button
                type="button"
                onClick={() => handleSendTest('campaign-composer', campaignForm.subject, campaignForm.contentHtml)}
                disabled={testSending === 'campaign-composer' || !campaignForm.contentHtml.trim()}
                style={S.btnOutline}
              >
                {testSending === 'campaign-composer' ? 'Sending…' : 'Send test'}
              </button>
              {testMessage['campaign-composer'] && <span style={{ fontSize: 12, color: T.ink }}>{testMessage['campaign-composer']}</span>}
            </div>
          </form>
        </Section>
        </>
        )}

        {activeTab === 'automations' && (
        <>
        {sendingReady && (!sendingReady.cronSecret || !sendingReady.resendKey) && (
          <div style={{ background: '#FDECEA', color: '#8A1F11', borderRadius: 14, padding: '14px 18px', marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
            <strong>Automatic sending is not running.</strong> Flows switched on below won&rsquo;t send until{' '}
            {[!sendingReady.cronSecret && 'CRON_SECRET', !sendingReady.resendKey && 'RESEND_API_KEY'].filter(Boolean).join(' and ')}{' '}
            {!sendingReady.cronSecret && !sendingReady.resendKey ? 'are' : 'is'} set in Vercel (Project → Settings → Environment Variables), followed by a redeploy.
          </div>
        )}
        <Section
          title="Automations"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input
                type="email"
                placeholder="Test email address"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                style={{ ...formInput, width: 200, maxWidth: '100%' }}
              />
              {syncDesignMessage && <span style={{ fontSize: 12, color: T.soft }}>{syncDesignMessage}</span>}
              <button type="button" onClick={handleSyncAutomationDesign} disabled={syncingDesign} style={S.btnOutline}>
                {syncingDesign ? 'Syncing…' : 'Sync latest design'}
              </button>
            </div>
          }
        >
          <div className="flow-layout" style={{ display: 'flex', gap: 24 }}>
            <nav className="pill-nav flow-nav">
              {automations.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setActiveAutomationId(a.id)}
                  style={{ ...sidebarLink, ...((activeAutomationId || automations[0]?.id) === a.id ? sidebarLinkActive : {}) }}
                >
                  {a.name}
                </button>
              ))}
              <button
                onClick={() => setActiveAutomationId(LEGACY_ABANDONED_ID)}
                style={{ ...sidebarLink, ...(activeAutomationId === LEGACY_ABANDONED_ID ? sidebarLinkActive : {}) }}
              >
                Abandoned checkout
              </button>
            </nav>

            <div style={{ flex: 1, minWidth: 0 }}>
              {activeAutomationId === LEGACY_ABANDONED_ID && <LegacyAbandonedCheckout />}
              {automations.filter((a) => a.id === (activeAutomationId || automations[0]?.id)).map((a) => (
            <div key={a.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ fontSize: 14 }}>{a.name}</strong>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.soft }}>
                  <input type="checkbox" checked={a.enabled} onChange={() => handleToggleAutomation(a)} />
                  {a.enabled ? 'On' : 'Off'}
                </label>
              </div>
              {FLOW_DESCRIPTIONS[a.id] && <p style={{ fontSize: 12, color: T.soft, marginBottom: 16 }}>{FLOW_DESCRIPTIONS[a.id]}</p>}

              {a.steps.map((step, i) => {
                const isSuppress = !step.subject;
                const previewKey = `${a.id}-${i}`;
                return (
                  <div key={i} style={stepCard}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: isSuppress ? 0 : 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.soft, flexShrink: 0 }}>
                        {step.delayHours != null ? `Hour ${step.delayHours}` : `Day ${step.delayDays}`}
                      </span>
                      {isSuppress ? (
                        <span style={{ fontSize: 12, color: T.soft }}>Suppresses the subscriber instead of sending</span>
                      ) : (
                        <input
                          value={step.subject}
                          onChange={(e) => updateAutomationStep(a.id, i, { subject: e.target.value })}
                          style={{ ...formInput, flex: 1 }}
                          placeholder="Subject"
                        />
                      )}
                    </div>

                    {!isSuppress && step.stats?.sent > 0 && (
                      <div style={{ fontSize: 12, color: T.soft, marginBottom: 12 }}>
                        Sent {step.stats.sent} · Click rate {Math.round((step.stats.clicked / step.stats.sent) * 1000) / 10}%
                        {emailAnalytics.automations?.[a.id]?.[i] && (
                          <span> · Conversion rate {emailAnalytics.automations[a.id][i].conversionRate}% ({emailAnalytics.automations[a.id][i].converted}/{emailAnalytics.automations[a.id][i].uniqueClickers} clickers ordered within 7d)</span>
                        )}
                      </div>
                    )}

                    {!isSuppress && (
                      <>
                        <textarea
                          placeholder="Paste this step's HTML here…"
                          value={step.html || ''}
                          onChange={(e) => updateAutomationStep(a.id, i, { html: e.target.value })}
                          style={{ ...formInput, height: 200, padding: 12, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}
                        />

                        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => togglePreview(previewKey)} style={S.btnOutline}>
                            {previewOpen[previewKey] ? 'Hide preview' : 'Preview'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendTest(previewKey, step.subject, step.html)}
                            disabled={testSending === previewKey}
                            style={S.btnOutline}
                          >
                            {testSending === previewKey ? 'Sending…' : 'Send test'}
                          </button>
                          {testMessage[previewKey] && <span style={{ fontSize: 12, color: T.ink }}>{testMessage[previewKey]}</span>}
                        </div>

                        {previewOpen[previewKey] && (
                          <iframe
                            title={`${a.id} step ${i} preview`}
                            srcDoc={renderEmailHtml(step.html, settings || {}, { preview: true })}
                            style={{ width: '100%', height: 320, border: `1px solid ${T.line}`, marginTop: 10, background: T.paper }}
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <button type="button" onClick={() => handleSaveAutomationSteps(a)} style={S.btnFill}>Save changes</button>
                {automationMessage[a.id] && <span style={{ fontSize: 12, color: T.ink }}>{automationMessage[a.id]}</span>}
              </div>
            </div>
              ))}
            </div>
          </div>
        </Section>
        </>
        )}
        </main>
      </div>
    </div>
  );
}

// This store's abandoned-checkout email runs on its own every-minute cron
// (lib/abandonedCheckout.js), separate from the flows above, so it's shown
// here read-only with its send numbers (pages/api/admin/email/abandoned-checkout.js).
const LEGACY_ABANDONED_ID = 'legacy_abandoned_checkout';

function LegacyAbandonedCheckout() {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    fetch('/api/admin/email/abandoned-checkout').then((r) => r.json()).then(setData).catch(() => setData({ error: 'Could not load.' }));
  }, []);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <strong style={{ fontSize: 14 }}>Abandoned checkout</strong>
        <span style={{ fontSize: 12, color: T.soft }}>{data?.enabled === false ? 'Off — CRON_SECRET or RESEND_API_KEY missing' : 'On'}</span>
      </div>
      <p style={{ fontSize: 12, color: T.soft, marginBottom: 16 }}>
        Sent about 10 minutes after someone with marketing consent leaves checkout without ordering (checkouts up to 3 hours old, at most one a day per person). Runs on its own schedule, so it isn&rsquo;t edited here. Test it or send it by hand from the main admin&rsquo;s Subscribers and Visitors tabs.
      </p>
      {data?.error && <p style={{ fontSize: 13, color: T.soft }}>{data.error}</p>}
      {data && !data.error && (
        <div style={stepCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{data.subject}</div>
          <div style={{ fontSize: 12, color: T.soft }}>
            Sent {data.sent7d} in the last 7 days · {data.sentTotal} in all{data.lastSentAt ? ` · last ${new Date(data.lastSentAt).toLocaleString()}` : ''}
          </div>
          <div style={{ fontSize: 12, color: T.ink, marginTop: 4 }}>
            Recovered {data.recovered ?? 0} order{data.recovered === 1 ? '' : 's'} ({data.recoveryRate ?? 0}%) · ${Number(data.recoveredRevenue || 0).toFixed(2)} — ordered within 7 days of the email
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistRow({ ok, label, busy }) {
  const icon = busy ? '…' : ok ? '✓' : '✕';
  const color = busy ? T.soft : ok ? '#1a7f37' : '#b3261e';
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', fontSize: 13 }}>
      <span style={{ color, fontWeight: 700, width: 16 }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <div className="admin-section" style={{ background: T.white, borderRadius: T.radius, boxShadow: T.shadow, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', color: T.ink }}>{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

const filterChip = {
  background: 'rgba(0,0,0,0.05)', border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 500,
  fontFamily: T.sans, color: T.ink, cursor: 'pointer', borderRadius: 999,
};
const filterChipActive = { background: T.ink, color: T.white, fontWeight: 600 };

// Under every subscriber: the emails they've had (flows + this store's
// abandoned-checkout email), and, when they left a checkout without
// ordering, what they left plus a button to send the abandoned-checkout
// email now.
function EmailHistoryRow({ subscriber: s, onSendAbandoned, sending, message }) {
  const history = s.emailHistory || [];
  const oc = s.openCheckout;
  return (
    <div style={{ padding: '0 0 12px 16px', borderBottom: `1px solid ${T.line}`, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: T.soft }}>
        {history.length === 0 ? 'No emails sent yet.' : (
          <>
            <span style={{ color: T.ink, fontWeight: 600 }}>Emails sent ({history.length}): </span>
            {history.map((h, i) => (
              <span key={i}>{i ? ' · ' : ''}{h.label}{h.subject ? ` — "${h.subject}"` : ''}{h.at ? ` (${new Date(h.at).toLocaleDateString()})` : ''}</span>
            ))}
          </>
        )}
      </div>
      {oc && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', background: T.paper, borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              Left checkout · {new Date(oc.at).toLocaleString()}{oc.value ? ` · $${Number(oc.value).toFixed(2)}` : ''}
            </div>
            <div>{oc.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</div>
            <div style={{ color: T.soft, marginTop: 2 }}>{oc.emailedAt ? `Abandoned-checkout email sent ${new Date(oc.emailedAt).toLocaleString()}` : 'No abandoned-checkout email for this checkout yet'}</div>
          </div>
          {s.status === 'subscribed' ? (
            <button type="button" onClick={onSendAbandoned} disabled={sending} style={S.btnOutline}>
              {sending ? 'Sending…' : oc.emailedAt ? 'Send it again' : 'Send abandoned checkout email'}
            </button>
          ) : <span style={{ color: T.soft }}>Can&rsquo;t email — {s.status}.</span>}
          {message && <span style={{ fontSize: 11, color: T.soft }}>{message}</span>}
        </div>
      )}
    </div>
  );
}

// Shown under a subscriber who started a checkout and hasn't ordered since
// (touchLastOrder clears checkoutStartedAt on purchase): what they left,
// which abandoned-checkout emails they've had, and a send button for any
// step — defaulting to the next one due. Works while the flow is switched
// off (lib/email/automationSend.js sendAutomationStepNow).
function AbandonedCheckoutPanel({ subscriber: s, flow, selectedStep, onSelectStep, onSend, sending, message }) {
  const items = s.checkoutItems || [];
  const itemsTotal = items.reduce((sum, i) => sum + (i.price != null ? Number(i.price) * (i.quantity || 1) : 0), 0);
  const value = s.checkoutValue || itemsTotal;
  const steps = flow?.steps || [];
  const sentCount = Math.min(s.automationState?.abandoned_checkout?.step || 0, steps.length);
  const nextDue = sentCount < steps.length ? sentCount : steps.length - 1;
  const chosen = selectedStep ?? nextDue;
  const canSend = s.status === 'subscribed' && steps.length > 0;

  return (
    <div style={{ padding: '4px 0 14px 16px', borderBottom: `1px solid ${T.line}`, fontSize: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 320px', background: T.paper, borderRadius: 12, padding: '10px 12px' }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          Abandoned checkout · {new Date(s.checkoutStartedAt).toLocaleString()}{value ? ` · $${Number(value).toFixed(2)}` : ''}
        </div>
        <div>{items.length ? items.map((i) => `${i.name || i.id} × ${i.quantity || 1}`).join(', ') : 'No cart items captured'}</div>
        <div style={{ color: T.soft, marginTop: 2 }}>
          Emails sent: {sentCount} of {steps.length}{flow && !flow.enabled ? ' · automatic sending is off' : ''}
        </div>
      </div>
      {canSend ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={chosen} onChange={(e) => onSelectStep(Number(e.target.value))} style={{ ...formInput, width: 'auto', height: 40 }}>
            {steps.map((step, i) => (
              <option key={i} value={i} disabled={!step.subject}>
                Email {i + 1}: {step.subject || '(no content)'}{i < sentCount ? ' — sent' : ''}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => onSend(chosen)} disabled={sending} style={S.btnOutline}>
            {sending ? 'Sending…' : 'Send now'}
          </button>
          {message && <span style={{ fontSize: 11, color: T.soft }}>{message}</span>}
        </div>
      ) : (
        <span style={{ color: T.soft }}>{s.status !== 'subscribed' ? `Can't email — ${s.status}.` : 'Loading automation…'}</span>
      )}
    </div>
  );
}

const headRow = {
  display: 'flex', gap: 12, padding: '0 0 10px', borderBottom: `1px solid ${T.line}`,
  fontSize: 12, fontWeight: 500, color: T.soft,
};
const row = { display: 'flex', gap: 12, padding: '12px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13, alignItems: 'center' };
const listRow = { display: 'flex', gap: 16, alignItems: 'flex-start', padding: '14px 0', borderBottom: `1px solid ${T.line}` };
const deleteBtn = {
  fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 980,
  background: 'rgba(255,59,48,0.1)', padding: '7px 14px', cursor: 'pointer', fontFamily: T.sans, flexShrink: 0, color: '#D70015',
};
const formInput = {
  width: '100%', height: 40, padding: '0 12px', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, background: T.white,
  fontFamily: T.sans, fontSize: 14, color: T.ink, outline: 'none', boxSizing: 'border-box',
};
const formLabel = { display: 'block', fontSize: 12, fontWeight: 500, color: T.soft, marginBottom: 6 };
const gradeTile = { background: T.paper, borderRadius: 14, padding: '14px 18px', minWidth: 90, textAlign: 'center' };
const stepCard = { background: T.paper, borderRadius: 14, padding: 14, marginBottom: 10 };
// Layout (width/display/scroll behavior) lives in the .pill-nav CSS class
// (horizontal scrolling pills on mobile, a vertical block list on desktop)
// so this only needs to carry the non-responsive visual styling.
const sidebarLink = {
  textAlign: 'left', padding: '10px 12px', marginBottom: 2,
  background: 'none', border: 'none', borderRadius: 10, cursor: 'pointer',
  fontFamily: T.sans, fontSize: 14, fontWeight: 500, color: T.ink,
};
const sidebarLinkActive = { background: T.accent, color: '#FFFFFF', fontWeight: 600 };


// Text-alert opt-ins from the signup popup (lib/email/smsStore.js). Nothing
// here sends texts — export the CSV into an SMS provider to message them.
function SmsSubscribers() {
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    fetch('/api/admin/email/sms').then((r) => r.json()).then((d) => setList(d.subscribers || [])).catch(() => setList([]));
  }, []);
  if (!list || list.length === 0) return null;
  return (
    <Section
      title={`Text alerts (${list.length})`}
      action={<a href="/api/admin/email/sms?format=csv" style={S.btnOutline}>Export CSV</a>}
    >
      <p style={{ color: T.soft, fontSize: 13, margin: '0 0 12px' }}>
        Mobile numbers opted in to text alerts, with the consent each person agreed to. This store doesn&rsquo;t send texts — export these into an SMS provider.
      </p>
      <div className="table-scroll">
        <div style={{ minWidth: 520 }}>
          {list.slice().reverse().slice(0, 50).map((s) => (
            <div key={s.phone} style={{ display: 'flex', gap: 12, fontSize: 13, padding: '8px 0', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ flex: '0 0 140px' }}>{s.phone}</div>
              <div style={{ flex: 1, color: T.soft }}>{s.email || '—'}</div>
              <div style={{ flex: '0 0 110px', color: T.soft }}>{new Date(s.consentAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
