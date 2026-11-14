import { listBirthdays, withdrawBirthday } from "../../../lib/birthdayStore";
// Protected by the store's existing /api/admin middleware.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const cursor = req.query.cursor || "0";
      if (typeof cursor !== "string" || !/^\d{1,30}$/.test(cursor))
        return res.status(400).json({ error: "Invalid page." });
      return res.status(200).json(await listBirthdays(cursor));
    }
    if (req.method === "POST" && req.body?.action === "withdraw") {
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return res.status(403).end();
      if (!/^[a-f0-9]{64}$/.test(req.body.id || ""))
        return res.status(400).json({ error: "Invalid birthday record." });
      await withdrawBirthday(req.body.id);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch {
    return res
      .status(503)
      .json({ error: "Birthday records are temporarily unavailable." });
  }
}
