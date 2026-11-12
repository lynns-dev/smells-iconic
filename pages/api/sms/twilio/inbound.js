import { verifySmsWebhook, handleInbound } from "../../../../lib/sms/webhook";
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!verifySmsWebhook(req, "inbound"))
    return res.status(403).json({ error: "Invalid Twilio signature." });
  try {
    await handleInbound(req.body);
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send("<Response></Response>");
  } catch {
    return res
      .status(503)
      .json({ error: "Could not record SMS callback. Twilio may retry." });
  }
}
