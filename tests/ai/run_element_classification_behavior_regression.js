const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const background = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `${startMarker} not found`);
  const end = source.indexOf(endMarker, start + 1);
  assert.notStrictEqual(end, -1, `${endMarker} not found after ${startMarker}`);
  return source.slice(start, end);
}

const context = {
  AI_POLICY_VERSION: 2,
  AI_PROVIDER_VERSION: 2,
  AI_ELEMENT_CACHE_MAX_ENTRIES: 500,
  AI_ELEMENT_CACHE_MAX_ENTRIES_PER_HOST: 80,
  AI_ELEMENT_CACHE_DEFAULT_TTL_MS: 5 * 60 * 1000,
  AI_ELEMENT_CACHE_HIGH_CONFIDENCE_TTL_MS: 10 * 60 * 1000,
  AI_ELEMENT_CACHE_TEXT_LIMIT: 80,
  AI_ELEMENT_CACHE_TOKEN_LIMIT: 8,
  aiState: { elementClassificationCache: {} },
  now: 1000,
  console,
  URL,
  Number,
  String,
  JSON,
  Math,
  RegExp,
  Boolean,
  Object,
  Array,
  Error,
  clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  },
  getNow() {
    return context.now;
  },
  getHostname(value) {
    try {
      const text = String(value || '');
      if (!text) return '';
      const parsed = text.includes('://') ? new URL(text) : new URL(`https://${text}`);
      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch (_) {
      return '';
    }
  },
  normalizeAiProviderSettings(input = {}) {
    return {
      version: input.version || 2,
      provider: input.provider || 'chrome_builtin',
      mode: input.mode || 'hybrid',
      model: input.model || 'Gemini Nano',
      temperature: input.temperature ?? 0.2,
      topK: input.topK ?? 8
    };
  },
  scheduleAiPersist() {
    context.persistScheduled = true;
  }
};

vm.createContext(context);
vm.runInContext(sectionBetween(background, 'function classifyAiProviderError', 'function normalizeGeneratedRuleCandidates'), context);
vm.runInContext(sectionBetween(background, 'function normalizeBucket', 'function buildElementClassificationPrompt'), context);
vm.runInContext(sectionBetween(background, 'function normalizeElementClassification', 'function normalizeProviderAdvisory'), context);

function sampleFeatures(index = 0) {
  return {
    tagName: 'A',
    selector: `a.watch-${index}`,
    text: `Watch now ${index}`,
    href: `https://ads${index}.example/path?token=secret-${index}`,
    src: '',
    className: `btn watch token-${index}`,
    id: `watch-${index}`,
    computedStyle: { position: 'fixed', zIndex: '2000' },
    rect: { width: 320, height: 120 }
  };
}

const settings = { provider: 'chrome_builtin', mode: 'hybrid', model: 'Gemini Nano', temperature: 0.2, topK: 8 };
const localResult = { category: 'suspicious', confidence: 0.4, matchedSeedIds: ['seed-1'] };
const descriptor = context.buildElementClassificationCacheDescriptor('video.example', sampleFeatures(1), settings, localResult);
const classification = { category: 'ad', confidence: 0.9, reason: 'test', suggestedAction: 'hide_element', provider: 'chrome_builtin' };

context.rememberElementClassification(descriptor.key, 'video.example', classification, descriptor.meta, descriptor.evidenceSignature);
assert.strictEqual(context.persistScheduled, true, 'cache writes should schedule persistence');
const hit = context.getCachedElementClassification(descriptor.key, descriptor.evidenceSignature);
assert.strictEqual(hit.cacheHit, true, 'same descriptor should hit cache');
assert.strictEqual(hit.ttlMs, 10 * 60 * 1000, 'high confidence cache value should expose ttlMs');

const collisionMiss = context.getCachedElementClassification(descriptor.key, `${descriptor.evidenceSignature}:different`);
assert.strictEqual(collisionMiss, null, 'secondary evidence signature should prevent hash collision reuse');

context.now += 10 * 60 * 1000 + 1;
assert.strictEqual(context.getCachedElementClassification(descriptor.key, descriptor.evidenceSignature), null, 'expired cache should miss');

const descriptorA = context.buildElementClassificationCacheDescriptor('video.example', sampleFeatures(2), { ...settings, topK: 8 }, localResult);
const descriptorB = context.buildElementClassificationCacheDescriptor('video.example', sampleFeatures(2), { ...settings, topK: 5 }, localResult);
assert.notStrictEqual(descriptorA.key, descriptorB.key, 'provider settings changes should invalidate cache key');

context.AI_POLICY_VERSION = 3;
const policyDescriptor = context.buildElementClassificationCacheDescriptor('video.example', sampleFeatures(2), settings, localResult);
assert.notStrictEqual(descriptorA.key, policyDescriptor.key, 'policy version changes should invalidate cache key');
context.AI_POLICY_VERSION = 2;

