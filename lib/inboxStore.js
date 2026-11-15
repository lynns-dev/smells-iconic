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
local changed=op.kind~='reconcile'
for _,id in ipairs(op.ids or {}) do targets[id]=true end
if op.kind=='reconcile' then
  local latest={}
  local function emailkey(entry)
    if type(entry.email)~='string' then return '' end
    return string.lower(string.match(entry.email,'^%s*(.-)%s*$'))
  end
  for _,entry in ipairs(entries) do
    local key=emailkey(entry)
    if key~='' and type(entry.replies)=='table' then
      for _,reply in ipairs(entry.replies) do
        if type(reply.at)=='string' and (not latest[key] or reply.at>latest[key].at) then latest[key]=reply end
      end
    end
  end
  for _,entry in ipairs(entries) do
    local lastReply=latest[emailkey(entry)]
    local replyAt=lastReply and lastReply.at
    local covered=true
    if lastReply and type(lastReply.coveredIds)=='table' then
      covered=false
      for _,id in ipairs(lastReply.coveredIds) do if id==entry.id then covered=true end end
    end
    local incomingAt=entry.updatedAt or entry.createdAt
    local reopened=type(entry.reopenedAt)=='string' and replyAt and entry.reopenedAt>replyAt
    if entry.status=='new' and covered and replyAt and type(incomingAt)=='string' and incomingAt<=replyAt and not reopened then
      entry.status='answered'
      entry.answeredAt=replyAt
      changed=true
    end
  end
elseif op.kind=='add' then
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
if changed then redis.call('SET',KEYS[1],encoded) end
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

export async function reconcileInbox() { return mutate({ kind: 'reconcile' }); }
