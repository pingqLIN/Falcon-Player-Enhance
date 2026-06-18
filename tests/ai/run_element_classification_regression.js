const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const backgroundPath = path.join(repoRoot, 'extension', 'background.js');
const dashboardPath = path.join(repoRoot, 'extension', 'dashboard', 'dashboard.js');
const dashboardCssPath = path.join(repoRoot, 'extension', 'dashboard', 'dashboard.css');
const dashboardHtmlPath = path.join(repoRoot, 'extension', 'dashboard', 'dashboard.html');
const popupPath = path.join(repoRoot, 'extension', 'popup', 'popup.js');
const popupHtmlPath = path.join(repoRoot, 'extension', 'popup', 'popup.html');
const cosmeticFilterPath = path.join(repoRoot, 'extension', 'content', 'cosmetic-filter.js');
const overlayRemoverPath = path.join(repoRoot, 'extension', 'content', 'overlay-remover.js');

const background = fs.readFileSync(backgroundPath, 'utf8');
const dashboard = fs.readFileSync(dashboardPath, 'utf8');
const dashboardCss = fs.readFileSync(dashboardCssPath, 'utf8');
const dashboardHtml = fs.readFileSync(dashboardHtmlPath, 'utf8');
const popup = fs.readFileSync(popupPath, 'utf8');
const popupHtml = fs.readFileSync(popupHtmlPath, 'utf8');
const cosmeticFilter = fs.readFileSync(cosmeticFilterPath, 'utf8');
const overlayRemover = fs.readFileSync(overlayRemoverPath, 'utf8');

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
assert(healthBody.includes('attemptChromeBuiltinDownloadStart'), 'Chrome Built-in downloadable health must try to start model download');
assert(healthBody.includes('downloadAttempted'), 'Chrome Built-in health must report download attempts');
assert(healthBody.includes("probe: 'create_prompt_destroy'"), 'Chrome Built-in health check must perform a create/prompt/destroy probe');
assert(healthBody.includes('probeSession?.destroy?.();'), 'Chrome Built-in health check must destroy probe sessions');

assert(dashboard.includes('capabilityStatus='), 'dashboard health output must display capabilityStatus');
assert(dashboard.includes('download='), 'dashboard health output must display Chrome Built-in download attempts');
assert(dashboard.includes('isChromeBuiltinAttentionState'), 'dashboard must classify Chrome Built-in setup/download as attention state');
assert(dashboard.includes("aiStatusDot.classList.add('warning')"), 'dashboard must show Chrome Built-in setup/download as warning status');
assert(dashboard.includes('await loadAiProviderSettings(settings.provider);'), 'dashboard health refresh must stay on the checked provider');
assert(dashboardCss.includes('.ai-status-dot.warning'), 'dashboard CSS must define the orange warning AI status dot');

