'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../extension/background.js'), 'utf8').replace(/\r\n/g, '\n');
function section(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'Missing Chrome retry section: ' + start);
  return source.slice(a, b);
}
let clock = 1800000000000;
let persistCalls = 0;
const state = {
  providerSettings: {
    provider: 'chrome_builtin', enabled: true, mode: 'advisory',
    minRiskScore: 8, cooldownMs: 30000
  },
  providerState: { perHostLastRun: {}, chromeBuiltinBackoffUntil: 0 }
};
const ctx = {
  aiState: state,
  getNow: () => clock,
  normalizeAiProviderState: (v) => v,
  scheduleAiPersist: () => { persistCalls++; },
  classifyAiProviderError: (e) => String(e.message || e),
  resolveAiProviderSettings: (v) => v,
  getAiProviderSecret: () => '',
  getHostname: (v) => String(v),
  recordAiProviderDiagnostic: () => {},
  LM_STUDIO_DEFAULT_COOLDOWN_MS: 30000
};
vm.createContext(ctx);
vm.runInContext(section('function isChromeBuiltinBackoffActive()', 'async function requestLmStudioAdvisory('), ctx);
const shouldQuery = (events = [{ type: 'blocked_popup' }]) =>
  ctx.shouldQueryAiProvider('test.example', { riskScore: 18 }, events);
assert.equal(shouldQuery(), true, 'ready model must be queried for confirmed threat');
function fail(type, ms) {
  ctx.recordChromeBuiltinRetryState(new Error(type));
  assert.equal(state.providerState.chromeBuiltinBackoffUntil, clock + ms);
  assert.equal(shouldQuery(), false, 'fallback must suppress repeated failed probes');
  clock += ms - 1;
  assert.equal(shouldQuery(), false);
  clock += 1;
  assert.equal(shouldQuery(), true, 'model must be retried after backoff');
}
fail('unavailable', 30 * 60 * 1000);
fail('downloadable', 5 * 60 * 1000);
fail('downloading', 5 * 60 * 1000);
fail('timeout', 60 * 1000);
ctx.recordChromeBuiltinRetryState();
assert.equal(state.providerState.chromeBuiltinBackoffUntil, 0);
assert.equal(shouldQuery(), true);
assert(persistCalls >= 5, 'retry state should be saved');
state.providerSettings = { ...state.providerSettings, provider: 'openai', enabled: false };
assert.equal(shouldQuery(), false, 'disabled external provider must remain off');
assert(source.includes("if (settings.provider === 'chrome_builtin' && isChromeBuiltinBackoffActive()) {"),
  'advisory route must respect backoff');
assert(source.includes("(settings.provider === 'chrome_builtin' && isChromeBuiltinBackoffActive())"),
  'element classification must respect backoff');
assert(source.includes('if (descriptor.provider === \'chrome_builtin\') recordChromeBuiltinRetryState(error);'),
  'provider failures must enter backoff');
assert(source.includes('const CHROME_BUILTIN_DEFAULT_TIMEOUT_MS = 45000;'),
  'cold Chrome model creation needs a realistic default timeout');
assert(source.includes("provider === 'chrome_builtin' && Number(input.timeoutMs) === 10000"),
  'previous automatic 10s setting should migrate without user setup');
assert(source.includes('if (!isChromeBuiltinReadyAvailability(sessionConfig.availability))'),
  'background may only create a ready model');
console.log('Chrome Built-in AI zero-setup and failure-backoff regression passed');
