import React from "react";
import Link from "next/link";

const SECTIONS = {
  overview: ["Overview", "Your audience, messages, and next steps."],
  campaigns: [
    "Email campaigns",
    "Create a message, review it, then choose when to send.",
  ],
  automations: [
    "Automations",
    "Helpful messages that reach people at the right moment.",
  ],
  subscribers: [
    "Audience",
    "Find contacts, review their activity, and manage subscriptions.",
  ],
  texts: ["SMS", "Manage text messages, opt-ins, and your sending connection."],
  settings: [
    "Settings",
    "Your sender details, sending connections, and delivery setup.",
  ],
  import: [
    "Import contacts",
    "Bring your existing audience and messages into this workspace.",
  ],
};
const PATHS = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  campaigns: "M3 5h18v14H3zM3 5l9 8 9-8",
  automations: "M13 2L4 14h7l-1 8 10-13h-7z",
  subscribers:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M17 11h6",
  texts:
    "M21 15a3 3 0 0 1-3 3H9l-6 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3zM7 8h10M7 12h7",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  import: "M12 3v12M7 10l5 5 5-5M3 17v4h18v-4",
};
export function MessageIcon({ name = "campaigns", size = 19 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] || PATHS.campaigns} />
    </svg>
  );
}
export function ChannelBadge({ ready, label }) {
  return (
    <span
      className={`mw-badge ${ready === true ? "is-ready" : ready === false ? "is-attention" : ""}`}
    >
      <span aria-hidden="true" />
      {label ||
        (ready === true
          ? "Connected"
          : ready === false
            ? "Needs setup"
            : "Checking…")}
    </span>
  );
}

