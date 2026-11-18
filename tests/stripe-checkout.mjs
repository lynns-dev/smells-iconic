import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const kv = new Map(); let writes = 0; let orders = []; let failLedger = false;
const env = { STRIPE_CHECKOUT_ORIGIN: 'https://anese.co', STRIPE_CHECKOUT_ENABLED: 'true', STRIPE_SECRET_KEY: 'mock', STRIPE_WEBHOOK_SECRET: 'mock', KV_REST_API_URL: 'https://kv.invalid', KV_REST_API_TOKEN: 'mock' };
const context = vm.createContext({ process: {env}, console, URL, Intl, Date, Set, JSON, Math, fetch: async (_url, opts) => { const [op,key,value,...args] = JSON.parse(opts.body); let result; if(op==='GET') result=kv.get(key)||null; if(op==='DEL'){ kv.delete(key); result=1; } if(op==='SET'){ if(args.includes('NX')&&kv.has(key)) result=null; else {kv.set(key,value);result='OK';} } return {ok:true,json:async()=>({result})}; }});
const mock = values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});
const mods={ './stripeServer':mock({getStripe:()=>({})}), './analyticsStore':mock({getOrders:async()=>orders}), './orderFulfillment':mock({fulfillOrder:async order=>{writes++;if(!failLedger)orders.push(order);}}) };
const mod = new vm.SourceTextModule(await fs.readFile('lib/stripeCheckout.js','utf8'),{context}); await mod.link(spec=>mods[spec]); await mod.evaluate();
const complete=mod.namespace.completeStripeSession;
const pending={origin:'https://anese.co',stripeSessionId:'cs_test_a',amount:25,items:[{id:'p',quantity:1,price:25}],eventId:'e'};
const session={livemode:true,id:'cs_test_a',client_reference_id:'r',payment_status:'paid',currency:'usd',amount_total:2500,payment_intent:'pi_a',metadata:{origin:'https://anese.co'}};
kv.set('stripe:pending:r',JSON.stringify(pending));
assert.equal(await complete({...session,payment_status:'unpaid'},{}),null);assert.equal(writes,0);
await assert.rejects(complete({...session,amount_total:1},{}),/total mismatch/);assert.equal(writes,0);
await assert.rejects(complete({...session,id:'cs_other'},{}),/identity mismatch/);
await assert.rejects(complete({...session,metadata:{origin:'https://other.test'}},{}),/another store/);
assert.equal((await complete(session,{})).orderId,'pi_a'); assert.equal(writes,1);
await complete(session,{});assert.equal(writes,1);
kv.delete('stripe:fulfilled:pi_a');await complete(session,{});assert.equal(writes,1,'existing durable order prevents replay');
orders=[];kv.delete('stripe:fulfilled:pi_a');failLedger=true;
await assert.rejects(complete(session,{}),/not yet recorded/);assert.equal(kv.has('stripe:fulfilled:pi_a'),false,'failed ledger must retry');
kv.set('stripe:lock:pi_a','1');await assert.rejects(complete(session,{}),/in progress/);
const endpoint=await fs.readFile('pages/api/stripe/session.js','utf8'); assert.ok(endpoint.includes('await validateCheckout(body)')); assert.ok(endpoint.includes('req.headers.origin !== origin')); assert.ok(endpoint.includes('count > 20'));
console.log('PASS Stripe unpaid, spoofed amount, session binding, store isolation, duplicate replay, durable ledger failure, concurrent lock, canonical pricing and origin/rate checks');
// Exercise session handler with stubbed canonical-pricing and Stripe services.
let sessionOptions;let sessionParams;let sessionsCreated=0;let count=1;let pendingWrites=[];
const routeContext=vm.createContext({process:{env},console,URL,Date,JSON,Math,Number,String});
const routeMock = values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context:routeContext});
const routeMods={
 'crypto':routeMock({default:{randomUUID:()=> 'reference',createHash:()=>({update:()=>({digest:()=> 'hash'})})}}),
 '../../../lib/stripeServer':routeMock({getStripe:()=>({checkout:{sessions:{create:async (params, options)=>{sessionParams=params;sessionOptions=options;sessionsCreated++;return {id:'cs_test_new',client_secret:'cs_test_client_secret_mock'};}}}})}),
 '../../../lib/validateCheckout':routeMock({validateCheckout:async body=>{if(body.amount!==25)throw new Error('total changed');return {total:25,items:pending.items};}}),
 '../../../lib/metaCapi':routeMock({getBrowserContext:()=>({})}),
 '../../../lib/stripeCheckout':routeMock({stripeCheckoutEnabled:()=>true,stripeKV:async command=>{if(command[0]==='INCR')return count;if(command[0]==='SET')pendingWrites.push(command);return 'OK';}}),
};
const route=new vm.SourceTextModule(endpoint,{context:routeContext});await route.link(spec=>routeMods[spec]);await route.evaluate();
const body={amount:25,items:pending.items,email:'buyer@example.test',shipping:{name:'Test Buyer',address:'1 Test',city:'Test',zip:'90001',state:'CA'}};
async function call(origin, data=body){const res={status(n){this.code=n;return this;},json(x){this.data=x;return this;},end(){return this;}};await route.namespace.default({method:'POST',headers:{origin},body:data},res);return res;}
assert.equal((await call('https://attacker.test')).code,403);assert.equal(sessionsCreated,0);
assert.equal((await call(env.STRIPE_CHECKOUT_ORIGIN,{...body,amount:0.01})).code,400);assert.equal(sessionsCreated,0);
count=21;assert.equal((await call(env.STRIPE_CHECKOUT_ORIGIN)).code,429);assert.equal(sessionsCreated,0);
count=1;assert.equal((await call(env.STRIPE_CHECKOUT_ORIGIN)).code,200);assert.equal(sessionsCreated,1);assert.equal(JSON.parse(pendingWrites.at(-1)[2]).stripeSessionId,'cs_test_new');
console.log('PASS session API forged origin, invalid amount and rate limit prevent processor calls; confirmed session bound before redirect');

await assert.rejects(complete({...session,livemode:false},{}),/mode mismatch/); console.log('PASS test events rejected in live mode');

assert.equal(sessionParams.ui_mode,'embedded_page');assert.ok(sessionParams.return_url.includes('/stripe-return'));assert.equal(sessionParams.success_url,undefined);assert.equal(sessionParams.cancel_url,undefined);assert.equal((await call(env.STRIPE_CHECKOUT_ORIGIN)).data.clientSecret,'cs_test_client_secret_mock');console.log('PASS embedded session mode, return URL, client secret response; no hosted redirect');

assert.equal(sessionOptions.apiVersion,'2026-10-28.endive');console.log('PASS embedded session request explicitly pins compatible API version');
