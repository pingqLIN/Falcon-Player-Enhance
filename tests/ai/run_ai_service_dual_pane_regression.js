'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'extension/dashboard/dashboard.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'extension/dashboard/dashboard.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'extension/dashboard/dashboard.js'), 'utf8');
const bg = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');

for (const id of [
  'ai-provider', 'ai-status-title', 'ai-status-sub', 'ai-connection-type',
  'ai-tokens-session', 'ai-tokens-total', 'ai-operation-log', 'ai-advanced-settings',
  'btn-save-lmstudio', 'btn-check-lmstudio', 'btn-toggle-ai',
  'btn-reset-ai-provider-defaults', 'btn-export-lmstudio-candidates',
  'lmstudio-candidate-list', 'lmstudio-candidate-summary'
]) {
  const occurrences = html.match(new RegExp('id="' + id + '"', 'g')) || [];
  assert.equal(occurrences.length, 1, 'duplicate or missing element: ' + id);
}
assert.match(html, /<div class="ai-workspace">[\s\S]*<aside class="settings-group ai-candidates-pane"/);
assert.match(html, /<select id="ai-provider"[\s\S]*value="chrome_builtin"/);
assert.doesNotMatch(html, /id="provider-card-grid"/);
assert.match(css, /#ai \.ai-workspace \{ display:grid/);
assert.match(css, /@media \(max-width: 1080px\)/);
assert.match(html, /<details class="settings-group ai-provider-advanced" id="ai-advanced-settings">/);
assert.match(html, /id="lmstudio-enabled" hidden/);
assert.match(js, /if \(nextProvider === lastSelectedProvider && providerFormLoaded\) return/);
assert.match(js, /collectProviderSettings\(lastSelectedProvider\)/);
assert.match(js, /btn-toggle-ai/);
assert.match(js, /delete settings\.apiKey/);
assert.match(js, /provider-reported usage only/);
assert.match(js, /aiSeenDiagnostics\.has/);

const begin = bg.indexOf('function recordAiProviderTokenUsage(');
const end = bg.indexOf('\nfunction classifyAiProviderError(', begin);
assert.ok(begin > 0 && end > begin, 'missing usage collector');
const context = {
  AI_PROVIDER_TYPES: ['openai', 'gemini', 'gateway', 'lmstudio', 'chrome_builtin'],
  aiState: { providerState: {} },
  normalizeAiProviderState: (x) => x,
  scheduleAiPersist: () => { context.persistCount += 1; },
  persistCount: 0
};
const collector = vm.runInNewContext(bg.slice(begin, end) + '\nrecordAiProviderTokenUsage;', context);
collector('openai', { usage: { input_tokens: 201, output_tokens: 17 } });
collector('openai', { usage: { input_tokens: 12, output_tokens: 4 } });
collector('gemini', { usageMetadata: { promptTokenCount: 18, candidatesTokenCount: 7 } });
collector('lmstudio', { usage: { prompt_tokens: 55, completion_tokens: 11 } });
collector('gateway', { usage: {} });
collector('openai', { usage: { input_tokens: -100, output_tokens: 5 } });
collector('chrome_builtin', {});
assert.equal(context.aiState.providerState.tokenUsage.openai.input, 213);
assert.equal(context.aiState.providerState.tokenUsage.openai.output, 21);
assert.equal(context.aiState.providerState.tokenUsage.openai.requests, 2);
assert.equal(context.aiState.providerState.tokenUsage.gemini.input, 18);
assert.equal(context.aiState.providerState.tokenUsage.lmstudio.output, 11);
assert.equal(context.aiState.providerState.tokenUsage.gateway, undefined);
assert.equal(context.persistCount, 4);
for (const provider of ['openai','gemini','gateway','lmstudio']) {
  assert.match(bg, new RegExp("recordAiProviderTokenUsage\\('" + provider + "', payload\\)"), 'no inference usage hook: '+provider);
}
const logStart = js.indexOf('function safeAiLog(value) {');
const logEnd = js.indexOf('    function appendAiLog(', logStart);
assert.ok(logStart > 0 && logEnd > logStart);
const redact = vm.runInNewContext(js.slice(logStart, logEnd) + '\nsafeAiLog;');
const sanitized = redact('Bearer sensitive-token sk-secretkey123456 api_key=s3cret token=abcd');
for (const secret of ['sensitive-token', 'sk-secretkey123456', 's3cret', 'abcd']) {
  assert.ok(!sanitized.includes(secret), 'secret leaked in log: '+secret);
}
assert.match(js, /URL query credentials must never be present/);
console.log('AI service dual-pane and provider usage contract: passed');
