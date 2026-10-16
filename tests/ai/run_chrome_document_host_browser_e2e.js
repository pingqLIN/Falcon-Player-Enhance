'use strict';
const fs=require('fs'), path=require('path'), cp=require('child_process'), assert=require('assert').strict;
const root=path.resolve(__dirname,'../..');
const folder=path.join(root,'.falcon-observability','chrome-document-host-e2e');
fs.mkdirSync(folder,{recursive:true});
const profile=fs.mkdtempSync(path.join(folder,'profile-'));
const chromePath=process.env.FALCON_CHROME_PATH || 'C:/Program Files/Google/Chrome Dev/Application/chrome.exe';
const report={time:new Date().toISOString(),checks:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function pass(name,details){console.log('PASS',name,JSON.stringify(details||'').slice(0,700));report.checks.push({name,status:'PASS',details});}
async function until(fn,limit=18000){
  let error;for(let i=0;i<limit/250;i++){try{let result=await fn();if(result)return result;}catch(e){error=e;}await wait(250);}
  throw Error('Timed out: '+(error?.message||'condition not met'));
}
class CDP{
 constructor(child){
   this.child=child;this.id=0;this.requests=new Map();this.buffer=Buffer.alloc(0);
   child.stdio[4].on('data',chunk=>{
     this.buffer=Buffer.concat([this.buffer,chunk]);let boundary;
     while((boundary=this.buffer.indexOf(0))>=0){
       const data=this.buffer.subarray(0,boundary);this.buffer=this.buffer.subarray(boundary+1);
       if(!data.length)continue;
       let m;try{m=JSON.parse(data.toString('utf8'));}catch(e){continue;}
       if(!this.requests.has(m.id))continue;
       const {ok,no}=this.requests.get(m.id);this.requests.delete(m.id);
       m.error?no(Error(m.error.message)):ok(m.result||{});
     }
   });
 }
 async open(){await this.call('Browser.getVersion');}
 call(method,params={},sid){
   return new Promise((ok,no)=>{
     const id=++this.id;
     const timer=setTimeout(()=>{this.requests.delete(id);no(Error('CDP timeout: '+method));},105000);
     this.requests.set(id,{ok:r=>{clearTimeout(timer);ok(r);},no:e=>{clearTimeout(timer);no(e);}});
     this.child.stdio[3].write(Buffer.from(JSON.stringify({
       id,method,params,...(sid?{sessionId:sid}:{})
     })+'\0'));
   });
 }
 async eval(sid,expression){
   const v=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sid);
   if(v.exceptionDetails)throw Error(v.exceptionDetails.exception?.description||v.exceptionDetails.text);
   return v.result?.value;
 }
 close(){try{this.child.stdio[3].end();}catch(_){}}
}
async function main(){
 const browser=cp.spawn(chromePath,[
  '--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--start-minimized','--window-position=-32000,-32000',
  '--user-data-dir='+profile,'--remote-debugging-pipe',
  '--enable-unsafe-extension-debugging','about:blank'
 ],{stdio:['ignore','ignore','pipe','pipe','pipe'],windowsHide:true});
 let c;
 try{
  c=new CDP(browser);await c.open();
  const installed=await c.call('Extensions.loadUnpacked',{path:path.join(root,'extension')});
  const extensionId=installed.id;
  const inventory=await c.call('Extensions.getExtensions');
  assert(inventory.extensions.some(x=>x.id===extensionId&&x.enabled));
  report.extensionId=extensionId;
  pass('Falcon unpacked extension installed via supported CDP',{extensionId});
  const target=await c.call('Target.createTarget',{url:'chrome-extension://'+extensionId+'/dashboard/dashboard.html'});
  const attached=await c.call('Target.attachToTarget',{targetId:target.targetId,flatten:true});const sid=attached.sessionId;
  await c.call('Runtime.enable',{},sid);await c.call('Page.enable',{},sid);
  await until(()=>c.eval(sid,"document.getElementById('ai-configure-panel')?.style.display==='block'"),20000);
  pass('dashboard initialized');
  await c.eval(sid,"(()=>{const el=document.getElementById('ai-provider');el.value='chrome_builtin';el.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('ai-advanced-settings').open=true;})()");
  await until(()=>c.eval(sid,"!document.getElementById('chrome-builtin-panel').hidden&&document.getElementById('ai-provider-context').textContent.includes('Chrome Built-in')"),18000);
  pass('advanced settings visible for Chrome provider');
  try{await until(()=>c.eval(sid,"document.getElementById('btn-save-lmstudio').disabled===false && document.getElementById('ai-provider').value==='chrome_builtin'"),20000);}catch(error){
    console.log('PROVIDER LOAD DEBUG',JSON.stringify(await c.eval(sid,"({provider:document.getElementById('ai-provider').value,buttonDisabled:document.getElementById('btn-save-lmstudio').disabled,aiStatus:document.getElementById('lmstudio-status').textContent,context:document.getElementById('ai-provider-context').textContent, panelHidden:document.getElementById('chrome-builtin-panel').hidden})")));
    throw error;
  }
  const change="(()=>{const el=id=>document.getElementById(id);document.querySelector('[data-mode=advisory].mode-card').click();el('chrome-sampling-mode').value='custom';el('chrome-sampling-mode').dispatchEvent(new Event('change',{bubbles:true}));const ja=[...document.querySelectorAll('#chrome-language-options input')].find(e=>e.value==='ja');ja.checked=true;ja.dispatchEvent(new Event('change',{bubbles:true}));for(const [id,v] of [['chrome-builtin-temperature','0.4'],['chrome-builtin-topk','7'],['lmstudio-timeout','45000'],['lmstudio-cooldown','90000']]){el(id).value=v;el(id).dispatchEvent(new Event('change',{bubbles:true}));}for(const id of ['chrome-response-constraint','lmstudio-dynamic-rules']){el(id).checked=false;el(id).dispatchEvent(new Event('change',{bubbles:true}));}el('btn-save-lmstudio').click();})()";
  await c.eval(sid,change);
  try{await until(()=>c.eval(sid,"(async()=>{const r=await chrome.runtime.sendMessage({action:'getAiProviderSettings',provider:'chrome_builtin'});return r?.success===true&&r.settings?.chromeSampling==='custom'&&r.settings?.temperature===0.4&&r.settings?.topK===7;})()"),22000);}catch(error){
    console.log('SAVE RESULT DEBUG',JSON.stringify(await c.eval(sid,"({provider:document.getElementById('ai-provider').value,buttonDisabled:document.getElementById('btn-save-lmstudio').disabled,statusText:document.getElementById('lmstudio-status')?.textContent,context:document.getElementById('ai-provider-context')?.textContent,sampling:document.getElementById('chrome-sampling-mode')?.value})")));
    throw error;
  }
  const state=await c.eval(sid,"(async()=>{let r=await chrome.runtime.sendMessage({action:'getAiProviderSettings',provider:'chrome_builtin'});return r;})()");
  assert(state?.success,'provider settings not returned');
  const s=state.settings;
  for(const [key,value] of Object.entries({provider:'chrome_builtin',mode:'advisory',chromeSampling:'custom',temperature:0.4,topK:7,timeoutMs:45000,cooldownMs:90000,chromeResponseConstraint:false,enableDynamicRuleCandidates:false})){
    assert.deepEqual(s[key],value,'settings mismatch '+key);
  }
  assert(s.chromeLanguages.includes('ja'));
  pass('advanced settings persisted and reloaded',{mode:s.mode,sampling:s.chromeSampling,temp:s.temperature,topK:s.topK,languages:s.chromeLanguages,timeout:s.timeoutMs});
  await c.eval(sid,"(()=>{const el=document.getElementById('ai-provider');el.value='lmstudio';el.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until(()=>c.eval(sid,"document.getElementById('ai-provider-context').textContent.includes('LM Studio')"),18000);
  assert(await c.eval(sid,"document.getElementById('chrome-builtin-panel').hidden"));
  pass('Chrome-only settings hidden on provider switch');
  await c.eval(sid,"(()=>{const el=document.getElementById('ai-provider');el.value='chrome_builtin';el.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until(()=>c.eval(sid,"document.getElementById('chrome-sampling-mode').value==='custom'&&document.getElementById('chrome-builtin-topk').value==='7'"),18000);
  pass('advanced sampling configuration restored after switching');
  await c.eval(sid,"(()=>{document.getElementById('chrome-usecase-inspector').open=true;})()");
  assert(await c.eval(sid,"document.getElementById('chrome-usecase-open-native').isConnected && document.getElementById('chrome-usecase-availability').isConnected"));
  pass('read-only Use Cases / Model Assets panel is accessible');
  await c.eval(sid,"(()=>{document.getElementById('btn-chrome-test-inference').click();})()");
  const inference=await until(()=>c.eval(sid,"(()=>{const e=document.getElementById('chrome-test-inference-status');return e.textContent.includes('Diagnostic inference failed')||e.textContent.includes('Prompt API responded')?e.textContent:null})()"),20000);
  assert(inference.includes('not ready')||inference.includes('Prompt API responded')||inference.includes('unavailable'),'unexpected inference diagnostic: '+inference);
  pass('diagnostic inference button reports actual readiness',{text:inference});
  await c.eval(sid,"(()=>{document.getElementById('btn-reset-ai-provider-defaults').click();})()");
  const defaults=await c.eval(sid,"(()=>({sampling:document.getElementById('chrome-sampling-mode').value,temp:document.getElementById('chrome-builtin-temperature').value,topK:document.getElementById('chrome-builtin-topk').value,constraint:document.getElementById('chrome-response-constraint').checked}))()");
  assert.deepEqual(defaults,{sampling:'runtime',temp:'1',topK:'3',constraint:true});
  const stillSaved=await c.eval(sid,"(async()=>{const r=await chrome.runtime.sendMessage({action:'getAiProviderSettings',provider:'chrome_builtin'});return {sampling:r.settings.chromeSampling,temperature:r.settings.temperature}})()");
  assert.equal(stillSaved.sampling,'custom','reset should not silently persist');
  pass('reset restores defaults only in the unsaved draft',{defaults,persisted:stillSaved});

  const health=await c.eval(sid,"(async()=>await chrome.runtime.sendMessage({action:'runAiProviderHealthCheck',settings:{provider:'chrome_builtin',model:'Gemini Nano',chromeLanguages:['en'],chromeSampling:'runtime',timeoutMs:45000,mode:'advisory'}}))()");
  report.modelHealth={success:health?.success,error:health?.error,availability:health?.availability,capability:health?.capability};
  const broker=await c.eval(sid,"(async()=>{const ctx=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']});const reply=await chrome.runtime.sendMessage({target:'falconChromePromptHostRequest',operation:'capabilities'});return {ctx:ctx.map(x=>x.documentUrl),reply};})()");
  assert(broker.ctx.some(x=>x.includes('chrome-prompt-host.html')),'no active document host');
  assert.equal(broker.reply?.success,true,'host capability message failed');
  assert.equal(broker.reply.result.documentContext,true,'model host not a document');
  pass('background to extension document broker',broker.reply.result);
  pass('health result recorded without claiming ready',report.modelHealth);
  const screenshot=await c.call('Page.captureScreenshot',{format:'png'},sid);
  if(screenshot.data){fs.writeFileSync(path.join(folder,'advanced-settings.png'),Buffer.from(screenshot.data,'base64'));pass('dashboard screenshot saved');}
 }finally{
  c?.close();browser.kill();
  await new Promise(resolve => {
   if(browser.exitCode!==null)return resolve();
   browser.once('exit',resolve);setTimeout(resolve,1500);
  });
  if(process.env.FALCON_TEST_KEEP_PROFILE!=='1'){
   try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:250});}
   catch(error){console.warn('Temp profile cleanup deferred:',error.code||error.message);}
  }
 }
}
main().catch(e=>{console.error('FAIL',e.stack||e);report.checks.push({name:'browser e2e',status:'FAIL',error:String(e.stack||e)});process.exitCode=1;})
.finally(()=>{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log('REPORT',path.join(folder,'report.json'));});
