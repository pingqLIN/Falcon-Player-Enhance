'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const hostSource=fs.readFileSync(path.join(root,'extension/ai/chrome-prompt-host.js'),'utf8');
const background=fs.readFileSync(path.join(root,'extension/background.js'),'utf8').replace(/\r\n/g,'\n');
const start=background.indexOf('// Service workers cannot own Prompt API sessions');
const end=background.indexOf('async function buildChromeBuiltinSessionOptions',start);
assert(start>=0&&end>start,'broker implementation must exist');
const listeners=[];
let modelAvailability='available',created=0,sessionsDestroyed=0;
const observed={available:[],create:[],prompts:[],storage:{}};
const origin='chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/';
const runtime={
 id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 getURL:p=>origin+p,
 getContexts:async()=>created?[{contextType:'OFFSCREEN_DOCUMENT',documentUrl:origin+'ai/chrome-prompt-host.html'}]:[],
 onMessage:{addListener(fn){listeners.push(fn)}},
 sendMessage(request){
  return new Promise((resolve,reject)=>{
   const receiver=listeners[0];
   const accepted=receiver(request,{id:runtime.id,url:origin+'background.js'},resolve);
   if(accepted!==true)resolve(undefined);
  });
 }
};
const api={
 availability:async options=>{observed.available.push(options);return modelAvailability;},
 params:async()=>({defaultTemperature:1,maxTemperature:2,defaultTopK:3,maxTopK:128}),
 create:async options=>{
  observed.create.push(options);
  return {
   prompt:async(prompt,opts)=>{observed.prompts.push({prompt,opts});return '{"verified":true}';},
   destroy(){sessionsDestroyed++;}
  };
 }
};
const storage={
 setItem(k,v){observed.storage[k]=v;},getItem:k=>observed.storage[k]
};
const hostChrome={runtime};
const host=vm.createContext({
 chrome:hostChrome,LanguageModel:api,localStorage:storage,
 AbortSignal,Date,setTimeout,clearTimeout
});
vm.runInContext(hostSource,host);
const workerChrome={runtime,offscreen:{createDocument:async details=>{
 assert.deepEqual(Array.from(details.reasons),['LOCAL_STORAGE']);created++;
}}};
const worker=vm.createContext({
 chrome:workerChrome,AbortController,AbortSignal,setTimeout,clearTimeout,Promise,
 console
});
vm.runInContext(background.slice(start,end),worker);
async function main(){
 const broker=await vm.runInContext('resolveChromeLanguageModel()',worker);
 assert.equal(created,1,'host must be created on first request');
 const options={
  expectedInputs:[{type:'text',languages:['en','ja']}],
  expectedOutputs:[{type:'text',languages:['ja']}],
  temperature:0.4,topK:7
 };
 const availability=await broker.availability(options);
 assert.equal(availability,'available');
 assert.equal(created,1,'offscreen host should be reused');
 const params=await broker.params();
 assert.equal(params.maxTopK,128);
 const abort=new AbortController();
 const session=await broker.create({...options,signal:abort.signal});
 const answer=await session.prompt('Return valid JSON',{responseConstraint:{type:'object'}});
 assert.equal(answer,'{"verified":true}');
 assert.deepEqual(JSON.parse(JSON.stringify(observed.create[0])),options);
 assert.equal(observed.create[0].signal,undefined,'AbortSignal must not be transferred over runtime messaging');
 assert.equal(observed.prompts[0].prompt,'Return valid JSON');
 assert.equal(observed.prompts[0].opts.responseConstraint.type,'object');
 await session.destroy();
 assert.equal(sessionsDestroyed,1);
 assert(observed.storage.falconChromePromptHostReadiness,'non-sensitive availability should be stored');
 assert(!JSON.stringify(observed.storage).includes('Return valid JSON'),'do not store prompt text');
 modelAvailability='downloadable';
 await assert.rejects(()=>broker.create(options),/chrome_builtin_not_ready_downloadable/);
 assert.equal(observed.create.length,1,'downloadable status must not automatically create a session');
 const blocked=await new Promise(resolve=>listeners[0](
  {target:'falconChromePromptHostRequest',operation:'capabilities'},
  {id:runtime.id,url:'https://untrusted.example/page'},resolve
 ));
 assert.equal(blocked.success,false,'content-script sender must not command host');
 const capabilities=await runtime.sendMessage({target:'falconChromePromptHostRequest',operation:'capabilities'});
 assert(capabilities.result.documentContext);
 assert(capabilities.result.hasCreate);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));
 assert(manifest.permissions.includes('offscreen'));
 console.log('PASS: document-owned model sessions, bridge, settings options, no implicit download, message origin checks');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
