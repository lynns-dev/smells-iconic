// Admin Inbox tab: messages sent through the Contact page
// (pages/contact.jsx → pages/api/contact.js), shown as chat conversations —
// everything from one email address is one thread, their messages on the
// left and our replies on the right. A reply is emailed to them from
// hello@smellsiconic.com and kept in the thread (pages/api/admin/inbox.js).
// The list can be searched and filtered by status and kind.

import React from 'react';
import { T, S } from '../lib/theme';

const STATUS_FILTERS = [
  ['new', 'New'],
  ['answered', 'Answered'],
  ['archived', 'Archived'],
  ['all', 'All'],
];
const TYPE_FILTERS = [
  ['all', 'Messages + votes'],
  ['message', 'Messages only'],
  ['vote', 'Bring it back votes'],
];
const EMPTY_TEXT = 'Nothing here yet. Messages from the Contact page (smellsiconic.com/contact) show up here.';

// Small label above one of their messages, if it needs one.
function entryTag(e) {
  if (e.type === 'vote') return 'Bring it back vote';
  if (e.orderNumber) return `Order ${e.orderNumber}`;
  return null;
}

const when = (t) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const time = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const day = (t) => new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const entryAt = (e) => e.updatedAt || e.createdAt;

// Entries grouped into conversations: by email address, or one per entry
// when there's no email (votes, anonymous messages). Newest activity first.
function buildThreads(entries) {
  const byKey = new Map();
  for (const e of entries) {
    const key = e.email ? `email:${e.email.toLowerCase()}` : `entry:${e.id}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(e);
  }
  return [...byKey.entries()].map(([key, list]) => {
    const sorted = list.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const messages = sorted.flatMap((e) => [
      { id: e.id, from: 'them', text: e.text, at: entryAt(e), entry: e },
      ...(e.replies || []).map((r) => ({ id: r.id, from: 'us', text: r.text, at: r.at })),
    ]).sort((a, b) => new Date(a.at) - new Date(b.at));
    const last = messages[messages.length - 1];
    const statuses = sorted.map((e) => e.status);
    const status = statuses.includes('new') ? 'new' : statuses.includes('answered') ? 'answered' : 'archived';
    const named = sorted.slice().reverse().find((e) => e.name);
    return {
      key,
      entries: sorted,
      messages,
      last,
      status,
      newCount: statuses.filter((s) => s === 'new').length,
      name: named?.name || '',
      email: sorted.find((e) => e.email)?.email || '',
      title: named?.name || sorted.find((e) => e.email)?.email || (sorted[0].type === 'vote' ? 'Bring it back' : 'Anonymous'),
      // Replies go to their latest message, which the email quotes.
      replyTo: sorted.slice().reverse().find((e) => e.email) || null,
    };
  }).sort((a, b) => new Date(b.last.at) - new Date(a.last.at));
}

function threadText(t) {
  return [t.name, t.email, ...t.entries.flatMap((e) => [e.text, e.orderNumber, e.name]), ...t.messages.map((m) => m.text)]
    .filter(Boolean).join(' ').toLowerCase();
}

export default function AdminInbox({ onCount }) {
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [filter, setFilter] = React.useState('new');
  const [type, setType] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [openKey, setOpenKey] = React.useState(null);
  // Replying marks a conversation answered; keep it in the list (under the
  // New filter too) so the sent reply stays on screen, until the filter changes.
  const [justReplied, setJustReplied] = React.useState([]);
  React.useEffect(() => { setJustReplied([]); }, [filter, type]);

  const load = React.useCallback(() => {
    setLoading(true);
    setError('');
    fetch('/api/admin/inbox')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setEntries(data.entries || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    if (onCount) onCount(entries.filter((e) => e.status === 'new').length);
  }, [entries, onCount]);

  const merge = (updated) => {
    const byId = new Map(updated.map((e) => [e.id, e]));
    setEntries((prev) => prev.map((e) => byId.get(e.id) || e));
  };

  const threads = React.useMemo(() => buildThreads(entries), [entries]);
  const visible = React.useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return threads.filter((t) => {
      if (words.length) {
        // A search looks through every status, so an old conversation can always be found.
        const text = threadText(t);
        if (!words.every((w) => text.includes(w))) return false;
      } else if (filter !== 'all' && t.status !== filter && !justReplied.includes(t.key)) {
        return false;
      }
      return type === 'all' || t.entries.some((e) => (e.type || 'message') === type);
    });
  }, [threads, filter, type, query, justReplied]);
  const open = threads.find((t) => t.key === openKey) || null;

  const setStatus = async (thread, status) => {
    const res = await fetch('/api/admin/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: thread.entries.map((e) => e.id), status }),
    });
    const data = await res.json();
    if (res.ok) merge(data.entries || []);
  };

  const remove = async (thread) => {
    if (!confirm(`Delete this whole conversation (${thread.messages.length} message${thread.messages.length === 1 ? '' : 's'}) permanently?`)) return;
    const ids = thread.entries.map((e) => e.id);
    const res = await fetch('/api/admin/inbox', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => !ids.includes(e.id)));
      setOpenKey(null);
    }
  };

  const replied = (thread, updated) => {
    merge(updated);
    setJustReplied((prev) => [...prev, thread.key]);
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <p style={{ ...S.label, margin: 0 }}>Messages</p>
        <button onClick={load} style={smallBtn}>Refresh</button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, order #, words…"
          aria-label="Search messages"
          style={{ flex: '1 1 220px', height: 34, padding: '0 10px', fontSize: 13, border: `1px solid ${T.line}`, background: T.white, color: T.ink, boxSizing: 'border-box' }}
        />
        {STATUS_FILTERS.map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} disabled={Boolean(query.trim())}
            style={{ ...chip, ...(filter === key && !query.trim() ? chipActive : {}), opacity: query.trim() ? 0.5 : 1 }}>{label}</button>
        ))}
        <select value={type} onChange={(e) => setType(e.target.value)} style={select} aria-label="Kind of message">
          {TYPE_FILTERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>

      {error && <p style={{ fontSize: 13, color: '#a13d2b' }}>{error}</p>}

      <div className={`inbox-shell${open ? ' has-open' : ''}`}>
        <div className="inbox-list">
          {loading && !entries.length && <p style={{ fontSize: 13, color: T.soft, padding: 14 }}>Loading…</p>}
          {!loading && visible.length === 0 && (
            <p style={{ fontSize: 13, color: T.soft, padding: 14 }}>{query.trim() ? 'No conversations match that search.' : EMPTY_TEXT}</p>
          )}
          {visible.map((t) => (
            <button key={t.key} onClick={() => setOpenKey(t.key)} className="inbox-item"
              style={{ background: t.key === openKey ? T.paper : 'transparent' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontWeight: t.newCount ? 700 : 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.newCount > 0 && <span style={dot} aria-label="New" />}{t.title}
                </span>
                <span style={{ fontSize: 11, color: T.soft, whiteSpace: 'nowrap' }}>{when(t.last.at)}</span>
              </span>
              <span style={{ display: 'block', fontSize: 13, color: T.soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>
                {t.last.from === 'us' ? 'You: ' : ''}{t.last.text}
              </span>
              {(t.status === 'archived' || t.messages.length > 1) && (
                <span style={{ display: 'block', fontSize: 11, color: T.soft, marginTop: 3 }}>
                  {t.messages.length > 1 ? `${t.messages.length} messages` : ''}{t.status === 'archived' ? `${t.messages.length > 1 ? ' · ' : ''}Archived` : ''}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="inbox-chat">
          {open ? (
            <Conversation
              key={open.key}
              thread={open}
              onBack={() => setOpenKey(null)}
              onStatus={(status) => setStatus(open, status)}
              onDelete={() => remove(open)}
              onReplied={(updated) => replied(open, updated)}
            />
          ) : (
            <div style={{ margin: 'auto', fontSize: 13, color: T.soft, padding: 24, textAlign: 'center' }}>
              {visible.length ? 'Pick a conversation on the left.' : ''}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .inbox-shell { display: flex; border: 1px solid ${T.line}; height: min(72vh, 720px); min-height: 420px; }
        .inbox-list { width: 300px; flex-shrink: 0; overflow-y: auto; border-right: 1px solid ${T.line}; }
        .inbox-chat { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .inbox-item { display: block; width: 100%; text-align: left; padding: 12px 14px; border: none; border-bottom: 1px solid ${T.line}; cursor: pointer; color: ${T.ink}; font-family: inherit; }
        .inbox-item:hover { background: ${T.paper} !important; }
        @media (max-width: 760px) {
          .inbox-shell { height: 75vh; }
          .inbox-list { width: 100%; border-right: none; }
          .inbox-chat { display: none; }
          .has-open .inbox-list { display: none; }
          .has-open .inbox-chat { display: flex; }
        }
      `}</style>
    </div>
  );
}

