const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../lib/sms/resendSms.js'),'utf8').replace(/export /g,'');
async function moduleFor(key, status=200, rejectedBody=false) {
 const calls=[];
 const context=vm.createContext({process:{env:{RESENDSMS_API_KEY:key}},fetch:async(url,options)=>{calls.push({url,options});return {ok:status===200,status,json:async()=>status===200&&!rejectedBody?{success:true,credits:100,credits_used:2}:{error:'Unauthorized',success:false}};}});
 vm.runInContext(source+'\nglobalThis.sms = { getSmsBalance, sendSms, smsConfigured };',context);
 return {sms:context.sms,calls};
}
(async()=>{
 for(const key of ['rsms_test_placeholder', '  rsms_test_placeholder\n', '"rsms_test_placeholder"', " 'rsms_test_placeholder' "]){
  const {sms,calls}=await moduleFor(key);assert.equal(sms.smsConfigured(),true);assert.equal((await sms.getSmsBalance()).credits,100);assert.equal(calls[0].options.headers.Authorization,'Bearer rsms_test_placeholder');assert.equal(calls[0].url,'https://resendsms.com/api/v1/balance');
 }
 const absent=await moduleFor('   ');assert.equal(absent.sms.smsConfigured(),false);await assert.rejects(absent.sms.getSmsBalance(),/not set/);assert.equal(absent.calls.length,0);
 const rejected=await moduleFor('rsms_secret_placeholder',401);await assert.rejects(rejected.sms.getSmsBalance(),e=>e.message.includes('rejected the balance request (401)')&&!e.message.includes('rsms_secret_placeholder'));
 const wrongService=await moduleFor('re_secret_placeholder',401);await assert.rejects(wrongService.sms.getSmsBalance(),/email-service API key/);
 const forbidden=await moduleFor('rsms_secret_placeholder',403);await assert.rejects(forbidden.sms.getSmsBalance(),/rejected the balance request \(403\)/);
 const sendRejected=await moduleFor('rsms_secret_placeholder',401);await assert.rejects(sendRejected.sms.sendSms('+12025550123','Test fixture'),e=>e.message.includes('rejected the send request (401)')&&e.message.includes('sending permission')&&e.smsProviderStatus===401&&!e.message.includes('rsms_secret_placeholder'));
 const bodyRejected=await moduleFor('rsms_secret_placeholder',200,true);await assert.rejects(bodyRejected.sms.sendSms('+12025550123','Test fixture'),/rejected the send request/);
 console.log('SMS auth: copied formatting, missing credentials, provider rejection and credential redaction passed. No real requests or texts sent.');
})().catch(e=>{console.error(e);process.exitCode=1;});
