import React from 'react';
import Head from 'next/head';

export default function AdminIntegrations() {
  const [configured, setConfigured] = React.useState(false);
  const [token, setToken] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const load = React.useCallback(async () => {
    const res = await fetch('/api/admin/mcp-key');
    if (res.ok) setConfigured(Boolean((await res.json()).configured));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const createKey = async () => {
    if (configured && !window.confirm('Replace the existing ChatGPT connection key? The old connection will stop working.')) return;
    setBusy(true); setMessage(''); setToken('');
    try {
      const res = await fetch('/api/admin/mcp-key', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create key.');
      setToken(data.token);
      setConfigured(true);
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  };

  const revoke = async () => {
    if (!window.confirm('Revoke ChatGPT access immediately?')) return;
    setBusy(true); setMessage(''); setToken('');
    try {
      const res = await fetch('/api/admin/mcp-key', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not revoke key.');
      setConfigured(false);
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(token);
    setMessage('Connection key copied.');
  };

  const endpoint = 'https://www.smellsiconic.com/api/mcp';

  return (
    <>
      <Head><title>ChatGPT Connection · Smells Iconic Admin</title></Head>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', color: '#211b17', fontFamily: 'Arial, sans-serif' }}>
        <a href="/admin" style={{ color: 'inherit' }}>← Back to Admin</a>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 400, margin: '28px 0 8px' }}>ChatGPT connection</h1>
        <p style={{ color: '#71675f', lineHeight: 1.6 }}>Connect ChatGPT to the Smells Iconic admin dashboard through a private, revocable connection.</p>
        <section style={{ border: '1px solid #e6ddd6', borderRadius: 12, padding: 22, marginTop: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Connection status</div>
          <p style={{ margin: '0 0 16px', color: configured ? '#28734b' : '#71675f' }}>{configured ? 'A connection key is active.' : 'No connection key has been created.'}</p>
          <button onClick={createKey} disabled={busy} style={button}>{busy ? 'Working…' : configured ? 'Replace connection key' : 'Generate connection key'}</button>
          {configured && <button onClick={revoke} disabled={busy} style={{ ...button, marginLeft: 8, background: '#fff', color: '#9a3328', border: '1px solid #d9c9c0' }}>Revoke access</button>}
          {token && (
            <div style={{ marginTop: 18 }}>
              <p style={{ color: '#9a3328', fontWeight: 700 }}>Copy this key now. It will not be displayed again.</p>
              <code style={{ display: 'block', overflowWrap: 'anywhere', background: '#f6f1ed', padding: 12, borderRadius: 8 }}>{token}</code>
              <button onClick={copy} style={{ ...button, marginTop: 10 }}>Copy key</button>
            </div>
          )}
          {message && <p role="status" style={{ marginTop: 12, fontSize: 13 }}>{message}</p>}
        </section>
        <section style={{ border: '1px solid #e6ddd6', borderRadius: 12, padding: 22, marginTop: 18 }}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>ChatGPT connection details</h2>
          <p style={{ fontSize: 13, color: '#71675f' }}>After generating a key, add a custom MCP connector in ChatGPT Settings → Apps (or Connectors) → Create. Choose bearer-token authentication if offered.</p>
          <div style={{ fontWeight: 700, marginTop: 14, marginBottom: 6 }}>Server URL</div>
          <code style={{ display: 'block', background: '#f6f1ed', padding: 12, borderRadius: 8, overflowWrap: 'anywhere' }}>{endpoint}</code>
          <p style={{ fontSize: 13, color: '#71675f', lineHeight: 1.6 }}>Paste the generated key as the bearer token. Available tools cover dashboard metrics, orders, visitors, inbox, reviews, subscribers, discounts, email reporting and SMS reporting. Campaign sends, refunds, payment settings and other unsupported high-impact actions are not exposed by this initial connection.</p>
        </section>
      </main>
    </>
  );
}

const button = { border: 'none', borderRadius: 7, padding: '11px 16px', background: '#211b17', color: '#fff', cursor: 'pointer', fontSize: 13 };
