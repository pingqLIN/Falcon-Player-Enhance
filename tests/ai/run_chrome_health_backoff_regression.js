'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const text=fs.readFileSync(path.join(__dirname,'../../extension/background.js'),'utf8').replace(/\r\n/g,'\n');
const a=text.indexOf('async function runChromeBuiltinHealthCheck(');
const b=text.indexOf('async function runAiProviderHealthCheck(',a);
assert(a>0&&b>a,'health-check handler must exist');
let availability='available', promptCalls=0, destroyed=0, persisted=0;
const settings={provider:'chrome_builtin',model:'Gemini Nano',timeoutMs:45000,chromeLanguages:['en'],chromeSampling:'runtime'};
const state={providerState:{chromeBuiltinBackoffUntil:Date.now()+30*60*1000}};
const ctx={
  aiState:state,
  normalizeAiProviderSettings:v=>v,normalizeAiProviderState:v=>v,
  resolveChromeLanguageModel:async()=>({
    create:async()=>({destroy:async()=>{destroyed++;}}),
    params:async()=>({defaultTopK:3,maxTopK:128})
  }),
  resolveChromeBuiltinSessionConfig:async()=>({options:{expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}]},availability,route:'language-and-sampling',attempts:[]}),
  isChromeBuiltinReadyAvailability:value=>value==='available',
  isChromeBuiltinDownloadAvailability:value=>value==='downloadable',
  createRequestTimeout:()=>({signal:new AbortController().signal,cleanup:()=>{}}),
  promptChromeBuiltinSession:async()=>{promptCalls++;return 'OK';},
  scheduleAiPersist:()=>{persisted++},
  classifyAiProviderError:()=> 'unavailable',
  getNow:()=>Date.now(),
  CHROME_BUILTIN_DEFAULT_TIMEOUT_MS:45000,
  CHROME_BUILTIN_DEFAULT_MODEL:'Gemini Nano',
  CHROME_BUILTIN_DOCS:[],
  normalizeChromeBuiltinLanguages:v=>v,
  getChromeBuiltinCapabilitySnapshot:()=>({document:true}),
  console,AbortController
};
vm.createContext(ctx);
vm.runInContext(text.slice(a,b),ctx);
async function main(){
  const result=await ctx.runChromeBuiltinHealthCheck(settings);
  assert.equal(result.success,true);
  assert.equal(state.providerState.lastHealthOk,true);
  assert.equal(state.providerState.chromeBuiltinBackoffUntil,0,
    'a successful ready/create/prompt/destroy must immediately clear stale model backoff');
  assert.equal(promptCalls,1);
  assert.equal(destroyed,1);
  state.providerState.chromeBuiltinBackoffUntil=Date.now()+30*60*1000;
  const oldBackoff=state.providerState.chromeBuiltinBackoffUntil;
  availability='unavailable';
  const failure=await ctx.runChromeBuiltinHealthCheck(settings);
  assert.equal(failure.success,false);
  assert.equal(state.providerState.chromeBuiltinBackoffUntil,oldBackoff,
    'an unavailable probe must not falsely clear the cooldown');
  assert(persisted>=2);
  console.log('PASS: Health Check clears model backoff only after a real successful inference');
}
main().catch(e=>{console.error(e);process.exitCode=1});
