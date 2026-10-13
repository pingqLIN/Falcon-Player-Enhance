const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'extension/dashboard/dashboard.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'extension/dashboard/chrome-usecase-inspector.js'), 'utf8');

const ids = [
  'chrome-usecase-inspector', 'chrome-usecase-open-native',
  'chrome-usecase-availability', 'chrome-usecase-file', 'chrome-model-file',
  'chrome-usecase-list', 'chrome-asset-list', 'chrome-usecase-status'
];
ids.forEach(id => assert.match(html, new RegExp('id="' + id + '"')));
assert.match(html, /<script src="chrome-usecase-inspector\.js"><\/script>/);
assert.doesNotMatch(source, /chrome\.debugger|\.executeScript|use-cases\/set|innerHTML\s*=/);

class Element {
  constructor() { this.children = []; this.listeners = {}; this.textContent = ''; this.value = ''; this.files = []; this.disabled = false; }
  addEventListener(name, cb) { this.listeners[name] = cb; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; }
}
const nodes = Object.fromEntries(ids.map(id => [id, new Element()]));
const calls = [];
const sandbox = {
  document: {
    getElementById: id => nodes[id],
    createElement: () => new Element(),
    createTextNode: s => String(s)
  },
  chrome: { tabs: { create: async config => { calls.push(config); } } },
  LanguageModel: { availability: async () => 'available' },
  console
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'chrome-usecase-inspector.js' });

(async () => {
  await nodes['chrome-usecase-open-native'].listeners.click();
  assert.equal(calls[0].url, 'chrome://on-device-internals/');
  assert.equal(calls[0].active, true);

  const useCaseInput = nodes['chrome-usecase-file'];
  useCaseInput.files = [{
    size: 100,
    text: async () => JSON.stringify({ useCases: [{ name: 'prompt_api_gemma4_12b', requested: true, unavailableReason: null }] })
  }];
  await useCaseInput.listeners.change({ currentTarget: useCaseInput });
  assert.equal(nodes['chrome-usecase-list'].children.length, 1);
  assert.match(nodes['chrome-usecase-list'].children[0].children[1].textContent, /Requested/);

  const inventoryInput = nodes['chrome-model-file'];
  inventoryInput.files = [{
    size: 100,
    text: async () => JSON.stringify({ assetStates: [{
      profile: 'Dev', assetId: 'gemma4_12b_component', fileState: 'BYTES_PRESENT',
      apiAvailability: 'NOT_TESTED', modelSelectedForInference: 'UNKNOWN'
    }] })
  }];
  await inventoryInput.listeners.change({ currentTarget: inventoryInput });
  assert.equal(nodes['chrome-asset-list'].children.length, 1);
  assert.match(nodes['chrome-asset-list'].children[0].children[1].textContent, /NOT_TESTED/);

  const check = nodes['chrome-usecase-availability'];
  await check.listeners.click({ currentTarget: check });
  assert.equal(nodes['chrome-usecase-list'].children.length, 6);
  assert.match(nodes['chrome-usecase-list'].children[0].children[1].textContent, /available/);
  assert.equal(check.disabled, false);
  console.log('PASS: protected internal link, broker import, model import, user-triggered public availability');
})().catch(err => { console.error(err); process.exitCode = 1; });