export default function MessagingWorkspace({
  brand,
  tabs,
  activeTab,
  onNavigate,
  onLogout,
  onCreate,
  errors = {},
  onRetry,
  children,
}) {
  const ordered = [
    "overview",
    "campaigns",
    "automations",
    "texts",
    "subscribers",
    "import",
    "settings",
  ].filter((id) => tabs.some((t) => t.id === id));
  const info = SECTIONS[activeTab] || SECTIONS.overview;
  return (
    <div className="messaging-workspace">
      <a className="mw-skip" href="#messaging-main">
        Skip to content
      </a>
      <header className="mw-topbar">
        <Link href="/admin" className="mw-store">
          <span className="mw-monogram">{brand.slice(0, 1)}</span>
          <strong>{brand}</strong>
          <span className="mw-top-divider" />
          Store admin
        </Link>
        <div className="mw-top-right">
          <span>Email & SMS</span>
          <button type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>
      <div className="mw-shell">
        <aside className="mw-sidebar">
          <p className="mw-eyebrow">MARKETING</p>
          <nav aria-label="Marketing workspace">
            {ordered.map((id) => (
              <button
                key={id}
                type="button"
                aria-current={activeTab === id ? "page" : undefined}
                onClick={() => onNavigate(id)}
              >
                <MessageIcon name={id} />
                <span>{SECTIONS[id][0]}</span>
                {activeTab === id && <span className="mw-nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="mw-sidebar-note">
            <MessageIcon name="texts" />
            <strong>A little more connected.</strong>
            <p>One place for the messages that bring people back.</p>
          </div>
          <Link href="/admin" className="mw-back">
            ← Back to store
          </Link>
        </aside>
        <main id="messaging-main" className="mw-main" tabIndex={-1}>
          <div className="mw-page-heading">
            <div>
              <p className="mw-eyebrow">{brand} / Marketing</p>
              <h1>{info[0]}</h1>
              <p>{info[1]}</p>
            </div>
            {["overview", "campaigns"].includes(activeTab) && (
              <button
                type="button"
                className="mw-primary"
                aria-label="Create email"
                onClick={onCreate}
              >
                <span aria-hidden="true">＋</span> Create email
              </button>
            )}
          </div>
          {Object.keys(errors).length > 0 && (
            <div role="alert" className="mw-error">
              <div>
                <strong>Some information couldn’t load.</strong>
                <p>
                  Your data hasn’t been changed. Check your connection and try
                  again.
                </p>
              </div>
              <div>
                {Object.values(errors).some((error) =>
                  error.includes("session expired"),
                ) && (
                  <Link href="/admin/login" className="mw-secondary">
                    Sign in again
                  </Link>
                )}
                <button type="button" onClick={onRetry}>
                  Try again
                </button>
              </div>
            </div>
          )}
          <div className="mw-content">{children}</div>
        </main>
      </div>
      <WorkspaceStyles />
    </div>
  );
}

export function MessagingOverview({
  subscribers = [],
  campaigns = [],
  automations = [],
  aggregate,
  sendingReady,
  sms,
  smsAvailable,
  loaded = {},
  onNavigate,
  onCreate,
}) {
  const active = subscribers.filter((s) => s.status === "subscribed").length;
  const running = automations.filter((a) => a.enabled).length;
  const emailReady = sendingReady
    ? Boolean(sendingReady.resendKey && sendingReady.cronSecret)
    : loaded.automationsError
      ? false
      : null;
  const smsReady = sms?.error
    ? false
    : sms
      ? Boolean(sms.connection?.canSend)
      : null;
  const sentTotal =
    aggregate?.sent ??
    campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.stats?.sent || 0),
      0,
    );
  const campaignClicks = campaigns.reduce(
    (sum, campaign) => sum + Number(campaign.stats?.clicked || 0),
    0,
  );
  const clickRate =
    aggregate?.clickRate ??
    (sentTotal ? Math.round((campaignClicks / sentTotal) * 1000) / 10 : 0);
  const metrics = [
    [
      "Email subscribers",
      loaded.contacts ? active.toLocaleString() : "—",
      "Currently subscribed",
    ],
    [
      "Emails sent",
      loaded.analytics ? sentTotal.toLocaleString() : "—",
      aggregate ? "Campaigns & automations · all time" : "Campaigns · all time",
    ],
    [
      "Click rate",
      loaded.analytics ? `${clickRate}%` : "—",
      "Clicks as a share of emails sent",
    ],
    [
      "Active automations",
      loaded.automations ? running : "—",
      "Email flows switched on",
    ],
  ];
  return (
    <>
      <div className="mw-metrics">
        {metrics.map(([label, value, note]) => (
          <article key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
            <span>{note}</span>
          </article>
        ))}
      </div>
      <div className="mw-section-title">
        <h2>Your channels</h2>
        <span>Connection & sending status</span>
      </div>
      <div className="mw-channels">
        <article>
          <div className="mw-channel-icon">
            <MessageIcon name="campaigns" size={23} />
          </div>
          <div className="mw-channel-body">
            <div className="mw-channel-title">
              <h3>Email</h3>
              <ChannelBadge
                ready={emailReady}
                label={
                  loaded.automationsError
                    ? "Unavailable"
                    : emailReady === true
                      ? "Configured"
                      : undefined
                }
              />
            </div>
            <p>
              {emailReady === null
                ? "Checking your email sending setup."
                : emailReady
                  ? "Sending service and automation schedule are configured."
                  : "Finish your sending setup before turning on messages."}
            </p>
            <button
              className="mw-text-button"
              type="button"
              onClick={() => onNavigate(emailReady ? "campaigns" : "settings")}
            >
              {emailReady ? "Manage email" : "Review email setup"}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </article>
        <article>
          <div className="mw-channel-icon">
            <MessageIcon name="texts" size={23} />
          </div>
          <div className="mw-channel-body">
            <div className="mw-channel-title">
              <h3>SMS</h3>
              <ChannelBadge
                ready={smsReady}
                label={
                  sms?.error
                    ? "Unavailable"
                    : smsReady === null
                      ? "Checking…"
                      : smsReady
                        ? "Ready to send"
                        : sms?.connection?.connected
                          ? "Sending paused"
                          : "Needs setup"
                }
              />
            </div>
            <p>
              {sms?.error
                ? "The SMS connection could not be checked."
                : !sms
                  ? "Checking the Twilio connection."
                  : smsReady
                    ? `${sms.subscribed || 0} opted-in contacts · Twilio sending enabled.`
                    : sms.connection?.connected
                      ? "Twilio is connected. Sending is paused until launch."
                      : "Connect your new Twilio account to prepare SMS sending."}
            </p>
            <button
              className="mw-text-button"
              type="button"
              onClick={() => onNavigate("texts")}
            >
              Open SMS <span aria-hidden="true">↗</span>
            </button>
          </div>
        </article>
      </div>
      <div className="mw-section-title">
        <h2>What would you like to do?</h2>
      </div>
      <div className="mw-tasks">
        {[
          [
            "campaigns",
            "Send something worth opening",
            "Create an email for your audience.",
            onCreate,
          ],
          [
            "automations",
            "Bring shoppers back",
            "Review checkout recovery and welcome flows.",
            () => onNavigate("automations"),
          ],
          [
            "subscribers",
            "Get to know your audience",
            "Find contacts and see their activity.",
            () => onNavigate("subscribers"),
          ],
        ].map(([id, title, text, action]) => (
          <button key={id} type="button" onClick={action}>
            <MessageIcon name={id} />
            <strong>{title}</strong>
            <span>{text}</span>
            <span className="mw-task-arrow" aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>
      <section className="mw-recent">
        <div className="mw-section-title">
          <h2>Recent campaigns</h2>
          <button
            type="button"
            className="mw-text-button"
            onClick={() => onNavigate("campaigns")}
          >
            View all →
          </button>
        </div>
        {!loaded.campaigns ? (
          <p className="mw-empty">
            {loaded.campaignsError
              ? "Campaigns couldn’t load. Use Try again above."
              : "Loading your campaigns…"}
          </p>
        ) : !campaigns.length ? (
          <div className="mw-empty">
            <MessageIcon size={28} />
            <h3>Your next conversation starts here.</h3>
            <p>
              Create your first email and save it as a draft. You choose when it
              sends.
            </p>
            <button type="button" className="mw-secondary" onClick={onCreate}>
              Create an email
            </button>
          </div>
        ) : (
          <div className="mw-recent-list">
            {campaigns
              .slice()
              .sort(
                (a, b) =>
                  (Number(b.createdAt) || Date.parse(b.createdAt) || 0) -
                  (Number(a.createdAt) || Date.parse(a.createdAt) || 0),
              )
              .slice(0, 4)
              .map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => onNavigate("campaigns")}
                >
                  <span className="mw-campaign-symbol">
                    <MessageIcon />
                  </span>
                  <span>
                    <strong>{c.subject || "Untitled campaign"}</strong>
                    <small>
                      {c.segment === "all"
                        ? "All subscribers"
                        : c.segment || "Email campaign"}
                    </small>
                  </span>
                  <ChannelBadge
                    ready={c.status === "sent" ? true : null}
                    label={
                      c.status === "sent"
                        ? "Sent"
                        : c.status === "scheduled"
                          ? "Scheduled"
                          : "Draft"
                    }
                  />
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
          </div>
        )}
      </section>
    </>
  );
}

export function TwilioConnectionPanel() {
  const [connection, setConnection] = React.useState(null);
  const [error, setError] = React.useState("");
  const load = React.useCallback(async () => {
    setError("");
    try {
      const r = await fetch("/api/admin/sms/connection");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not check Twilio.");
      setConnection(data.connection);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);
  return (
    <section className="mw-recent">
      <div className="mw-section-title">
        <h2>Twilio connection</h2>
        <ChannelBadge
          ready={Boolean(connection?.canSend)}
          label={
            connection?.canSend
              ? "Ready to send"
              : connection?.connected
                ? "Sending paused"
                : "Setup required"
          }
        />
      </div>
      <p className="mw-help">
        Connect the new account and an approved SMS sender. Sending stays paused
        until explicitly enabled; the retired provider is never used as a
        fallback.
      </p>
      {error && (
        <div className="mw-error" role="alert">
          {error}
        </div>
      )}
      {!connection ? (
        <p role="status">Checking connection…</p>
      ) : (
        <>
          <div className="mw-sms-status">
            <span>Account credentials</span>
            <strong>
              {connection.connected
                ? `Connected (${connection.accountType || "account"})`
                : connection.hasAccount && connection.hasToken
                  ? "Could not verify"
                  : "Not connected"}
            </strong>
          </div>
          <div className="mw-sms-status">
            <span>Sending number or Messaging Service</span>
            <strong>{connection.hasSender ? "Configured" : "Needed"}</strong>
          </div>
          <div className="mw-sms-status">
            <span>Sending enabled</span>
            <strong>{connection.enabled ? "Enabled" : "Paused"}</strong>
          </div>
          {connection.error && (
            <div className="mw-error" role="alert">
              {connection.error}
            </div>
          )}
          <p className="mw-help">
            US business messaging requires an approved sender setup. Trial
            accounts can only message verified recipients. Phone-number and
            messaging charges are billed by Twilio.
          </p>
          <details className="mw-disclosure">
            <summary>Connection setup details</summary>
            <div>
              <p className="mw-help">
                Enter credentials securely in this store’s deployment settings.
                Do not put tokens in a customer message or chat.
              </p>
              <ul>
                {[
                  "TWILIO_ACCOUNT_SID",
                  "TWILIO_AUTH_TOKEN",
                  "TWILIO_MESSAGING_SERVICE_SID (or TWILIO_PHONE_NUMBER)",
                  "TWILIO_SMS_ENABLED=false until launch",
                ].map((field) => (
                  <li key={field}>
                    <code>{field}</code>
                  </li>
                ))}
              </ul>
              <p className="mw-help">
                Use a separate Messaging Service or sending number for each
                brand, with Advanced Opt-Out enabled.
              </p>
              <label className="mw-field">
                Incoming messages URL
                <input
                  aria-label="Twilio incoming messages URL"
                  value={connection.inboundUrl || ""}
                  readOnly
                />
              </label>
              <label className="mw-field">
                Delivery status URL
                <input
                  aria-label="Twilio delivery status URL"
                  value={connection.statusUrl || ""}
                  readOnly
                />
              </label>
              <p className="mw-help">
                Configure callbacks as HTTP POST. Incoming requests are verified
                with Twilio signatures.
              </p>
            </div>
          </details>
        </>
      )}
      <button type="button" className="mw-secondary" onClick={load}>
        Check connection
      </button>
    </section>
  );
}
export function SmsSetupPanel({ children }) {
  return (
    <>
      <TwilioConnectionPanel />
      {children}
    </>
  );
}

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function buildSimpleEmail(text, label = "", url = "") {
  if (url && !/^https?:\/\//i.test(url))
    throw new Error("Use a full link beginning with https:// or http://.");
  const body = String(text)
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 18px;line-height:1.7">${escape(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  return `<div style="font-family:Arial,sans-serif;color:#202a25;max-width:560px;margin:0 auto;padding:24px">${body}${label && url ? `<p><a href="${escape(url)}" style="display:inline-block;padding:14px 24px;border-radius:6px;background:#203f34;color:white;text-decoration:none">${escape(label)}</a></p>` : ""}</div>`;
}
export function EmailMessageEditor({ value, onChange }) {
  const [mode, setMode] = React.useState(value ? "html" : "write");
  const [text, setText] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState("");
  const lastGenerated = React.useRef(value);
  React.useEffect(() => {
    if (value !== lastGenerated.current) {
      setMode(value ? "html" : "write");
      setText("");
      setLabel("");
      setUrl("");
      lastGenerated.current = value;
    }
  }, [value]);
  const update = (nextText, nextLabel, nextUrl) => {
    try {
      const html = buildSimpleEmail(nextText, nextLabel, nextUrl);
      lastGenerated.current = html;
      onChange(html);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div className="mw-editor">
      <div className="mw-segmented" role="group" aria-label="Email editor mode">
        <button
          type="button"
          aria-pressed={mode === "write"}
          onClick={() => setMode("write")}
        >
          Write message
        </button>
        <button
          type="button"
          aria-pressed={mode === "html"}
          onClick={() => setMode("html")}
        >
          Edit HTML
        </button>
      </div>
      {mode === "write" ? (
        <>
          <p className="mw-editor-note">
            Write a simple email below. For an existing template, use Edit HTML
            to keep its layout.
          </p>
          <label className="mw-field">
            Your message
            <textarea
              aria-label="Your email message"
              value={text}
              placeholder="Hi there,\n\nWe have something we think you’ll love…"
              onChange={(e) => {
                setText(e.target.value);
                update(e.target.value, label, url);
              }}
              rows={10}
            />
          </label>
          <div className="mw-editor-links">
            <label className="mw-field">
              Button text <span>(optional)</span>
              <input
                value={label}
                placeholder="Shop the collection"
                onChange={(e) => {
                  setLabel(e.target.value);
                  update(text, e.target.value, url);
                }}
              />
            </label>
            <label className="mw-field">
              Button link
              <input
                type="url"
                value={url}
                placeholder="https://yourstore.com/shop"
                onChange={(e) => {
                  setUrl(e.target.value);
                  update(text, label, e.target.value);
                }}
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="mw-field-error">
              {error}
            </p>
          )}
        </>
      ) : (
        <label className="mw-field">
          Email HTML
          <textarea
            aria-label="Email HTML"
            value={value}
            onChange={(e) => {
              lastGenerated.current = e.target.value;
              onChange(e.target.value);
            }}
            rows={14}
            spellCheck={false}
            className="mw-code"
          />
        </label>
      )}
    </div>
  );
}

export function SmsAudience({ canManage = false, onChange }) {
  const [contacts, setContacts] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const load = React.useCallback(async () => {
    setError("");
    try {
      const r = await fetch("/api/admin/email/sms");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not load SMS contacts.");
      setContacts(data.subscribers || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);
  const unsubscribe = async (phone) => {
    if (!window.confirm(`Mark ${phone} as opted out of texts?`)) return;
    setBusy(phone);
    setError("");
    try {
      const r = await fetch("/api/admin/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          phone,
          status: "unsubscribed",
        }),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data.error || "Could not update this contact.");
      await load();
      onChange?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const visible = (contacts || []).filter(
    (c) =>
      (!query ||
        `${c.phone} ${c.email || ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())) &&
      (filter === "all" || c.status === filter),
  );
  return (
    <section className="mw-recent">
      <div className="mw-section-title">
        <h2>SMS contacts{contacts ? ` · ${contacts.length}` : ""}</h2>
        <a className="mw-text-button" href="/api/admin/email/sms?format=csv">
          Export CSV ↗
        </a>
      </div>
      <p className="mw-help">
        Phone numbers, subscription status, and the date consent was recorded.
      </p>
      <div className="mw-audience-toolbar">
        <input
          aria-label="Search SMS contacts"
          placeholder="Search phone or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filter SMS contacts by status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All contacts</option>
          <option value="subscribed">Subscribed</option>
          <option value="unsubscribed">Opted out</option>
        </select>
      </div>
      {error && (
        <div className="mw-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={load}>
            Try again
          </button>
        </div>
      )}
      {!contacts && !error ? (
        <p className="mw-help" role="status">
          Loading SMS contacts…
        </p>
      ) : (
        <div className="table-scroll">
          <table className="mw-audience-table">
            <thead>
              <tr>
                <th>Phone number</th>
                <th>Email</th>
                <th>Consent recorded</th>
                <th>Status</th>
                {canManage && (
                  <th>
                    <span className="mw-sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.phone}>
                  <td>{c.phone}</td>
                  <td>{c.email || "—"}</td>
                  <td>
                    {c.consentAt
                      ? new Date(c.consentAt).toLocaleDateString()
                      : "Not recorded"}
                  </td>
                  <td>
                    <ChannelBadge
                      ready={c.status === "subscribed" && Boolean(c.consentAt)}
                      label={
                        c.status === "unsubscribed"
                          ? "Opted out"
                          : c.consentAt
                            ? "Subscribed"
                            : "No consent record"
                      }
                    />
                  </td>
                  {canManage && (
                    <td>
                      {c.status === "subscribed" && (
                        <button
                          type="button"
                          className="mw-text-button"
                          disabled={busy === c.phone}
                          onClick={() => unsubscribe(c.phone)}
                        >
                          {busy === c.phone ? "Updating…" : "Mark opted out"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && contacts && (
            <div className="mw-empty">
              {query || filter !== "all"
                ? "No contacts match these filters."
                : "No SMS opt-ins yet. Contacts will appear here when shoppers subscribe."}
            </div>
          )}
        </div>
      )}
      {visible.length > 0 && (
        <p className="mw-help">
          Showing {visible.length} of {contacts.length} contacts
        </p>
      )}
    </section>
  );
}

function WorkspaceStyles() {
  return (
    <style jsx global>{`
      .messaging-workspace {
        --mw-ink: #223c32;
        --mw-muted: #727b74;
        --mw-line: #e3e7e0;
        --mw-green: #244d3d;
        color: #27372e;
        background: #f6f7f3;
        min-height: 100vh;
        font-family:
          "DM Sans",
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
        font-size: 14px;
        line-height: 1.5;
      }
      .messaging-workspace * {
        box-sizing: border-box;
      }
      .messaging-workspace button,
      .messaging-workspace input,
      .messaging-workspace select,
      .messaging-workspace textarea {
        font-family: inherit;
      }
      .messaging-workspace button {
        cursor: pointer;
      }
      .messaging-workspace button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
      .messaging-workspace
        :is(button, a, input, textarea, select, summary):focus-visible {
        outline: 3px solid #85ac95 !important;
        outline-offset: 3px;
      }
      .mw-topbar {
        height: 76px;
        border-bottom: 1px solid var(--mw-line);
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 34px;
        gap: 18px;
      }
      .mw-store {
        display: flex;
        align-items: center;
        gap: 12px;
        text-decoration: none;
        color: #7a827c;
        font-size: 12px;
      }
      .mw-store strong {
        color: var(--mw-ink);
        font-size: 16px;
        letter-spacing: -0.4px;
      }
      .mw-monogram {
        background: #244d3d;
        color: white;
        width: 31px;
        height: 31px;
        display: grid;
        place-items: center;
        border-radius: 9px;
        font-family: Georgia, serif;
        font-size: 21px;
      }
      .mw-top-divider {
        height: 16px;
        width: 1px;
        background: var(--mw-line);
        margin: 0 5px;
      }
      .mw-top-right {
        display: flex;
        align-items: center;
        gap: 24px;
        color: #798179;
        font-size: 12px;
      }
      .mw-top-right button {
        border: 1px solid var(--mw-line);
        background: white;
        border-radius: 7px;
        padding: 7px 12px;
        color: #556358;
      }
      .mw-shell {
        display: grid;
        grid-template-columns: 216px minmax(0, 1fr);
        max-width: 1512px;
        margin: auto;
        min-height: calc(100vh - 76px);
      }
      .mw-sidebar {
        padding: 32px 18px;
        border-right: 1px solid var(--mw-line);
        position: sticky;
        top: 0;
        align-self: start;
        min-height: calc(100vh - 76px);
      }
      .mw-eyebrow {
        font-size: 10px !important;
        letter-spacing: 1.35px;
        text-transform: uppercase;
        color: #7b877c !important;
        font-weight: 600;
        margin: 0 0 16px !important;
      }
      .mw-sidebar > .mw-eyebrow {
        padding: 0 13px;
      }
      .mw-sidebar nav {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .mw-sidebar nav button {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        text-align: left;
        padding: 11px 13px;
        font-size: 13px;
        font-weight: 500;
        border: 0;
        border-radius: 7px;
        background: none;
        color: #687268;
      }
      .mw-sidebar nav button:hover {
        background: #ecefe8;
      }
      .mw-sidebar nav button[aria-current="page"] {
        background: #e4ebe1;
        color: #244d3d;
        font-weight: 700;
      }
      .mw-nav-dot {
        margin-left: auto;
        border-radius: 50%;
        width: 5px;
        height: 5px;
        background: #547c5b;
      }
      .mw-sidebar-note {
        margin: 52px 12px 28px;
        padding-top: 22px;
        border-top: 1px solid var(--mw-line);
        font-size: 12px;
        color: #8b948a;
      }
      .mw-sidebar-note strong {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: #59695c;
        margin-top: 10px;
      }
      .mw-sidebar-note p {
        font-size: 11px;
        line-height: 1.7;
      }
      .mw-back {
        font-size: 12px;
        color: #6d786e;
        text-decoration: none;
        margin: 0 12px;
      }
      .mw-main {
        min-width: 0;
        padding: 38px 44px 80px;
        max-width: 1280px;
        outline: none;
      }
      .mw-page-heading {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 20px;
        margin-bottom: 28px;
      }
      .mw-page-heading h1 {
        font-family: inherit;
        font-size: 32px;
        letter-spacing: -1.15px;
        font-weight: 600;
        line-height: 1.2;
        color: var(--mw-ink);
        margin: 0 0 9px;
      }
      .mw-page-heading p {
        font-size: 13px;
        color: #7a847a;
        margin: 0;
      }
      .mw-page-heading .mw-eyebrow {
        margin-bottom: 12px !important;
      }
      .mw-primary,
      .mw-secondary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        white-space: nowrap;
        padding: 11px 17px;
        border: 1px solid #244d3d;
        border-radius: 7px;
        background: #244d3d;
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        min-height: 40px;
      }
      .mw-secondary {
        background: white;
        color: #244d3d;
        border-color: #d6dfd5;
      }
      .mw-primary:hover {
        background: #173c2c;
      }
      .mw-primary span {
        font-size: 18px;
        font-weight: 400;
      }
      .mw-metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 34px;
      }
      .mw-metrics article {
        background: #fff;
        border: 1px solid var(--mw-line);
        border-radius: 10px;
        padding: 19px 20px;
        min-height: 128px;
      }
      .mw-metrics p {
        font-size: 11px;
        color: #718073;
        margin: 0 0 9px;
      }
      .mw-metrics strong {
        display: block;
        font-size: 29px;
        font-weight: 500;
        letter-spacing: -0.8px;
        color: #244737;
        line-height: 1.2;
      }
      .mw-metrics span {
        font-size: 10px;
        color: #8a9388;
        display: block;
        margin-top: 10px;
      }
      .mw-section-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .mw-section-title h2 {
        font-size: 15px;
        font-weight: 600;
        color: var(--mw-ink);
        margin: 0;
        letter-spacing: -0.2px;
      }
      .mw-section-title > span {
        font-size: 11px;
        color: #929b90;
      }
      .mw-channels {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 31px;
      }
      .mw-channels > article {
        display: flex;
        gap: 15px;
        border: 1px solid var(--mw-line);
        border-radius: 10px;
        background: white;
        padding: 23px;
      }
      .mw-channel-icon {
        display: grid;
        place-items: center;
        border: 1px solid #e0e8dc;
        border-radius: 11px;
        background: #f0f4eb;
        color: #5d7b51;
        width: 45px;
        height: 45px;
        flex: 0 0 45px;
      }
      .mw-channel-body {
        flex: 1;
        min-width: 0;
      }
      .mw-channel-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .mw-channel-title h3 {
        font-size: 15px;
        margin: 0;
        font-weight: 600;
      }
      .mw-channel-body p {
        font-size: 12px;
        color: #808a7e;
        line-height: 1.7;
        margin: 10px 0 15px;
        min-height: 40px;
      }
      .mw-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
        font-size: 10px;
        font-weight: 500;
        border-radius: 20px;
        padding: 4px 9px;
        background: #f0f1ee;
        color: #727b70;
      }
      .mw-badge > span {
        height: 4px;
        width: 4px;
        border-radius: 50%;
        background: currentColor;
      }
      .mw-badge.is-ready {
        background: #edf3e9;
        color: #507240;
      }
      .mw-badge.is-attention {
        background: #faf1e3;
        color: #987336;
      }
      .mw-text-button {
        background: none;
        border: 0;
        padding: 0;
        color: #466345;
        font-weight: 600;
        font-size: 11px;
        text-align: left;
      }
      .mw-text-button span {
        margin-left: 8px;
      }
      .mw-tasks {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 32px;
      }
      .mw-tasks button {
        border: 1px solid #dce3d5;
        border-radius: 10px;
        background: #eef2e8;
        color: #5c7751;
        padding: 19px;
        text-align: left;
        position: relative;
        transition: background 0.15s;
      }
      .mw-tasks button:hover {
        background: #e3eadb;
      }
      .mw-tasks strong {
        display: block;
        font-size: 12px;
        color: #385235;
        font-weight: 600;
        margin: 14px 0 6px;
      }
      .mw-tasks button > span:not(.mw-task-arrow) {
        display: block;
        font-size: 11px;
        line-height: 1.7;
        color: #7b8974;
        max-width: 95%;
      }
      .mw-task-arrow {
        position: absolute;
        right: 18px;
        top: 18px;
        font-size: 16px;
      }
      .mw-recent {
        background: #fff;
        border: 1px solid var(--mw-line);
        border-radius: 10px;
        padding: 22px;
        margin-bottom: 20px;
      }
      .mw-empty {
        text-align: center;
        padding: 26px 12px;
        color: #8a9587;
        font-size: 12px;
      }
      .mw-empty > svg {
        color: #96aa8f;
      }
      .mw-empty h3 {
        font-size: 14px;
        color: #50624c;
        font-weight: 500;
      }
      .mw-empty p {
        font-size: 12px;
        margin-bottom: 20px;
      }
      .mw-recent-list > button {
        display: flex;
        align-items: center;
        gap: 14px;
        text-align: left;
        width: 100%;
        background: none;
        border: 0;
        border-top: 1px solid #edf0e9;
        padding: 15px 0;
        color: #697a63;
      }
      .mw-recent-list > button > span:nth-child(2) {
        flex: 1;
        min-width: 0;
      }
      .mw-recent-list strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: #3f5140;
        font-weight: 500;
      }
      .mw-recent-list small {
        display: block;
        margin-top: 4px;
        font-size: 10px;
        color: #939c8e;
      }
      .mw-campaign-symbol {
        width: 34px;
        height: 34px;
        background: #f5f6f0;
        border-radius: 7px;
        display: grid;
        place-items: center;
        color: #8c9b7f;
      }
      .mw-disclosure {
        border: 1px solid var(--mw-line);
        border-radius: 10px;
        background: white;
        margin-bottom: 20px;
        overflow: hidden;
      }
      .mw-disclosure-button {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        border: 0;
        background: white;
        text-align: left;
        padding: 17px 22px;
        font-size: 13px;
        font-weight: 500;
        color: #4e624a;
        cursor: pointer;
      }
      .mw-disclosure > summary {
        padding: 17px 22px;
        font-size: 13px;
        font-weight: 500;
        color: #4e624a;
        cursor: pointer;
      }
      .mw-disclosure > div {
        padding: 0 20px 20px;
      }
      .mw-content .admin-section {
        border: 1px solid var(--mw-line) !important;
        border-radius: 10px !important;
        box-shadow: none !important;
        margin-bottom: 20px !important;
        background: white !important;
        padding: 22px !important;
      }
      .mw-content .admin-section h2 {
        font-size: 16px !important;
        letter-spacing: -0.25px !important;
      }
      .mw-content .admin-section input:not([type="checkbox"]),
      .mw-content .admin-section select,
      .mw-content .admin-section textarea {
        border: 1px solid #dce2d5 !important;
        border-radius: 6px !important;
        box-shadow: none !important;
        background: #fff !important;
        max-width: 100%;
        font-size: 13px !important;
      }
      .mw-content .admin-section button {
        border-radius: 6px !important;
      }
      .mw-content .pill-nav button {
        border-radius: 6px !important;
      }
      .mw-content .table-scroll {
        overflow: auto;
      }
      .mw-error {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        padding: 15px 20px;
        border: 1px solid #ead9b8;
        background: #fffaed;
        border-radius: 9px;
        margin-bottom: 22px;
        font-size: 12px;
        color: #826329;
      }
      .mw-error p {
        margin: 4px 0 0;
      }
      .mw-error button {
        border: 1px solid #dac59d;
        border-radius: 5px;
        background: white;
        padding: 8px 12px;
        color: #826329;
        white-space: nowrap;
      }
      .mw-setup-panel {
        background: white;
        display: flex;
        gap: 22px;
        padding: 28px;
        border-radius: 10px;
        border: 1px solid var(--mw-line);
        margin-bottom: 22px;
      }
      .mw-setup-panel h2 {
        font-size: 22px;
        font-weight: 500;
        letter-spacing: -0.5px;
        margin: 12px 0;
      }
      .mw-setup-panel p {
        color: #788771;
        font-size: 13px;
        max-width: 540px;
      }
      .mw-muted {
        font-size: 12px !important;
        color: #97a08f !important;
      }
      .mw-segmented {
        display: flex;
        gap: 4px;
        padding: 4px;
        background: #f0f3ec;
        border-radius: 7px;
        width: fit-content;
        margin-bottom: 14px;
      }
      .mw-segmented button {
        background: none;
        border: 0;
        padding: 7px 13px;
        font-size: 12px;
        color: #7a8772;
        border-radius: 5px;
      }
      .mw-segmented button[aria-pressed="true"] {
        background: #fff;
        color: #35572e;
        box-shadow: 0 1px 3px #28401c12;
      }
      .mw-editor-note {
        font-size: 11px;
        color: #8a9481;
        line-height: 1.6;
      }
      .mw-field {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 12px;
        color: #6a795f;
        margin-bottom: 14px;
      }
      .mw-field > span {
        color: #929c87;
      }
      .mw-field input,
      .mw-field textarea {
        width: 100%;
        padding: 12px;
        line-height: 1.7;
        border: 1px solid var(--mw-line);
        border-radius: 6px;
      }
      .mw-editor-links {
        display: grid;
        grid-template-columns: 1fr 1.5fr;
        gap: 14px;
      }
      .mw-code {
        font-family: ui-monospace, monospace !important;
        font-size: 12px !important;
      }
      .mw-field-error {
        color: #a23e2b;
        font-size: 12px;
      }
      .mw-skip {
        position: absolute;
        left: 20px;
        top: -100px;
        background: white;
        padding: 12px;
        z-index: 10;
      }
      .mw-skip:focus {
        top: 10px;
      }
      .mw-sms-tabs {
        margin-bottom: 20px;
      }
      .mw-sms-status {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 20px;
      }
      .mw-sms-status h2 {
        font-size: 18px;
        margin: 0;
      }
      .mw-help {
        font-size: 12px;
        color: #7c8675;
        margin: 8px 0 20px;
      }
      .mw-audience-toolbar {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin: 18px 0;
      }
      .mw-audience-toolbar input,
      .mw-audience-toolbar select {
        padding: 10px 13px;
        border: 1px solid var(--mw-line);
        border-radius: 6px;
        background: white;
        font-size: 12px;
        color: #576951;
        max-width: 100%;
      }
      .mw-audience-toolbar input {
        flex: 1;
        min-width: 160px;
      }
      .mw-audience-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        text-align: left;
        min-width: 560px;
      }
      .mw-audience-table th {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        font-weight: 500;
        color: #909b88;
        padding: 12px 10px;
        border-bottom: 1px solid var(--mw-line);
      }
      .mw-audience-table td {
        padding: 15px 10px;
        border-bottom: 1px solid #edf0e8;
        color: #607155;
      }
      .mw-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
      }
      .mw-content .admin-section > div:first-child > p {
        font-size: 16px !important;
      }
      .mw-sms-tabs {
        overflow-x: auto;
        max-width: 100%;
      }
      .mw-sms-tabs button {
        white-space: nowrap;
      }
      @media (min-width: 1600px) {
        .mw-main {
          padding-left: 56px;
          padding-right: 56px;
        }
      }
      @media (max-width: 1120px) {
        .mw-main {
          padding: 30px 24px 60px;
        }
        .mw-shell {
          grid-template-columns: 190px minmax(0, 1fr);
        }
        .mw-channel-title {
          align-items: flex-start;
          flex-direction: column;
        }
        .mw-metrics {
          gap: 10px;
        }
        .mw-metrics article {
          padding: 16px 13px;
        }
        .mw-tasks {
          gap: 10px;
        }
        .mw-tasks button {
          padding: 16px;
        }
      }
      @media (max-width: 760px) {
        .mw-topbar {
          height: 62px;
          padding: 0 18px;
        }
        .mw-top-divider,
        .mw-store > strong ~ span,
        .mw-top-right > span {
          display: none;
        }
        .mw-store {
          font-size: 0;
        }
        .mw-store strong {
          font-size: 14px;
        }
        .mw-top-right {
          gap: 0;
        }
        .mw-shell {
          display: block;
        }
        .mw-sidebar {
          position: static;
          min-height: 0;
          border-right: 0;
          border-bottom: 1px solid var(--mw-line);
          padding: 12px;
        }
        .mw-sidebar > .mw-eyebrow,
        .mw-sidebar-note,
        .mw-back {
          display: none;
        }
        .mw-sidebar nav {
          flex-direction: row;
          overflow-x: auto;
          gap: 5px;
        }
        .mw-sidebar nav button {
          flex: 0 0 auto;
          width: auto;
          padding: 10px;
          font-size: 12px;
          white-space: nowrap;
          gap: 7px;
        }
        .mw-nav-dot {
          display: none;
        }
        .mw-main {
          padding: 26px 18px 60px;
        }
        .mw-page-heading {
          gap: 12px;
          align-items: flex-start;
        }
        .mw-page-heading h1 {
          font-size: 27px;
        }
        .mw-page-heading > div > p:last-child {
          max-width: 240px;
          line-height: 1.7;
        }
        .mw-page-heading .mw-primary {
          font-size: 0;
          padding: 7px 11px;
          min-height: 36px;
        }
        .mw-page-heading .mw-primary span {
          font-size: 20px;
        }
        .mw-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 25px;
        }
        .mw-metrics article {
          padding: 17px;
          min-height: 120px;
        }
        .mw-channels {
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .mw-channel-title {
          flex-direction: row;
          align-items: center;
        }
        .mw-tasks {
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .mw-tasks button {
          padding: 17px 18px 17px 55px;
        }
        .mw-tasks button > svg {
          position: absolute;
          left: 19px;
          top: 21px;
        }
        .mw-tasks strong {
          margin: 0 0 5px;
        }
        .mw-task-arrow {
          top: 22px;
        }
        .mw-section-title > span {
          display: none;
        }
        .mw-content .admin-section {
          padding: 17px !important;
        }
        .mw-editor-links {
          grid-template-columns: 1fr;
        }
        .mw-content .col-html,
        .mw-content .col-preview {
          min-width: 0 !important;
          flex-basis: 100% !important;
        }
        .mw-content .flow-layout {
          flex-direction: column !important;
        }
        .mw-content .flow-nav {
          width: auto !important;
        }
        .mw-error {
          align-items: flex-start;
        }
        .mw-setup-panel {
          padding: 20px;
          gap: 14px;
        }
        .mw-setup-panel h2 {
          font-size: 20px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .messaging-workspace * {
          transition: none !important;
        }
      }
    `}</style>
  );
}
