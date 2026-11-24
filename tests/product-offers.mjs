import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
let now=Date.parse('2026-11-22T12:00:00-08:00');
class Clock extends Date {static now(){return now;}}
const context=vm.createContext({Date:Clock,Buffer,process:{env:{STRIPE_WEBHOOK_SECRET:'fixture-secret'}},console});
const mock=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v)},{context});
const mocks={crypto:mock({default:crypto}),'./bringBackStore':mock({getBringBackCount:async()=>50}),'./discountsStore':mock({getDiscounts:async()=>[{code:'HALF',type:'percent',value:50}]}),'./promos':mock({findPromo:c=>c==='BLACKFRIDAY20'?{code:c,type:'percent',value:20}:null})};
const cache=new Map();async function load(file){if(cache.has(file))return cache.get(file);const mod=new vm.SourceTextModule(await fs.readFile(file,'utf8'),{context});cache.set(file,mod);await mod.link(spec=>mocks[spec]||load(path.join(path.dirname(file),spec+'.js')));return mod;}
const pricing=await load('lib/shopPayQuote.js');await pricing.evaluate();const quote=pricing.namespace.quoteShopPayCart;
const rules=cache.get('lib/productOffer.js').namespace;
const server=cache.get('lib/productOfferServer.js').namespace;
const a=server.issueOffer('visitor-permanent');assert.equal(a.variant,'gift_75');assert.equal(server.verifyOffer(a.token).variant,'gift_75');
const mist=q=>[{id:'babygirl',quantity:q,price:0.01}];
assert.equal((await quote(mist(3),'',a.token)).total,96);
const gift=await quote(mist(4),'BLACKFRIDAY20',a.token);assert.equal(gift.total,76.8);assert.equal(gift.discount,51.2);assert.equal(gift.items[0].quantity,4);
assert.equal((await quote(mist(8),'',a.token)).discount,32);
assert.equal((await quote(mist(4),'HALF',a.token)).total,48);
assert.equal((await quote([{id:'babygirl-perfume',quantity:4}],'',a.token)).discount,0);
assert.equal((await quote(mist(4),'',a.token+'x')).discount,0);
assert.equal(rules.offerSavings([{id:'babygirl',quantity:4,price:25}],'gift_75'),25);
assert.equal(rules.offerSavings([{id:'other',quantity:1,price:75},{id:'babygirl',quantity:1,price:32}],'gift_75'),32);
assert.equal(rules.offerSavings([{id:'other',quantity:1,price:74.99},{id:'babygirl',quantity:1,price:32}],'gift_75'),0);
assert.equal((await quote([{id:'babygirl-perfume',quantity:2},{id:'babygirl',quantity:1}],'',a.token)).discount,32);
now=Date.parse('2026-12-24T12:00:00-08:00');assert.equal((await quote(mist(4),'',a.token)).discount,32);
console.log('PASS permanent gift assignment, $75 paid-mist threshold, gift exclusion, one-gift limit, canonical prices, tampering, coupon non-stacking and ongoing validity');
