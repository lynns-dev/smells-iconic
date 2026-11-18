// Run without external services: NODE_PATH=<temporary fengari install>/node_modules
// node --experimental-vm-modules tests/stripe-experiments.mjs
import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { lua, lauxlib, lualib, to_luastring: str, to_jsstring: js } = createRequire(import.meta.url)('fengari');
const values=new Map(), hashes=new Map(), ledger=[];
let fulfills=0, failMetrics=false;
function redis(command) {
  const [op,key,value,...args]=command;
  if(op==='GET')return values.get(key)||null;
  if(op==='SET'){if(args.includes('NX')&&values.has(key))return null;values.set(key,String(value));return 'OK';}
  if(op==='DEL'){values.delete(key);return 1;}
  if(op==='EXPIRE')return 1;
  if(op==='HINCRBY'||op==='HINCRBYFLOAT'){const hash=hashes.get(key)||{};hash[value]=(hash[value]||0)+Number(args[0]);hashes.set(key,hash);return String(hash[value]);}
  throw Error('Unexpected Redis command: '+op);
}
function runLua(script, keys, args) {
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const array=(items)=>{lua.lua_createtable(L,items.length,0);items.forEach((v,i)=>{lua.lua_pushstring(L,str(String(v)));lua.lua_rawseti(L,-2,i+1);});};
  array(keys);lua.lua_setglobal(L,str('KEYS'));array(args);lua.lua_setglobal(L,str('ARGV'));
  lua.lua_newtable(L);lua.lua_pushjsfunction(L,()=>{const command=[];for(let i=1;i<=lua.lua_gettop(L);i++)command.push(js(lua.lua_tostring(L,i)));const result=redis(command);if(result===null)lua.lua_pushboolean(L,false);else if(typeof result==='number')lua.lua_pushnumber(L,result);else lua.lua_pushstring(L,str(result));return 1;});lua.lua_setfield(L,-2,str('call'));lua.lua_setglobal(L,str('redis'));
  lua.lua_newtable(L);lua.lua_pushjsfunction(L,()=>{const parsed=JSON.parse(js(lua.lua_tostring(L,1)));array(parsed);return 1;});lua.lua_setfield(L,-2,str('decode'));lua.lua_setglobal(L,str('cjson'));
  const status=lauxlib.luaL_dostring(L,str(script));if(status!==lua.LUA_OK)throw Error(js(lua.lua_tostring(L,-1)));lua.lua_close(L);
}
const experiments={active_test:{variants:['control','treatment']},ended_test:{variants:['control'],winner:'control'},draft_test:{variants:['control'],status:'draft'},babygirl_scent_landing_v1:{variants:['control','landing']},shop_pay_checkout_v1:{variants:['control','shop_pay']}};
const env={KV_REST_API_URL:'https://mock.invalid',KV_REST_API_TOKEN:'mock',STRIPE_CHECKOUT_ORIGIN:'https://store.example',STRIPE_CHECKOUT_MODE:'test'};
const context=vm.createContext({process:{env},console,URL,Intl,Date,Set,JSON,Math,Number,String,Object,fetch:async(_url,options)=>{const command=JSON.parse(options.body);if(command[0]==='EVAL'){if(failMetrics)return {ok:false,json:async()=>({error:'Temporary metric outage'})};const n=Number(command[2]);runLua(command[1],command.slice(3,3+n),command.slice(3+n));return {ok:true,json:async()=>({result:1})};}return {ok:true,json:async()=>({result:redis(command)})};}});
const mock=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});
const helper=new vm.SourceTextModule(await fs.readFile('lib/stripeExperimentPurchase.js','utf8'),{context});await helper.link(spec=>spec.endsWith('/experiments')?mock({EXPERIMENTS:experiments}):mock({STEPS:['added','cart_open','checkout_click','checkout_view','address','payment_step','pay_attempt','purchased'].map(k=>[k,k])}));await helper.evaluate();
const {snapshotExperimentAttribution:snapshot,recordStripeExperimentPurchase:record}=helper.namespace;
const modules={'./stripeExperimentPurchase':helper,'./stripeServer':mock({getStripe:()=>({}),getCheckoutStripe:()=>({})}),'./stripeCheckoutServer':mock({getCheckoutStripe:()=>({})}),'./analyticsStore':mock({getOrders:async()=>ledger}),'./orderFulfillment':mock({fulfillOrder:async order=>{fulfills++;ledger.push(order);}})};
const completeModule=new vm.SourceTextModule(await fs.readFile('lib/stripeCheckout.js','utf8'),{context});await completeModule.link(spec=>modules[spec]);await completeModule.evaluate();const complete=completeModule.namespace.completeStripeSession;
const attribution=snapshot({active_test:'treatment',ended_test:'control',draft_test:'control',unknown:'control'},'visitor-123','desktop');assert.deepEqual(Object.keys(attribution.assignments),['active_test']);assert.equal(snapshot({active_test:'wrong'},'visitor-123'),null);assert.equal(snapshot({active_test:'control'},'bad'),null);
let seq=0;
function payment(who='visitor-123',variant='treatment') {const index=++seq;const pending={origin:env.STRIPE_CHECKOUT_ORIGIN,stripeSessionId:`cs_test_${index}`,amount:23.8,items:[{id:'product',price:28,quantity:1}],eventId:'event',experimentAttribution:snapshot({active_test:variant},who),sessionId:`session-${index}`};const session={id:pending.stripeSessionId,livemode:false,metadata:{origin:pending.origin},payment_status:'paid',client_reference_id:`ref-${index}`,currency:'usd',amount_total:2380,payment_intent:`pi_${index}`};values.set(`stripe:pending:${session.client_reference_id}`,JSON.stringify(pending));return {pending,session};}
const first=payment();assert.equal(await complete({...first.session,payment_status:'unpaid'},{}),null);assert.equal(hashes.size,0);await assert.rejects(complete({...first.session,amount_total:1},{}),/total mismatch/);assert.equal(hashes.size,0);
await complete(first.session,{});assert.equal(fulfills,1);assert.equal(hashes.get('exp:active_test:treatment').purchased,1);assert.equal(hashes.get('exp:active_test:treatment').revenue,23.8);
await Promise.all([complete(first.session,{}),complete(first.session,{})]);assert.equal(fulfills,1);assert.equal(hashes.get('exp:active_test:treatment').purchased,1);
await complete(payment().session,{});assert.equal(hashes.get('exp:active_test:treatment').purchased,1,'preserve unique purchasing visitor semantics across repeat orders');
await complete(payment('visitor-222','control').session,{});assert.equal(hashes.get('exp:active_test:control').purchased,1);assert.equal(hashes.get('exp:active_test:treatment').purchased,1);
const retry=payment('visitor-333');const before=fulfills;failMetrics=true;await assert.rejects(complete(retry.session,{}),/metric outage/);assert.equal(fulfills,before+1);assert.equal(values.has(`stripe:fulfilled:${retry.session.payment_intent}`),false);failMetrics=false;await complete(retry.session,{});assert.equal(fulfills,before+1,'retry never fulfills/emails the order twice');assert.equal(hashes.get('exp:active_test:treatment').purchased,2);
// A browser purchase recorded before rollout uses these same keys.
values.set('exp:active_test:seen:purchased:visitor-444','1');values.set('exp:active_test:seen:revenue:visitor-444','1');hashes.set('exp:active_test:treatment',{...hashes.get('exp:active_test:treatment'),purchased:3,revenue:71.4});await complete(payment('visitor-444').session,{});assert.equal(hashes.get('exp:active_test:treatment').purchased,3);assert.equal(hashes.get('exp:active_test:treatment').revenue,71.4);
const legacy={sessionId:'legacy-session',amount:28};values.set('exp:babygirl_scent_landing_v1:session:legacy-session',JSON.stringify({visitorId:'legacy-visitor',variant:'landing'}));values.set('exp:shop_pay_checkout_v1:session:legacy-session',JSON.stringify({visitorId:'wallet-visitor',variant:'shop_pay',device:'mobile'}));await record(legacy);await record(legacy);assert.equal(hashes.get('exp:babygirl_scent_landing_v1:landing').purchased,1);assert.equal(hashes.get('exp:shop_pay_checkout_v1:shop_pay').purchased,1);assert.equal(hashes.get('exp:shop_pay_checkout_v1:shop_pay').purchased_mobile,1);
await record({...legacy,experimentTrackingExcluded:true,amount:99});assert.equal(hashes.get('exp:babygirl_scent_landing_v1:landing').purchased,1);
experiments.active_test.winner='control';await complete(payment('visitor-555').session,{});assert.equal(hashes.get('exp:active_test:treatment').purchased,3,'permanent choices never restart');assert.equal(hashes.has('exp:ended_test:control'),false);assert.equal(hashes.has('exp:draft_test:control'),false);
console.log('PASS actual Lua: paid-only Stripe→ledger→A/B counters, correct arms/paid revenue, no browser return needed, webhook/status/concurrent retries, existing browser dedupe, repeat-buyer semantics, metric-outage recovery without repeat fulfillment, legacy Babygirl/wallet identity+device, exclusions, and frozen historical winners. No external services or payments.');
