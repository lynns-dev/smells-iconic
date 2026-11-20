import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
const db=new Map(),queue=new Map(),orders=new Map(),writes=[];
let failCharge=false,wrongOrigin=false,wrongAmount=false;
const payment={id:'pi_fixture',status:'succeeded',currency:'usd',amount_received:2900,latest_charge:'ch_fixture',metadata:{origin:'https://store.test'},shipping:{name:'Existing Recipient',address:{line1:'Keep Address',country:'US'}}};
const stripe={paymentIntents:{retrieve:async()=>({...payment,amount_received:wrongAmount?1:2900,metadata:{origin:wrongOrigin?'https://other.test':'https://store.test'}}),update:async(id,payload)=>{writes.push({object:'payment',id,payload});return payload;}},charges:{retrieve:async()=>({id:'ch_fixture',paid:true,payment_intent:'pi_fixture',shipping:payment.shipping}),update:async(id,payload)=>{if(failCharge)throw new Error('Stripe unavailable');writes.push({object:'charge',id,payload});return payload;}}};
const context=vm.createContext({process:{env:{KV_REST_API_URL:'https://kv.test',KV_REST_API_TOKEN:'fixture',STRIPE_CHECKOUT_ORIGIN:'https://store.test'}},console:{error(){}},fetch:async(_,o)=>{
const [op,key,a,b]=JSON.parse(o.body);let result;
if(op==='SET'){result=db.has(key)?null:'OK';if(result)db.set(key,a);}
if(op==='EVAL'){db.delete(b);result=1;}
if(op==='HSET'){queue.set(a,b);result=1;}
if(op==='HGET')result=queue.get(a)||null;
if(op==='HDEL')result=queue.delete(a)?1:0;
if(op==='HKEYS')result=[...queue.keys()];if(op==='INCR')result=1;
return {ok:true,json:async()=>({result})};}});
const synth=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v)},{context});
const mod=new vm.SourceTextModule(await fs.readFile('lib/stripeTracking.js','utf8'),{context});
await mod.link(spec=>spec==='crypto'?synth({createHash:crypto.createHash,randomUUID:crypto.randomUUID}):spec.endsWith('stripeServer')?synth({getStripe:()=>stripe}):synth({getOrders:async()=>[],dateKeysForRange:()=>[],updateOrderStatus:async(id,patch)=>{const next={...orders.get(id),...patch};orders.set(id,next);return next;}}));await mod.evaluate();const api=mod.namespace;
const order={id:'pi_fixture',processor:'stripe',amount:29,trackingNumber:'TRACK1',carrier:'USPS',trackingUrl:'https://tracking.test/1',shippedAt:'2026-11-20T00:00:00Z'};orders.set(order.id,order);
await api.withTrackingLock(order.id,async()=>{await api.queueStripeTracking(order);await api.runStripeTrackingJob(order.id)});
assert.equal(writes.length,2);for(const write of writes){assert.equal(write.payload.shipping.tracking_number,'TRACK1');assert.equal(write.payload.shipping.name,'Existing Recipient');assert.equal(write.payload.shipping.address.line1,'Keep Address');assert.equal(write.payload.metadata.tracking_url,order.trackingUrl);assert(!('amount' in write.payload));assert(!('receipt_email' in write.payload));}assert.equal(queue.size,0);assert.equal(orders.get(order.id).stripeTrackingSync.status,'synced');
failCharge=true;await api.queueStripeTracking({...order,trackingNumber:'TRACK2'});await api.runStripeTrackingJob(order.id);assert.equal(queue.size,1);assert.equal(orders.get(order.id).stripeTrackingSync.status,'pending');
failCharge=false;await api.retryStripeTracking();assert.equal(queue.size,0);assert.equal(writes.at(-1).payload.shipping.tracking_number,'TRACK2');
await api.queueStripeTracking({...order,trackingNumber:null,carrier:null,trackingUrl:null,shippedAt:null});await api.runStripeTrackingJob(order.id);assert.equal(writes.at(-1).payload.shipping.tracking_number,'');assert.equal(writes.at(-1).payload.metadata.fulfillment_status,'unfulfilled');
wrongOrigin=true;await assert.rejects(()=>api.syncStripeTracking(order),/another store/);wrongOrigin=false;wrongAmount=true;await assert.rejects(()=>api.syncStripeTracking(order),/match/);wrongAmount=false;
const count=writes.length;await api.syncStripeTracking({...order,processor:'square'});assert.equal(writes.length,count);
await api.withTrackingLock(order.id,async()=>{await assert.rejects(()=>api.withTrackingLock(order.id,async()=>{}),/already/)});
assert.equal(db.size,0);
console.log('PASS payment + charge native tracking, metadata, address preservation, safe amount/origin checks, clear/correct tracking, durable partial-failure retry, other processors untouched, exclusive edit lock. No Stripe calls or real orders.');
