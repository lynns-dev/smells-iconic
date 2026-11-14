import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
const base = path.resolve(import.meta.dirname, "..");
const hashes = new Map(),
  counters = new Map();
let unavailable = false;
const context = vm.createContext({
  URL,
  AbortSignal,
  console,
  Date,
  process: {
    env: {
      KV_REST_API_URL: "https://redis.test",
      KV_REST_API_TOKEN: "mock-token",
    },
  },
  fetch: async (url, options) => {
    assert.equal(
      url,
      "https://redis.test",
      "birthday collection may only contact its own store, never message/payment services",
    );
    if (unavailable) throw Error("unavailable");
    const [command, key, ...args] = JSON.parse(options.body);
    let result;
    if (command === "HSET") {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key).set(args[0], args[1]);
      result = 1;
    } else if (command === "HSCAN")
      result = ["0", [...(hashes.get(key) || new Map())].flat()];
    else if (command === "EVAL") {
      const rateKey = args[1];
      const n = (counters.get(rateKey) || 0) + 1;
      counters.set(rateKey, n);
      result = n;
    } else throw Error("Unexpected Redis command");
    return { ok: true, json: async () => ({ result }) };
  },
});
const cache = new Map();
async function load(file) {
  if (cache.has(file)) return cache.get(file);
  const m = new vm.SourceTextModule(
    await fs.readFile(path.join(base, file), "utf8"),
    { context },
  );
  cache.set(file, m);
  await m.link((s) =>
    s === "crypto"
      ? new vm.SyntheticModule(
          ["createHash"],
          function () {
            this.setExport("createHash", crypto.createHash);
          },
          { context },
        )
      : load(path.normalize(path.join(path.dirname(file), s + ".js"))),
  );
  return m;
}
await (await load("lib/email/brand.js")).evaluate();
await (await load("lib/birthdayConsent.js")).evaluate();
const api = await load("pages/api/birthday.js");
await api.evaluate();
const handler = api.namespace.default;
const consent = cache.get("lib/birthdayConsent.js").namespace;
const brand = cache.get("lib/email/brand.js").namespace.BRAND;
const store = cache.get("lib/birthdayStore.js").namespace;
const valid = {
  email: " Example@Example.com ",
  month: "2",
  day: "29",
  consent: true,
  consentVersion: consent.BIRTHDAY_CONSENT_VERSION,
};
async function call(body = valid, method = "POST", headers = {}) {
  const res = {
    code: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  await handler(
    {
      method,
      headers: {
        host: "store.test",
        "content-type": "application/json",
        ...headers,
      },
      body,
      socket: { remoteAddress: "127.0.0.1" },
    },
    res,
  );
  return res;
}
for (const changes of [
  { consent: false },
  { consent: "true" },
  { consentVersion: "old" },
  { month: 2, day: 30 },
  { month: 4, day: 31 },
  { month: 13 },
  { day: 0 },
  { month: true },
  { month: "2e0" },
  { year: 1990 },
  { birthYear: 1990 },
  { email: "bad" },
])
  assert.equal((await call({ ...valid, ...changes })).code, 400);
assert.equal(hashes.size, 0, "invalid input never stored");
assert.equal((await call(valid, "GET")).code, 405);
assert.equal(
  (await call(valid, "POST", { "content-type": "text/plain" })).code,
  415,
);
assert.equal(
  (await call(valid, "POST", { origin: "https://other.test" })).code,
  403,
);
assert.equal((await call({ ...valid, website: "spam" })).code, 200);
assert.equal(hashes.size, 0);
assert.equal((await call()).code, 200);
assert.deepEqual(
  Object.keys((await call()).body),
  ["ok"],
  "public response cannot enumerate customers",
);
let records = await store.listBirthdays();
assert.equal(
  records.profiles.length,
  1,
  "repeat signup updates one customer/brand record",
);
const p = records.profiles[0];
assert.equal(p.brand, brand.id);
assert.equal(p.customerEmail, "example@example.com");
assert.equal(p.month, 2);
assert.equal(p.day, 29);
assert.equal(p.consent, true);
assert.equal(p.consentVersion, consent.BIRTHDAY_CONSENT_VERSION);
assert.equal(p.consentText, consent.BIRTHDAY_CONSENT_TEXT);
assert.equal(p.programMode, "collection-only");
assert.equal(p.verification, "self-reported-unverified");
assert.ok(p.consentAt);
assert.ok(!("year" in p));
assert.ok([...hashes.keys()][0].includes(brand.id));
for (let i = 0; i < 3; i++) assert.equal((await call()).code, 200);
assert.equal((await call()).code, 429, "per-contact limit enforced");
const admin = await load("pages/api/admin/birthdays.js");
await admin.evaluate();
const adminResponse = {
  code: 200,
  setHeader() {},
  status(n) {
    this.code = n;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  },
  end() {
    return this;
  },
};
await admin.namespace.default(
  {
    method: "POST",
    headers: { host: "store.test", origin: "https://other.test" },
    body: { action: "withdraw", id: p.id },
  },
  adminResponse,
);
assert.equal(adminResponse.code, 403);
await store.withdrawBirthday(p.id);
assert.equal((await store.listBirthdays()).profiles.length, 0);
const raw = [...hashes.values()][0].get(p.id);
assert.ok(!raw.includes("example@example.com"));
assert.ok(!raw.includes('"month"'));
assert.ok(!raw.includes('"day"'));
assert.equal(JSON.parse(raw).consent, false);
unavailable = true;
assert.equal(
  (await call({ ...valid, email: "another@example.com" })).code,
  503,
  "storage failure must not show a success",
);
console.log(
  `${brand.name}: optional consent, no birth year, leap-day validation, brand/customer storage, idempotency, privacy, rate limits, withdrawal and no-send boundaries passed.`,
);
