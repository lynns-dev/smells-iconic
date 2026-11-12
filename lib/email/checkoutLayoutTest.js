import { randomUUID, createHash } from 'crypto';
const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'email_abandoned_checkout_layout_test';
async function command(command) {
  if (!URL || !TOKEN) throw new Error('Email store is not configured.');
  const response = await fetch(URL, {method:'POST', headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(command)});
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('Could not update checkout test.');
  return data.result;
}
export async function getCheckoutLayoutTest() {
  const value = await command(['GET', KEY]);
  return value ? JSON.parse(value) : {enabled:false,winner:'a'};
}
export async function changeCheckoutLayoutTest(action, winner) {
  const current = await getCheckoutLayoutTest();
  let next;
  if (action === 'start') {
    if (current.enabled) throw new Error('Checkout test is already running.');
    next = {...current,enabled:true,testId:randomUUID().slice(0,8),startedAt:Date.now()};
  } else if (action === 'stop' && ['a','b'].includes(winner)) {
    if (!current.enabled) throw new Error('No checkout test is running.');
    next = {...current,enabled:false,winner,endedAt:Date.now()};
  } else throw new Error('Invalid checkout test action.');
  await command(['SET',KEY,JSON.stringify(next)]);
  return next;
}
export function checkoutLayoutVariant(test, email) {
  if (!test?.enabled || !test.testId) return test?.winner === 'b' ? 'b' : 'a';
  return createHash('sha256').update(`${test.testId}:${String(email).trim().toLowerCase()}`).digest()[0] % 2 ? 'b' : 'a';
}
