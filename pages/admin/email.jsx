import MessagingWorkspace, { MessagingOverview, SmsSetupPanel, EmailMessageEditor, SmsAudience, ChannelBadge } from '../../components/MessagingWorkspace';
import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { T, S } from '../../lib/adminTheme';
import Link from 'next/link';
import { renderEmailHtml, EMAIL_FONTS } from '../../lib/email/emailBlocks';
import { BRAND } from '../../lib/email/brand';
import AbandonedSmsButton from '../../components/AbandonedSmsButton';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'settings', label: 'Settings' },
  { id: 'subscribers', label: 'Subscribers' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'automations', label: 'Automations' },
  { id: 'texts', label: 'Texts (SMS)' },
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
  const [campaignComposerOpen, setCampaignComposerOpen] = React.useState(false);
  const [loadStates, setLoadStates] = React.useState({});
  const [loadErrors, setLoadErrors] = React.useState({});
  const [smsOverview, setSmsOverview] = React.useState(null);
  const adminGet = React.useCallback(async (url) => {
    setLoadStates(prev => ({ ...prev, [url]: 'loading' }));
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(response.status === 401 ? 'Your session expired. Sign in again.' : 'Could not load this section.');
      setLoadStates(prev => ({ ...prev, [url]: 'ready' }));
      setLoadErrors(prev => { const next = { ...prev }; delete next[url]; return next; });
      return response;
    } catch (error) {
      setLoadStates(prev => ({ ...prev, [url]: 'error' }));
      setLoadErrors(prev => ({ ...prev, [url]: error.message }));
      throw error;
    }
  }, []);
  React.useEffect(() => {
    if (!router.isReady) return;
    const tab = typeof router.query.tab === 'string' ? router.query.tab : 'overview';
    if (TABS.some(item => item.id === tab)) setActiveTab(tab);
  }, [router.isReady, router.query.tab]);
  const navigateMessaging = (tab) => {
    setActiveTab(tab);
    router.replace({ pathname: router.pathname, query: { ...router.query, tab } }, undefined, { shallow: true });
  };
  React.useEffect(() => {
    if (activeTab === 'campaigns' && campaignComposerOpen) {
      document.getElementById('campaign-composer')?.scrollIntoView({ block: 'start' });
    }
  }, [activeTab, campaignComposerOpen]);
  const createEmail = () => {
    navigateMessaging('campaigns');
    setCampaignComposerOpen(true);
  };

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
  const [emailAnalytics, setEmailAnalytics] = React.useState({ campaigns: {}, automations: {}, flows: [], thresholds: null, aggregate: null });

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
    adminGet('/api/admin/email/subscribers')
      .then((r) => r.json())
      .then((data) => {
        setSubscribers(data.subscribers || []);
        setGradeSummary(data.gradeSummary || null);
      })
      .catch(() => {});
  }, [adminGet]);

  const loadCampaigns = React.useCallback(() => {
    adminGet('/api/admin/email/campaigns').then((r) => r.json()).then((data) => setCampaigns(data.campaigns || [])).catch(() => {});
  }, [adminGet]);

  const loadEmailAnalytics = React.useCallback(() => {
    adminGet('/api/admin/email/analytics')
      .then((r) => r.json())
      .then((data) => setEmailAnalytics({ campaigns: data.campaigns || {}, automations: data.automations || {}, flows: data.flows || [], thresholds: data.thresholds || null, aggregate: data.aggregate || null }))
      .catch(() => {});
  }, [adminGet]);

  const loadAutomations = React.useCallback(() => {
    adminGet('/api/admin/email/automations').then((r) => r.json()).then((data) => {
      setAutomations(data.automations || []);
      setSendingReady(data.sendingReady || null);
    }).catch(() => {});
  }, [adminGet]);

  const loadTemplates = React.useCallback(() => {
    adminGet('/api/admin/email/templates').then((r) => r.json()).then((data) => setTemplates(data.templates || [])).catch(() => {});
  }, [adminGet]);

  const loadSettings = React.useCallback(() => {
    adminGet('/api/admin/email/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings || null);
        setSettingsForm(data.settings || null);
      })
      .catch(() => {});
  }, [adminGet]);

  const loadDomainIdentity = React.useCallback(() => {
    setDomainIdentityLoading(true);
    adminGet('/api/admin/email/resend-identity')
      .then((r) => r.json())
      .then(setDomainIdentity)
      .catch(() => {})
      .finally(() => setDomainIdentityLoading(false));
  }, [adminGet]);

  React.useEffect(() => {
    loadSubscribers();
    loadCampaigns();
    loadEmailAnalytics();
    loadAutomations();
    loadTemplates();
    loadSettings();
    loadDomainIdentity();
  }, [loadSubscribers, loadCampaigns, loadEmailAnalytics, loadAutomations, loadTemplates, loadSettings, loadDomainIdentity]);

  React.useEffect(() => {
    fetch('/api/admin/sms').then(response => {
      if (!response.ok) throw new Error('SMS connection could not be checked.');
      return response.json();
    }).then(setSmsOverview).catch(error => setSmsOverview({ error: error.message }));
  }, []);

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
    setCampaignComposerOpen(true);
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
        <title>{`Email & SMS — ${BRAND.name} admin`}</title>
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

      <MessagingWorkspace brand={BRAND.name} tabs={TABS} activeTab={activeTab} onNavigate={navigateMessaging} onLogout={handleLogout} onCreate={createEmail} errors={loadErrors} onRetry={() => { loadSubscribers(); loadCampaigns(); loadEmailAnalytics(); loadAutomations(); loadTemplates(); loadSettings(); loadDomainIdentity(); }}>
        {activeTab === 'overview' && (
        <>
        <MessagingOverview subscribers={subscribers} campaigns={campaigns} automations={automations} aggregate={emailAnalytics.aggregate} sendingReady={sendingReady} sms={smsOverview} smsAvailable={true} loaded={{ campaignsError: loadStates['/api/admin/email/campaigns'] === 'error', automationsError: loadStates['/api/admin/email/automations'] === 'error', contacts: loadStates['/api/admin/email/subscribers'] === 'ready', campaigns: loadStates['/api/admin/email/campaigns'] === 'ready', analytics: loadStates['/api/admin/email/analytics'] === 'ready', automations: loadStates['/api/admin/email/automations'] === 'ready' }} onNavigate={navigateMessaging} onCreate={createEmail} />
        <details className="mw-disclosure"><summary>Audience growth & detailed performance</summary><div>

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
        </div></details>
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
        <Section
          title={`Subscribers (${visibleSubscribers.length}${visibleSubscribers.length !== subscribers.length ? ` of ${subscribers.length}` : ''})`}
          action={<a href="/api/admin/email/subscribers?format=csv" style={S.btnOutline}>Export CSV</a>}
        >
          <details className="mw-disclosure"><summary>Add an email contact</summary><div><form onSubmit={handleAddSubscriber} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <input
              type="email"
              aria-label="Email address to add" placeholder="Add subscriber by email…"
              value={newSubscriberEmail}
              onChange={(e) => setNewSubscriberEmail(e.target.value)}
              style={{ ...formInput, width: 260, maxWidth: '100%' }}
              required
            />
            <button type="submit" disabled={addingSubscriber} style={S.btnFill}>
              {addingSubscriber ? 'Adding…' : 'Add subscriber'}
            </button>
            {addSubscriberMessage && <span style={{ fontSize: 12, color: T.ink }}>{addSubscriberMessage}</span>}
          </form></div></details>
          <p style={{ fontSize: 12, color: T.soft, marginTop: 0, marginBottom: 20 }}>
            Skips double opt-in and marks them subscribed immediately — only add someone here if you already have a lawful basis to email them.
          </p>

          {subscribers.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No subscribers yet.</p>
          ) : (
            <div>
              <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  aria-label="Search audience by email" placeholder="Search by email…"
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
        <details className="mw-disclosure"><summary>Saved email templates ({templates.length})</summary><div><Section title={`Templates (${templates.length})`}>
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
        </Section></div></details>

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
          <section id="campaign-composer" className="mw-disclosure"><button type="button" className="mw-disclosure-button" aria-expanded={campaignComposerOpen} aria-controls="campaign-composer-body" onClick={() => setCampaignComposerOpen(open => !open)}>Create an email <span aria-hidden="true">{campaignComposerOpen ? '−' : '+'}</span></button><div id="campaign-composer-body" hidden={!campaignComposerOpen}><form onSubmit={handleCreateCampaign}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ flex: 2, minWidth: 220 }}>
                <label style={formLabel} htmlFor="campaign-subject">Subject</label>
                <input
                  id="campaign-subject" value={campaignForm.subject}
                  onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })}
                  style={formInput}
                  required
                />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={formLabel} htmlFor="campaign-fromName">From name</label>
                <input
                  id="campaign-fromName" value={campaignForm.fromName}
                  onChange={(e) => setCampaignForm({ ...campaignForm, fromName: e.target.value })}
                  style={formInput}
                  placeholder="Your store name"
                />
              </div>
              <div style={{ width: 160 }}>
                <label style={formLabel} htmlFor="campaign-segment">Audience segment</label>
                <select
                  id="campaign-segment" value={campaignForm.segment}
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
                <label style={formLabel}>Email content</label>
                <EmailMessageEditor value={campaignForm.contentHtml} onChange={contentHtml => setCampaignForm(prev => ({ ...prev, contentHtml }))} />

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
          </form></div></section>
        </Section>
        </>
        )}

        {activeTab === 'texts' && <TextsTab />}

        {activeTab === 'automations' && (
        <>
        {sendingReady && (!sendingReady.cronSecret || !sendingReady.resendKey) && (
          <div style={{ background: '#FDECEA', color: '#8A1F11', borderRadius: 14, padding: '14px 18px', marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
            <strong>Automatic sending is not running.</strong> Flows switched on below won&rsquo;t send until{' '}
            {[!sendingReady.cronSecret && 'CRON_SECRET', !sendingReady.resendKey && 'RESEND_API_KEY'].filter(Boolean).join(' and ')}{' '}
            {!sendingReady.cronSecret && !sendingReady.resendKey ? 'are' : 'is'} set in Vercel (Project → Settings → Environment Variables), followed by a redeploy.
          </div>
        )}
        <FlowPerformance flows={emailAnalytics.flows} thresholds={emailAnalytics.thresholds} onSelect={(id) => setActiveAutomationId(id === 'abandoned_checkout' ? LEGACY_ABANDONED_ID : id)} />
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
              {activeAutomationId === LEGACY_ABANDONED_ID && <LegacyAbandonedCheckout perf={emailAnalytics.flows.find((f) => f.id === 'abandoned_checkout')} />}
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

                    {!isSuppress && (() => {
                      const perf = emailAnalytics.flows.find((f) => f.id === a.id)?.steps.find((r) => r.index === i);
                      const conv = emailAnalytics.automations?.[a.id]?.[i];
                      if (!perf || perf.sent === 0) return null;
                      return (
                        <div style={{ fontSize: 12, color: T.soft, marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span>Sent {perf.sent} · Open rate {perf.trackedSent ? `${perf.openRate}%` : '—'} · Click rate {perf.clickRate}% ({perf.clickers} clicked)</span>
                          {conv && <span>· Conversion {conv.conversionRate}% ({conv.converted}/{conv.uniqueClickers} clickers ordered within 7d)</span>}
                          <HealthBadge health={perf.health} />
                        </div>
                      );
                    })()}

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

                        <AbTestPanel
                          automation={a}
                          settings={settings}
                          stepIndex={i}
                          step={step}
                          perf={emailAnalytics.flows.find((f) => f.id === a.id)?.steps.find((r) => r.index === i)}
                          onChangeB={(patch) => updateAutomationStep(a.id, i, { abTest: { ...step.abTest, ...patch } })}
                          onUpdated={(automation) => {
                            setAutomations((prev) => prev.map((x) => (x.id === automation.id ? automation : x)));
                            loadEmailAnalytics();
                          }}
                        />
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
      </MessagingWorkspace>
    </div>
  );
}

// This store's abandoned-checkout email runs on its own every-minute cron
// (lib/abandonedCheckout.js), separate from the flows above, so it's shown
// here read-only with its send numbers (pages/api/admin/email/abandoned-checkout.js).
const LEGACY_ABANDONED_ID = 'legacy_abandoned_checkout';

function LegacyAbandonedCheckout({ perf }) {
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
          <div style={{ fontSize: 12, color: T.soft, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {perf?.sent
              ? <span>Since click tracking: {perf.sent} sent · Open rate {perf.openRate}% · Click rate {perf.clickRate}% ({perf.clickers} clicked)</span>
              : <span>Open and click tracking starts with the next abandoned-checkout email.</span>}
            {perf?.sent > 0 && <HealthBadge health={perf.health} />}
          </div>
        </div>
      )}
      <CheckoutLayoutTest />
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

// Per-automation open/click rates (pages/api/admin/email/analytics.js →
// lib/email/flowPerformance.js), so a flow that isn't working stands out.
function FlowPerformance({ flows, thresholds, onSelect }) {
  if (!flows?.length) return null;
  const cell = { padding: '10px 8px', borderBottom: `1px solid ${T.line}`, fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' };
  const head = { ...cell, fontSize: 11, fontWeight: 600, color: T.soft, textTransform: 'uppercase', letterSpacing: '0.06em' };
  const pct = (v, has = true) => (has ? `${v}%` : '—');
  return (
    <Section title="Automation performance">
      <p style={{ fontSize: 12, color: T.soft, margin: '0 0 12px', lineHeight: 1.5 }}>
        Click rate = email deliveries clicked at least once ÷ emails sent. Repeat clicks do not increase the rate. Open rate counts from when open tracking went live and reads high because Apple Mail preloads images, so treat it as a spam-folder warning and judge emails on clicks.
        {thresholds && <> Flagged when a flow has {thresholds.minSent}+ sends and click rate is under {thresholds.clickRateFloor}% or open rate is under {thresholds.openRateFloor}%.</>}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }}>Automation</th>
              <th style={head}>Sent</th>
              <th style={head}>Open rate</th>
              <th style={head}>Click rate</th>
              <th style={head}>Click-to-open</th>
              <th style={{ ...head, textAlign: 'left' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((f) => (
              <React.Fragment key={f.id}>
                <tr>
                  <td style={{ ...cell, textAlign: 'left' }}>
                    <button type="button" onClick={() => onSelect(f.id)} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 600, color: T.ink, cursor: 'pointer', textDecoration: 'underline' }}>{f.name}</button>
                    {!f.enabled && <span style={{ fontSize: 11, color: T.soft, marginLeft: 6 }}>off</span>}
                  </td>
                  <td style={cell}>{f.sent}</td>
                  <td style={cell}>{pct(f.openRate, f.trackedSent > 0)}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{pct(f.clickRate, f.sent > 0)}</td>
                  <td style={cell}>{pct(f.clickToOpenRate, f.opened > 0)}</td>
                  <td style={{ ...cell, textAlign: 'left' }}><HealthBadge health={f.health} /></td>
                </tr>
                {f.steps.length > 1 && f.steps.map((st) => (
                  <tr key={st.index}>
                    <td style={{ ...cell, textAlign: 'left', paddingLeft: 20, color: T.soft, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>Step {st.index + 1}: {st.subject}{st.abTest && ' · A/B running'}</td>
                    <td style={{ ...cell, color: T.soft }}>{st.sent}</td>
                    <td style={{ ...cell, color: T.soft }}>{pct(st.openRate, st.trackedSent > 0)}</td>
                    <td style={{ ...cell, color: T.soft }}>{pct(st.clickRate, st.sent > 0)}</td>
                    <td style={{ ...cell, color: T.soft }}>{pct(st.clickToOpenRate, st.opened > 0)}</td>
                    <td style={{ ...cell, textAlign: 'left' }}><HealthBadge health={st.health} /></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function HealthBadge({ health }) {
  if (!health) return null;
  const styles = {
    failing: { background: '#FDECEA', color: '#8A1F11', label: 'Failing' },
    ok: { background: '#E7F4EA', color: '#1E5B2E', label: 'Healthy' },
    learning: { background: T.paper, color: T.soft, label: 'Not enough data' },
  };
  const st = styles[health.status] || styles.learning;
  return (
    <span title={health.note || ''} style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: st.background, color: st.color }}>
      {st.label}{health.status === 'failing' && health.note ? `: ${health.note}` : ''}
    </span>
  );
}

// A/B test for one automation step: variant B gets its own subject and/or
// HTML, subscribers are split 50/50 (stable per person), and the results
// compare click rate with a confidence figure. Ending the test with B as
// the winner copies B into the step (lib/email/automationsStore.js).
function AbTestPanel({ automation, stepIndex, step, perf, onChangeB, onUpdated, settings }) {
  const [open, setOpen] = React.useState(Boolean(step.abTest?.enabled));
  const [draft, setDraft] = React.useState({ subject: '', html: '' });
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const running = step.abTest?.enabled ? step.abTest : null;
  const results = perf?.abTest?.results;

  const call = async (body) => {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/email/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: automation.id, stepIndex, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed.');
      onUpdated(data.automation);
      return true;
    } catch (err) {
      setMsg(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const box = { marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.line}` };
  if (!open && !running) {
    return (
      <div style={box}>
        <button type="button" onClick={() => setOpen(true)} style={S.btnOutline}>A/B test this email</button>
        {step.abHistory?.length > 0 && <span style={{ fontSize: 12, color: T.soft, marginLeft: 10 }}>{step.abHistory.length} past test{step.abHistory.length === 1 ? '' : 's'} · last winner: {step.abHistory[step.abHistory.length - 1].winner.toUpperCase()}</span>}
      </div>
    );
  }

  const row = (label, m) => (
    <tr>
      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{label}</td>
      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m?.sent ?? 0}</td>
      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m?.sent ? `${m.openRate}%` : '—'}</td>
      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{m?.sent ? `${m.clickRate}%` : '—'}</td>
      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m?.clickers ?? 0}</td>
    </tr>
  );

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>A/B test {running ? '· running' : ''}</strong>
        {!running && <button type="button" onClick={() => setOpen(false)} style={{ ...S.btnOutline, height: 28, fontSize: 12 }}>Cancel</button>}
      </div>
      <p style={{ fontSize: 12, color: T.soft, margin: '0 0 10px', lineHeight: 1.5 }}>
        Variant A is the email above. Half of the people who reach this step get variant B (each person always gets the same one). Leave B&rsquo;s HTML blank to test only the subject line. Pick a winner once each side has a few hundred sends.
      </p>
      <label style={formLabel}>Variant B subject</label>
      <input
        value={running ? running.subject || '' : draft.subject}
        onChange={(e) => (running ? onChangeB({ subject: e.target.value }) : setDraft({ ...draft, subject: e.target.value }))}
        placeholder={step.subject}
        style={{ ...formInput, marginBottom: 10 }}
      />
      <label style={formLabel}>Variant B HTML (optional)</label>
      <textarea
        value={running ? running.html || '' : draft.html}
        onChange={(e) => (running ? onChangeB({ html: e.target.value }) : setDraft({ ...draft, html: e.target.value }))}
        placeholder="Blank = same HTML as variant A"
        style={{ ...formInput, height: 140, padding: 12, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}
      />
      {running && <p style={{ fontSize: 11, color: T.soft, margin: '6px 0 0' }}>Edits to B are saved with &ldquo;Save changes&rdquo; below.</p>}

      {running ? (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 12 }}>
            <thead>
              <tr style={{ color: T.soft, textAlign: 'right' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Variant</th><th style={{ padding: '6px 8px' }}>Sent</th><th style={{ padding: '6px 8px' }}>Open rate</th><th style={{ padding: '6px 8px' }}>Click rate</th><th style={{ padding: '6px 8px' }}>Clicked</th>
              </tr>
            </thead>
            <tbody>
              {row('A', results?.a)}
              {row('B', results?.b)}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: T.ink, margin: '8px 0' }}>
            {perf?.abTest?.leader
              ? `${perf.abTest.leader.toUpperCase()} is ahead on click rate · ${perf.abTest.confidence}% confidence${perf.abTest.confidence < 95 ? ' (wait for 95%+ before calling it)' : ' — review sample size and conversions before choosing'}`
              : 'No clicks to compare yet.'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" disabled={busy} onClick={() => window.confirm('End the test and keep variant A?') && call({ action: 'ab-end', winner: 'a' })} style={S.btnOutline}>Keep A, end test</button>
            <button type="button" disabled={busy} onClick={() => window.confirm('End the test and replace this step with variant B?') && call({ action: 'ab-end', winner: 'b' })} style={S.btnFill}>B wins, use B</button>
            <details style={{ marginTop: 12 }}><summary>Preview variant B</summary>
        <iframe title="Variant B preview" sandbox="" srcDoc={renderEmailHtml((running ? running.html : draft.html) || step.html, settings || {}, { preview: true })} style={{ width: '100%', maxWidth: 600, height: 480, border: '1px solid #ddd' }} />
      </details>
      {msg && <span style={{ fontSize: 12, color: T.danger }}>{msg}</span>}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <button
            type="button"
            disabled={busy || (!draft.subject.trim() && !draft.html.trim())}
            onClick={async () => { if (await call({ action: 'ab-start', subject: draft.subject, html: draft.html })) setDraft({ subject: '', html: '' }); }}
            style={S.btnFill}
          >
            {busy ? 'Starting…' : 'Start A/B test'}
          </button>
          {msg && <span style={{ fontSize: 12, color: T.danger }}>{msg}</span>}
        </div>
      )}
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
            <span style={{ color: T.ink, fontWeight: 600 }}>{history.some((h) => h.channel === 'sms') ? 'Emails & texts sent' : 'Emails sent'} ({history.length}): </span>
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
          <AbandonedSmsButton contactKey={oc.key} phone={oc.phone} smsStatus={oc.smsStatus} sentAt={oc.textedAt} />
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


// Admin → Texts: automated texts and broadcasts through ResendSMS
// (pages/api/admin/sms.js, lib/sms/). Every send costs ResendSMS credits.
function TextsTab() {
  const [smsPanel, setSmsPanel] = React.useState('automations');
  const [data, setData] = React.useState(null);
  const [edits, setEdits] = React.useState({});
  const [msg, setMsg] = React.useState({});
  const [busy, setBusy] = React.useState('');
  const [testPhone, setTestPhone] = React.useState('');
  const [broadcast, setBroadcast] = React.useState({ message: 'Smells Iconic: new drop is live {{LINK}} Reply STOP to opt out', link: '/shop' });

  const load = React.useCallback(() => {
    fetch('/api/admin/sms').then(async r => { const result = await r.json(); if (!r.ok) throw new Error(result.error || 'Could not load SMS.'); return result; }).then(setData).catch(() => setData({ error: 'Could not load.' }));
  }, []);
  React.useEffect(load, [load]);

  const api = async (key, method, body) => {
    setBusy(key);
    setMsg((m) => ({ ...m, [key]: '' }));
    try {
      const res = await fetch('/api/admin/sms', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Failed.');
      return out;
    } catch (err) {
      setMsg((m) => ({ ...m, [key]: err.message }));
      return null;
    } finally {
      setBusy('');
    }
  };

  if (!data) return <Section title="Texts (SMS)"><p style={{ fontSize: 13, color: T.soft }}>Loading…</p></Section>;
  if (data.error) return <Section title="Texts (SMS)"><p style={{ fontSize: 13, color: T.soft }}>{data.error}</p></Section>;

  const tile = (value, label) => (
    <div style={gradeTile}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>{label}</div>
    </div>
  );
  const segInfo = (text) => {
    const len = [...String(text || '')].length;
    const unicode = /[^\x00-\x7F£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€]/.test(text || '');
    const single = unicode ? 70 : 160;
    const multi = unicode ? 67 : 153;
    const segs = len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi);
    return `${len} characters · ${segs} credit${segs === 1 ? '' : 's'} per text${unicode ? ' (emoji/special characters make texts cost more)' : ''} · {{LINK}} adds ~30`;
  };

  return (
    <>
      {!data.configured && (
        <div style={{ background: '#FDECEA', color: '#8A1F11', borderRadius: 14, padding: '14px 18px', marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
          <strong>ResendSMS isn&rsquo;t connected.</strong> Your sending connection needs to be finished before texts can go out. Open the Connection tab to review its status.
        </div>
      )}
      {data.configured && data.balance && data.balance.credits < Math.max(10, data.subscribed) && (
        <div style={{ background: '#FFF4E5', color: '#7A4A00', borderRadius: 14, padding: '14px 18px', marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
          <strong>Low on credits: {data.balance.credits} left.</strong> Nothing sends at 0. Top up at resendsms.com (credits never expire).
        </div>
      )}

      <div className="mw-segmented mw-sms-tabs" role="group" aria-label="SMS tools">
        {[['automations', 'Automations'], ['broadcast', 'Broadcast'], ['contacts', 'Contacts'], ['connection', 'Connection']].map(([id, label]) => <button type="button" key={id} aria-pressed={smsPanel === id} onClick={() => setSmsPanel(id)}>{label}</button>)}
      </div>
      <Section title="Sending status">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {tile(data.configured ? (data.balance ? data.balance.credits : '—') : 'Off', data.balanceError ? `Credits (error: ${data.balanceError})` : 'ResendSMS credits')}
          {tile(data.subscribed, 'On the text list')}
          {tile(data.unsubscribed, 'Opted out')}
          {tile(data.inSendWindow ? 'Open' : 'Closed', 'Send window (11am–8pm ET)')}
        </div>
<details style={{ marginTop: 16 }}><summary style={{ fontSize: 12, cursor: 'pointer' }}>How sending and opt-outs work</summary>        <p style={{ fontSize: 12, color: T.soft, margin: '14px 0 0', lineHeight: 1.5 }}>
          Numbers join from the &ldquo;Text me new drops and offers&rdquo; box at checkout (unticked by default; the consent wording is saved with each number). Texts only go to numbers on that list, only between 11am and 8pm Eastern. ResendSMS doesn&rsquo;t pass replies back to the store, so when someone replies STOP, mark them opted out below.
        </p></details>
      </Section>

      {smsPanel === 'automations' && <>      <Section title="Automated texts">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
          <input type="tel" aria-label="Mobile number for SMS tests" placeholder="Your mobile, for test texts" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} style={{ ...formInput, width: 240, maxWidth: '100%' }} />
          <span style={{ fontSize: 12, color: T.soft }}>Test texts use 1 credit each.</span>
        </div>
        {data.flows.map((f) => {
          const e = edits[f.id] || {};
          const message = e.message ?? f.message;
          const delay = e.delayMinutes ?? f.delayMinutes;
          const st = f.stats;
          return (
            <div key={f.id} style={stepCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ fontSize: 14 }}>{f.name}</strong>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.soft }}>
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    disabled={busy === f.id || (!f.enabled && !data.configured)}
                    onChange={async () => { if (await api(f.id, 'PUT', { id: f.id, enabled: !f.enabled })) load(); }}
                  />
                  {f.enabled ? 'On' : 'Off'}
                </label>
              </div>
              <p style={{ fontSize: 12, color: T.soft, margin: '0 0 10px' }}>{f.description}</p>
              {st?.sent > 0 && (
                <p style={{ fontSize: 12, color: T.soft, margin: '0 0 10px' }}>Sent {st.sent} · Clicked {st.clickers} · Click rate {st.clickRate}%</p>
              )}
              <label style={formLabel}>Message ({'{{LINK}}'} = tracked link{f.id === 'sms_abandoned_checkout' ? ', {{PRODUCT}} = first item in their bag' : ''})</label>
              <textarea
                value={message}
                onChange={(ev) => setEdits((x) => ({ ...x, [f.id]: { ...e, message: ev.target.value } }))}
                style={{ ...formInput, height: 80, padding: 12, fontSize: 13, lineHeight: 1.5 }}
              />
              <div style={{ fontSize: 11, color: T.soft, margin: '4px 0 10px' }}>{segInfo(message)}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, color: T.soft }}>
                  Send after{' '}
                  <input type="number" min="0" max="1440" value={delay} onChange={(ev) => setEdits((x) => ({ ...x, [f.id]: { ...e, delayMinutes: ev.target.value } }))} style={{ ...formInput, width: 80, display: 'inline-block' }} />
                  {' '}minutes
                </label>
                <button
                  type="button"
                  disabled={busy === f.id}
                  onClick={async () => { if (await api(f.id, 'PUT', { id: f.id, message, delayMinutes: Number(delay) })) { setEdits((x) => ({ ...x, [f.id]: undefined })); setMsg((m) => ({ ...m, [f.id]: 'Saved.' })); load(); } }}
                  style={S.btnFill}
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={busy === `test-${f.id}` || !data.configured || !testPhone}
                  onClick={async () => { if (await api(`test-${f.id}`, 'POST', { action: 'test', phone: testPhone, message })) { setMsg((m) => ({ ...m, [`test-${f.id}`]: `Sent to ${testPhone} (1 credit).` })); load(); } }}
                  style={S.btnOutline}
                >
                  Send test
                </button>
                {msg[f.id] && <span style={{ fontSize: 12 }}>{msg[f.id]}</span>}
                {msg[`test-${f.id}`] && <span style={{ fontSize: 12 }}>{msg[`test-${f.id}`]}</span>}
              </div>
            </div>
          );
        })}
      </Section>

</>}
      {smsPanel === 'broadcast' && <>      <Section title="Send an SMS broadcast">
        <label style={formLabel}>Message</label>
        <textarea value={broadcast.message} onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })} style={{ ...formInput, height: 80, padding: 12, fontSize: 13, lineHeight: 1.5 }} />
        <div style={{ fontSize: 11, color: T.soft, margin: '4px 0 10px' }}>{segInfo(broadcast.message)}</div>
        <label style={formLabel}>{'{{LINK}}'} goes to</label>
        <input value={broadcast.link} onChange={(e) => setBroadcast({ ...broadcast, link: e.target.value })} placeholder="/shop" style={{ ...formInput, width: 280, maxWidth: '100%', marginBottom: 12 }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={busy === 'broadcast' || !data.configured || !data.subscribed}
            onClick={async () => {
              if (!window.confirm(`Text ${data.subscribed} number${data.subscribed === 1 ? '' : 's'} now? This uses at least ${data.subscribed} ResendSMS credits and can't be undone.`)) return;
              const out = await api('broadcast', 'POST', { action: 'broadcast', message: broadcast.message, link: broadcast.link, confirmCount: data.subscribed });
              if (out) { setMsg((m) => ({ ...m, broadcast: `Sent to ${out.sent}.${out.errors?.length ? ` Errors: ${out.errors.join('; ')}` : ''}` })); load(); }
            }}
            style={S.btnFill}
          >
            {busy === 'broadcast' ? 'Sending…' : `Send to ${data.subscribed} opted-in contacts`}
          </button>
          {msg.broadcast && <span style={{ fontSize: 12 }}>{msg.broadcast}</span>}
        </div>
        {data.broadcasts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {data.broadcasts.map((b) => (
              <div key={b.broadcastId} style={{ fontSize: 12, padding: '8px 0', borderBottom: `1px solid ${T.line}` }}>
                <div>{b.message}</div>
                <div style={{ color: T.soft, marginTop: 2 }}>
                  {new Date(b.at).toLocaleString()} · sent {b.sent}/{b.recipients}{b.stats ? ` · ${b.stats.clicks} clicks` : ''}{b.errors?.length ? ` · ${b.errors[0]}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

</>}
      {smsPanel === 'contacts' && <SmsSubscribers onChange={load} />}
      {smsPanel === 'connection' && <Section title="ResendSMS connection"><p className="mw-help">This connection is used by the existing text-sending tools. Delivery status and incoming replies are separate capabilities.</p><div className="mw-sms-status"><strong>Sending configuration</strong><ChannelBadge ready={Boolean(data.configured)} label={data.configured ? 'Configured' : 'Not connected'} /></div><div className="mw-sms-status"><strong>Provider balance</strong><span>{data.balance ? `${data.balance.credits} credits` : 'Unavailable'}</span></div>{data.balanceError && <div className="mw-error" role="alert"><div><strong>The provider could not be reached.</strong><p>{data.balanceError}</p></div></div>}<button type="button" className="mw-secondary" onClick={load}>Check connection again</button></Section>}

    </>
  );
}

// The text list (lib/email/smsStore.js), with each number's consent record.
function SmsSubscribers(props) { return <SmsAudience canManage={true} {...props} />; }

function CheckoutLayoutTest() {
  const [data,setData] = React.useState(null);
  const [error,setError] = React.useState('');
  const [busy,setBusy] = React.useState(false);
  async function load(body) {
    setBusy(true);setError('');
    try {
      const r=await fetch('/api/admin/email/checkout-layout-test',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
      const value=await r.json();if(!r.ok)throw new Error(value.error || 'Could not load test.');setData(value);
    } catch(e){setError(e.message);}finally{setBusy(false);}
  }
  React.useEffect(()=>{load();},[]);
  return <div style={{...stepCard,marginTop:16}}>
    <strong>Abandoned checkout · layout A/B test{data?.test?.enabled?' · running':''}</strong>
    <p>50/50 stable assignment for automatic reminders. A keeps the current layout; B puts the same checkout button before the saved cart with a larger mobile tap area. Subject, copy, cart restoration, eligibility and timing stay the same.</p>
    <p>Judge unique clicked deliveries first; review orders and sample size before choosing a winner. No automatic winner selection.</p>
    {error&&<p role="alert">{error}</p>}
    {data?.test?.enabled ? <>
      <table style={{width:'100%'}}><thead><tr><th>Variant</th><th>Sent</th><th>Clicked</th><th>Click rate</th></tr></thead><tbody>{['a','b'].map(v=><tr key={v}><td>{v.toUpperCase()}</td><td>{data.results?.[v]?.sent || 0}</td><td>{data.results?.[v]?.clickers || 0}</td><td>{data.results?.[v]?.sent?`${data.results[v].clickRate}%`:'—'}</td></tr>)}</tbody></table>
      <button disabled={busy} onClick={()=>load()}>Refresh results</button>
      <button disabled={busy} onClick={()=>window.confirm('End the checkout test and keep A?')&&load({action:'stop',winner:'a'})}>Keep A, end test</button>
      <button disabled={busy} onClick={()=>window.confirm('End the checkout test and use B?')&&load({action:'stop',winner:'b'})}>Use B, end test</button>
    </>:<button disabled={busy||!data} onClick={()=>load({action:'start'})}>Start checkout layout A/B test</button>}
    {data?.previews&&<div>{['a','b'].map(v=><details key={v}><summary>Preview checkout variant {v.toUpperCase()}</summary><iframe title={`Checkout variant ${v.toUpperCase()} preview`} sandbox="" srcDoc={data.previews[v]} style={{width:'100%',maxWidth:600,height:500,border:'1px solid #ddd'}} /></details>)}</div>}
  </div>;
}
