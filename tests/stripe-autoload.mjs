import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {transformSync}=require('next/dist/compiled/babel/core');
const source=await fs.readFile('components/StripeCheckoutButton.jsx','utf8');
const {code}=transformSync(source,{filename:'StripeCheckoutButton.jsx',babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:false,targets:{node:'current'}},'preset-react':{runtime:'classic'}}]]});
const slots=[];let cursor=0,pending=[],tree,requests=0,mounts=0,destroys=0,fail=false;let payload={amount:23.8,items:[{id:'babygirl',quantity:1,price:28}],email:'buyer@example.test',shipping:{address:'Test'},discountCode:'ICONIC15'};
const props={disabled:true,getPayload:()=>payload,onBusy:b=>{props.disabled=b;},onError:()=>{}};
const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef:initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect:(fn,deps)=>{const i=cursor++;if(!deps||!slots[i]){slots[i]=true;pending.push(fn);}}};
const context=vm.createContext({process:{env:{NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED:'true',NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'mock',NEXT_PUBLIC_STRIPE_CHECKOUT_PUBLISHABLE_KEY:'mock'}},window:{matchMedia:()=>({matches:false}),Stripe:()=>({createEmbeddedCheckoutPage:async()=>({mount:()=>mounts++,destroy:()=>destroys++})})},console,JSON,Promise});
const mod=new vm.SourceTextModule(code,{context});
await mod.link(spec=>{let values=spec.startsWith('@babel/runtime/')?{default:require('next/dist/compiled/'+spec)}:spec==='react'?{default:React}:spec.includes('paymentFetch')?{paymentFetch:async()=>{requests++;return {ok:!fail,json:async()=>fail?{error:'Try again'}:{clientSecret:'mock'}};}}:spec.includes('experiments')?{exposedExperiments:()=>({active_test:'control'})}:{getVisitorId:()=> 'visitor-123'};return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await mod.evaluate();
function nodes(node){if(!node||typeof node!=='object')return [];return [node,...(node.props?.children||[]).flat(Infinity).flatMap(nodes)];}
function render(){cursor=0;pending=[];tree=mod.namespace.default(props);for(const n of nodes(tree))if(n.props?.ref)n.props.ref.current={};for(const effect of pending)effect();}
async function pump(){for(let i=0;i<7;i++){render();await Promise.resolve();await Promise.resolve();}}
await pump();assert.equal(requests,0,'external validation blocks auto-load');props.disabled=false;await pump();assert.equal(requests,1);assert.equal(mounts,1,'form mounts with no click');assert.equal(props.disabled,false,'Back/edit controls enabled after load');await pump();assert.equal(requests,1,'parent rerenders do not create more sessions');
payload={...payload,amount:22.4,discountCode:'BLACKFRIDAY20'};await pump();assert.equal(requests,2);assert.equal(mounts,2);assert.ok(destroys>=1,'stale form removed on changed total');
fail=true;payload={...payload,amount:21};await pump();const retry=nodes(tree).find(n=>n.props?.id==='stripe-checkout-button');assert.ok(retry,'failed load offers an explicit retry');fail=false;await retry.props.onClick();await pump();assert.equal(mounts,3);assert.equal(nodes(tree).some(n=>n.props?.id==='stripe-checkout-button'),false);
assert.equal(source.includes('Continue to secure payment'),false);
console.log('PASS: payment step auto-mounts without extra Continue; no repeated sessions on rerender; total/code changes replace stale form; validation gates loading; parent navigation re-enabled; failed load retries. Mock SDK only, no payments.');
