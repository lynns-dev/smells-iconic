export const inboxConversationKey = (entry) => {
  const email = String(entry.email || "")
    .trim()
    .toLowerCase();
  return email ? `email:${email}` : `entry:${entry.id}`;
};
export const countOpenConversations = (entries) =>
  new Set(
    entries.filter((entry) => entry.status === "new").map(inboxConversationKey),
  ).size;
export function mergeInboxEntries(previous, updated, replace = false) {
  if (replace) return updated.filter(Boolean);
  const byId = new Map(previous.map((entry) => [entry.id, entry]));
  for (const entry of updated.filter(Boolean)) byId.set(entry.id, entry);
  return [...byId.values()];
}
// A GET started before/during a reply cannot restore its old unread state.
export function createInboxSync() {
  let version = 0,
    request = 0,
    mutations = 0;
  return {
    beginLoad() {
      return mutations ? null : { version, request: ++request };
    },
    accepts(ticket) {
      return Boolean(
        ticket &&
          ticket.version === version &&
          ticket.request === request &&
          !mutations,
      );
    },
    beginMutation() {
      version++;
      mutations++;
      let finished = false;
      return () => {
        if (!finished) {
          finished = true;
          mutations--;
          version++;
        }
      };
    },
  };
}
