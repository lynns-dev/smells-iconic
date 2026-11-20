import { createHash, randomUUID } from 'crypto';
import { getStripe } from './stripeServer';
import { updateOrderStatus, getOrders, dateKeysForRange } from './analyticsStore';

const QUEUE = 'stripe:tracking:pending';
const OPTIONS = { timeout: 10000, maxNetworkRetries: 1 };
async function redis(command) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) throw new Error('Tracking sync storage unavailable.');
  const response = await fetch(process.env.KV_REST_API_URL, {method:'POST',headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(command)});
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('Tracking sync storage unavailable.');
  return data.result;
}
export async function withTrackingLock(id, action) {
  const key = `stripe:tracking:lock:${id}`, token = randomUUID();
  if (!await redis(['SET',key,token,'NX','EX',120])) throw new Error('Tracking is already being updated. Try again shortly.');
  try { return await action(); }
  finally { await redis(['EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,key,token]); }
}
export async function syncStripeTracking(order) {
  if (order.processor !== 'stripe') return;
  if (!/^pi_[A-Za-z0-9]+$/.test(order.id || '')) throw new Error('Invalid Stripe payment identifier.');
  const stripe = getStripe();
  const step = async (stage, action) => {try{return await action();}catch(error){error.trackingStage=stage;throw error;}};
  const payment = await step('read_payment',()=>stripe.paymentIntents.retrieve(order.id, {}, OPTIONS));
  if (payment.status !== 'succeeded' || payment.currency !== 'usd' || payment.amount_received !== Math.round(Number(order.amount)*100)) throw new Error('Stripe payment does not match the paid order.');
  const origin = process.env.STRIPE_CHECKOUT_ORIGIN?.replace(/\/$/,'');
  if (payment.metadata?.origin && payment.metadata.origin !== origin) throw new Error('Stripe payment belongs to another store.');
  const chargeId = typeof payment.latest_charge === 'string' ? payment.latest_charge : payment.latest_charge?.id;
  if (!chargeId) throw new Error('Stripe payment has no charge to update.');
  const charge = await step('read_charge',()=>stripe.charges.retrieve(chargeId, {}, OPTIONS));
  if ((typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id) !== order.id || !charge.paid) throw new Error('Stripe charge does not match this order.');
  const local = order.shipping || {};
  const fallback = {name:local.name || '',address:{line1:local.address || '',line2:local.apt || '',city:local.city || '',state:local.state || '',postal_code:local.zip || '',country:local.country || 'US'},...(local.phone?{phone:local.phone}:{})};
  const shipping = existing => ({...(existing || payment.shipping || fallback),carrier:order.carrier || '',tracking_number:order.trackingNumber || ''});
  const metadata = {tracking_number:order.trackingNumber || '',tracking_carrier:order.carrier || '',tracking_url:order.trackingUrl || '',fulfillment_status:order.trackingNumber?'fulfilled':'unfulfilled',shipped_at:order.shippedAt || ''};
  // Completed charges have their own shipping snapshot: update both objects.
  // Never confirm/capture/refund, change payment amounts, or send receipts.
  await step('update_payment',()=>stripe.paymentIntents.update(order.id,{shipping:shipping(payment.shipping),metadata},OPTIONS));
  await step('update_charge',()=>stripe.charges.update(chargeId,{shipping:shipping(charge.shipping),metadata},OPTIONS));
}
export async function queueStripeTracking(order) {
  const job = {id:order.id,processor:'stripe',amount:order.amount,shipping:order.shipping,trackingNumber:order.trackingNumber,trackingUrl:order.trackingUrl,carrier:order.carrier,shippedAt:order.shippedAt};
  job.version = createHash('sha256').update(JSON.stringify(job)).digest('hex');
  await redis(['HSET',QUEUE,order.id,JSON.stringify(job)]);
}
// Caller holds the per-order lock, shared with admin edits and retries.
export async function runStripeTrackingJob(id) {
  const raw = await redis(['HGET',QUEUE,id]);
  if (!raw) return null;
  const job = typeof raw === 'string' ? JSON.parse(raw) : raw;
  try {
    await syncStripeTracking(job);
    const order = await updateOrderStatus(id,{stripeTrackingSync:{status:'synced',syncedAt:new Date().toISOString(),version:job.version}});
    if (!order) throw new Error('Order record unavailable.');
    await redis(['HDEL',QUEUE,id]);
    return order;
  } catch (error) {
    console.error('Stripe tracking sync failed:',error.code || error.type || 'sync_error',error.trackingStage || 'ledger');
    // Keep the durable job until both Stripe objects and the ledger succeed.
    return updateOrderStatus(id,{stripeTrackingSync:{status:'pending',errorCode:/^[a-z_]+$/.test(error.code || '') ? error.code : 'sync_error',stage:error.trackingStage || 'ledger',lastAttemptAt:new Date().toISOString(),version:job.version}});
  }
}
export async function retryStripeTracking() {
  const all = await redis(['HKEYS',QUEUE]) || [];
  const cursor = Number(await redis(['INCR','stripe:tracking:retry-cursor'])) || 0;
  const start = all.length ? (cursor * 20) % all.length : 0;
  const ids = [...all.slice(start),...all.slice(0,start)].slice(0,20);
  const results = [];
  for (const id of ids) {
    try { const order = await withTrackingLock(id,()=>runStripeTrackingJob(id));results.push({id,status:order?.stripeTrackingSync?.status || 'skipped'}); }
    catch { results.push({id,status:'retry_pending'}); }
  }
  return results;
}

export async function queueExistingStripeTracking() {
  const days = await Promise.all(dateKeysForRange('45d').map(async day=>({day,orders:await getOrders(day)})));
  let queued = 0;
  for (const {day,orders} of days) for (const candidate of orders) {
    if (candidate.processor !== 'stripe' || !candidate.trackingNumber || candidate.stripeTrackingSync?.status === 'synced') continue;
    await withTrackingLock(candidate.id,async()=>{
      // Re-read under the same lock as admin edits; never enqueue an old label.
      const order = (await getOrders(day)).find(o=>o.id === candidate.id);
      if(order?.processor === 'stripe' && order.trackingNumber && order.stripeTrackingSync?.status !== 'synced') {await queueStripeTracking(order);queued++;}
    });
  }
  return queued;
}
export async function stripeTrackingSummary() {
  const orders = (await Promise.all(dateKeysForRange('45d').map(day=>getOrders(day)))).flat().filter(o=>o.processor === 'stripe' && o.trackingNumber);
  const syncErrors = {};
  for(const order of orders) {const state=order.stripeTrackingSync;if(state?.status === 'pending' && state.errorCode){const key=`${state.errorCode}:${state.stage || 'unknown'}`;syncErrors[key]=(syncErrors[key] || 0)+1;}}
  return {syncErrors,fulfilledStripeOrders:orders.length,synced:orders.filter(o=>o.stripeTrackingSync?.status === 'synced').length,pending:Number(await redis(['HLEN',QUEUE])) || 0};
}
