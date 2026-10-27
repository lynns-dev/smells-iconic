// Admin Inbox tab: messages sent through the Contact page
// (pages/contact.jsx → pages/api/contact.js). Each one can be answered
// right here — the reply is emailed to them from hello@smellsiconic.com
// and kept under their message (pages/api/admin/inbox.js).

import React from 'react';
import { T, S } from '../lib/theme';

const FILTERS = [
  ['new', 'New'],
  ['answered', 'Answered'],
  ['archived', 'Archived'],
  ['all', 'All'],
];

export default function AdminInbox({ onCount }) {
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [filter, setFilter] = React.useState('new');
  // Replying marks a message answered; keep it on screen (under the New
  // filter too) so the sent reply is visible, until the filter changes.
  const [justReplied, setJustReplied] = React.useState([]);
  React.useEffect(() => { setJustReplied([]); }, [filter]);

  const load = React.useCallback(() => {
    setLoading(true);
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

  const setStatus = async (id, status) => {
    const res = await fetch('/api/admin/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    const data = await res.json();
    if (res.ok) setEntries((prev) => prev.map((e) => (e.id === id ? data.entry : e)));
  };

  const replied = (entry) => {
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
    setJustReplied((prev) => [...prev, entry.id]);
  };

  const remove = async (id) => {
    if (!confirm('Delete this permanently?')) return;
    const res = await fetch('/api/admin/inbox', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const visible = entries.filter((e) => filter === 'all' || e.status === filter || justReplied.includes(e.id));

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <p style={{ ...S.label, margin: 0 }}>Messages</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{ ...chip, ...(filter === key ? chipActive : {}) }}>{label}</button>
          ))}
        </div>
      </div>

      {loading && <p style={{ fontSize: 13, color: T.soft }}>Loading…</p>}
      {error && <p style={{ fontSize: 13, color: '#a13d2b' }}>{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <p style={{ fontSize: 13, color: T.soft }}>Nothing here yet. Messages from the Contact page (smellsiconic.com/contact) show up here.</p>
      )}

      {visible.map((e) => (
        <div key={e.id} style={row}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ ...tag, background: T.paper, border: `1px solid ${T.line}` }}>
              {e.type === 'vote' ? 'Bring it back vote' : e.orderNumber ? `Order ${e.orderNumber}` : 'Message'}
            </span>
            <span style={{ fontSize: 12, color: T.soft }}>
              {new Date(e.updatedAt || e.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
          <p style={{ fontSize: 15, whiteSpace: 'pre-wrap', margin: '0 0 10px' }}>{e.text}</p>
          {e.type !== 'vote' && (
            <div style={{ fontSize: 12, color: T.soft, marginBottom: 12 }}>
              {e.name && <span>{e.name} · </span>}
              {e.email ? <a href={`mailto:${e.email}`} style={{ textDecoration: 'underline', color: T.ink }}>{e.email}</a> : 'No email'}
            </div>
          )}
          {(e.replies || []).map((r) => (
            <div key={r.id} style={replyBubble}>
              <div style={{ fontSize: 11, color: T.soft, marginBottom: 4 }}>
                You replied · {new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{r.text}</div>
            </div>
          ))}
          {e.email && <ReplyBox entry={e} onReplied={replied} />}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {e.status !== 'answered' && <button onClick={() => setStatus(e.id, 'answered')} style={smallBtn}>Mark answered</button>}
            {e.status !== 'archived' && <button onClick={() => setStatus(e.id, 'archived')} style={smallBtn}>Archive</button>}
            {e.status !== 'new' && <button onClick={() => setStatus(e.id, 'new')} style={smallBtn}>Move to new</button>}
            <button onClick={() => remove(e.id)} style={{ ...smallBtn, color: '#a13d2b' }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Reply composer under one message: emails the reply to them and adds it to
// the thread above. The draft stays put if sending fails.
function ReplyBox({ entry, onReplied }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');

  const send = async () => {
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
      onReplied(data.entry);
      setText('');
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...smallBtn, background: T.ink, color: T.white, borderColor: T.ink, marginBottom: 10 }}>
        {entry.replies?.length ? 'Reply again' : 'Reply'}
      </button>
    );
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <textarea
        value={text}
        onChange={(ev) => setText(ev.target.value)}
        placeholder={`Write your reply to ${entry.name || entry.email}…`}
        rows={5}
        autoFocus
        style={{ width: '100%', boxSizing: 'border-box', padding: 12, fontSize: 14, fontFamily: 'inherit', border: `1px solid ${T.line}`, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <button onClick={send} disabled={sending || !text.trim()} style={{ ...smallBtn, background: T.ink, color: T.white, borderColor: T.ink, opacity: sending || !text.trim() ? 0.5 : 1 }}>
          {sending ? 'Sending…' : `Send to ${entry.email}`}
        </button>
        <button onClick={() => { setOpen(false); setError(''); }} style={smallBtn}>Cancel</button>
        {error && <span style={{ fontSize: 12, color: '#a13d2b' }}>{error}</span>}
      </div>
      <p style={{ fontSize: 11, color: T.soft, margin: '6px 0 0' }}>Sent by email — “Hi (their first name),” is added at the top and their message is quoted underneath. Marks this answered.</p>
    </div>
  );
}

const replyBubble = { background: T.blush, padding: '10px 12px', fontSize: 14, margin: '0 0 10px' };
const card = { background: T.white, border: `1px solid ${T.line}`, padding: 24, marginBottom: 24 };
const row = { padding: '16px 0', borderTop: `1px solid ${T.line}` };
const tag = { fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 8px', fontWeight: 700 };
const chip = { fontSize: 12, padding: '6px 12px', border: `1px solid ${T.line}`, background: T.white, cursor: 'pointer', color: T.ink };
const chipActive = { background: T.ink, color: T.white, borderColor: T.ink };
const select = { fontSize: 12, padding: '6px 8px', border: `1px solid ${T.line}`, background: T.white, color: T.ink };
const smallBtn = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '7px 12px', border: `1px solid ${T.line}`, background: 'none', cursor: 'pointer', color: T.ink };
