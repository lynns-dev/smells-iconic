import { createHash } from "crypto";
import { BRAND } from "./email/brand";
import {
  BIRTHDAY_CONSENT_VERSION,
  BIRTHDAY_CONSENT_TEXT,
} from "./birthdayConsent";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const KEY = `birthday:${BRAND.id}:profiles:v1`;
async function redis(command) {
  const url = process.env.KV_REST_API_URL,
    token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Birthday storage is not configured.");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw new Error("Birthday storage is unavailable.");
  return data.result;
}
export async function birthdayRateLimit(ip, email) {
  for (const [kind, value, limit] of [
    ["network", ip || "unknown", 30],
    ["email", email, 5],
  ]) {
    const count = await redis([
      "EVAL",
      "local n=redis.call('INCR',KEYS[1]) if n==1 then redis.call('EXPIRE',KEYS[1],3600) end return n",
      "1",
      `birthday:${BRAND.id}:limit:${kind}:${hash(value)}`,
    ]);
    if (Number(count) > limit) return false;
  }
  return true;
}
export async function saveBirthday({ email, month, day }) {
  const now = new Date().toISOString();
  // Email is the association to this brand's customer/contact record. Never
  // create a newsletter/SMS subscriber or trigger a message from this store.
  const profile = {
    id: hash(`${BRAND.id}:${email}`),
    brand: BRAND.id,
    customerEmail: email,
    month,
    day,
    status: "consented",
    consent: true,
    consentAt: now,
    consentVersion: BIRTHDAY_CONSENT_VERSION,
    consentText: BIRTHDAY_CONSENT_TEXT,
    source: "birthday-page",
    updatedAt: now,
    verification: "self-reported-unverified",
    programMode: "collection-only",
  };
  await redis(["HSET", KEY, profile.id, JSON.stringify(profile)]);
  return profile.id;
}
export async function listBirthdays(cursor = "0") {
  const result = await redis(["HSCAN", KEY, cursor, "COUNT", "50"]);
  const entries = result?.[1] || [];
  const profiles = [];
  for (let i = 1; i < entries.length; i += 2) {
    const row = JSON.parse(entries[i]);
    if (row.status === "consented") profiles.push(row);
  }
  return {
    profiles,
    cursor: String(result?.[0] || "0"),
    mode: "collection-only",
    brand: BRAND.id,
  };
}
export async function withdrawBirthday(id) {
  if (!/^[a-f0-9]{64}$/.test(id || ""))
    throw new Error("Invalid birthday record.");
  // Remove email/month/day; retain only a non-contactable withdrawal record.
  await redis([
    "HSET",
    KEY,
    id,
    JSON.stringify({
      id,
      brand: BRAND.id,
      status: "withdrawn",
      consent: false,
      withdrawnAt: new Date().toISOString(),
    }),
  ]);
}
