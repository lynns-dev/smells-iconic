import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
const voters=new Set(Array.from({length:49},(_,i)=>`voter-${i}`));let failStore=false;
const context=vm.createContext({process:{env:{KV_REST_API_URL:'https://fixture.test',KV_REST_API_TOKEN:'fixture'}},fetch:async(_,o)=>{
 if(failStore)throw new Error('Store unavailable');const [command,key,value]=JSON.parse(o.body);assert.equal(key,'bringback:ginger-creme');
 const before=voters.size;if(command==='SADD')voters.add(value);
 return {ok:true,json:async()=>({result:command==='SADD'?Number(voters.size>before):voters.size})};
}});
const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v)},{context});
const mocks={ './discountsStore':synthetic({getDiscounts:async()=>[]}), './promos':synthetic({findPromo:()=>null}) };
const cache=new Map();async function load(file){if(cache.has(file))return cache.get(file);const mod=new vm.SourceTextModule(await fs.readFile(file,'utf8'),{context});cache.set(file,mod);await mod.link(spec=>mocks[spec]||load(path.join(path.dirname(file),spec+'.js')));return mod;}
const quote=await load('lib/shopPayQuote.js');await quote.evaluate();
const catalog=cache.get('lib/products.js').namespace;const policy=cache.get('lib/bringBackAvailability.js').namespace;const store=cache.get('lib/bringBackStore.js').namespace;
const product=catalog.getProductById('ginger-creme');
assert.equal(policy.withBringBackAvailability(product,49).archived,true);
await assert.rejects(()=>quote.namespace.quoteShopPayCart([{id:'ginger-creme',quantity:1,price:0,archived:false}]),/no longer available/);
assert.equal((await store.addBringBackVote('ginger-creme','voter-0')).count,49);
assert.equal((await store.addBringBackVote('ginger-creme','new-voter')).count,50);
assert.equal((await store.addBringBackVote('ginger-creme','new-voter')).added,false);
const returned=policy.withBringBackAvailability(product,50);assert.equal(returned.archived,false);assert.equal(returned.badge,'Back by popular demand');assert.equal(returned.broughtBack,true);assert.equal(product.archived,true);
const result=await quote.namespace.quoteShopPayCart([{id:'ginger-creme',quantity:2,price:0}]);assert.equal(result.subtotal,64);assert.equal(result.shipping,0);assert.equal(result.items[0].price,32);
assert.equal(policy.withBringBackAvailability(product,51).archived,false);
assert.equal(policy.withBringBackAvailability(catalog.getProductById('babygirl'),50),catalog.getProductById('babygirl'));
failStore=true;await assert.rejects(()=>quote.namespace.quoteShopPayCart([{id:'ginger-creme',quantity:1}]),/Store unavailable/);
const single=await quote.namespace.quoteShopPayCart([{id:'babygirl',quantity:1}]);assert.equal(single.subtotal,32);assert.equal(single.shipping,0);assert.equal(single.total,32);
console.log('PASS 49 blocked, duplicate vote unchanged, 50 unlocks both display and canonical checkout, 51 stays available, catalog immutable, tampered price ignored, outage fails closed only for Ginger Crème. No real votes or orders.');
