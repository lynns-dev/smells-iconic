import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
const root = new URL("../", import.meta.url);
const context = vm.createContext({ console, Date });
const state = new vm.SourceTextModule(
  await fs.readFile(new URL("lib/inboxState.js", root), "utf8"),
  { context },
);
await state.link(() => {});
await state.evaluate();
const {
  countOpenConversations,
  inboxConversationKey,
  mergeInboxEntries,
  createInboxSync,
} = state.namespace;
const fixture = [
  {
    id: "a",
    email: " Person@Example.com ",
    status: "new",
    text: "First",
    createdAt: "2026-11-14T01:00:00Z",
  },
  {
    id: "b",
    email: "person@example.com",
    status: "new",
    text: "Second",
    createdAt: "2026-11-14T02:00:00Z",
  },
  {
    id: "c",
    email: "other@example.com",
    status: "new",
    text: "Another",
    createdAt: "2026-11-14T02:00:00Z",
  },
];
assert.equal(countOpenConversations(fixture), 2);
assert.equal(
  countOpenConversations([...fixture, { id: "anonymous", status: "new" }]),
  3,
);
const gate = createInboxSync(),
  old = gate.beginLoad(),
  finish = gate.beginMutation();
assert.equal(gate.accepts(old), false);
assert.equal(gate.beginLoad(), null);
finish();
assert.equal(gate.accepts(old), false);
const newer = gate.beginLoad();
assert.equal(gate.accepts(newer), true);
const latest = gate.beginLoad();
assert.equal(gate.accepts(newer), false);
assert.equal(gate.accepts(latest), true);
assert.equal(
  mergeInboxEntries(fixture, [{ ...fixture[0], status: "answered" }]).find(
    (e) => e.id === "a",
  ).status,
  "answered",
);
assert.equal(mergeInboxEntries(fixture, [], true).length, 0);
let entries = structuredClone(fixture),
  sent = 0,
  providerFails = false,
  storageFails = false,
  incoming = false,
  covered;
const synthetic = (exports) =>
  new vm.SyntheticModule(
    Object.keys(exports),
    function () {
      for (const [k, v] of Object.entries(exports)) this.setExport(k, v);
    },
    { context },
  );
async function send() {
  sent++;
  if (providerFails) throw Error("provider unavailable");
  if (incoming)
    entries.push({
      id: "late",
      email: "person@example.com",
      status: "new",
      createdAt: "2026-11-14T03:00:00Z",
    });
  return { id: "sent-receipt" };
}
const mocks = {
  crypto: synthetic({ default: crypto }),
  "../../../lib/inboxState": state,
  "../../../lib/inboxStore": synthetic({
    getInbox: async () => structuredClone(entries),
    reconcileInbox: async () => structuredClone(entries),
    updateInboxEntry: async () => {},
    updateInboxEntries: async (ids, updates) => {
      entries = entries.map((e) =>
        ids.includes(e.id) ? { ...e, ...updates } : e,
      );
      return entries.filter((e) => ids.includes(e.id));
    },
    deleteInboxEntries: async (ids) => {
      entries = entries.filter((e) => !ids.includes(e.id));
      return entries;
    },
    recordInboxReply: async (id, reply, ids) => {
      if (storageFails) throw Error("storage unavailable");
      covered = ids;
      entries = entries.map((e) =>
        e.id === id
          ? { ...e, status: "answered", replies: [...(e.replies || []), reply] }
          : ids.includes(e.id) && e.status === "new"
            ? { ...e, status: "answered" }
            : e,
      );
      return structuredClone(entries);
    },
  }),
  "../../../lib/email/resendEmail": synthetic({ sendTransactionalEmail: send }),
  "../../../lib/email/settingsStore": synthetic({
    getSettings: async () => ({}),
  }),
  "../../../lib/email/inboxReplyEmail": synthetic({
    renderInboxReplyEmail: () => "<p>reply</p>",
    inboxReplySubject: () => "Reply",
  }),
  "../../../lib/inboxReplyEmail": synthetic({ sendInboxReply: send }),
};
const api = new vm.SourceTextModule(
  await fs.readFile(new URL("pages/api/admin/inbox.js", root), "utf8"),
  { context },
);
await api.link((spec) => {
  assert.ok(mocks[spec], spec);
  return mocks[spec];
});
await api.evaluate();
async function call(method, body) {
  const res = {
    code: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(n) {
      this.code = n;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
  await api.namespace.default({ method, body }, res);
  return res;
}
let result = await call("GET");
assert.equal(result.body.openCount, 2);
assert.equal(result.headers["Cache-Control"], "no-store");
result = await call("POST", { id: "b", reply: "A customer reply" });
assert.equal(result.code, 200);
assert.equal(sent, 1);
assert.equal(result.body.openCount, 1);
assert.deepEqual([...covered], ["a", "b"]);
assert.equal(
  result.body.snapshot.find((e) => e.id === "b").replies[0].emailId,
  "sent-receipt",
);
assert.deepEqual([...result.body.snapshot.find(e => e.id === "b").replies[0].coveredIds], ["a", "b"]);
entries = structuredClone(fixture);
providerFails = true;
result = await call("POST", { id: "b", reply: "Test" });
assert.equal(result.code, 502);
assert.equal(countOpenConversations(entries), 2);
providerFails = false;
entries = structuredClone(fixture);
incoming = true;
result = await call("POST", { id: "b", reply: "Reply while another arrives" });
assert.equal(result.body.openCount, 2);
assert.equal(result.body.snapshot.find((e) => e.id === "late").status, "new");
incoming = false;
entries = structuredClone(fixture);
storageFails = true;
result = await call("POST", {
  id: "b",
  reply: "Provider accepted but storage failed",
});
assert.equal(result.code, 503);
assert.equal(result.body.sent, true);
storageFails = false;
result = await call("PATCH", { ids: ["a", "b"], status: "answered" });
assert.equal(result.body.openCount, 1);
result = await call("PATCH", { ids: ["a", "b"], status: "new" });
assert.equal(result.body.openCount, 2);
result = await call("DELETE", { ids: ["a", "b"] });
assert.equal(result.body.openCount, 1);
console.log(
  "Inbox: immediate reply closure, normalized conversation counts, incoming-message races, stale GET rejection, failed sends, status changes and deletion passed. Email provider mocked; no messages sent.",
);
