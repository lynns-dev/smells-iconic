import React from 'react';
import { T, S } from '../lib/theme';

// Admin's Paths tab: how visitors move from first touch to purchase
// (lib/journeys.js). A collapsible tree — each row is one step on a path,
// with how many visitors took it, what share of the previous step that is,
// how many of them bought, and how many left the site right there.
// One measure (visitors) gets one ink-colored bar; drop-offs are flagged
// with an icon and words, not color alone.

const DROP_ALERT = { minVisitors: 5, share: 0.5 };
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

function collectDropOffs(node, trail = [], out = []) {
  for (const child of node.children || []) {
    const path = [...trail, child.label];
    if (!child.other && child.leftHere >= DROP_ALERT.minVisitors) out.push({ path, ...child });
    collectDropOffs(child, path, out);
  }
  return out;
}

// Expanded by default: the first two levels, plus every step on the most
// common path to purchase so it's visible without clicking.
function defaultOpen(tree, topPath) {
  const open = new Set(['']);
  (tree.children || []).forEach((c) => open.add(c.label));
  if (topPath) topPath.forEach((_, i) => open.add(topPath.slice(0, i + 1).join('\u0000')));
  return open;
}

function Row({ node, parentVisitors, rootVisitors, depth, trail, open, toggle }) {
  const key = trail.join('\u0000');
  const hasChildren = node.children && node.children.length > 0;
  const isOpen = open.has(key);
  const leftShare = node.visitors ? node.leftHere / node.visitors : 0;
  const dropAlert = !node.other && node.visitors >= DROP_ALERT.minVisitors && leftShare >= DROP_ALERT.share;
  const isPurchase = node.label === 'Purchase';
  const tip = `${node.label}: ${node.visitors} visitors (${pct(node.visitors, parentVisitors)}% of previous step), `
    + `${node.bought} bought (${pct(node.bought, node.visitors)}%), ${node.leftHere} left here`;

  return (
    <>
      <div className="path-row" title={tip} style={{ paddingLeft: 8 + depth * 22 }}>
        <button
          type="button"
          onClick={() => hasChildren && toggle(key)}
          aria-expanded={hasChildren ? isOpen : undefined}
          aria-label={hasChildren ? `${isOpen ? 'Collapse' : 'Expand'} ${node.label}` : undefined}
          className="path-toggle"
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {isOpen ? '▾' : '▸'}
        </button>
        <div className="path-label">
          <span style={{ fontWeight: isPurchase ? 700 : 500 }}>{isPurchase ? '✓ ' : ''}{node.label}</span>
          <div className="path-bar-track" aria-hidden="true">
            <div className="path-bar" style={{ width: `${Math.max(pct(node.visitors, rootVisitors), node.visitors ? 1 : 0)}%` }} />
          </div>
        </div>
        <div className="path-num">{node.visitors}</div>
        <div className="path-num path-soft">{pct(node.visitors, parentVisitors)}%</div>
        <div className="path-num">{node.bought}<span className="path-soft"> · {pct(node.bought, node.visitors)}%</span></div>
        <div className="path-num">
          {dropAlert ? (
            <span className="path-drop" style={{ whiteSpace: 'nowrap' }}>▼ {node.leftHere} left ({Math.round(leftShare * 100)}%)</span>
          ) : (
            <span className="path-soft">{node.leftHere || '—'}</span>
          )}
        </div>
      </div>
      {isOpen && hasChildren && node.children.map((child) => (
        <Row
          key={child.label}
          node={child}
          parentVisitors={node.visitors}
          rootVisitors={rootVisitors}
          depth={depth + 1}
          trail={[...trail, child.label]}
          open={open}
          toggle={toggle}
        />
      ))}
    </>
  );
}

