const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const backgroundPath = path.join(repoRoot, 'extension', 'background.js');
const dashboardPath = path.join(repoRoot, 'extension', 'dashboard', 'dashboard.js');

const background = fs.readFileSync(backgroundPath, 'utf8');
const dashboard = fs.readFileSync(dashboardPath, 'utf8');

function functionBody(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} not found`);

  const braceStart = source.indexOf('{', start);
  assert.notStrictEqual(braceStart, -1, `${name} body start not found`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(braceStart + 1, index);
    }
  }

  throw new Error(`${name} body end not found`);
}

function sectionBetween(source, startName, endName) {
  const start = source.indexOf(`function ${startName}`);
  assert.notStrictEqual(start, -1, `${startName} not found`);
  const end = source.indexOf(`function ${endName}`, start + 1);
  assert.notStrictEqual(end, -1, `${endName} not found after ${startName}`);
  return source.slice(start, end);
}

const promptBody = sectionBetween(background, 'buildElementClassificationPrompt', 'normalizeElementClassification');
assert(!promptBody.includes('block_request'), 'element prompt must not allow block_request');
assert(!promptBody.includes('Local heuristic prior'), 'element prompt must not include local heuristic prior');
assert(promptBody.includes('Local evidence'), 'element prompt must include normalized local evidence');
assert(!promptBody.includes('`Text:'), 'element prompt must not include raw text');
assert(!promptBody.includes('`Href:'), 'element prompt must not include raw href');
assert(!promptBody.includes('`Src:'), 'element prompt must not include raw src');
assert(!promptBody.includes('`Selector:'), 'element prompt must not include raw selector');

const normalizeBody = sectionBetween(background, 'normalizeElementClassification', 'normalizeProviderAdvisory');
assert(!normalizeBody.includes("'block_request'"), 'normalizer must not accept block_request');
assert(!normalizeBody.includes('? \'block_request\''), 'tracker fallback must not become block_request');
assert(normalizeBody.includes("'guard_navigation'"), 'normalizer must retain advisory guard fallback');

const evidenceBody = sectionBetween(background, 'buildElementEvidenceSummary', 'getAiProviderSettingsSignature');
assert(evidenceBody.includes('matchedSeedCount'), 'evidence must expose matched seed count');
assert(evidenceBody.includes('externalHref'), 'evidence must expose external href signal');
assert(evidenceBody.includes('positionBucket'), 'evidence must expose position bucket');
assert(evidenceBody.includes('zIndexBucket'), 'evidence must expose z-index bucket');
assert(evidenceBody.includes('sizeBucket'), 'evidence must expose size bucket');
assert(!evidenceBody.includes('localCategory'), 'evidence must not feed local category as model prior');
assert(!evidenceBody.includes('localConfidence'), 'evidence must not feed local confidence as model prior');
assert(!evidenceBody.includes('textHash'), 'prompt evidence must not expose deterministic text hash');
assert(!evidenceBody.includes('classHash'), 'evidence must not cache raw class hash');
assert(!evidenceBody.includes('idHash'), 'evidence must not cache raw id hash');

const cacheKeyBody = sectionBetween(background, 'buildElementClassificationCacheKey', 'getElementCacheTtlMs');
assert(cacheKeyBody.includes('policyVersion'), 'cache key must include policy version');
assert(cacheKeyBody.includes('providerSettingsVersion'), 'cache key must include provider settings version');
assert(cacheKeyBody.includes('matchedSeedCount'), 'cache key must include matched seed count');
assert(cacheKeyBody.includes('externalHref'), 'cache key must include external href signal');
assert(cacheKeyBody.includes('hasMediaSource'), 'cache key must include media-source presence');
assert(!cacheKeyBody.includes('selectorHash'), 'cache key must not depend on raw selector hash');
assert(!cacheKeyBody.includes('textHash'), 'cache key must not depend on deterministic text hash');
assert(!cacheKeyBody.includes('classHash'), 'cache key must not depend on raw class hash');
assert(!cacheKeyBody.includes('idHash'), 'cache key must not depend on raw id hash');

