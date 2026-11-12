// Twilio transport. No fallback to the retired provider and no automatic
// retries after an ambiguous send response. Activation is explicitly gated.
import { getEmailBaseUrl } from "../email/emailBaseUrl";
import { smsRedis, isSmsSuppressed } from "./twilioStore";
import { smsSegments } from "./segments";
export { smsSegments };
const clean = (value) =>
  String(value || "")
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2")
    .trim();
function settings() {
  return {
    account: clean(process.env.TWILIO_ACCOUNT_SID),
    token: clean(process.env.TWILIO_AUTH_TOKEN),
    service: clean(process.env.TWILIO_MESSAGING_SERVICE_SID),
    from: clean(process.env.TWILIO_PHONE_NUMBER),
    enabled: process.env.TWILIO_SMS_ENABLED === "true",
  };
}
export function smsConfiguration() {
  const c = settings();
  const hasAccount = /^AC[0-9a-f]{32}$/i.test(c.account);
  const hasToken = Boolean(c.token);
  const hasSender = c.service
    ? /^MG[0-9a-f]{32}$/i.test(c.service)
    : /^\+1[2-9]\d{9}$/.test(c.from);
  return {
    provider: "Twilio",
    hasAccount,
    hasToken,
    hasSender,
    enabled: c.enabled,
    configured: hasAccount && hasToken && hasSender,
    missing: [
      !hasAccount && "Account SID",
      !hasToken && "Auth Token",
      !hasSender && "Messaging Service or SMS number",
    ].filter(Boolean),
    inboundUrl: `${getEmailBaseUrl()}/api/sms/twilio/inbound`,
    statusUrl: `${getEmailBaseUrl()}/api/sms/twilio/status`,
  };
}
export function smsConfigured() {
  const c = smsConfiguration();
  return c.configured && c.enabled;
}
function apiError(status, code) {
  const notes = {
    20003: "The Twilio credentials were rejected.",
    21608: "A trial account can only message verified recipients.",
    21610: "This recipient has opted out of texts.",
    21606: "The sending number is not available for this account.",
    30034: "US business sender registration is not complete.",
    20404: "The Twilio account or sender was not found.",
  };
  const e = new Error(
    `${notes[code] || "Twilio could not accept this request."}${code ? ` Twilio code: ${code}.` : ""}`,
  );
  e.smsProviderStatus = status;
  e.smsProviderCode = code || null;
  return e;
}
async function request(path, options = {}) {
  const c = settings();
  let res;
  try {
    res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${c.account}${path}`,
      {
        ...options,
        headers: {
          Authorization: `Basic ${Buffer.from(`${c.account}:${c.token}`).toString("base64")}`,
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      },
    );
  } catch {
    const e = new Error(
      options.method === "POST"
        ? "Twilio did not confirm the send. Check Twilio message logs before retrying; delivery may already be in progress."
        : "Could not check the Twilio connection.",
    );
    e.smsDeliveryUncertain = options.method === "POST";
    throw e;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = apiError(res.status, data?.code);
    if (options.method === "POST" && res.status >= 500)
      error.smsDeliveryUncertain = true;
    throw error;
  }
  return data;
}
export async function getSmsConnection() {
  const c = smsConfiguration();
  if (!c.hasAccount || !c.hasToken)
    return { ...c, connected: false, canSend: false, status: "setup_required" };
  try {
    const account = await request(".json");
    const connected = account?.status === "active";
    return {
      ...c,
      connected,
      accountStatus: account?.status || "unknown",
      accountType: account?.type || "unknown",
      canSend: connected && c.configured && c.enabled,
      status: !connected
        ? "account_inactive"
        : !c.hasSender
          ? "sender_required"
          : !c.enabled
            ? "paused"
            : "ready",
    };
  } catch (e) {
    return {
      ...c,
      connected: false,
      canSend: false,
      status: "connection_error",
      error: e.message,
    };
  }
}
export async function sendSms(to, message) {
  if (!smsConfigured())
    throw new Error(
      "Twilio sending is paused. Finish account and sender setup, then explicitly enable sending.",
    );
  if (typeof to !== "string" || !/^\+1[2-9]\d{9}$/.test(to))
    throw new Error("Use one valid US mobile number per message.");
  if (typeof message !== "string" || !message.trim() || message.length > 1600)
    throw new Error("SMS message must contain 1–1600 characters.");
  if (await isSmsSuppressed(to))
    throw new Error("This recipient opted out of texts.");
  const c = settings();
  const body = new URLSearchParams({
    To: to,
    Body: message,
    StatusCallback: smsConfiguration().statusUrl,
  });
  if (c.service) body.set("MessagingServiceSid", c.service);
  else body.set("From", c.from);
  const data = await request("/Messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!data?.sid || !/^SM[0-9a-f]{32}$/i.test(data.sid)) {
    const e = new Error(
      "Twilio returned no message receipt. Check message logs before retrying.",
    );
    e.smsDeliveryUncertain = true;
    throw e;
  }
  await smsRedis([
    "SET",
    `sms_twilio_out:${data.sid}`,
    JSON.stringify({ status: data.status, to, at: new Date().toISOString() }),
    "EX",
    "2592000",
  ]).catch(() => {});
  return { id: data.sid, status: data.status, provider: "Twilio" };
}