// One conversation: header with who it is and actions, the scrolling
// bubble history, and the reply box at the bottom.
function Conversation({ thread, onBack, onStatus, onDelete, onReplied }) {
  const scroller = React.useRef(null);
  React.useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [thread.messages.length]);

  let lastDay = null;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
        <button onClick={onBack} className="inbox-back" style={{ ...smallBtn, padding: '6px 10px' }} aria-label="Back to conversations">←</button>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{thread.title}</div>
          <div style={{ fontSize: 12, color: T.soft }}>
            {thread.email
              ? <a href={`mailto:${thread.email}`} style={{ textDecoration: 'underline', color: T.ink }}>{thread.email}</a>
              : thread.entries[0].type === 'vote' ? 'Votes from the shop' : 'No email — can’t reply'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {thread.status !== 'answered' && <button onClick={() => onStatus('answered')} style={smallBtn}>Mark answered</button>}
          {thread.status !== 'archived' && <button onClick={() => onStatus('archived')} style={smallBtn}>Archive</button>}
          {thread.status !== 'new' && <button onClick={() => onStatus('new')} style={smallBtn}>Move to new</button>}
          <button onClick={onDelete} style={{ ...smallBtn, color: '#a13d2b' }}>Delete</button>
        </div>
      </div>

      <div ref={scroller} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', background: T.white }}>
        {thread.messages.map((m) => {
          const d = day(m.at);
          const showDay = d !== lastDay;
          lastDay = d;
          const mine = m.from === 'us';
          const tag = m.entry && entryTag(m.entry);
          return (
            <React.Fragment key={m.id}>
              {showDay && <div style={{ textAlign: 'center', fontSize: 11, color: T.soft, margin: '10px 0 12px' }}>{d}</div>}
              <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                <div style={{ maxWidth: '78%' }}>
                  <div style={mine ? bubbleUs : bubbleThem}>
                    {tag && <div style={{ ...tagStyle, color: mine ? T.white : T.soft }}>{tag}</div>}
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                  </div>
                  <div style={{ fontSize: 11, color: T.soft, marginTop: 3, textAlign: mine ? 'right' : 'left' }}>
                    {mine ? 'You · ' : m.entry?.status === 'new' ? 'New · ' : ''}{time(m.at)}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {thread.replyTo ? <Composer entry={thread.replyTo} onReplied={onReplied} /> : null}
      <style jsx>{`
        .inbox-back { display: none; }
        @media (max-width: 760px) { .inbox-back { display: inline-block; } }
      `}</style>
    </>
  );
}

// Reply box under a conversation: emails the reply to them (quoting their
// latest message) and adds it to the thread. The draft stays put if
// sending fails. Ctrl/⌘+Enter sends.
function Composer({ entry, onReplied }) {
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/admin/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, reply: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The reply didn’t send.');
      onReplied(data.entries || [data.entry]);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ borderTop: `1px solid ${T.line}`, padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); send(); } }}
          placeholder={`Reply to ${entry.name || entry.email}…`}
          rows={2}
          style={{ flex: 1, boxSizing: 'border-box', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', border: `1px solid ${T.line}`, borderRadius: 18, resize: 'vertical', minHeight: 44, maxHeight: 220, background: T.white, color: T.ink }}
        />
        <button onClick={send} disabled={sending || !text.trim()}
          style={{ ...smallBtn, background: T.ink, color: T.white, borderColor: T.ink, borderRadius: 18, height: 40, padding: '0 16px', opacity: sending || !text.trim() ? 0.5 : 1 }}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: '#a13d2b', marginTop: 6 }}>{error}</div>}
      <p style={{ fontSize: 11, color: T.soft, margin: '6px 0 0' }}>Emailed to {entry.email} with “Hi (first name),” on top and their latest message quoted underneath. Ctrl/⌘+Enter to send.</p>
    </div>
  );
}

const card = { background: T.white, border: `1px solid ${T.line}`, padding: 24, marginBottom: 24 };
const bubbleBase = { padding: '10px 14px', fontSize: 14, lineHeight: 1.5, borderRadius: 18 };
const bubbleThem = { ...bubbleBase, background: T.paper, color: T.ink, borderBottomLeftRadius: 4 };
const bubbleUs = { ...bubbleBase, background: T.ink, color: T.white, borderBottomRightRadius: 4 };
const tagStyle = { fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 };
const dot = { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#c0392b', marginRight: 6, verticalAlign: 'middle' };
const chip = { fontSize: 12, padding: '6px 12px', border: `1px solid ${T.line}`, background: T.white, cursor: 'pointer', color: T.ink };
const chipActive = { background: T.ink, color: T.white, borderColor: T.ink };
const select = { fontSize: 12, padding: '6px 8px', border: `1px solid ${T.line}`, background: T.white, color: T.ink, height: 34 };
const smallBtn = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '7px 12px', border: `1px solid ${T.line}`, background: 'none', cursor: 'pointer', color: T.ink };
