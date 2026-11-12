// Only Twilio's SDK authenticates incoming callbacks. Never trust a forwarded
// hostname when calculating the signed URL; use the store's configured origin.
import twilio from "twilio";
import { smsConfiguration } from "./provider";
import { smsRedis } from "./twilioStore";
export function verifySmsWebhook(req, kind) {
  const token = String(process.env.TWILIO_AUTH_TOKEN || "")
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2");
  const account = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  if (!token || !account) return false;
  const params = req.body;
  if (
    !params ||
    typeof params !== "object" ||
    Array.isArray(params) ||
    Object.values(params).some((v) => typeof v !== "string")
  )
    return false;
  if (params.AccountSid !== account) return false;
  const signature = req.headers["x-twilio-signature"];
  if (typeof signature !== "string") return false;
  const config = smsConfiguration();
  const service = String(process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
  const number = String(process.env.TWILIO_PHONE_NUMBER || "").trim();
  if (service && kind === "inbound" && params.MessagingServiceSid !== service)
    return false;
  if (number && kind === "inbound" && params.To !== number) return false;
  const url = kind === "inbound" ? config.inboundUrl : config.statusUrl;
  if (req.url?.includes("?")) return false;
  return twilio.validateRequest(token, signature, url, params);
}
export async function handleInbound(body) {
  if (
    !/^SM[0-9a-f]{32}$/i.test(body.MessageSid || "") ||
    !/^\+1[2-9]\d{9}$/.test(body.From || "") ||
    typeof body.Body !== "string" ||
    body.Body.length > 1600
  )
    throw new Error("Invalid incoming message.");
  const id = body.MessageSid,
    phone = body.From;
  const stop =
    body.OptOutType === "STOP" ||
    /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPTOUT)$/i.test(
      body.Body.trim(),
    );
  // Apply suppression even on retries; a failed history write cannot lose STOP.
  if (stop) {
    const at = new Date().toISOString();
    await smsRedis(["SET", `sms_optout:${phone}`, at]);
    await smsRedis([
      "EVAL",
      "local raw=redis.call('GET',KEYS[1]) if not raw then return 0 end local list=cjson.decode(raw) local found=false for _,contact in ipairs(list) do if contact.phone==ARGV[1] then contact.status='unsubscribed' contact.unsubscribedAt=ARGV[2] found=true end end if found then redis.call('SET',KEYS[1],cjson.encode(list)) return 1 end return 0",
      "1",
      "sms_subscribers",
      phone,
      at,
    ]);
  }
  const record = JSON.stringify({
    id,
    phone,
    to: body.To,
    body: body.Body,
    optOut: stop,
    at: new Date().toISOString(),
  });
  const saved = await smsRedis([
    "EVAL",
    "if redis.call('EXISTS',KEYS[1]) == 1 then return 0 end redis.call('SET',KEYS[1],ARGV[1],'EX',2592000) redis.call('LPUSH',KEYS[2],ARGV[2]) redis.call('LTRIM',KEYS[2],0,499) return 1",
    "2",
    `sms_twilio_in:${id}`,
    "sms_twilio_inbox",
    record,
    id,
  ]);
  // START is recorded for human review. It does not silently override the
  // brand's existing marketing-consent requirements or suppression record.
  return { duplicate: Number(saved) !== 1, optOut: stop };
}
export async function handleStatus(body) {
  if (
    !/^SM[0-9a-f]{32}$/i.test(body.MessageSid || "") ||
    ![
      "accepted",
      "scheduled",
      "queued",
      "sending",
      "sent",
      "delivered",
      "undelivered",
      "failed",
      "canceled",
      "read",
    ].includes(body.MessageStatus)
  )
    throw new Error("Invalid delivery status.");
  await smsRedis([
    "SET",
    `sms_twilio_status:${body.MessageSid}:${body.MessageStatus}`,
    JSON.stringify({
      status: body.MessageStatus,
      errorCode: body.ErrorCode || null,
      at: new Date().toISOString(),
    }),
    "EX",
    "2592000",
  ]);
}
