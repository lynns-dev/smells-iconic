import { birthdayInput } from "../../lib/birthdayConsent";
import { birthdayRateLimit, saveBirthday } from "../../lib/birthdayStore";
export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (
    !String(req.headers["content-type"] || "")
      .toLowerCase()
      .startsWith("application/json")
  )
    return res.status(415).json({ error: "Please use the birthday form." });
  if (req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host)
        return res
          .status(403)
          .json({ error: "Please use the birthday form on this store." });
    } catch {
      return res
        .status(403)
        .json({ error: "Please use the birthday form on this store." });
    }
  }
  if (req.body?.website) return res.status(200).json({ ok: true });
  let input;
  try {
    input = birthdayInput(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const ip = String(
      req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
    )
      .split(",")[0]
      .trim();
    if (!(await birthdayRateLimit(ip, input.email))) {
      res.setHeader("Retry-After", "3600");
      return res
        .status(429)
        .json({ error: "Please wait a little before trying again." });
    }
    await saveBirthday(input);
    return res.status(200).json({ ok: true });
  } catch {
    return res
      .status(503)
      .json({
        error: "We couldn’t save that just now. Please try again later.",
      });
  }
}
