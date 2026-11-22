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
const tokens={};for(let i=0;Object.keys(tokens).length<3;i++){const a=server.issueOffer(`visitor-${i}`);tokens[a.variant]=a.token;assert.equal(server.issueOffer(`visitor-${i}`).variant,a.variant);}
const mist=q=>[{id:'babygirl',quantity:q,price:0.01}];
assert.equal((await quote(mist(3),'',tokens.mix_match)).total,64);
assert.equal((await quote(mist(6),'',tokens.mix_match)).total,128);
assert.equal((await quote(mist(2),'',tokens.mix_match)).total,64);
assert.equal((await quote(mist(3),'BLACKFRIDAY20',tokens.mix_match)).total,64,'not stacked with 20%');
assert.equal((await quote(mist(3),'HALF',tokens.mix_match)).total,48,'larger coupon wins');
assert.equal((await quote(mist(3),'',tokens.control)).total,96);
assert.equal((await quote(mist(3),'BLACKFRIDAY20',tokens.control)).total,76.8);
assert.equal((await quote(mist(3),'',tokens.gift_75)).total,96,'three paid mists, gift not yet added');
const gift=await quote(mist(4),'BLACKFRIDAY20',tokens.gift_75);assert.equal(gift.total,96);assert.equal(gift.items[0].quantity,4);assert.equal(gift.offerExperiment.contribution,70);
assert.equal((await quote(mist(8),'',tokens.gift_75)).discount,32,'only one gift');
const mixed=await quote([{id:'babygirl',quantity:1},{id:'cherry-afterglow',quantity:1},{id:'daddy-is-a-state-of-mind',quantity:1}],'',tokens.mix_match);assert.equal(mixed.total,64);assert.equal(mixed.offerExperiment.contribution,43);
const perfume=await quote([{id:'babygirl-perfume',quantity:3}],'',tokens.mix_match);assert.equal(perfume.discount,0);assert.equal(perfume.offerExperiment.costKnown,false);
assert.equal((await quote(mist(3),'',tokens.mix_match+'x')).discount,0,'tampered token rejected');
assert.equal((await quote(mist(3),'','fake')).discount,0);
await assert.rejects(quote([{id:'babygirl-solid-perfume',quantity:3}],'',tokens.mix_match),/no longer available/);
await assert.rejects(quote([{id:'babygirl',quantity:1},{id:'babygirl',quantity:2}],'',tokens.mix_match),/no longer available/);
assert.equal(rules.offerSavings([{id:'babygirl',quantity:4,price:25}],'gift_75'),0,'strictly over $75, gift excluded');
now=rules.OFFER_END;assert.equal(server.issueOffer('visitor-ended'),null);assert.equal(server.verifyOffer(tokens.mix_match),null);assert.equal((await quote(mist(3),'',tokens.mix_match)).discount,0,'expires at midnight Pacific');
console.log('PASS stable three-arm signed assignment, tampering, canonical prices, mix-and-match, repeat sets, gift thresholds and inventory, body-mist eligibility, coupon non-stacking, contribution math and midnight expiry');
