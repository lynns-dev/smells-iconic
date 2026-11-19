import { findPromo } from '../promos';
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
  const current = value ? JSON.parse(value) : {enabled:false,winner:'a'};
  // Never email an expired offer. Existing per-test counters remain intact.
  if (current.enabled && current.type === 'offer' && !findPromo('BLACKFRIDAY20')) {
    const record = {testId:current.testId,type:'offer',startedAt:current.startedAt,endedAt:Date.now(),outcome:'offer_expired'};
    const next = {...current,enabled:false,winner:'a',endedAt:record.endedAt,history:[...(current.history || []),record].slice(-20)};
    await command(['SET',KEY,JSON.stringify(next)]);
    return next;
  }
  return current;
}
export async function changeCheckoutLayoutTest(action, winner, type = 'layout', results = null) {
  const current = await getCheckoutLayoutTest();
  let next;
  if (action === 'start') {
    if (current.enabled) throw new Error('Checkout test is already running.');
    if (!['layout','message','subject','offer'].includes(type)) throw new Error('Invalid checkout test type.');
    if (type === 'offer' && !findPromo('BLACKFRIDAY20')) throw new Error('The Black Friday offer is not active.');
    next = {...current,enabled:true,type,winner:'a',testId:randomUUID().slice(0,8),startedAt:Date.now(),endedAt:null};
  } else if (action === 'pause') {
    if (!current.enabled) throw new Error('No checkout test is running.');
    const record = {testId:current.testId,type:current.type || 'layout',startedAt:current.startedAt,endedAt:Date.now(),outcome:'paused_without_winner',results};
    next = {...current,enabled:false,winner:'a',endedAt:record.endedAt,history:[...(current.history || []),record].slice(-20)};
  } else if (action === 'stop'  && ['a','b'].includes(winner)) {
    if (!current.enabled) throw new Error('No checkout test is running.');
    const record = {testId:current.testId,type:current.type || 'layout',startedAt:current.startedAt,endedAt:Date.now(),outcome:'manual_selection',winner,results};
    next = {...current,enabled:false,winner,endedAt:record.endedAt,history:[...(current.history || []),record].slice(-20)};
  } else throw new Error('Invalid checkout test action.');
  await command(['SET',KEY,JSON.stringify(next)]);
  return next;
}
export function checkoutLayoutVariant(test, email) {
  if (!test?.enabled || !test.testId) return test?.winner === 'b' ? 'b' : 'a';
  return createHash('sha256').update(`${test.testId}:${String(email).trim().toLowerCase()}`).digest()[0] % 2 ? 'b' : 'a';
}