const rememberBody = sectionBetween(background, 'rememberElementClassification', 'buildElementClassificationPrompt');
assert(rememberBody.includes('policyVersion'), 'cache value must include policy version');
assert(rememberBody.includes('providerSettingsVersion'), 'cache value must include provider settings version');
assert(rememberBody.includes('ttlMs'), 'cache value must include ttlMs');
assert(rememberBody.includes('createdAt'), 'cache value must include createdAt');
assert(rememberBody.includes('expiresAt'), 'cache value must include expiration');
assert(rememberBody.includes('evidenceSignature'), 'cache value must keep a secondary evidence signature');
assert(rememberBody.includes('scheduleAiPersist();'), 'cache writes must schedule persistence for MV3 service worker sleep');

assert(
  background.includes("'aiElementClassificationCache'") && background.includes('aiState.elementClassificationCache ='),
  'loadAiState must restore element cache from storage'
);
assert(
  background.includes('aiElementClassificationCache: aiState.elementClassificationCache || {}'),
  'persistAiState must save element cache to storage'
);
const resetStart = background.indexOf("request.action === 'resetAiLearning'");
assert.notStrictEqual(resetStart, -1, 'resetAiLearning handler not found');
const resetEnd = background.indexOf("request.action === 'aiClassifyElement'", resetStart);
assert.notStrictEqual(resetEnd, -1, 'aiClassifyElement handler not found after resetAiLearning');
const resetBody = background.slice(resetStart, resetEnd);
assert(resetBody.includes('aiState.elementClassificationCache = {};'), 'resetAiLearning must clear persisted element cache state');

const requestBody = sectionBetween(background, 'requestAiElementClassification', 'buildPolicyGate');
assert(requestBody.indexOf('getCachedElementClassification(cacheKey, evidenceSignature)') < requestBody.indexOf("settings.provider === 'openai'"), 'cache lookup must happen before provider calls');
assert(requestBody.indexOf("settings.enabled !== true || settings.mode === 'off'") < requestBody.indexOf('getCachedElementClassification(cacheKey, evidenceSignature)'), 'AI disabled/off mode must bypass cache');
assert(requestBody.includes('responseConstraint: AI_ELEMENT_CLASSIFICATION_RESPONSE_CONSTRAINT'), 'Chrome Built-in classification must try responseConstraint');
assert(requestBody.includes('promptChromeBuiltinSession(session, prompt'), 'Chrome Built-in prompt calls must be timeout-wrapped');
assert(requestBody.includes('isResponseConstraintUnsupportedError(error)'), 'responseConstraint fallback must be limited to schema/options errors');
assert(requestBody.includes('classifyAiProviderError(error)'), 'provider failures must be classified');
assert(requestBody.includes('session?.destroy?.();'), 'Chrome Built-in classification must destroy sessions after prompt timeout/fallback paths');
assert(!requestBody.includes('rememberElementClassification(cacheKey, hostname, classification, cacheMeta);\n    aiState.providerState'), 'transient provider failures must not be cached as normal classifications');

const healthBody = sectionBetween(background, 'runChromeBuiltinHealthCheck', 'runAiProviderHealthCheck');
assert(healthBody.includes('capabilityStatus'), 'Chrome Built-in health check must return capabilityStatus');
assert(healthBody.includes('getChromeBuiltinCapabilitySnapshot'), 'Chrome Built-in health check must include capability snapshot');
assert(healthBody.includes('attempts'), 'Chrome Built-in health check must report route attempts');
assert(healthBody.includes("probe: 'create_prompt_destroy'"), 'Chrome Built-in health check must perform a create/prompt/destroy probe');
assert(healthBody.includes('probeSession?.destroy?.();'), 'Chrome Built-in health check must destroy probe sessions');

assert(dashboard.includes('capabilityStatus='), 'dashboard health output must display capabilityStatus');
assert(dashboard.includes('await loadAiProviderSettings();'), 'dashboard must refresh provider state after health check');

console.log('element classification regression checks passed');
