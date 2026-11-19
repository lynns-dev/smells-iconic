const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=process.cwd();
function evaluate(path,context){const s=fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');vm.createContext(context);vm.runInContext(s,context);return context;}
const render=evaluate(root+'/lib/abandonedCheckout.js',{findPromo:()=>({code:'BLACKFRIDAY20',value:20}),crypto,randomUUID:crypto.randomUUID,process:{env:{CRON_SECRET:'fixture'}},Buffer,URL,getProductById:()=>({name:'Test fragrance',price:28,images:['/images/product.png']}),openPixelTag:u=>`<img src="${u}">`,appendBeforeBodyClose:(h,p)=>h+p});
const args={key:'test-key',name:'Person',cart:[{id:'test',quantity:1}],sendId:'12345678-abcd-abcd-abcd-123456789012',test:{testId:'test1234',variant:'b'}};
const a=render.renderAbandonedEmail({...args,variant:'a'}),b=render.renderAbandonedEmail({...args,variant:'b'});
assert.equal(a.subject,b.subject);assert.equal(a.text,b.text);assert.notEqual(a.html,b.html);
assert(a.html.indexOf('Subtotal')<a.html.indexOf('Finish checking out'));assert(b.html.indexOf('Finish checking out')<b.html.indexOf('Subtotal'));
assert.equal((b.html.match(/Finish checking out/g)||[]).length,1);assert(b.html.includes('restore%3Dtest%253A1'));assert(b.html.includes('&t=test1234&v=b'));assert(b.html.includes('Unsubscribe'));
const assignment=evaluate(root+'/lib/email/checkoutLayoutTest.js',{randomUUID:crypto.randomUUID,createHash:crypto.createHash,process:{env:{}}});
assert.equal(assignment.checkoutLayoutVariant({enabled:false,winner:'a'},'x'),'a');assert.equal(assignment.checkoutLayoutVariant({enabled:false,winner:'b'},'x'),'b');assert.equal(assignment.checkoutLayoutVariant({enabled:true,testId:'id'},'USER@EXAMPLE.TEST'),assignment.checkoutLayoutVariant({enabled:true,testId:'id'},'user@example.test'));
console.log('PASS checkout layout order, identical offer/copy/text, one CTA, restored cart URL, test attribution, unsubscribe and stable assignment.');

const ma=render.renderAbandonedEmail({...args,variant:'a',testType:'message'}),mb=render.renderAbandonedEmail({...args,variant:'b',testType:'message'});
assert.equal(ma.subject,mb.subject);assert(mb.html.includes('Your next signature scent is still here.'));assert(mb.text.includes('See my saved cart: https://'));
assert(ma.text.includes('/api/email/click?'));assert(mb.text.includes('/api/email/click?'));
const sa=render.renderAbandonedEmail({...args,variant:'a',testType:'subject'}),sb=render.renderAbandonedEmail({...args,variant:'b',testType:'subject'});
assert.notEqual(sa.subject,sb.subject);assert.equal(sa.html,sb.html);assert.equal(sa.text,sb.text);
(async()=>{
 let stored={enabled:true,testId:'old123',startedAt:1,winner:'a'};
 const context=evaluate(root+'/lib/email/checkoutLayoutTest.js',{findPromo:()=>null,randomUUID:crypto.randomUUID,createHash:crypto.createHash,process:{env:{KV_REST_API_URL:'https://fixture.test',KV_REST_API_TOKEN:'fixture'}},fetch:async(_,o)=>{const c=JSON.parse(o.body);if(c[0]==='SET')stored=JSON.parse(c[2]);return {ok:true,json:async()=>({result:c[0]==='GET'?JSON.stringify(stored):'OK'})};}});
 const snapshot={a:{sent:12,clickers:0},b:{sent:13,clickers:0}};
 const paused=await context.changeCheckoutLayoutTest('pause',null,'layout',snapshot);
 assert.equal(paused.enabled,false);assert.equal(paused.history[0].outcome,'paused_without_winner');assert.equal(paused.history[0].winner,undefined);assert.equal(paused.history[0].results.a.sent,12);
 const next=await context.changeCheckoutLayoutTest('start',null,'message');assert.equal(next.enabled,true);assert.notEqual(next.testId,'old123');assert.equal(next.history.length,1);assert.equal(next.type,'message');
 await assert.rejects(()=>context.changeCheckoutLayoutTest('start',null,'offer'));
 stored={...stored,enabled:true,type:'offer'};const expired=await context.getCheckoutLayoutTest();assert.equal(expired.enabled,false);assert.equal(expired.history.at(-1).outcome,'offer_expired');assert.equal(expired.winner,'a');
 console.log('PASS tracked plain-text links, isolated message/subject variants, archived pause without winner and fresh test identity.');
})().catch(e=>{console.error(e);process.exitCode=1});

const oa=render.renderAbandonedEmail({...args,variant:'a',testType:'offer'}),ob=render.renderAbandonedEmail({...args,variant:'b',testType:'offer'});
assert.equal(oa.subject,ob.subject);assert(!oa.html.includes('BLACKFRIDAY20'));assert(ob.html.includes('Take 20% off with code BLACKFRIDAY20'));assert(ob.text.includes('One code per order'));
assert.equal(ob.html.match(/<a href="([^"]+)" style="display:inline-block/)[1],oa.html.match(/<a href="([^"]+)" style="display:inline-block/)[1]);
console.log('PASS offer-only difference, unchanged subject/CTA/destination and existing single-code terms.');
