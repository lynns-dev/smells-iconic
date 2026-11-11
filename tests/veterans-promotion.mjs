import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
{
 const base=path.resolve(import.meta.dirname, '..');
 const repo=path.basename(base);
 const RealDate=Date; const now=Date.parse('2026-11-10T20:00:00Z');
 class Clock extends RealDate { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} }
 const context=vm.createContext({Date:Clock,Intl,console,Set,Number,String,Math,Array,Error});
 const mock = values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});
 const mocks={discountsStore:mock({getDiscounts:async()=>[{code:'OLD10',type:'percent',value:10}]}),uniqueDiscounts:mock({findUniqueDiscount:async()=>null}),shippingPerk:mock({hasFreeShipping:()=>false}),experiments:mock({getVariant:()=> 'control'})};
 const cache=new Map();
 async function load(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(await fs.readFile(path.join(base,file),'utf8'),{context});cache.set(file,m);await m.link(async spec=>mocks[path.basename(spec)]||load(path.join(path.dirname(file),spec+'.js')));return m;}
 const mod=await load('lib/validateCheckout.js');await mod.evaluate();const validate=mod.namespace.validateCheckout;
 const promo=cache.get('lib/promos.js').namespace;
 assert.equal(promo.findPromo(' veterans15 ').value,15);
 assert.equal(promo.activePromo().code,'VETERANS15');
 assert.equal(promo.findPromo('VETERANS15',Date.parse('2026-11-10T07:59:59Z')),null);
 assert.equal(promo.findPromo('VETERANS15',Date.parse('2026-11-13T07:59:59Z')).value,15);
 assert.equal(promo.findPromo('VETERANS15',Date.parse('2026-11-13T08:00:00Z')),null);
 const catalog=cache.get('lib/products.js').namespace;const product=catalog.PRODUCTS.find(p=>!p.archived);
 const cart=[{id:product.id,quantity:2,price:0.01}];
 const quote=cache.get('lib/shopPayQuote.js').namespace.quoteShopPayCart;
 const q=await quote(cart,' veterans15 ');
 assert.equal(q.discount,Math.round(product.price*2*15)/100);
 assert.equal(q.total,Math.round((product.price*2-q.discount+q.shipping)*100)/100);
 await validate({items:cart,amount:q.total,discountCode:'VETERANS15'});
 await assert.rejects(validate({items:cart,amount:0.01,discountCode:'VETERANS15'}));
 await assert.rejects(validate({items:cart,amount:q.total-q.discount,discountCode:'VETERANS15'}));
 await assert.rejects(validate({items:cart,amount:q.total}));
 await assert.rejects(quote(cart,['VETERANS15','OLD10']));
 await assert.rejects(quote(cart,'VETERANS15,OLD10'));
 await assert.rejects(quote([{id:product.id,quantity:-1}],'VETERANS15'));
 await assert.rejects(quote([...cart,...cart],'VETERANS15'));
 await assert.rejects(quote([{id:'fake',quantity:1}],'VETERANS15'));
 const old=await quote(cart,'OLD10');assert.equal(old.discount,Math.round(product.price*2*10)/100);
 await validate({items:cart,amount:q.total+2.79,discountCode:'VETERANS15',shippingProtection:2.79});
 await assert.rejects(validate({items:cart,amount:q.total+1,discountCode:'VETERANS15',shippingProtection:1}));
 for(const f of ['square-checkout.js','qb-checkout.js','afterpay/checkout.js','amazon-pay/session.js','shop-pay/session.js']){
 let s; try { s=await fs.readFile(path.join(base,'pages/api',f),'utf8'); } catch(e) { if(e.code==='ENOENT') continue; throw e; }assert.ok(s.includes('await validateCheckout(req.body)'),f);
 }
 let charges=0, chargedAmount, fulfilled;
 mocks.squareServer=mock({chargeCard:async (token, amount)=>{charges++;chargedAmount=amount;return {id:'test-charge',status:'COMPLETED'};}});
 mocks.orderFulfillment=mock({fulfillOrder:async order=>{fulfilled=order;}});
 mocks.webPush=mock({sendPushToAdmins:async()=>{}});
 const handlerModule=await load('pages/api/square-checkout.js');await handlerModule.evaluate();
 const call=async body=>{const res={statusCode:0,status(n){this.statusCode=n;return this;},json(data){this.body=data;return this;}};await handlerModule.namespace.default({method:'POST',body},res);return res;};
 assert.equal((await call({token:'test',items:cart,amount:0.01,discountCode:'VETERANS15'})).statusCode,400);
 assert.equal(charges,0);
 assert.equal((await call({token:'test',items:cart,amount:q.total,discountCode:'VETERANS15'})).statusCode,200);
 assert.equal(charges,1);assert.equal(chargedAmount,q.total);assert.equal(fulfilled.items[0].price,product.price);
 console.log(`${repo}: PASS — active dates, 15% canonical pricing, rounding, single-code replacement, invalid/stacked codes, price and amount tampering, quantities, protection, all five payment guards`);
}
