const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
(async()=>{
 for(const root of [process.cwd()]){
  let src=fs.readFileSync(root+'/lib/email/automationSend.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const ctx={createHash:crypto.createHash};vm.createContext(ctx);vm.runInContext(src+';this.pickVariant=pickVariant;this.variantContent=variantContent;',ctx);
  const step={subject:'same',html:'control',abTest:{enabled:true,testId:'fresh-test',subject:'same',html:'variant'}};
  const choices=Array.from({length:1000},(_,i)=>ctx.pickVariant(step,`person${i}@example.test`));
  assert(choices.filter(v=>v==='a').length>400&&choices.filter(v=>v==='a').length<600);
  assert.equal(ctx.pickVariant(step,'SAME@EXAMPLE.TEST'),ctx.pickVariant(step,'same@example.test'));
  assert.equal(ctx.variantContent(step,'b').subject,'same');assert.equal(ctx.variantContent(step,'b').html,'variant');
  assert.equal(ctx.pickVariant({...step,abTest:null},'person@example.test'),'a');
  src=fs.readFileSync(root+'/lib/email/flowPerformance.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const c={getFlowStats:async()=>new Map([['welcome:0',{sent:2,clickers:1,clicks:4,opened:1}]]),getAutomationClickLog:async()=>[{sendId:'old'},{sendId:'old'},{sendId:'new'}],abConfidence:()=>({})};vm.createContext(c);vm.runInContext(src+';this.run=computeFlowPerformance;',c);
  const rows=await c.run([{id:'welcome',steps:[{subject:'hello',stats:{sent:10,clicked:90}}]}]);
  assert.equal(rows[0].sent,12);assert.equal(rows[0].clickers,2);assert.equal(rows[0].clickRate,16.7);
  console.log(root+': PASS stable 50/50 allocation, unchanged subject, distinct B HTML, disabled fallback, repeat-click deduplication and legacy sent preservation');
 }
})();