export default function PathsTree() {
  const [days, setDays] = React.useState(7);
  const [buyersOnly, setBuyersOnly] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [open, setOpen] = React.useState(new Set(['']));

  React.useEffect(() => {
    setError('');
    fetch(`/api/admin/journeys?days=${days}${buyersOnly ? '&buyers=1' : ''}`)
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || 'Could not load paths')))))
      .then((d) => { setData(d); setOpen(defaultOpen(d.tree, d.topPaths?.[0]?.path)); })
      .catch((err) => setError(err.message));
  }, [days, buyersOnly]);

  const toggle = (key) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const tree = data?.tree;
  const dropOffs = React.useMemo(
    () => (tree ? collectDropOffs(tree).sort((a, b) => b.leftHere - a.leftHere).slice(0, 5) : []),
    [tree]
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        {[1, 7, 30].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} style={{ ...chip, ...(days === d ? chipOn : {}) }}>
            {d === 1 ? 'Last 24 hours' : `Last ${d} days`}
          </button>
        ))}
        <span style={{ width: 1, height: 22, background: T.line, margin: '0 4px' }} />
        <button type="button" onClick={() => setBuyersOnly(false)} style={{ ...chip, ...(!buyersOnly ? chipOn : {}) }}>All visitors</button>
        <button type="button" onClick={() => setBuyersOnly(true)} style={{ ...chip, ...(buyersOnly ? chipOn : {}) }}>Buyers only</button>
      </div>

      {error && <p style={{ color: '#a13d2b', fontSize: 14 }}>{error}</p>}
      {!tree && !error && <p style={{ color: T.soft, fontSize: 14 }}>Loading…</p>}

      {tree && tree.visitors === 0 && (
        <p style={{ color: T.soft, fontSize: 14, lineHeight: 1.6 }}>
          No paths recorded in this period yet. Paths are recorded from the moment this tab went live — check back after some traffic.
        </p>
      )}

      {tree && tree.visitors > 0 && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            <div style={tile}><div style={tileNum}>{tree.visitors}</div><div style={tileLabel}>{buyersOnly ? 'Buyers' : 'Visitors'}</div></div>
            <div style={tile}><div style={tileNum}>{tree.bought}</div><div style={tileLabel}>Bought</div></div>
            <div style={tile}><div style={tileNum}>{pct(tree.bought, tree.visitors)}%</div><div style={tileLabel}>Conversion</div></div>
          </div>

          {data.topPaths?.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <p style={{ ...S.label, marginBottom: 10 }}>Most common paths to purchase</p>
              {data.topPaths.map((p) => (
                <div key={p.path.join('>')} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '7px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13 }}>
                  <span style={{ flex: '0 0 42px', fontWeight: 700 }}>{p.count}×</span>
                  <span style={{ lineHeight: 1.6 }}>{p.path.join('  ›  ')}</span>
                </div>
              ))}
            </div>
          )}

          {!buyersOnly && dropOffs.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <p style={{ ...S.label, marginBottom: 10 }}>Biggest drop-off points</p>
              {dropOffs.map((d) => (
                <div key={d.path.join('>')} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '7px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13 }}>
                  <span style={{ flex: '0 0 110px', fontWeight: 700 }}>▼ {d.leftHere} left</span>
                  <span style={{ lineHeight: 1.6 }}>{d.path.join('  ›  ')} <span style={{ color: T.soft }}>({pct(d.leftHere, d.visitors)}% of the {d.visitors} who got here)</span></span>
                </div>
              ))}
            </div>
          )}

          <p style={{ ...S.label, marginBottom: 10 }}>Path tree</p>
          <div className="paths-scroll">
            <div style={{ minWidth: 720 }}>
              <div className="path-row path-head">
                <div style={{ width: 20 }} />
                <div className="path-label">First touch › next step › … › purchase</div>
                <div className="path-num">Visitors</div>
                <div className="path-num">Of prev. step</div>
                <div className="path-num">Bought</div>
                <div className="path-num">Left here</div>
              </div>
              {tree.children.map((child) => (
                <Row key={child.label} node={child} parentVisitors={tree.visitors} rootVisitors={tree.visitors} depth={0} trail={[child.label]} open={open} toggle={toggle} />
              ))}
            </div>
          </div>
          <p style={{ color: T.soft, fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
            Each visit starts with where it came from; a later visit by the same person shows as &ldquo;Return visit · source&rdquo;.
            Bars show each step&rsquo;s share of all {buyersOnly ? 'buyers' : 'visitors'}. ▼ marks steps where at least half of the people who got there left.
            Hover a row for its numbers in a sentence.
          </p>
        </>
      )}

      <style jsx>{`
        .paths-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        :global(.path-row) { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-bottom: 1px solid ${T.line}; font-size: 13px; }
        :global(.path-row:hover) { background: ${T.paper}; }
        :global(.path-head) { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.soft}; background: none !important; }
        :global(.path-toggle) { width: 20px; flex-shrink: 0; border: none; background: none; cursor: pointer; font-size: 12px; color: ${T.ink}; padding: 0; }
        :global(.path-label) { flex: 1; min-width: 0; }
        :global(.path-bar-track) { height: 4px; background: ${T.line}; margin-top: 5px; border-radius: 2px; overflow: hidden; }
        :global(.path-bar) { height: 4px; background: ${T.ink}; border-radius: 2px; }
        :global(.path-num) { flex: 0 0 96px; text-align: right; }
        :global(.path-soft) { color: ${T.soft}; }
        :global(.path-drop) { color: #a13d2b; font-weight: 700; }
      `}</style>
    </div>
  );
}

const chip = { border: `1px solid ${T.line}`, background: T.white, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontFamily: T.sans, color: T.ink };
const chipOn = { background: T.ink, color: T.white, borderColor: T.ink };
const tile = { border: `1px solid ${T.line}`, padding: '12px 18px', minWidth: 120, background: T.white };
const tileNum = { fontSize: 22, fontWeight: 700 };
const tileLabel = { fontSize: 11, color: T.soft, marginTop: 2 };
