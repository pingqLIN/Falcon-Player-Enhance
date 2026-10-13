'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'extension', 'dashboard', 'chrome-builtin-panel.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'extension', 'dashboard', 'dashboard.html'), 'utf8');

const start = background.indexOf('function normalizeChromeBuiltinLanguages(values)');
const end = background.indexOf('function promptChromeBuiltinSession(', start);
assert(start >= 0 && end > start, 'Chrome Built-in option and availability helpers must exist');
const code = [
  "const CHROME_BUILTIN_LANGUAGES = ['en', 'ja', 'es', 'de', 'fr'];",
  'const CHROME_BUILTIN_DEFAULT_TEMPERATURE = 1;',
  'const CHROME_BUILTIN_DEFAULT_TOP_K = 3;',
  'function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }',
  background.slice(start, end)
].join('\n');
const sandbox = vm.createContext({});
vm.runInContext(code, sandbox);
const build = (api, settings) => vm.runInContext('buildChromeBuiltinSessionOptions(api, settings)', Object.assign(sandbox, { api, settings }));
const resolve = (api, settings) => vm.runInContext('resolveChromeBuiltinSessionConfig(api, settings)', Object.assign(sandbox, { api, settings }));

async function main() {
  const params = { defaultTemperature: 1, maxTemperature: 2, defaultTopK: 3, maxTopK: 128 };
  const calls = [];
  const api = {
    params: async () => params,
    availability: async (options) => {
      calls.push(JSON.parse(JSON.stringify(options)));
      return 'available';
    }
  };
  const japanese = { chromeLanguages: ['ja'], chromeSampling: 'custom', temperature: 0, topK: 7 };
  const config = await resolve(api, japanese);
  assert.equal(config.route, 'language-and-sampling');
  assert.deepEqual(JSON.parse(JSON.stringify(config.options.expectedInputs[0].languages)), ['en', 'ja']);
  assert.deepEqual(JSON.parse(JSON.stringify(config.options.expectedOutputs[0].languages)), ['ja']);
  assert.equal(config.options.temperature, 0);
  assert.equal(config.options.topK, 7);
  assert.equal(calls.length, 1, 'availability must be called only with the requested options');
  assert.deepEqual(calls[0], JSON.parse(JSON.stringify(config.options)), 'availability and create must use identical session options');

  const english = await build(api, { chromeLanguages: ['en'], chromeSampling: 'runtime' });
  assert.equal(english.temperature, undefined);
  assert.equal(english.topK, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(english.expectedInputs[0].languages)), ['en']);
  assert.deepEqual(JSON.parse(JSON.stringify(english.expectedOutputs[0].languages)), ['en']);
  await assert.rejects(
    () => build({ availability: api.availability }, japanese),
    /chrome_builtin_custom_sampling_unavailable/
  );
  let unavailableCalls = 0;
  const unsupported = await resolve({
    params: api.params,
    availability: async () => { unavailableCalls++; return 'unavailable'; }
  }, japanese);
  assert.equal(unsupported.availability, 'unavailable');
  assert.equal(unavailableCalls, 1, 'must not strip requested languages to discover an unrelated model');
  assert(!background.includes('attemptChromeBuiltinDownloadStart('), 'background must not auto-download on health check');
  assert(background.includes('downloadActionRequired'), 'health check must report an explicit download action');

  assert(html.includes('id="btn-download-chrome-model"'), 'explicit download control is missing');
  assert(panel.includes("downloadButton?.addEventListener('click', startDownload)"), 'download must run from a user click');
  assert(panel.includes("addEventListener('downloadprogress'"), 'download should report progress');
  assert(panel.includes('api.availability(options)'), 'page probe must use configured language and sampling options');
  assert(panel.includes("expectedInputs: [{ type: 'text', languages: Array.from(new Set(['en', ...languages])) }]"), 'panel needs English system prompt input');
  console.log('chrome builtin Prompt API contract regression passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
