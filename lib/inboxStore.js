const KEY = "inbox";
const MAX_ENTRIES = 2000;
async function redis(command) {
  const url = process.env.KV_REST_API_URL,
    token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Inbox storage is not configured.");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw new Error("Inbox storage is unavailable.");
  return data.result;
}
const normalize = (entries) =>
  entries.map((entry) => ({
    ...entry,
    replies: Array.isArray(entry.replies) ? entry.replies : [],
  }));
export async function getInbox() {
  const raw = await redis(["GET", KEY]);
  const entries = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(entries)) throw new Error("Inbox data is invalid.");
  return normalize(entries);
}
// All inbox writers share one atomic update, preserving simultaneous incoming
// messages and replies. Only the messages actually covered by a reply close.
const MUTATE = `
local entries=cjson.decode(redis.call('GET',KEYS[1]) or '[]')
local op=cjson.decode(ARGV[1])
local targets={}
for _,id in ipairs(op.ids or {}) do targets[id]=true end
if op.kind=='add' then
  local found=false
  for _,entry in ipairs(entries) do if entry.id==op.entry.id then found=true end end
  if not found then table.insert(entries,op.entry) end
  while #entries>tonumber(ARGV[2]) do table.remove(entries,1) end
elseif op.kind=='delete' then
  local kept={}
  for _,entry in ipairs(entries) do if not targets[entry.id] then table.insert(kept,entry) end end
  entries=kept
elseif op.kind=='reply' then
  local found=false
  for _,entry in ipairs(entries) do
    if entry.id==op.id then
      found=true
      entry.replies=entry.replies or {}
      local duplicate=false
      for _,reply in ipairs(entry.replies) do if reply.id==op.reply.id then duplicate=true end end
      if not duplicate then table.insert(entry.replies,op.reply) end
      entry.status='answered'
      entry.answeredAt=op.reply.at
    elseif targets[entry.id] and entry.status=='new' then
      entry.status='answered'
      entry.answeredAt=op.reply.at
    end
  end
  if not found then return redis.error_reply('Inbox message no longer exists') end
else
  for _,entry in ipairs(entries) do if targets[entry.id] then
    for key,value in pairs(op.updates) do entry[key]=value end
  end end
end
local encoded='[]'
if #entries>0 then encoded=cjson.encode(entries) end
redis.call('SET',KEYS[1],encoded)
return encoded`;
async function mutate(operation) {
  return normalize(
    JSON.parse(
      await redis([
        "EVAL",
        MUTATE,
        "1",
        KEY,
        JSON.stringify(operation),
        String(MAX_ENTRIES),
      ]),
    ),
  );
}
export async function addInboxEntry(entry) {
  return (await mutate({ kind: "add", entry })).find(
    (row) => row.id === entry.id,
  );
}
export async function updateInboxEntry(id, updates) {
  return (await updateInboxEntries([id], updates))[0] || null;
}
export async function updateInboxEntries(ids, updates) {
  return (await mutate({ kind: "update", ids, updates })).filter((row) =>
    ids.includes(row.id),
  );
}
export async function deleteInboxEntries(ids) {
  return mutate({ kind: "delete", ids });
}
export async function recordInboxReply(id, reply, coveredIds) {
  return mutate({ kind: "reply", id, reply, ids: coveredIds });
}
