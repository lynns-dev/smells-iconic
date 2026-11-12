const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=process.cwd();
function evaluate(path,context){const s=fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');vm.createContext(context);vm.runInContext(s,context);return context;}
const render=evaluate(root+'/lib/abandonedCheckout.js',{crypto,randomUUID:crypto.randomUUID,process:{env:{CRON_SECRET:'fixture'}},Buffer,URL,getProductById:()=>({name:'Test fragrance',price:28,images:['/images/product.png']}),openPixelTag:u=>`<img src="${u}">`,appendBeforeBodyClose:(h,p)=>h+p});
const args={key:'test-key',name:'Person',cart:[{id:'test',quantity:1}],sendId:'12345678-abcd-abcd-abcd-123456789012',test:{testId:'test1234',variant:'b'}};
const a=render.renderAbandonedEmail({...args,variant:'a'}),b=render.renderAbandonedEmail({...args,variant:'b'});
assert.equal(a.subject,b.subject);assert.equal(a.text,b.text);assert.notEqual(a.html,b.html);
assert(a.html.indexOf('Subtotal')<a.html.indexOf('Finish checking out'));assert(b.html.indexOf('Finish checking out')<b.html.indexOf('Subtotal'));
assert.equal((b.html.match(/Finish checking out/g)||[]).length,1);assert(b.html.includes('restore%3Dtest%253A1'));assert(b.html.includes('&t=test1234&v=b'));assert(b.html.includes('Unsubscribe'));
const assignment=evaluate(root+'/lib/email/checkoutLayoutTest.js',{randomUUID:crypto.randomUUID,createHash:crypto.createHash,process:{env:{}}});
assert.equal(assignment.checkoutLayoutVariant({enabled:false,winner:'a'},'x'),'a');assert.equal(assignment.checkoutLayoutVariant({enabled:false,winner:'b'},'x'),'b');assert.equal(assignment.checkoutLayoutVariant({enabled:true,testId:'id'},'USER@EXAMPLE.TEST'),assignment.checkoutLayoutVariant({enabled:true,testId:'id'},'user@example.test'));
console.log('PASS checkout layout order, identical offer/copy/text, one CTA, restored cart URL, test attribution, unsubscribe and stable assignment.');
