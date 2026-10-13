/* Read-only Chrome Built-in AI Use Case diagnostics.
 * chrome://on-device-internals is a protected debug UI, not an extension API.
 * No private Mojo/CDP access, model downloads, Requested mutations, or storage.
 */
(() => {
  'use strict';
  const root = document.getElementById('chrome-usecase-inspector');
  if (!root) return;
  const byId = id => document.getElementById(id);
  const list = byId('chrome-usecase-list');
  const status = byId('chrome-usecase-status');
  const assets = byId('chrome-asset-list');
  const apiNames = [
    ['LanguageModel', 'Prompt API'], ['Summarizer', 'Summarizer'],
    ['Writer', 'Writer'], ['Rewriter', 'Rewriter'],
    ['Proofreader', 'Proofreader'], ['LanguageDetector', 'Language Detector']
  ];
  const text = value => document.createTextNode(String(value));
  function show(node, value) { node.replaceChildren(text(value)); }
  function row(parent, title, value) {
    const div = document.createElement('div');
    div.className = 'setting-item';
    const label = document.createElement('span');
    label.className = 'setting-title';
    label.textContent = title;
    const result = document.createElement('span');
    result.className = 'info-text';
    result.textContent = value;
    div.append(label, result);
    parent.append(div);
  }
  function resetList(node) { node.replaceChildren(); }
  function renderBroker(json) {
    if (!Array.isArray(json?.useCases)) throw Error('Missing useCases array');
    if (json.useCases.length > 1000) throw Error('Too many Use Cases');
    resetList(list);
    json.useCases.slice(0, 150).forEach(entry => {
      if (typeof entry?.name !== 'string' || entry.name.length > 150) return;
      const requested = entry.requested === true ? 'Requested' : entry.requested === false ? 'Not requested' : 'Requested unknown';
      const unavailable = entry.unavailableReason == null ? '' : ' · unavailable reason ' + String(entry.unavailableReason);
      const available = typeof entry.availability === 'string' ? ' · ' + entry.availability.slice(0, 70) : '';
      row(list, entry.name, requested + unavailable + available);
    });
    const observedAt = typeof json.observedAt === 'string' ? json.observedAt.slice(0, 48) : 'unknown';
    show(status, 'Imported ' + json.useCases.length + ' Use Cases; captured at ' + observedAt + '. Historical snapshot, NOT LIVE. Requested does not identify the model used.');
  }
  function renderAssets(json) {
    if (!Array.isArray(json?.assetStates)) throw Error('Missing assetStates array');
    if (json.assetStates.length > 1000) throw Error('Too many assets');
    resetList(assets);
    json.assetStates.slice(0, 100).forEach(entry => {
      if (typeof entry?.assetId !== 'string') return;
      const name = [entry.profile, entry.assetId].filter(Boolean).join(' / ');
      const state = [entry.fileState, entry.requestedVersion, entry.manifest?.modelName || entry.manifest?.componentName || '',
        entry.resolvedFromCanonical ? 'Shared canonical bytes' : 'Independent / unknown source',
        'API ' + (entry.apiAvailability || 'NOT_TESTED')].filter(Boolean).join(' · ');
      row(assets, name.slice(0, 170), state.slice(0, 450));
    });
    show(status, 'Imported ' + json.assetStates.length + ' asset observations. File states are not Runtime readiness.');
  }
  async function importFile(input, renderer) {
    const selected = input?.files?.[0];
    if (!selected) return;
    try {
      if (selected.size > 1024 * 1024) throw Error('JSON file exceeds 1 MB');
      const parsed = JSON.parse(await selected.text());
      renderer(parsed);
    } catch (error) { show(status, 'Import failed: ' + String(error?.message || error)); }
    finally { input.value = ''; }
  }
  byId('chrome-usecase-file')?.addEventListener('change', event => importFile(event.currentTarget, renderBroker));
  byId('chrome-model-file')?.addEventListener('change', event => importFile(event.currentTarget, renderAssets));
  byId('chrome-usecase-open-native')?.addEventListener('click', async () => {
    try {
      await chrome.tabs.create({ url: 'chrome://on-device-internals/', active: true });
      show(status, 'Opened Chrome internal diagnostics in its own tab; this panel cannot read or change it.');
    } catch (err) {
      show(status, 'Unable to open internal diagnostics: ' + String(err?.message || err));
    }
  });
  byId('chrome-usecase-availability')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    resetList(list);
    show(status, 'Checking public availability() methods on explicit request; no create() or Requested updates.');
    try {
      for (const [globalName, name] of apiNames) {
        const api = globalThis[globalName];
        if (typeof api?.availability !== 'function') {
          row(list, name, 'Not exposed in this extension context');
          continue;
        }
        try {
          // No create(): some availability() calls may still trigger background
          // downloads according to the official model-management documentation.
          const state = await api.availability();
          row(list, name, 'Public API: ' + String(state));
        } catch (err) {
          row(list, name, 'Probe error: ' + String(err?.name || 'Error') + ' · ' + String(err?.message || err).slice(0, 160));
        }
      }
      show(status, 'Public APIs checked. They do not reveal model ID, Manifest Ledger, or internal Requested flags.');
    } finally { button.disabled = false; }
  });
})();