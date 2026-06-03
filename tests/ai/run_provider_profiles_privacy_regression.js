const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const backgroundPath = path.join(repoRoot, 'extension', 'background.js');
const source = fs.readFileSync(backgroundPath, 'utf8');

function sectionBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  assert(startIndex >= 0, `missing start marker: ${start}`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert(endIndex > startIndex, `missing end marker: ${end}`);
  return text.slice(startIndex, endIndex);
}

assert(
  source.includes("const AI_PROVIDER_PROFILES_STORAGE_KEY = 'aiProviderProfiles';"),
  'provider profiles must have an explicit local storage key'
);
assert(
  source.includes('function normalizeAiProviderProfiles'),
  'provider profiles must be normalized per provider'
);
assert(
  source.includes('function normalizeAiProviderSecrets'),
  'provider API secrets must be normalized separately from profiles'
);
assert(
  source.includes('async function persistProviderSecretsToSession'),
  'provider API secrets must be persisted only through session storage'
);

const persistSection = sectionBetween(source, 'async function persistAiState()', 'async function isExtensionEnabled()');
const localPersistPayload = sectionBetween(persistSection, 'await chrome.storage.local.set({', '  });');
assert(
  localPersistPayload.includes('[AI_PROVIDER_PROFILES_STORAGE_KEY]'),
  'AI state persistence must save per-provider profiles'
);
assert(
  !localPersistPayload.includes('providerSecrets'),
  'AI state persistence must not write providerSecrets to local storage'
);
assert(
  !localPersistPayload.includes('apiKey: aiState'),
  'AI state persistence must not write in-memory API keys to local storage'
);
assert(
  persistSection.includes('persistProviderSecretsToSession(aiState.providerSecrets || {})'),
  'AI state persistence must send API secrets to session storage'
);

const setSettingsSection = sectionBetween(source, "if (request.action === 'setAiProviderSettings')", "if (request.action === 'runAiProviderHealthCheck')");
assert(
  setSettingsSection.includes('normalizeAiProviderProfiles(aiState.providerProfiles || {}, aiState.providerSettings)'),
  'saving settings must update the selected provider profile without overwriting other profiles'
);
assert(
  setSettingsSection.includes('[nextSettings.provider]: nextSecret'),
  'saving a credential must bind the secret to the selected provider'
);
assert(
  setSettingsSection.includes('redactAiProviderSettings'),
  'settings responses must redact API keys'
);

console.log('provider profiles privacy regression passed');
