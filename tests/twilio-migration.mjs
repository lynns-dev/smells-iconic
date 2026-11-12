import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const twilio=require('twilio');
const root=path.resolve(import.meta.dirname,'..');
const env={TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'test-token-not-real',TWILIO_MESSAGING_SERVICE_SID:'MG'+'b'.repeat(32)};
const store=new Map(), inbox=[];let calls=[], mode='ok';
const redis=async args=>{
 const [command,key,value,...rest]=args;
 if(command==='GET')return store.get(key)||null;
 if(command==='SET'){store.set(key,value);return 'OK';}
 if(command==='EVAL'){
  if(args[2]==='1')return 1;
  const recordKey=args[3];if(store.has(recordKey))return 0;
  store.set(recordKey,args[5]);inbox.unshift(args[6]);return 1;
 }
 throw Error('Unexpected Redis command');
};
const context=vm.createContext({process:{env},Buffer,AbortSignal,URLSearchParams,console,Date,Set,fetch:async(url,options)=>{
 calls.push({url,options});
 if(mode==='timeout')throw Error('timeout');
 if(mode==='reject')return {ok:false,status:401,json:async()=>({code:20003})};
 return {ok:true,status:options.method==='POST'?201:200,json:async()=>options.method==='POST'?{sid:'SM'+'c'.repeat(32),status:'queued'}:{status:'active',type:'Trial'}};
}});
const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
const mocks={twilio:synthetic({default:twilio}),'../email/emailBaseUrl':synthetic({getEmailBaseUrl:()=> 'https://store.test'}),'./twilioStore':synthetic({smsRedis:redis,isSmsSuppressed:async phone=>Boolean(store.get(`sms_optout:${phone}`))})};
const modules=new Map();async function load(file){if(modules.has(file))return modules.get(file);const mod=new vm.SourceTextModule(await fs.readFile(path.join(root,file),'utf8'),{context});modules.set(file,mod);await mod.link(spec=>mocks[spec]||load(path.join(path.dirname(file),spec+'.js')));return mod;}
const providerModule=await load('lib/sms/provider.js');await providerModule.evaluate();const provider=providerModule.namespace;
assert.equal(provider.smsConfigured(),false);await assert.rejects(provider.sendSms('+12025550123','test'),/paused/);assert.equal(calls.length,0);
assert.equal((await provider.getSmsConnection()).status,'paused');assert.equal(calls.length,1);
env.TWILIO_SMS_ENABLED='true';assert.equal(provider.smsConfigured(),true);
const result=await provider.sendSms('+12025550123','Sample only');assert.equal(result.status,'queued');assert.equal(calls.length,2);
assert.equal(new URLSearchParams(calls[1].options.body).get('MessagingServiceSid'),env.TWILIO_MESSAGING_SERVICE_SID);
assert.equal(new URLSearchParams(calls[1].options.body).get('StatusCallback'),'https://store.test/api/sms/twilio/status');
await assert.rejects(provider.sendSms(['+12025550123'],'test'),/one valid/);assert.equal(calls.length,2);
const webhookModule=await load('lib/sms/webhook.js');await webhookModule.evaluate();const hooks=webhookModule.namespace;
const body={AccountSid:env.TWILIO_ACCOUNT_SID,MessagingServiceSid:env.TWILIO_MESSAGING_SERVICE_SID,MessageSid:'SM'+'d'.repeat(32),From:'+12025550123',To:'+12025550124',Body:'STOP'};
const signature=twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN,'https://store.test/api/sms/twilio/inbound',body);
const req={body,headers:{'x-twilio-signature':signature},url:'/api/sms/twilio/inbound'};
assert.equal(hooks.verifySmsWebhook(req,'inbound'),true);
assert.equal(hooks.verifySmsWebhook({...req,body:{...body,Body:'changed'}},'inbound'),false);
assert.equal(hooks.verifySmsWebhook({...req,headers:{}},'inbound'),false);
assert.equal(hooks.verifySmsWebhook({...req,body:{...body,AccountSid:'AC'+'e'.repeat(32)}},'inbound'),false);
assert.equal(hooks.verifySmsWebhook({...req,url:req.url+'?query=1'},'inbound'),false);
await hooks.handleInbound(body);await hooks.handleInbound(body);assert.equal(inbox.length,1);
assert.ok(store.get('sms_optout:+12025550123'));
const count=calls.length;await assert.rejects(provider.sendSms('+12025550123','test'),/opted out/);assert.equal(calls.length,count);
mode='reject';await assert.rejects(provider.sendSms('+12025550125','test'),e=>e.smsProviderCode===20003&&!e.message.includes(env.TWILIO_AUTH_TOKEN));
mode='timeout';const before=calls.length;await assert.rejects(provider.sendSms('+12025550125','test'),e=>e.smsDeliveryUncertain);assert.equal(calls.length,before+1);
await hooks.handleStatus({MessageSid:'SM'+'c'.repeat(32),MessageStatus:'delivered'});assert.ok(store.has('sms_twilio_status:SM'+'c'.repeat(32)+':delivered'));
console.log('Twilio: paused launch, account check, send mapping, signature validation, STOP suppression, deduplication, delivery events and no retry on uncertainty passed. All external calls mocked.');
