import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {transformSync}=require('next/dist/compiled/babel/core');
const source=await fs.readFile('components/StripeCheckoutButton.jsx','utf8');
const {code}=transformSync(source,{filename:'StripeCheckoutButton.jsx',babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:false,targets:{node:'current'}},'preset-react':{runtime:'classic'}}]]});
let slots=[],cursor=0,pending=[],tree,requests=0,mounts=0,destroys=0,fail=false,confirmCalls=0,confirmArgs,redirect,decline=false,events={},ready=false;
let payload={amount:23.8,items:[{id:'babygirl',quantity:1,price:28}],email:'buyer@example.test',shipping:{name:'QA',address:'Test',city:'Test',state:'NY',zip:'10001'},discountCode:'ICONIC15'};
const props={disabled:true,getPayload:()=>payload,submitRef:{current:null},onBusy:b=>props.disabled=b,onError:()=>{},onReady:r=>ready=r};
const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef:initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect:(fn,deps)=>{const i=cursor++;if(!deps||!slots[i]){slots[i]=true;pending.push(fn);}}};
function element(kind){const handlers={};events[kind]=handlers;return{on:(e,h)=>handlers[e]=h,mount:()=>{mounts++;handlers.ready?.(kind==='express'?{availablePaymentMethods:{applePay:true}}:{});},destroy:()=>destroys++};}
const context=vm.createContext({process:{env:{NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED:'true',NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'mock',NEXT_PUBLIC_STRIPE_CHECKOUT_PUBLISHABLE_KEY:'mock'}},window:{location:{assign:url=>redirect=url},matchMedia:()=>({matches:false}),Stripe:()=>({initCheckoutElementsSdk:()=>({loadActions:async()=>({type:'success',actions:{confirm:async args=>{confirmCalls++;confirmArgs=args;return decline?{type:'error',error:{message:'Declined'}}:{type:'success',session:{id:'cs_test_qa'}};}}}),createPaymentElement:()=>element('payment'),createExpressCheckoutElement:()=>element('express')})})},console,JSON,Promise,Object,encodeURIComponent});
const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>{let values=spec.startsWith('@babel/runtime/')?{default:require('next/dist/compiled/'+spec)}:spec==='react'?{default:React}:spec.includes('paymentFetch')?{paymentFetch:async()=>{requests++;return{ok:!fail,json:async()=>fail?{error:'Try again'}:{clientSecret:'mock'}};}}:spec.includes('theme')?{T:{ink:'#222',soft:'#666',line:'#ddd'}}:spec.includes('experiments')?{exposedExperiments:()=>({active_test:'control'})}:{getVisitorId:()=> 'visitor-123'};return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await mod.evaluate();
function nodes(n){if(!n||typeof n!=='object')return[];return[n,...(n.props?.children||[]).flat(Infinity).flatMap(nodes)];}
function render(){cursor=0;pending=[];tree=mod.namespace.default(props);for(const n of nodes(tree))if(n.props?.ref)n.props.ref.current={};for(const e of pending)e();}
async function pump(){for(let i=0;i<8;i++){render();await Promise.resolve();await Promise.resolve();}}
await pump();assert.equal(requests,0);props.disabled=false;await pump();assert.equal(requests,1);assert.equal(mounts,2);assert.equal(ready,true);await pump();assert.equal(requests,1);
assert.ok(nodes(tree).some(n=>n.props?.children?.includes('Credit or Debit Card')),'native card section is always present');
await props.submitRef.current();assert.equal(confirmCalls,1);assert.equal(confirmArgs.billingAddress.address.postal_code,'10001');assert.equal(redirect,'/stripe-return?session_id=cs_test_qa');
redirect=null;decline=true;await props.submitRef.current();assert.equal(redirect,null);assert.equal(props.disabled,false,'decline releases order button');decline=false;
const walletEvent={wallet:'mock'};await events.express.confirm(walletEvent);assert.equal(confirmArgs.expressCheckoutConfirmEvent,walletEvent,'wallet authorization goes to same confirmed session');
const staleSubmit=props.submitRef.current;payload={...payload,amount:22.4,discountCode:'BLACKFRIDAY20'};const previous=confirmCalls;await staleSubmit();assert.equal(confirmCalls,previous,'stale form cannot pay changed total');await pump();assert.equal(requests,2);assert.equal(mounts,4);assert.ok(destroys>=2);
fail=true;payload={...payload,amount:21};await pump();assert.equal(ready,false);const retry=nodes(tree).find(n=>n.type==='button');assert.ok(retry);fail=false;await retry.props.onClick();await pump();assert.equal(ready,true);
assert.equal(source.includes('createEmbeddedCheckoutPage'),false);assert.equal(source.includes('Loading secure payment form'),false);
console.log('PASS native card section + express mounts; readiness gating; canonical billing passed to confirm; declines retry; wallet confirmation uses same session; stale totals blocked and recreated; rerenders dedupe; connection failure retries. No real charge.');
