export async function smsRedis(command) {
  const url = process.env.KV_REST_API_URL,
    token = process.env.KV_REST_API_TOKEN;
  if (!url || !token)
    throw new Error("The SMS message store is not configured.");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok || data.error)
    throw new Error("The SMS message store is unavailable.");
  return data.result;
}
export async function isSmsSuppressed(phone) {
  return Boolean(await smsRedis(["GET", `sms_optout:${phone}`]));
}
