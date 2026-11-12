import { getSmsConnection } from "../../../../lib/sms/provider";
import { getSmsSubscribers } from "../../../../lib/email/smsStore";
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const connection = await getSmsConnection();
    const subscribers = await getSmsSubscribers();
    return res
      .status(200)
      .json({
        provider: "Twilio",
        connection,
        configured: connection.canSend,
        subscribed: subscribers.filter(
          (s) => s.status === "subscribed" && s.consentAt,
        ).length,
      });
  } catch {
    return res
      .status(503)
      .json({ error: "Could not check the SMS connection." });
  }
}
