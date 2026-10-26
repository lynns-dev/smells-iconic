// Visitor paths to purchase, for admin's Paths tab.
//
// Every tracked step (page view, add to cart, checkout, purchase) is
// appended to the visitor's own journey — keyed by the device's visitor id
// (lib/session.js getVisitorId, sent with every tracking ping), so one
// journey can span several visits: an ad click today and a return
// visit that buys tomorrow are one path, not two strangers. The per-tab
// sessionId on each step is what marks where one visit ends and the next
// begins.
//
// Storage (KV):
//   journey:<visitorId>  JSON list of steps (RPUSH), expires 30 days after
//                        the visitor's last step, capped at MAX_STEPS.
//   journeys:index       sorted set, visitorId scored by last-seen time, so
//                        admin can load "everyone active in the last N days".
//
// buildTree() folds those journeys into a tree: first touch (traffic
// source) > landing page > next step > … > Purchase, with how many visitors
// took each branch, how many of them went on to buy, and how many left the
// site right there.

import { getProductById } from './products';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_STEPS = 60;
const INDEX_KEY = 'journeys:index';

async function pipeline(commands) {
  if (!KV_URL || !KV_TOKEN || commands.length === 0) return [];
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`KV pipeline failed: ${res.status}`);
  return (await res.json()).map((r) => r.result);
}

const VISITOR_ID_RE = /^[\w.-]{4,80}$/;

// Plain-language name for a page path, so the tree reads "Product:
// Babygirl" rather than "/product/babygirl".
const PAGE_LABELS = {
  '/': 'Home',
  '/shop': 'Shop',
  '/contact': 'Contact page',
};
const POLICY_PAGES = ['/terms', '/privacy', '/returns', '/shipping'];

export function pageLabel(path) {
  const clean = String(path || '/').split('?')[0].replace(/\/+$/, '') || '/';
  if (PAGE_LABELS[clean]) return PAGE_LABELS[clean];
  const product = clean.match(/^\/products?\/([^/]+)/);
  if (product) return `Product: ${getProductById(product[1])?.name || product[1]}`;
  if (POLICY_PAGES.includes(clean)) return 'Policy page';
  // Checkout and the success page are represented by their own events
  // (Checkout, Purchase) instead of a page view.
  if (/^\/(checkout|success|unsubscribe|admin)/.test(clean)) return null;
  return clean.slice(1).replace(/[-/]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()).slice(0, 60);
}

export const EVENT_LABELS = {
  addtocart: 'Add to cart',
  checkout_start: 'Checkout',
  purchase: 'Purchase',
};

// Appends one step. Best-effort and silent: a missing visitor id or a KV
// hiccup just means this step isn't recorded — tracking never affects the
// shopper.
export async function recordJourneyStep(visitorId, { sessionId, label, source, value }) {
  if (typeof visitorId !== 'string' || !VISITOR_ID_RE.test(visitorId) || !label) return;
  const key = `journey:${visitorId}`;
  const step = {
    t: Date.now(),
    s: String(sessionId || '').slice(0, 40) || null,
    l: String(label).slice(0, 80),
    ...(source ? { src: String(source).slice(0, 60) } : {}),
    ...(value != null ? { v: Number(value) || 0 } : {}),
  };
  try {
    await pipeline([
      ['RPUSH', key, JSON.stringify(step)],
      ['LTRIM', key, String(-MAX_STEPS), '-1'],
      ['EXPIRE', key, String(TTL_SECONDS)],
      ['ZADD', INDEX_KEY, String(step.t), visitorId],
    ]);
  } catch (err) {
    console.error('Journey step not recorded:', err.message);
  }
}

// Journeys of everyone active in the last `days` days.
export async function getJourneys(days = 7) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const [ids] = await pipeline([
    ['ZREMRANGEBYSCORE', INDEX_KEY, '-inf', String(Date.now() - TTL_SECONDS * 1000)],
    ['ZRANGEBYSCORE', INDEX_KEY, String(since), '+inf'],
  ]).then((r) => [r[1] || []]);
  const journeys = [];
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500);
    const lists = await pipeline(batch.map((id) => ['LRANGE', `journey:${id}`, '0', '-1']));
    lists.forEach((list) => {
      const steps = (list || []).map((raw) => { try { return JSON.parse(raw); } catch { return null; } }).filter(Boolean);
      if (steps.length) journeys.push(steps);
    });
  }
  return journeys;
}

// One journey -> the labels of its path: each visit opens with where it
// came from ("Facebook/Instagram ad", later "Return visit · Email"), then
// the steps in that visit, repeats collapsed. Stops at the first purchase.
export function journeyPath(steps) {
  const path = [];
  let lastSession;
  let visits = 0;
  for (const step of steps) {
    if (step.s !== lastSession) {
      lastSession = step.s;
      visits += 1;
      const source = step.src || 'Direct';
      path.push(visits === 1 ? source : `Return visit · ${source}`);
    }
    if (path[path.length - 1] !== step.l) path.push(step.l);
    if (step.l === EVENT_LABELS.purchase) break;
  }
  return path;
}

const MAX_DEPTH = 12;
const MAX_CHILDREN = 8;

// Folds paths into a counted tree. Each node: visitors who reached it,
// how many of those bought, and how many left the site right there
// (their path ends at this node without a purchase).
export function buildTree(journeys, { buyersOnly = false } = {}) {
  const root = { label: 'All visitors', visitors: 0, bought: 0, leftHere: 0, children: new Map() };
  const topPaths = new Map();

  for (const steps of journeys) {
    const path = journeyPath(steps).slice(0, MAX_DEPTH);
    const bought = path[path.length - 1] === EVENT_LABELS.purchase;
    if (buyersOnly && !bought) continue;

    root.visitors += 1;
    if (bought) {
      root.bought += 1;
      const keyPath = path.join(' › ');
      topPaths.set(keyPath, (topPaths.get(keyPath) || 0) + 1);
    }
    let node = root;
    path.forEach((label, i) => {
      if (!node.children.has(label)) node.children.set(label, { label, visitors: 0, bought: 0, leftHere: 0, children: new Map() });
      node = node.children.get(label);
      node.visitors += 1;
      if (bought) node.bought += 1;
      if (i === path.length - 1 && !bought) node.leftHere += 1;
    });
  }

  // Map -> sorted arrays; beyond MAX_CHILDREN, the smallest branches are
  // merged into one "Other" node so the tree stays readable.
  const finish = (node) => {
    let children = [...node.children.values()].sort((a, b) => b.visitors - a.visitors);
    if (children.length > MAX_CHILDREN) {
      const rest = children.slice(MAX_CHILDREN - 1);
      children = children.slice(0, MAX_CHILDREN - 1);
      children.push({
        label: `Other (${rest.length} paths)`,
        visitors: rest.reduce((n, c) => n + c.visitors, 0),
        bought: rest.reduce((n, c) => n + c.bought, 0),
        leftHere: rest.reduce((n, c) => n + c.leftHere, 0),
        children: new Map(),
        other: true,
      });
    }
    return {
      label: node.label,
      visitors: node.visitors,
      bought: node.bought,
      leftHere: node.leftHere,
      ...(node.other ? { other: true } : {}),
      children: children.map(finish),
    };
  };

  return {
    tree: finish(root),
    topPaths: [...topPaths.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path: path.split(' › '), count })),
  };
}
