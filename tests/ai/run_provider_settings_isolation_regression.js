'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const background = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'extension/dashboard/dashboard.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'extension/dashboard/dashboard.html'), 'utf8');

function extractFunction(name) {
  const marker = 'function ' + name + '(';
  const start = background.indexOf(marker);
  assert(start !== -1, 'missing function ' + name);
  const endMatch = /^}\r?$/m.exec(background.slice(start));
  assert(endMatch, 'missing function end ' + name);
  return background.slice(start, start + endMatch.index + 1);
}
const constants = background.split(/\r?\n/).filter((line) =>
  /^const (AI_PROVIDER_(VERSION|TYPES)|(?:LM_STUDIO|OPENAI|GEMINI|GATEWAY|CHROME_BUILTIN)_DEFAULT_[A-Z_]+) =/.test(line)
);
const names = [
  'getProviderDefaults', 'buildDefaultAiProviderSettings',
  'normalizeAiProviderSettings', 'getPersistableAiProviderSettings',
  'normalizeAiProviderProfiles', 'normalizeAiProviderSecrets'
];
const code = [
  ...constants,
  'function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }',
  "function normalizeChromeBuiltinLanguages(input) { return Array.isArray(input) && input.length ? input : ['en']; }",
  ...names.map(extractFunction)
].join('\n');
const ctx = vm.createContext({});
vm.runInContext(code, ctx);

const original = {
  openai: { provider: 'openai', endpoint: 'https://api.openai.com/v1/responses', model: 'gpt-custom', timeoutMs: 12345, temperature: 0, apiKey: 'OPENAI_SECRET' },
  gemini: { provider: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-custom:generateContent', model: 'gemini-custom', timeoutMs: 23456, apiKey: 'GEMINI_SECRET' },
  lmstudio: { provider: 'lmstudio', endpoint: 'http://127.0.0.1:1234/v1/chat/completions', model: 'local-Q8', modelStoragePath: 'D:/models' },
  gateway: { provider: 'gateway', endpoint: 'http://127.0.0.1:8787/v1', model: 'proxy-A', cooldownMs: 45000, apiKey: 'GATEWAY_SECRET' },
  chrome_builtin: { provider: 'chrome_builtin', endpoint: '', model: 'Gemini Nano', temperature: 0, topK: 3, chromeSampling: 'custom', chromeLanguages: ['ja'] }
};
const profiles = ctx.normalizeAiProviderProfiles(original);
assert.equal(profiles.openai.model, 'gpt-custom');
assert.equal(profiles.openai.temperature, 0);
assert.equal(profiles.gemini.model, 'gemini-custom');
assert.equal(profiles.gemini.timeoutMs, 23456);
assert.equal(profiles.lmstudio.modelStoragePath, 'D:/models');
assert.equal(profiles.gateway.model, 'proxy-A');
assert.equal(profiles.gateway.cooldownMs, 45000);
assert.equal(profiles.chrome_builtin.endpoint, '');
assert.equal(profiles.chrome_builtin.temperature, 0);
assert.equal(profiles.chrome_builtin.chromeSampling, 'custom');
for (const provider of ['openai', 'gemini', 'gateway']) {
  assert.equal(profiles[provider].apiKey, '', provider + ' secret leaked into local profile');
}
const next = ctx.normalizeAiProviderProfiles(profiles, { ...profiles.gemini, model: 'gemini-updated' });
assert.equal(next.gemini.model, 'gemini-updated');
for (const provider of ['openai', 'lmstudio', 'gateway', 'chrome_builtin']) {
  assert.equal(JSON.stringify(next[provider]), JSON.stringify(profiles[provider]), provider + ' profile was modified by Gemini save');
}
const secrets = ctx.normalizeAiProviderSecrets({ openai: 'OA', gemini: 'GG', gateway: 'GW', lmstudio: 'LOCAL', chrome_builtin: 'NANO' });
assert.equal(secrets.openai, 'OA');
assert.equal(secrets.gemini, 'GG');
assert.equal(secrets.gateway, 'GW');
assert.equal(secrets.lmstudio, undefined);
assert.equal(secrets.chrome_builtin, undefined);

assert(html.includes('id="ai-provider-context"'), 'active/editing context is missing');
assert(dashboard.includes('const providerDrafts = new Map()'), 'per-provider unsaved drafts are missing');
assert(dashboard.includes('providerDrafts.set(lastSelectedProvider, collectProviderSettings())'), 'provider switch does not isolate unsaved drafts');
assert(dashboard.includes("loadAiProviderSettings('', true)"), 'initial dashboard must load active provider');
assert(dashboard.includes('card.dataset.provider !== activeProvider'), 'selected card should not be mislabelled active');
assert(dashboard.includes('AI_PROVIDER_ENDPOINTS, provider'), 'empty Chrome endpoint needs its own default');
assert(dashboard.includes('chromeBuiltinTemperature?.value ??'), 'temperature zero must not be treated as missing');
assert(dashboard.includes("provider === 'chrome_builtin' ? (window.FalconChromeBuiltin?.collect?.()"), 'Chrome-only fields must not be applied to other providers');
const saveStart = background.indexOf("if (request.action === 'setAiProviderSettings')");
const saveEnd = background.indexOf("if (request.action === 'runAiProviderHealthCheck')", saveStart);
const saveHandler = background.slice(saveStart, saveEnd);
assert(saveHandler.includes('await persistAiState();'), 'saving should await storage persistence before replying');
console.log('provider isolation and storage regression passed');