const seedDescriptorA = context.buildElementClassificationCacheDescriptor(
  'video.example',
  sampleFeatures(3),
  settings,
  { ...localResult, matchedSeedIds: ['seed-1'] }
);
const seedDescriptorB = context.buildElementClassificationCacheDescriptor(
  'video.example',
  sampleFeatures(3),
  settings,
  { ...localResult, matchedSeedIds: ['seed-1', 'seed-2'] }
);
assert.notStrictEqual(seedDescriptorA.key, seedDescriptorB.key, 'matched seed count changes should not collide');

const mediaFeaturesA = sampleFeatures(4);
const mediaFeaturesB = { ...sampleFeatures(4), src: 'https://cdn.example/media.js' };
const mediaDescriptorA = context.buildElementClassificationCacheDescriptor('video.example', mediaFeaturesA, settings, localResult);
const mediaDescriptorB = context.buildElementClassificationCacheDescriptor('video.example', mediaFeaturesB, settings, localResult);
assert.notStrictEqual(mediaDescriptorA.key, mediaDescriptorB.key, 'media source presence changes should not collide');

const sensitiveFeatures = {
  tagName: 'DIV',
  selector: '#player-secret-selector > div[data-user="miles"]',
  text: 'private watch token SECRET_PHRASE',
  href: 'https://ads.example/path?token=SECRET_HREF',
  src: 'https://cdn.example/media.js?secret=SECRET_SRC',
  className: 'ad banner 0123456789abcdef0123456789abcdef',
  id: '550e8400-e29b-41d4-a716-446655440000',
  computedStyle: { position: 'absolute', zIndex: '1200' },
  rect: { width: 728, height: 90 }
};
const sensitiveDescriptor = context.buildElementClassificationCacheDescriptor('video.example', sensitiveFeatures, settings, localResult);
const sensitiveSignature = sensitiveDescriptor.evidenceSignature;
assert(!sensitiveSignature.includes('SECRET_PHRASE'), 'evidence signature must not persist raw text');
assert(!sensitiveSignature.includes('SECRET_HREF'), 'evidence signature must not persist raw href query');
assert(!sensitiveSignature.includes('SECRET_SRC'), 'evidence signature must not persist raw src query');
assert(!sensitiveSignature.includes('player-secret-selector'), 'evidence signature must not persist raw selector');
assert(!sensitiveSignature.includes('550e8400'), 'random-like id tokens should be filtered from evidence signature');
context.rememberElementClassification(
  sensitiveDescriptor.key,
  'video.example',
  classification,
  sensitiveDescriptor.meta,
  sensitiveDescriptor.evidenceSignature
);
const persistedSensitiveEntry = JSON.stringify(context.aiState.elementClassificationCache[sensitiveDescriptor.key]);
assert(!persistedSensitiveEntry.includes('SECRET_PHRASE'), 'persisted cache entry must not include raw text');
assert(!persistedSensitiveEntry.includes('SECRET_HREF'), 'persisted cache entry must not include raw href query');
assert(!persistedSensitiveEntry.includes('SECRET_SRC'), 'persisted cache entry must not include raw src query');
assert(!persistedSensitiveEntry.includes('player-secret-selector'), 'persisted cache entry must not include raw selector');

context.aiState.elementClassificationCache = {};
context.now = 5000;
for (let index = 0; index < 85; index += 1) {
  const itemDescriptor = context.buildElementClassificationCacheDescriptor('video.example', sampleFeatures(index), settings, localResult);
  context.rememberElementClassification(itemDescriptor.key, 'video.example', classification, itemDescriptor.meta, itemDescriptor.evidenceSignature);
  context.now += 1;
}
assert(
  Object.keys(context.aiState.elementClassificationCache).length <= 80,
  'per-host cache pruning should cap entries'
);

context.aiState.elementClassificationCache = {};
for (let index = 0; index < 520; index += 1) {
  const host = `site${index}.example`;
  const itemDescriptor = context.buildElementClassificationCacheDescriptor(host, sampleFeatures(index), settings, localResult);
  context.rememberElementClassification(itemDescriptor.key, host, classification, itemDescriptor.meta, itemDescriptor.evidenceSignature);
  context.now += 1;
}
assert(
  Object.keys(context.aiState.elementClassificationCache).length <= 500,
  'global cache pruning should cap entries'
);

const rejectedAction = context.normalizeElementClassification(
  { category: 'tracker', confidence: 0.8, reason: 'bad', suggestedAction: 'block_request' },
  null
);
assert.strictEqual(rejectedAction.suggestedAction, 'observe_only', 'invalid model action should downgrade to observe_only');

assert.strictEqual(context.classifyAiProviderError(new Error('chrome_builtin_prompt_api_unavailable')), 'unsupported_context');
assert.strictEqual(context.classifyAiProviderError(new Error('chrome_builtin_not_ready_downloadable')), 'downloadable');
assert.strictEqual(context.classifyAiProviderError(new Error('chrome_builtin_element_invalid_json')), 'invalid_json');
assert.strictEqual(context.classifyAiProviderError(new Error('HTTP 429 rate limit')), 'quota_exceeded');
assert.strictEqual(context.classifyAiProviderError(new Error('unclassified provider failure')), 'error');

console.log('element classification behavior regression checks passed');