assert(background.includes("const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash'"), 'Gemini backend default must stay gemini-2.5-flash');
assert(background.includes('const OPENAI_DEFAULT_TIMEOUT_MS = 30000'), 'OpenAI default timeout must be 30000 ms');
assert(background.includes('const OPENAI_DEFAULT_COOLDOWN_MS = 60000'), 'OpenAI default cooldown must be 60000 ms');
assert(background.includes('const OPENAI_DEFAULT_TEMPERATURE = 0.1'), 'OpenAI default temperature must be 0.1');
assert(background.includes('const OPENAI_DEFAULT_TOP_K = 40'), 'OpenAI default Top K must be 40');
assert(background.includes('const GEMINI_DEFAULT_TIMEOUT_MS = 30000'), 'Gemini default timeout must be 30000 ms');
assert(background.includes('const GEMINI_DEFAULT_COOLDOWN_MS = 60000'), 'Gemini default cooldown must be 60000 ms');
assert(background.includes('const GEMINI_DEFAULT_TEMPERATURE = 0.1'), 'Gemini default temperature must be 0.1');
assert(background.includes('const GEMINI_DEFAULT_TOP_K = 40'), 'Gemini default Top K must be 40');
assert(background.includes('const CHROME_BUILTIN_DEFAULT_TIMEOUT_MS = 10000'), 'Chrome Built-in default timeout must be 10000 ms');
assert(background.includes('const CHROME_BUILTIN_DEFAULT_COOLDOWN_MS = 30000'), 'Chrome Built-in default cooldown must be 30000 ms');
assert(background.includes('AI_PROVIDER_ADVISORY_CACHE_MAX_ENTRIES'), 'provider advisory cache must have a bounded max size');
assert(background.includes('AI_PROVIDER_ADVISORY_DEFAULT_TTL_MS = 5 * 60 * 1000'), 'provider advisory cache must keep a short TTL');
const providerDefaultsBody = sectionBetween(background, 'getProviderDefaults', 'buildDefaultAiProviderSettings');
const geminiDefaultsStart = providerDefaultsBody.indexOf("provider === 'gemini'");
const gatewayDefaultsStart = providerDefaultsBody.indexOf("provider === 'gateway'", geminiDefaultsStart);
assert.notStrictEqual(geminiDefaultsStart, -1, 'Gemini provider defaults branch must exist');
assert.notStrictEqual(gatewayDefaultsStart, -1, 'Gateway provider defaults branch must follow Gemini branch');
const geminiDefaultsBody = providerDefaultsBody.slice(geminiDefaultsStart, gatewayDefaultsStart);
assert(geminiDefaultsBody.includes('model: GEMINI_DEFAULT_MODEL'), 'Gemini defaults must use GEMINI_DEFAULT_MODEL');
assert(!geminiDefaultsBody.includes('OPENAI_DEFAULT_MODEL'), 'Gemini defaults must not reuse the OpenAI model');
const geminiGenerateBody = functionBody(background, 'buildGeminiGenerateContentBody');
assert(geminiGenerateBody.includes('settings?.temperature ?? GEMINI_DEFAULT_TEMPERATURE'), 'Gemini request body must honor configured temperature');
assert(geminiGenerateBody.includes('settings?.topK ?? GEMINI_DEFAULT_TOP_K'), 'Gemini request body must honor configured Top K');
const chromeBuiltinPromptBody = functionBody(background, 'buildChromeBuiltinPrompt');
assert(chromeBuiltinPromptBody.includes('buildChromeBuiltinPolicyPromptInput'), 'Chrome Built-in policy prompt must use compact input');
assert(!chromeBuiltinPromptBody.includes('buildOpenAiInstructions()'), 'Chrome Built-in policy prompt must not resend full OpenAI instructions');
assert(!chromeBuiltinPromptBody.includes('buildOpenAiInput('), 'Chrome Built-in policy prompt must not resend the full provider schema');
const providerAdvisoryBody = sectionBetween(background, 'requestAiProviderAdvisory', 'requestAiElementClassification');
assert(providerAdvisoryBody.includes('getCachedProviderAdvisory'), 'provider advisory requests must check cache before model calls');
assert(providerAdvisoryBody.includes('aiProviderAdvisoryInflight.get'), 'provider advisory requests must join in-flight work');
assert(providerAdvisoryBody.includes('perHostLastRun') && providerAdvisoryBody.includes('[normalizedHost]: startedAt'), 'provider advisory requests must reserve host cooldown before awaiting model calls');
assert(providerAdvisoryBody.includes('rememberProviderAdvisory'), 'provider advisory success must persist a reusable cache entry');
const shouldQueryBody = functionBody(background, 'shouldQueryAiProvider');
assert(shouldQueryBody.includes('skipped_cooldown'), 'provider query gate must record cooldown skips');
const chromeBuiltinAdvisoryBody = functionBody(background, 'requestChromeBuiltinAdvisory');
assert(chromeBuiltinAdvisoryBody.includes('promptChromeBuiltinSession'), 'Chrome Built-in advisory prompt must be timeout-wrapped');
assert(chromeBuiltinAdvisoryBody.includes('advisory.promptChars = prompt.length'), 'Chrome Built-in advisory must record prompt size diagnostics');
assert(background.includes("'aiProviderAdvisoryCache'"), 'provider advisory cache must load from storage');
assert(background.includes('aiProviderAdvisoryCache: aiState.providerAdvisoryCache || {}'), 'provider advisory cache must persist to storage');
assert(background.includes('recentRequests'), 'provider state must retain recent request diagnostics');
assert(dashboard.includes("if (provider === 'gemini') return 'gemini-2.5-flash';"), 'dashboard Gemini default must stay gemini-2.5-flash');
assert(dashboard.includes("'Gemini Nano'"), 'dashboard provider switching must recognize the Chrome Built-in default model');
assert(dashboard.includes('AI_PROVIDER_TEMPERATURES'), 'dashboard must expose per-provider temperature defaults');
assert(dashboard.includes('AI_PROVIDER_TOP_K'), 'dashboard must expose per-provider Top K defaults');
assert(background.includes('aiEnabled: aiState.enabled'), 'provider settings response must expose global AI enabled state');
assert(dashboard.includes('let aiServiceEnabled = false'), 'dashboard must track global AI service state separately from provider settings');
assert(dashboard.includes("aiStatusTitle.textContent = 'AI enabled'"), 'dashboard top AI status must use fixed global enabled wording');
assert(dashboard.includes("aiStatusTitle.textContent = 'AI disabled'"), 'dashboard top AI status must use fixed global disabled wording');
assert(dashboard.includes('applyAiServiceControlState'), 'dashboard must gray and lock AI provider controls when AI is disabled');
assert(dashboardHtml.includes('id="btn-select-all-lmstudio-candidates"'), 'dashboard must expose bulk candidate select all');
assert(dashboardHtml.includes('id="btn-accept-selected-lmstudio-candidates"'), 'dashboard must expose bulk candidate accept');
assert(dashboardHtml.includes('dashboardAiCandidateHelp'), 'dashboard must explain Accept versus Promote');
assert(popup.includes('applyAiMonitorDisabledState'), 'side-panel AI controls must gray and lock when AI is disabled');

