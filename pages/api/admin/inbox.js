import {
  inboxConversationKey,
  countOpenConversations,
} from "../../../lib/inboxState";
// Admin read/update/reply for Contact-page messages (lib/inboxStore.js).
// Behind the admin session check in middleware.js like every
// /api/admin/* route.
//
// POST { id, reply } emails the reply to the person who wrote in
// (lib/inboxReplyEmail.js, through Resend), saves it on the entry
// (entry.replies) and marks the entry answered. Nothing is saved if the
// email doesn't go out, so admin can fix the problem and send again. Their
// other unanswered messages are marked answered too — the Inbox shows
// everything from one email address as one conversation.
//
// PATCH { ids, status } and DELETE { ids } act on a whole conversation
// ({ id } still works for a single entry).

import crypto from "crypto";
import {
  getInbox,
  updateInboxEntry,
  updateInboxEntries,
  deleteInboxEntries,
  recordInboxReply,
  reconcileInbox,
} from "../../../lib/inboxStore";
import { sendInboxReply } from "../../../lib/inboxReplyEmail";

const STATUSES = ["new", "answered", "archived"];
const MAX_REPLY = 5000;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const entries = await reconcileInbox();
      return res
        .status(200)
        .json({
          entries: entries.slice().reverse(),
          openCount: countOpenConversations(entries),
        });
    }
    if (req.method === "POST") {
      const { id, reply } = req.body || {};
      const text = String(reply || "").trim();
      if (!id || !text)
        return res.status(400).json({ error: "Write a reply first." });
      if (text.length > MAX_REPLY)
        return res
          .status(400)
          .json({
            error: `Keep replies under ${MAX_REPLY.toLocaleString()} characters.`,
          });
      const beforeReply = await getInbox();
      const entry = beforeReply.find((e) => e.id === id);
      if (!entry) return res.status(404).json({ error: "Not found." });
      if (!entry.email)
        return res.status(400).json({ error: "There’s no email to reply to." });

      let sent;
      try {
        sent = await sendInboxReply({ entry, reply: text });
      } catch (err) {
        return res
          .status(502)
          .json({ error: `The email didn’t send: ${err.message}` });
      }
      const replyRecord = {
        id: crypto.randomUUID(),
        text,
        at: new Date().toISOString(),
        emailId: sent?.id || null,
      };
      const coveredIds = beforeReply
        .filter(
          (e) =>
            e.status === "new" &&
            inboxConversationKey(e) === inboxConversationKey(entry),
        )
        .map((e) => e.id);
      replyRecord.coveredIds = coveredIds;
      let snapshot;
      try {
        snapshot = await recordInboxReply(id, replyRecord, coveredIds);
      } catch {
        return res
          .status(503)
          .json({
            sent: true,
            error:
              "The reply was emailed, but the inbox could not update. Refresh the inbox before sending again.",
          });
      }
      const updated = snapshot.find((e) => e.id === id);
      return res
        .status(200)
        .json({
          entry: updated,
          entries: snapshot.filter(
            (e) => e.id === id || coveredIds.includes(e.id),
          ),
          snapshot,
          openCount: countOpenConversations(snapshot),
        });
    }
    if (req.method === "PATCH") {
      const { id, ids, status } = req.body || {};
      const targets = Array.isArray(ids) ? ids : id ? [id] : [];
      if (!targets.length || !STATUSES.includes(status))
        return res
          .status(400)
          .json({ error: "ids and a valid status are required." });
      const updated = await updateInboxEntries(targets, { status, ...(status === "new" ? { reopenedAt: new Date().toISOString() } : {}) });
      if (!updated.length) return res.status(404).json({ error: "Not found." });
      const snapshot = await getInbox();
      return res
        .status(200)
        .json({
          entry: updated[0],
          entries: updated,
          snapshot,
          openCount: countOpenConversations(snapshot),
        });
    }
    if (req.method === "DELETE") {
      const { id, ids } = req.body || {};
      const targets = Array.isArray(ids) ? ids : id ? [id] : [];
      if (!targets.length)
        return res.status(400).json({ error: "ids are required." });
      const snapshot = await deleteInboxEntries(targets);
      return res
        .status(200)
        .json({
          ok: true,
          snapshot,
          openCount: countOpenConversations(snapshot),
        });
    }
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