assert(background.includes("const DISPLAY_RELOAD_ON_CHANGE_KEY = 'autoReloadDisplaySettings'"), 'background must define auto reload setting key');
assert(dashboardHtml.includes('id="toggle-display-auto-reload"'), 'dashboard must expose the display auto-reload setting');
assert(dashboard.includes('applyDisplaySettingChange'), 'dashboard must reload or mark pending after display-related setting changes');
assert(popupHtml.includes('id="display-reload-warning"'), 'side-panel popup must include pending display reload warning');
assert(popup.includes('updateDisplayReloadWarning'), 'popup must render pending display reload warning state');
assert(popup.includes("markDisplaySettingsChanged(['blockingLevel']"), 'blocking level changes must use display reload policy');
assert(popup.includes("markDisplaySettingsChanged(['popupGuardEnabled']"), 'popup guard changes must use display reload policy');
assert(popup.includes("markDisplaySettingsChanged(['sameTabRedirectGuardEnabled']"), 'same-tab redirect guard changes must use display reload policy');
assert(popup.includes('popupPickElementActivating'), 'Block element must provide visible activation feedback');
assert(popup.includes('!isSidecarContext && !isPinnedWindowMode'), 'Block element must keep the side-panel open after activation');
assert(cosmeticFilter.includes("target.style.setProperty('pointer-events', 'none', 'important');"), 'hidden-element preview must not intercept clicks in cosmetic-filter');
assert(overlayRemover.includes("target.style.setProperty('pointer-events', 'none', 'important');"), 'hidden-element preview must not intercept clicks in overlay-remover');

console.log('element classification regression checks passed');
