// ============================================================================
// Falcon-Player-Enhance - Background Service Worker v4.4
// ============================================================================
// 全域開關、動態腳本註冊、白名單與統計管理
// AI 強化: 常駐監控介面、風險模型、策略下發
// ============================================================================

const APP_BRAND = 'Falcon-Player-Enhance';
const DEFAULT_WHITELIST = [
  'youtube.com',
  'youtu.be',
  'netflix.com',
  'disneyplus.com',
  'hulu.com',
  'primevideo.com',
  'max.com',
  'hbomax.com',
  'tv.apple.com',
  'peacocktv.com',
  'paramountplus.com'
];

const CONTENT_SCRIPT_IDS = [
  'shield-basic-docidle',
  'shield-ai-runtime',
  'shield-main-world',
  'shield-docstart-isolated',
  'shield-enhanced-docidle',
  'shield-docidle-isolated'
];

const ACTION_MENU_IDS = {
  openSidebar: 'open-action-side-panel',
  openPopup: 'open-action-popup-window'
};
const SITE_REGISTRY_RESOURCE_PATH = 'rules/site-registry.json';
const SITE_BEHAVIORS_RESOURCE_PATH = 'rules/site-behaviors.json';
const AD_LIST_RESOURCE_PATH = 'rules/ad-list.json';
const AI_PROVIDER_SECRET_STORAGE_KEY = 'aiProviderSecret';
const AI_PROVIDER_SECRETS_STORAGE_KEY = 'aiProviderSecrets';
const AI_KNOWLEDGE_VERSION = 1;
const AI_KNOWLEDGE_MAX_OBSERVATIONS = 300;
const AI_KNOWLEDGE_MAX_CANDIDATES = 160;
const AI_KNOWLEDGE_MAX_TEACH_SESSIONS = 200;
const TEACHING_CONFIRMATION_THRESHOLD = 3;
const AUTO_LEARNING_PROMOTION_THRESHOLD = 5;

const directPopupOverlayTabs = {};
let siteRegistryLoadPromise = null;
let siteRegistryDomains = [];
let siteBehaviorLoadPromise = null;
let siteBehaviorProfiles = [];
let adListLoadPromise = null;
let adListEntries = [];

const SITE_REGISTRY = {
  // 產生 Chrome match patterns
  toMatchPatterns() {
    return toDomainMatchPatterns(getBuiltinEnhancedDomains());
  },
  // 產生純域名片段清單（供 content script 內部 hostname 比對）
  toDomainKeywords() {
    return [...new Set(getBuiltinEnhancedDomains().map(d => d.replace(/\.(com|org|net|tv|one|ws|online)$/i, '')))];
  }
};

function toDomainMatchPatterns(domains = []) {
  return domains.flatMap((domain) => [
    `*://*.${domain}/*`,
    `*://${domain}/*`
  ]);
}

function normalizeDomainList(domains = []) {
  return [...new Set(
    (Array.isArray(domains) ? domains : [])
      .map((domain) => String(domain || '').trim().toLowerCase())
      .filter(Boolean)
  )];
}

async function loadSiteRegistry() {
  if (siteRegistryLoadPromise) return siteRegistryLoadPromise;

  siteRegistryLoadPromise = (async () => {
    try {
      const response = await fetch(chrome.runtime.getURL(SITE_REGISTRY_RESOURCE_PATH), {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`site_registry_http_${response.status}`);
      }

      const payload = await response.json();
      const domains = normalizeDomainList(payload?.domains);
      if (domains.length === 0) {
        throw new Error('site_registry_empty');
      }

      siteRegistryDomains = domains;
      return siteRegistryDomains;
    } catch (error) {
      siteRegistryDomains = [];
      console.error('✗ 站點註冊表載入失敗:', error);
      return siteRegistryDomains;
    }
  })();

  return siteRegistryLoadPromise;
}

async function loadSiteBehaviors() {
  if (siteBehaviorLoadPromise) return siteBehaviorLoadPromise;

  siteBehaviorLoadPromise = (async () => {
    try {
      const response = await fetch(chrome.runtime.getURL(SITE_BEHAVIORS_RESOURCE_PATH), {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`site_behaviors_http_${response.status}`);
      }

      const payload = await response.json();
      siteBehaviorProfiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
      return siteBehaviorProfiles;
    } catch (error) {
      siteBehaviorProfiles = [];
      console.error('✗ 站點行為規則載入失敗:', error);
      return siteBehaviorProfiles;
    }
  })();

  return siteBehaviorLoadPromise;
}

async function loadAdList() {
  if (adListLoadPromise) return adListLoadPromise;

  adListLoadPromise = (async () => {
    try {
      const response = await fetch(chrome.runtime.getURL(AD_LIST_RESOURCE_PATH), {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`ad_list_http_${response.status}`);
      }

      const payload = await response.json();
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];
      adListEntries = entries
        .map((entry, index) => normalizeAdListEntry(entry, index))
        .filter(Boolean);
      return adListEntries;
    } catch (error) {
      adListEntries = [];
      console.error('✗ AD LIST 載入失敗:', error);
      return adListEntries;
    }
  })();

  return adListLoadPromise;
}

function getBuiltinEnhancedDomains() {
  return normalizeDomainList(siteRegistryDomains);
}

function getEffectiveEnhancedDomains(customSites = []) {
  return normalizeDomainList([
    ...getBuiltinEnhancedDomains(),
    ...customSites
  ]);
}

function getEffectiveEnhancedMatchPatterns(customSites = []) {
  return toDomainMatchPatterns(getEffectiveEnhancedDomains(customSites));
}

const BASIC_GLOBAL_CONTENT_SCRIPT_DEFINITIONS = [
  {
    id: 'shield-basic-docidle',
    matches: ['<all_urls>'],
    css: ['content/styles.css', 'content/player-overlay-fix.css'],
    js: [
      'content/site-profile.js',
      'content/player-detector.js',
      'content/fake-video-remover.js',
      'content/overlay-remover.js',
      'content/player-enhancer.js',
      'content/player-controls.js',
      'content/player-sync.js'
    ],
    runAt: 'document_idle',
    allFrames: true,
    persistAcrossSessions: true
  }
];

const ENHANCED_SITE_CONTENT_SCRIPT_DEFINITIONS = [
  {
    id: 'shield-ai-runtime',
    matches: [],
    js: ['content/ai-runtime.js'],
    runAt: 'document_start',
    allFrames: true,
    persistAcrossSessions: true
  },
  {
    id: 'shield-main-world',
    matches: [],
    js: ['content/anti-antiblock.js', 'content/inject-blocker.js'],
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: true,
    persistAcrossSessions: true
  },
  {
    id: 'shield-docstart-isolated',
    matches: [],
    js: ['content/site-profile.js', 'content/cosmetic-filter.js', 'content/anti-popup.js'],
    runAt: 'document_start',
    allFrames: true,
    persistAcrossSessions: true
  },
  {
    id: 'shield-enhanced-docidle',
    matches: [],
    css: ['content/styles.css', 'content/player-overlay-fix.css'],
    js: [
      'content/site-profile.js',
      'content/player-detector.js',
      'content/fake-video-remover.js',
      'content/overlay-remover.js',
      'content/player-enhancer.js',
      'content/player-controls.js',
      'content/player-sync.js'
    ],
    runAt: 'document_idle',
    allFrames: true,
    persistAcrossSessions: true
  }
];

const AI_POLICY_VERSION = 2;
const AI_POLICY_GATE_VERSION = 1;
const AI_PROVIDER_VERSION = 2;
const AI_PROVIDER_TYPES = ['openai', 'gemini', 'lmstudio', 'gateway'];
const AI_MAX_TELEMETRY = 1500;
const AI_DECAY_PER_MINUTE = 0.96;
const AI_HOST_FALLBACK_DURATION_MS = 8 * 60 * 1000;
const AI_HOST_FALLBACK_COOLDOWN_MS = 2 * 60 * 1000;
const LM_STUDIO_DEFAULT_ENDPOINT = 'http://127.0.0.1:1234/v1/chat/completions';
const LM_STUDIO_DEFAULT_MODEL = '';
const LM_STUDIO_DEFAULT_TIMEOUT_MS = 4000;
const LM_STUDIO_DEFAULT_COOLDOWN_MS = 25000;
const OPENAI_DEFAULT_ENDPOINT = 'https://api.openai.com/v1/responses';
const OPENAI_DEFAULT_MODEL = 'gpt-5.4-mini';
const OPENAI_DEFAULT_TIMEOUT_MS = 20000;
const GEMINI_DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_DEFAULT_TIMEOUT_MS = 20000;
const GATEWAY_DEFAULT_ENDPOINT = '';
const GATEWAY_DEFAULT_MODEL = 'gpt-5.4-mini';
const GATEWAY_DEFAULT_TIMEOUT_MS = 8000;
const APP_VERSION = chrome.runtime.getManifest().version || '0.0.0';
const LM_STUDIO_DEFAULT_MIN_RISK_SCORE = 8;
const LM_STUDIO_DEFAULT_MAX_RECENT_EVENTS = 8;
const BLOCKING_LEVEL_DEFAULT = 2;
const BLOCKING_LEVEL_MIN = 0;
const BLOCKING_LEVEL_MAX = 3;
const L3_REDIRECT_BLOCK_RULES = [
  { id: 9300, domain: 'sfnu-protect.sbs' },
  { id: 9301, domain: 'xsotrk.com' },
  { id: 9302, domain: 'exoclick-adb.com' },
  { id: 9303, domain: 'exoclick.com' },
  { id: 9304, domain: 'cooladblocker.app' },
  { id: 9305, domain: 'cooladblocker.com' },
  { id: 9306, domain: 'cyltor88mf.com' },
  { id: 9307, domain: 'drynvalo.info' },
  { id: 9310, domain: 'trackingclick' },
  { id: 9311, domain: 'magsrv.com' },
  { id: 9312, domain: 'popads.net' }
];
const L3_DYNAMIC_RULE_LEGACY_IDS = [9308, 9309, 9399];
const AI_HIGH_RISK_EXTRA_DOMAINS = [
  'exoclick',
  'trafficjunky',
  'juicyads',
  'popads',
  'magsrv',
  'clickadu',
  'adsterra',
  'doubleclick',
  'trackingclick',
  'slot'
];
const AI_POLICY_GATE_DEFAULT_THRESHOLDS = {
  advisoryMinConfidence: 0.55,
  reversibleMinConfidence: 0.82,
  reversibleMinRiskScore: 18,
  devEscalationMinRiskScore: 30
};
const AI_POLICY_GATE_ACTION_BUDGET = {
  maxReversibleActionsPerWindow: 3,
  cooldownMs: 30000
};

const AI_EVENT_WEIGHTS = {
  runtime_bootstrap: 0.2,
  blocked_popup: 6,
  blocked_malicious_navigation: 7,
  overlay_removed: 4,
  clickjacking_detected: 8,
  suspicious_dom_churn: 3,
  false_positive_signal: -5,
  user_override: -2
};

const STATS_DEFAULTS = {
  popupsBlocked: 0,
  overlaysRemoved: 0,
  fakeVideosRemoved: 0,
  playersProtected: 0,
  totalBlocked: 0
};

let stats = { ...STATS_DEFAULTS };
let pinnedPopupPlayers = {};
let blockingLevel = BLOCKING_LEVEL_DEFAULT;
let lastActiveBlockingLevel = BLOCKING_LEVEL_DEFAULT;
let runtimeExtensionEnabled = null;

let aiState = {
  enabled: true,
  profiles: {},
  telemetryLog: [],
  policyCache: {},
  hostMetrics: {},
  hostFallbacks: {},
  providerSettings: null,
  providerSecret: '',
  providerSecrets: {},
  providerState: null,
  providerAdvisories: {},
  generatedRuleCandidates: {},
  knowledgeStore: null
};

let aiPersistTimer = null;
let contentScriptSyncQueue = Promise.resolve();
let actionContextMenuSetupPromise = null;

function normalizeStats(source) {
  return {
    ...STATS_DEFAULTS,
    ...(source && typeof source === 'object' ? source : {})
  };
}

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`🎬 ${APP_BRAND} v4.4 已安裝/更新`);
  await configureProviderSecretStorage();
  await loadSiteRegistry();
  await loadSiteBehaviors();
  await loadAdList();
  await initStorage(details.reason);
  await loadStats();
  await loadBlockingSettings();
  await loadPinnedPopupPlayers();
  await loadAiState();
  await configureActionClickBehavior();
  await configureActionContextMenus();
  await applyExtensionState(resolveEnabledByBlockingLevel(blockingLevel), 'install');
});

chrome.runtime.onStartup?.addListener(async () => {
  await configureProviderSecretStorage();
  await loadSiteRegistry();
  await loadSiteBehaviors();
  await loadAdList();
  await initStorage('startup');
  await loadStats();
  await loadBlockingSettings();
  await loadPinnedPopupPlayers();
  await loadAiState();
  await configureActionClickBehavior();
  await configureActionContextMenus();
  await applyExtensionState(resolveEnabledByBlockingLevel(blockingLevel), 'startup');
});

(async () => {
  await configureProviderSecretStorage();
  await loadSiteRegistry();
  await loadSiteBehaviors();
  await loadAdList();
  await initStorage('runtime_init');
  await loadStats();
  await loadBlockingSettings();
  await loadPinnedPopupPlayers();
  await loadAiState();
  await configureActionClickBehavior();
  await configureActionContextMenus();
  await applyExtensionState(resolveEnabledByBlockingLevel(blockingLevel), 'runtime_init');
})();

async function initStorage(reason = 'update') {
  const result = await chrome.storage.local.get([
    'stats',
    'whitelist',
    'removeOverlays',
    'bypassAntiBlock',
    'playerEnhancement',
    'popupBlockingEnabled',
    'fakeVideoRemovalEnabled',
    'playerSyncEnabled',
    'extensionEnabled',
    'blockingLevel',
    'lastActiveBlockingLevel',
    'pinnedPopupPlayers',
    'aiMonitorEnabled',
    'aiProfiles',
    'aiTelemetryLog',
    'aiPolicyCache',
    'aiHostMetrics',
    'aiHostFallbacks',
    'aiProviderSettings',
    AI_PROVIDER_SECRETS_STORAGE_KEY,
    'aiProviderState',
    'aiProviderAdvisories',
    'aiGeneratedRuleCandidates',
    'aiKnowledgeStore',
    'uiLanguage',
    'theme'
  ]);

  const patch = {};

  if (!result.stats) {
    patch.stats = { ...stats };
  } else {
    const normalizedStats = normalizeStats(result.stats);
    if (JSON.stringify(normalizedStats) !== JSON.stringify(result.stats)) {
      patch.stats = normalizedStats;
    }
  }

  if (!Array.isArray(result.whitelist)) {
    patch.whitelist = [...DEFAULT_WHITELIST];
  } else if (reason === 'install' || result.whitelist.length === 0) {
    patch.whitelist = Array.from(new Set([...DEFAULT_WHITELIST, ...result.whitelist]));
  }

  if (typeof result.removeOverlays !== 'boolean') {
    patch.removeOverlays = true;
  }

  if (typeof result.bypassAntiBlock !== 'boolean') {
    patch.bypassAntiBlock = true;
  }

  if (typeof result.playerEnhancement !== 'boolean') {
    patch.playerEnhancement = true;
  }

  if (typeof result.popupBlockingEnabled !== 'boolean') {
    patch.popupBlockingEnabled = true;
  }

  if (typeof result.fakeVideoRemovalEnabled !== 'boolean') {
    patch.fakeVideoRemovalEnabled = true;
  }

  if (typeof result.playerSyncEnabled !== 'boolean') {
    patch.playerSyncEnabled = true;
  }

  if (typeof result.extensionEnabled !== 'boolean') {
    patch.extensionEnabled = true;
  }

  const normalizedLevel = Number.isFinite(Number(result.blockingLevel))
    ? normalizeBlockingLevel(result.blockingLevel)
    : result.extensionEnabled === false
    ? 0
    : BLOCKING_LEVEL_DEFAULT;

  if (Number(result.blockingLevel) !== normalizedLevel) {
    patch.blockingLevel = normalizedLevel;
  }

  const normalizedLastActive = Number.isFinite(Number(result.lastActiveBlockingLevel))
    ? normalizeActiveBlockingLevel(result.lastActiveBlockingLevel)
    : normalizedLevel > 0
    ? normalizeActiveBlockingLevel(normalizedLevel)
    : BLOCKING_LEVEL_DEFAULT;

  if (Number(result.lastActiveBlockingLevel) !== normalizedLastActive) {
    patch.lastActiveBlockingLevel = normalizedLastActive;
  }

  const enabledFromLevel = normalizedLevel > 0;
  if (result.extensionEnabled !== enabledFromLevel) {
    patch.extensionEnabled = enabledFromLevel;
  }

  if (typeof result.pinnedPopupPlayers !== 'object' || result.pinnedPopupPlayers === null) {
    patch.pinnedPopupPlayers = {};
  }

  if (typeof result.aiMonitorEnabled !== 'boolean') {
    patch.aiMonitorEnabled = true;
  }

  if (typeof result.aiProfiles !== 'object' || result.aiProfiles === null) {
    patch.aiProfiles = {};
  }

  if (!Array.isArray(result.aiTelemetryLog)) {
    patch.aiTelemetryLog = [];
  }

  if (typeof result.aiPolicyCache !== 'object' || result.aiPolicyCache === null) {
    patch.aiPolicyCache = {};
  }

  if (typeof result.aiHostMetrics !== 'object' || result.aiHostMetrics === null) {
    patch.aiHostMetrics = {};
  }

  if (typeof result.aiHostFallbacks !== 'object' || result.aiHostFallbacks === null) {
    patch.aiHostFallbacks = {};
  }

  const normalizedKnowledgeStore = normalizeAiKnowledgeStore(result.aiKnowledgeStore || {});
  if (JSON.stringify(normalizedKnowledgeStore) !== JSON.stringify(result.aiKnowledgeStore || {})) {
    patch.aiKnowledgeStore = normalizedKnowledgeStore;
  }

  if (typeof result.aiProviderSettings !== 'object' || result.aiProviderSettings === null) {
    patch.aiProviderSettings = buildDefaultAiProviderSettings();
  } else {
    const persistableProviderSettings = getPersistableAiProviderSettings(result.aiProviderSettings);
    if (JSON.stringify(persistableProviderSettings) !== JSON.stringify(result.aiProviderSettings)) {
      patch.aiProviderSettings = persistableProviderSettings;
    }
  }

  if (typeof result.aiProviderState !== 'object' || result.aiProviderState === null) {
    patch.aiProviderState = buildDefaultAiProviderState();
  }

  if (typeof result.aiProviderAdvisories !== 'object' || result.aiProviderAdvisories === null) {
    patch.aiProviderAdvisories = {};
  }

  if (typeof result.aiGeneratedRuleCandidates !== 'object' || result.aiGeneratedRuleCandidates === null) {
    patch.aiGeneratedRuleCandidates = {};
  }

  if (!result.theme) {
    patch.theme = 'light';
  }

  if (typeof result[AI_PROVIDER_SECRETS_STORAGE_KEY] !== 'object' || result[AI_PROVIDER_SECRETS_STORAGE_KEY] === null) {
    patch[AI_PROVIDER_SECRETS_STORAGE_KEY] = normalizeAiProviderSecrets({});
  }

  if (typeof result.uiLanguage !== 'string') {
    patch.uiLanguage = 'auto';
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}

async function loadStats() {
  const result = await chrome.storage.local.get(['stats']);
  stats = normalizeStats(result.stats || stats);
}

async function loadBlockingSettings() {
  const result = await chrome.storage.local.get(['blockingLevel', 'lastActiveBlockingLevel', 'extensionEnabled']);

  const levelFromStorage = Number.isFinite(Number(result.blockingLevel))
    ? normalizeBlockingLevel(result.blockingLevel)
    : result.extensionEnabled === false
    ? 0
    : BLOCKING_LEVEL_DEFAULT;

  const activeLevelFromStorage = Number.isFinite(Number(result.lastActiveBlockingLevel))
    ? normalizeActiveBlockingLevel(result.lastActiveBlockingLevel)
    : levelFromStorage > 0
    ? normalizeActiveBlockingLevel(levelFromStorage)
    : BLOCKING_LEVEL_DEFAULT;

  blockingLevel = levelFromStorage;
  lastActiveBlockingLevel = levelFromStorage > 0 ? normalizeActiveBlockingLevel(levelFromStorage) : activeLevelFromStorage;

  const enabled = resolveEnabledByBlockingLevel(blockingLevel);
  const patch = {};
  if (Number(result.blockingLevel) !== blockingLevel) {
    patch.blockingLevel = blockingLevel;
  }
  if (Number(result.lastActiveBlockingLevel) !== lastActiveBlockingLevel) {
    patch.lastActiveBlockingLevel = lastActiveBlockingLevel;
  }
  if (result.extensionEnabled !== enabled) {
    patch.extensionEnabled = enabled;
  }
  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}

async function setBlockingLevel(level, source = 'unknown') {
  const normalized = normalizeBlockingLevel(level);
  blockingLevel = normalized;
  if (normalized > 0) {
    lastActiveBlockingLevel = normalizeActiveBlockingLevel(normalized);
  }

  const enabled = resolveEnabledByBlockingLevel(normalized);
  await chrome.storage.local.set({
    blockingLevel: normalized,
    lastActiveBlockingLevel,
    extensionEnabled: enabled
  });

  await applyExtensionState(enabled, source);

  return {
    blockingLevel: normalized,
    lastActiveBlockingLevel,
    enabled
  };
}

function sanitizePopupPlayerPayload(input = {}) {
  return {
    windowId: input.windowId ? String(input.windowId) : '',
    videoSrc: input.videoSrc ? String(input.videoSrc) : '',
    iframeSrc: input.iframeSrc ? String(input.iframeSrc) : '',
    poster: input.poster ? String(input.poster) : '',
    title: input.title ? String(input.title) : '',
    sourceTabUrl: input.sourceTabUrl ? String(input.sourceTabUrl) : '',
    sourceTabId: Number.isFinite(Number(input.sourceTabId)) ? Number(input.sourceTabId) : 0,
    playerId: input.playerId ? String(input.playerId) : '',
    remoteControlPreferred:
      input.remoteControlPreferred === true || String(input.remoteControlPreferred || '') === '1',
    pin: input.pin === true || String(input.pin || '') === '1'
  };
}

function withSenderPopupPlayerContext(input = {}, sender) {
  const payload = sanitizePopupPlayerPayload(input);
  const senderTabId = Number(sender?.tab?.id || 0);
  if (!payload.sourceTabId && Number.isFinite(senderTabId) && senderTabId > 0) {
    payload.sourceTabId = senderTabId;
  }
  if (!payload.sourceTabUrl && sender?.tab?.url) {
    payload.sourceTabUrl = String(sender.tab.url);
  }
  const popupBehavior = getPopupBehaviorForPayload(payload);
  if (popupBehavior.forcePopupDirect && popupBehavior.popupMode === 'remote-control' && payload.sourceTabId > 0) {
    payload.remoteControlPreferred = true;
  }
  return payload;
}

function normalizePopupHost(input = '') {
  return String(input || '').toLowerCase().replace(/^www\./, '');
}

function isPopupDomainOrSubdomain(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

function findSiteBehaviorProfileByHost(hostname = '') {
  const normalized = normalizePopupHost(hostname);
  if (!normalized) return null;

  return siteBehaviorProfiles.find((profile) => {
    const hostSuffixes = Array.isArray(profile?.match?.hostSuffixes) ? profile.match.hostSuffixes : [];
    return hostSuffixes.some((domain) => isPopupDomainOrSubdomain(normalized, normalizePopupHost(domain)));
  }) || null;
}

function getPopupBehaviorForPayload(payload = {}) {
  const iframeSrc = String(payload.iframeSrc || '').trim();
  if (!iframeSrc) {
    return {
      forcePopupDirect: false,
      popupMode: 'standard'
    };
  }

  try {
    const hostname = normalizePopupHost(new URL(iframeSrc).hostname);
    const profile = findSiteBehaviorProfileByHost(hostname);
    return {
      forcePopupDirect: profile?.capabilities?.forcePopupDirect === true,
      popupMode: String(profile?.capabilities?.popupMode || 'standard')
    };
  } catch (_) {
    return {
      forcePopupDirect: false,
      popupMode: 'standard'
    };
  }
}

function shouldOpenPopupDirectly(payload = {}) {
  return getPopupBehaviorForPayload(payload).forcePopupDirect === true;
}

function buildPopupPlayerUrl(payload = {}) {
  const normalized = sanitizePopupPlayerPayload(payload);
  const params = new URLSearchParams();
  if (normalized.videoSrc) params.set('videoSrc', normalized.videoSrc);
  if (normalized.iframeSrc) params.set('iframeSrc', normalized.iframeSrc);
  if (normalized.poster) params.set('poster', normalized.poster);
  if (normalized.title) params.set('title', normalized.title);
  if (normalized.windowId) params.set('windowId', normalized.windowId);
  if (normalized.sourceTabUrl) params.set('sourceTabUrl', normalized.sourceTabUrl);
  if (normalized.sourceTabId > 0) params.set('sourceTabId', String(normalized.sourceTabId));
  if (normalized.playerId) params.set('playerId', normalized.playerId);
  if (normalized.remoteControlPreferred) params.set('remote', '1');
  if (normalized.pin) params.set('pin', '1');
  return chrome.runtime.getURL('popup-player/popup-player.html') + '?' + params.toString();
}

function shouldUseRemoteControlMode(payload = {}) {
  const normalized = sanitizePopupPlayerPayload(payload);
  if (!Number.isFinite(normalized.sourceTabId) || normalized.sourceTabId <= 0) {
    return false;
  }
  if (normalized.remoteControlPreferred) {
    return true;
  }
  return !normalized.videoSrc && !normalized.iframeSrc;
}

async function persistPinnedPopupPlayers() {
  await chrome.storage.local.set({ pinnedPopupPlayers });
}

async function loadPinnedPopupPlayers() {
  const result = await chrome.storage.local.get(['pinnedPopupPlayers']);
  pinnedPopupPlayers =
    result.pinnedPopupPlayers && typeof result.pinnedPopupPlayers === 'object' ? result.pinnedPopupPlayers : {};

  const windows = await chrome.windows.getAll({});
  const alive = new Set((windows || []).map((item) => String(item.id)));
  let changed = false;
  Object.keys(pinnedPopupPlayers).forEach((windowId) => {
    if (!alive.has(windowId)) {
      delete pinnedPopupPlayers[windowId];
      changed = true;
    }
  });
  if (changed) {
    await persistPinnedPopupPlayers();
  }
}

async function createPopupPlayerWindow(payload = {}) {
  const popupUrl = shouldUseRemoteControlMode(payload)
    ? buildPopupPlayerUrl({ ...payload, remoteControlPreferred: true })
    : shouldOpenPopupDirectly(payload)
    ? String(payload.iframeSrc || '').trim()
    : buildPopupPlayerUrl(payload);
  const createdWindow = await chrome.windows.create({
    url: popupUrl,
    type: 'popup',
    width: 1280,
    height: 720,
    focused: true
  });
  await registerDirectPopupOverlayWindow(createdWindow, payload);
  return createdWindow;
}

function getDirectPopupOverlayDomain(payload = {}) {
  try {
    const iframeSrc = String(payload.iframeSrc || '').trim();
    if (!iframeSrc) return '';
    return normalizePopupHost(new URL(iframeSrc).hostname);
  } catch (_) {
    return '';
  }
}

async function registerDirectPopupOverlayWindow(createdWindow, payload = {}) {
  if (!createdWindow?.id || !shouldOpenPopupDirectly(payload)) {
    return;
  }

  const domain = getDirectPopupOverlayDomain(payload);
  if (!domain) return;

  const tabs = await chrome.tabs.query({ windowId: createdWindow.id });
  for (const tab of tabs || []) {
    if (!tab?.id) continue;
    directPopupOverlayTabs[String(tab.id)] = {
      windowId: createdWindow.id,
      domain,
      createdAt: getNow()
    };
    if (tab.status === 'complete' && tab.url) {
      injectDirectPopupOverlay(tab.id, tab.url).catch(() => {});
    }
  }
}

function shouldKeepDirectPopupOverlayTab(tabId, tabUrl = '') {
  const entry = directPopupOverlayTabs[String(tabId)];
  if (!entry) return false;

  try {
    const hostname = normalizePopupHost(new URL(tabUrl).hostname);
    const allowed = isPopupDomainOrSubdomain(hostname, entry.domain);
    if (!allowed) {
      delete directPopupOverlayTabs[String(tabId)];
    }
    return allowed;
  } catch (_) {
    delete directPopupOverlayTabs[String(tabId)];
    return false;
  }
}

async function injectDirectPopupOverlay(tabId, tabUrl = '') {
  if (!shouldKeepDirectPopupOverlayTab(tabId, tabUrl)) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['content/direct-popup-overlay.js']
    });
  } catch (error) {
    console.warn('⚠️ 外站 popup overlay 注入失敗:', String(error?.message || error));
  }
}

function buildPinnedControlPanelPath(tabId) {
  const resolvedTabId = Number(tabId || 0);
  const params = new URLSearchParams();
  params.set('pinned', '1');
  if (Number.isFinite(resolvedTabId) && resolvedTabId > 0) {
    params.set('tabId', String(resolvedTabId));
  }
  return `popup/popup.html?${params.toString()}`;
}

function buildDefaultControlPanelPath(tabId) {
  return buildPinnedControlPanelPath(tabId);
}

async function configureActionClickBehavior() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (_) {
    // Ignore unsupported Chrome versions or transient startup failures.
  }
}

function getActionMenuLabel(key, fallback) {
  return chrome.i18n?.getMessage?.(key) || fallback;
}

async function configureActionContextMenus() {
  if (!chrome.contextMenus?.removeAll || !chrome.contextMenus?.create) {
    return;
  }

  if (actionContextMenuSetupPromise) {
    return actionContextMenuSetupPromise;
  }

  const removeAllMenus = () => new Promise((resolve, reject) => {
    chrome.contextMenus.removeAll(() => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });

  const createMenu = (options) => new Promise((resolve, reject) => {
    chrome.contextMenus.create(options, () => {
      if (!chrome.runtime.lastError) {
        resolve();
        return;
      }

      const message = String(chrome.runtime.lastError.message || '');
      if (message.includes('duplicate id')) {
        resolve();
        return;
      }

      reject(new Error(message));
    });
  });

  actionContextMenuSetupPromise = (async () => {
    try {
      await removeAllMenus();
      await createMenu({
        id: ACTION_MENU_IDS.openSidebar,
        title: getActionMenuLabel('actionMenuOpenSidebar', 'Open sidebar control panel'),
        contexts: ['action']
      });
      await createMenu({
        id: ACTION_MENU_IDS.openPopup,
        title: getActionMenuLabel('actionMenuOpenPopup', 'Open popup window'),
        contexts: ['action']
      });
    } catch (error) {
      console.warn('⚠️ 無法建立常駐列右鍵選單:', String(error?.message || error));
    } finally {
      actionContextMenuSetupPromise = null;
    }
  })();

  return actionContextMenuSetupPromise;
}

async function openDefaultControlSidePanel(tabId) {
  const resolvedTabId = Number(tabId || 0);
  if (!Number.isFinite(resolvedTabId) || resolvedTabId <= 0) {
    throw new Error('missing_tab_id');
  }
  if (!chrome.sidePanel?.setOptions || !chrome.sidePanel?.open) {
    throw new Error('side_panel_unsupported');
  }

  await chrome.sidePanel.setOptions({
    tabId: resolvedTabId,
    enabled: true,
    path: buildDefaultControlPanelPath(resolvedTabId)
  });
  await chrome.sidePanel.open({ tabId: resolvedTabId });
  return { tabId: resolvedTabId };
}

async function openPinnedControlSidePanel(tabId) {
  const resolvedTabId = Number(tabId || 0);
  if (!Number.isFinite(resolvedTabId) || resolvedTabId <= 0) {
    throw new Error('missing_tab_id');
  }
  if (!chrome.sidePanel?.setOptions || !chrome.sidePanel?.open) {
    throw new Error('side_panel_unsupported');
  }

  const panelPath = buildPinnedControlPanelPath(resolvedTabId);
  await chrome.sidePanel.setOptions({
    tabId: resolvedTabId,
    enabled: true,
    path: panelPath
  });

  try {
    await chrome.sidePanel.open({ tabId: resolvedTabId });
  } catch (error) {
    // Roll back to disabled when open fails (e.g. missing user gesture)
    await chrome.sidePanel.setOptions({
      tabId: resolvedTabId,
      enabled: false
    });
    throw error;
  }

  return { tabId: resolvedTabId };
}

async function closePinnedControlSidePanel(tabId) {
  const resolvedTabId = Number(tabId || 0);
  if (!Number.isFinite(resolvedTabId) || resolvedTabId <= 0) {
    throw new Error('missing_tab_id');
  }
  if (!chrome.sidePanel?.setOptions) {
    throw new Error('side_panel_unsupported');
  }

  await chrome.sidePanel.setOptions({
    tabId: resolvedTabId,
    enabled: false
  });

  return { tabId: resolvedTabId };
}

async function openActionPopupForTab(tabId) {
  const resolvedTabId = Number(tabId || 0);
  if (!Number.isFinite(resolvedTabId) || resolvedTabId <= 0) {
    return { opened: false, reason: 'missing_tab_id' };
  }

  try {
    const result = await openDefaultControlSidePanel(resolvedTabId);
    return { opened: true, tabId: result.tabId, mode: 'side_panel' };
  } catch (error) {
    return { opened: false, reason: String(error?.message || error) };
  }
}

async function openActionPopupWindowForTab(tabId) {
  const resolvedTabId = Number(tabId || 0);
  if (!Number.isFinite(resolvedTabId) || resolvedTabId <= 0) {
    return { opened: false, reason: 'missing_tab_id' };
  }

  const url = chrome.runtime.getURL(
    `popup/popup.html?tabId=${encodeURIComponent(String(resolvedTabId))}`
  );
  const created = await chrome.windows.create({
    url,
    type: 'popup',
    focused: true,
    width: 1280,
    height: 840
  });

  return { opened: true, tabId: resolvedTabId, windowId: created?.id || 0, mode: 'popup_window' };
}

function broadcastStatsUpdated() {
  try {
    chrome.runtime.sendMessage({ action: 'statsUpdated', stats }).catch(() => {});
  } catch (_) {
    // no-op
  }
}

async function updateStatsWith(mutator) {
  const result = await chrome.storage.local.get(['stats']);
  const next = normalizeStats(result.stats || stats);
  mutator(next);
  next.totalBlocked = Math.max(
    Number(next.totalBlocked || 0),
    Number(next.overlaysRemoved || 0) + Number(next.popupsBlocked || 0) + Number(next.fakeVideosRemoved || 0)
  );
  stats = normalizeStats(next);
  await chrome.storage.local.set({ stats });
  broadcastStatsUpdated();
}

async function loadAiState() {
  const result = await chrome.storage.local.get([
    'aiMonitorEnabled',
    'aiProfiles',
    'aiTelemetryLog',
    'aiPolicyCache',
    'aiHostMetrics',
    'aiHostFallbacks',
    'aiProviderSettings',
    AI_PROVIDER_SECRETS_STORAGE_KEY,
    'aiProviderState',
    'aiProviderAdvisories',
    'aiGeneratedRuleCandidates',
    'aiKnowledgeStore'
  ]);
  const storedSettings = normalizeAiProviderSettings(result.aiProviderSettings || {});
  const migratedSecret =
    storedSettings.provider !== 'lmstudio' && storedSettings.apiKey
      ? String(storedSettings.apiKey || '').trim()
      : '';
  const legacySessionSecret = await loadProviderSecretFromSession();
  const providerSecrets = normalizeAiProviderSecrets(result[AI_PROVIDER_SECRETS_STORAGE_KEY] || {});
  const legacyProvider = String(storedSettings.provider || 'openai');
  const nextProviderSecrets = normalizeAiProviderSecrets({
    ...providerSecrets,
    [legacyProvider]: providerSecrets[legacyProvider] || legacySessionSecret || migratedSecret
  });

  if (
    migratedSecret ||
    legacySessionSecret ||
    JSON.stringify(nextProviderSecrets) !== JSON.stringify(providerSecrets)
  ) {
    await chrome.storage.local.set({
      aiProviderSettings: getPersistableAiProviderSettings(storedSettings),
      [AI_PROVIDER_SECRETS_STORAGE_KEY]: nextProviderSecrets
    });
    await persistProviderSecretToSession('');
  }

  aiState.enabled = result.aiMonitorEnabled !== false;
  aiState.profiles = result.aiProfiles || {};
  aiState.telemetryLog = Array.isArray(result.aiTelemetryLog) ? result.aiTelemetryLog : [];
  aiState.policyCache = result.aiPolicyCache || {};
  aiState.hostMetrics = result.aiHostMetrics || {};
  aiState.hostFallbacks = result.aiHostFallbacks || {};
  aiState.providerSettings = getPersistableAiProviderSettings(storedSettings);
  aiState.providerSecrets = nextProviderSecrets;
  aiState.providerSecret = String(nextProviderSecrets[legacyProvider] || '').trim();
  aiState.providerState = normalizeAiProviderState(result.aiProviderState || {});
  aiState.providerAdvisories =
    result.aiProviderAdvisories && typeof result.aiProviderAdvisories === 'object'
      ? result.aiProviderAdvisories
      : {};
  aiState.generatedRuleCandidates = normalizeGeneratedRuleCandidates(result.aiGeneratedRuleCandidates || {});
  const knowledgeBeforeSeed = JSON.stringify(result.aiKnowledgeStore || {});
  aiState.knowledgeStore = normalizeAiKnowledgeStore(result.aiKnowledgeStore || {});
  seedAiKnowledgeStore();
  if (JSON.stringify(aiState.knowledgeStore) !== knowledgeBeforeSeed) {
    scheduleAiPersist();
  }
}

function scheduleAiPersist() {
  if (aiPersistTimer) return;
  aiPersistTimer = setTimeout(() => {
    aiPersistTimer = null;
    persistAiState().catch((error) => {
      console.error('✗ AI 狀態持久化失敗:', error);
    });
  }, 1200);
}

async function persistAiState() {
  await chrome.storage.local.set({
    aiMonitorEnabled: aiState.enabled,
    aiProfiles: aiState.profiles,
    aiTelemetryLog: aiState.telemetryLog,
    aiPolicyCache: aiState.policyCache,
    aiHostMetrics: aiState.hostMetrics,
    aiHostFallbacks: aiState.hostFallbacks,
    aiProviderSettings: getPersistableAiProviderSettings(aiState.providerSettings || {}),
    [AI_PROVIDER_SECRETS_STORAGE_KEY]: normalizeAiProviderSecrets(aiState.providerSecrets || {}),
    aiProviderState: normalizeAiProviderState(aiState.providerState || {}),
    aiProviderAdvisories: aiState.providerAdvisories || {},
    aiGeneratedRuleCandidates: normalizeGeneratedRuleCandidates(aiState.generatedRuleCandidates || {}),
    aiKnowledgeStore: normalizeAiKnowledgeStore(aiState.knowledgeStore || {})
  });
  await persistProviderSecretToSession('');
}

async function isExtensionEnabled() {
  const result = await chrome.storage.local.get(['extensionEnabled']);
  return result.extensionEnabled === true;
}

async function updateRulesets(enabled) {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enabled ? ['player_rules'] : [],
      disableRulesetIds: enabled ? [] : ['player_rules']
    });
    console.log(enabled ? '✓ 規則集已啟用' : '⏸ 規則集已停用');
  } catch (error) {
    console.error('✗ 規則集更新失敗:', error);
  }
}

async function updateL3DynamicBlockingRules(level, enabled) {
  const l3RuleIds = L3_REDIRECT_BLOCK_RULES.map((rule) => rule.id);
  const removeRuleIds = [...new Set([...l3RuleIds, ...L3_DYNAMIC_RULE_LEGACY_IDS])];
  const shouldEnableL3Rules = enabled === true && normalizeBlockingLevel(level) >= 3;

  const addRules = shouldEnableL3Rules
    ? L3_REDIRECT_BLOCK_RULES.map((rule) => ({
        id: rule.id,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: `||${rule.domain}^`,
          resourceTypes: ['main_frame', 'sub_frame']
        }
      }))
    : [];

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules
    });
    if (shouldEnableL3Rules) {
      console.log(`✓ L3 動態導流封鎖已啟用 (${addRules.length} rules)`);
    } else {
      console.log('⏸ L3 動態導流封鎖已停用');
    }
  } catch (error) {
    console.error('✗ L3 動態導流封鎖更新失敗:', error);
  }
}

function enqueueContentScriptSync(task) {
  const run = async () => task();
  const next = contentScriptSyncQueue.then(run, run);
  contentScriptSyncQueue = next.catch(() => {});
  return next;
}

async function unregisterContentScriptsNow() {
  try {
    const getRegistered = chrome.scripting.getRegisteredContentScripts?.bind(chrome.scripting);

    if (!getRegistered) {
      await chrome.scripting.unregisterContentScripts({ ids: CONTENT_SCRIPT_IDS });
      return;
    }

    const registered = await getRegistered();
    const registeredIds = new Set((registered || []).map((item) => item.id));
    const idsToRemove = CONTENT_SCRIPT_IDS.filter((id) => registeredIds.has(id));

    if (idsToRemove.length === 0) {
      return;
    }

    await chrome.scripting.unregisterContentScripts({ ids: idsToRemove });
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    const isBenign =
      msg.includes('no content script') ||
      msg.includes('nonexistent script id') ||
      msg.includes('does not exist');

    if (!isBenign) {
      console.error('✗ 解除內容腳本失敗:', error);
    }
  }
}

async function registerContentScriptsNow() {
  try {
    await loadSiteRegistry();
    await unregisterContentScriptsNow();

    const { customSites = [] } = await chrome.storage.local.get(['customSites']);
    const enhancedPatterns = getEffectiveEnhancedMatchPatterns(customSites);
    const basicDefinitions = BASIC_GLOBAL_CONTENT_SCRIPT_DEFINITIONS.map((definition) => ({
      ...definition,
      excludeMatches: enhancedPatterns
    }));
    const enhancedDefinitions = ENHANCED_SITE_CONTENT_SCRIPT_DEFINITIONS
      .map((definition) => ({
        ...definition,
        matches: enhancedPatterns
      }))
      .filter((definition) => Array.isArray(definition.matches) && definition.matches.length > 0);
    const definitions = [...basicDefinitions, ...enhancedDefinitions].map((definition) => ({
      ...definition,
      excludeMatches: Array.isArray(definition.excludeMatches) && definition.excludeMatches.length
        ? definition.excludeMatches
        : undefined
    }));

    try {
      await chrome.scripting.registerContentScripts(definitions);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('duplicate script id')) {
        throw error;
      }

      await unregisterContentScriptsNow();
      await chrome.scripting.registerContentScripts(definitions);
    }
    console.log(`✓ 內容腳本已註冊 (全站基礎保護 + ${getBuiltinEnhancedDomains().length} 內建增強站點 + ${normalizeDomainList(customSites).length} 自訂增強站點)`);
  } catch (error) {
    console.error('✗ 內容腳本註冊失敗:', error);
  }
}

async function unregisterContentScripts() {
  return enqueueContentScriptSync(() => unregisterContentScriptsNow());
}

async function registerContentScripts() {
  return enqueueContentScriptSync(() => registerContentScriptsNow());
}

async function syncContentScripts(enabled) {
  return enqueueContentScriptSync(async () => {
    if (enabled) {
      await registerContentScriptsNow();
      return;
    }

    await unregisterContentScriptsNow();
    console.log('⏸ 內容腳本已停用');
  });
}

function notifyAllTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id && tab.url && isManagedPageUrl(tab.url)) {
        sendMessageToTab(tab.id, message).catch(() => {});
      }
    });
  });
}

async function dispatchElementPickerEvent(tabId, eventName) {
  const resolvedTabId = Number(tabId || 0);
  if (!Number.isFinite(resolvedTabId) || resolvedTabId <= 0) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId: resolvedTabId, allFrames: true },
    func: (name) => {
      window.dispatchEvent(new CustomEvent(name));
    },
    args: [eventName]
  });
}

async function sendMessageToTab(tabId, message) {
  if (message?.action === 'activateElementPicker') {
    await dispatchElementPickerEvent(tabId, '__shield_pro_activate_picker__');
    return;
  }

  if (message?.action === 'deactivateElementPicker') {
    await dispatchElementPickerEvent(tabId, '__shield_pro_deactivate_picker__');
    return;
  }

  await chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

function refreshCosmeticRulesForAllTabs() {
  notifyAllTabs({ action: 'refreshCosmeticRules' });
}

async function applyExtensionState(enabled, source = 'unknown') {
  const targetEnabled = enabled === true;
  const stateChanged = runtimeExtensionEnabled !== targetEnabled;

  if (stateChanged) {
    await updateRulesets(targetEnabled);
    await syncContentScripts(targetEnabled);
    runtimeExtensionEnabled = targetEnabled;
  }

  await updateL3DynamicBlockingRules(blockingLevel, targetEnabled);

  if (!targetEnabled) {
    notifyAllTabs({ action: 'disableBlocking' });
    notifyAllTabs({ action: 'deactivateElementPicker' });
    notifyAllTabs({ action: 'disableAiMonitor' });
  } else if (aiState.enabled) {
    notifyAllPoliciesToAllTabs();
  }

  if (targetEnabled) {
    notifyAllTabs({
      action: 'applyBlockingLevel',
      level: blockingLevel,
      source
    });
  }

  console.log(targetEnabled ? `🟢 ${APP_BRAND} 已啟用 (L${blockingLevel})` : `⚪ ${APP_BRAND} 已停用`);
}

async function isWhitelisted(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const result = await chrome.storage.local.get(['whitelist']);
    const whitelist = result.whitelist || [];

    return whitelist.some((domain) => {
      const normalized = String(domain).toLowerCase();
      return hostname === normalized || hostname.endsWith('.' + normalized);
    });
  } catch {
    return false;
  }
}

function getHostname(value) {
  try {
    if (!value) return '';
    if (value.includes('://')) {
      return new URL(value).hostname.toLowerCase();
    }
    return String(value).toLowerCase();
  } catch {
    return '';
  }
}

function isManagedPageUrl(url) {
  try {
    const value = new URL(String(url || ''));
    return (
      value.protocol === 'http:' ||
      value.protocol === 'https:' ||
      value.protocol === 'file:' ||
      value.protocol === 'ftp:' ||
      value.protocol === 'ws:' ||
      value.protocol === 'wss:'
    );
  } catch {
    return false;
  }
}

function getNow() {
  return Date.now();
}

async function configureProviderSecretStorage() {
  if (!chrome.storage.session?.setAccessLevel) return;

  try {
    await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch (_) {
    // Best effort only. Older runtimes may not support access level changes.
  }
}

async function loadProviderSecretFromSession() {
  if (!chrome.storage.session) return '';
  const result = await chrome.storage.session.get([AI_PROVIDER_SECRET_STORAGE_KEY]);
  return String(result[AI_PROVIDER_SECRET_STORAGE_KEY] || '').trim();
}

async function persistProviderSecretToSession(secret) {
  if (!chrome.storage.session) return;

  const normalized = String(secret || '').trim();
  if (!normalized) {
    await chrome.storage.session.remove([AI_PROVIDER_SECRET_STORAGE_KEY]);
    return;
  }

  await chrome.storage.session.set({ [AI_PROVIDER_SECRET_STORAGE_KEY]: normalized });
}

function createRequestTimeout(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort(new Error('request_timeout'));
    } catch (_) {
      controller.abort();
    }
  }, Math.max(1, Number(timeoutMs || 1)));

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
    }
  };
}

function getProviderDefaults(provider = 'lmstudio') {
  if (provider === 'openai') {
    return {
      provider: 'openai',
      endpoint: OPENAI_DEFAULT_ENDPOINT,
      model: OPENAI_DEFAULT_MODEL,
      apiKey: '',
      timeoutMs: OPENAI_DEFAULT_TIMEOUT_MS
    };
  }

  if (provider === 'gemini') {
    return {
      provider: 'gemini',
      endpoint: GEMINI_DEFAULT_ENDPOINT,
      model: GEMINI_DEFAULT_MODEL,
      apiKey: '',
      timeoutMs: GEMINI_DEFAULT_TIMEOUT_MS
    };
  }

  if (provider === 'gateway') {
    return {
      provider: 'gateway',
      endpoint: GATEWAY_DEFAULT_ENDPOINT,
      model: GATEWAY_DEFAULT_MODEL,
      apiKey: '',
      timeoutMs: GATEWAY_DEFAULT_TIMEOUT_MS
    };
  }

  return {
    provider: 'lmstudio',
    endpoint: LM_STUDIO_DEFAULT_ENDPOINT,
    model: LM_STUDIO_DEFAULT_MODEL,
    apiKey: 'lm-studio',
    timeoutMs: LM_STUDIO_DEFAULT_TIMEOUT_MS
  };
}

function buildDefaultAiProviderSettings() {
  const defaults = getProviderDefaults('openai');
  return {
    version: AI_PROVIDER_VERSION,
    provider: defaults.provider,
    enabled: false,
    mode: 'hybrid',
    endpoint: defaults.endpoint,
    model: defaults.model,
    apiKey: defaults.apiKey,
    timeoutMs: defaults.timeoutMs,
    cooldownMs: LM_STUDIO_DEFAULT_COOLDOWN_MS,
    minRiskScore: LM_STUDIO_DEFAULT_MIN_RISK_SCORE,
    maxRecentEvents: LM_STUDIO_DEFAULT_MAX_RECENT_EVENTS,
    enableDynamicRuleCandidates: true
  };
}

function buildDefaultAiProviderState() {
  return {
    lastHealthCheckAt: 0,
    lastHealthOk: false,
    lastLatencyMs: 0,
    lastError: '',
    lastModelCount: 0,
    lastResolvedModel: '',
    lastProvider: '',
    lastService: '',
    lastRulePreviewAt: 0,
    perHostLastRun: {}
  };
}

function normalizeAiProviderSecrets(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return AI_PROVIDER_TYPES.reduce((acc, provider) => {
    if (provider === 'lmstudio') {
      acc[provider] = '';
      return acc;
    }
    acc[provider] = String(source[provider] || '').trim();
    return acc;
  }, {});
}

function getAiProviderSecretKeyState(secrets = {}) {
  const normalized = normalizeAiProviderSecrets(secrets);
  return AI_PROVIDER_TYPES.reduce((acc, provider) => {
    acc[provider] = provider === 'lmstudio'
      ? false
      : Boolean(normalized[provider]);
    return acc;
  }, {});
}

function normalizeAiProviderSettings(input = {}) {
  const defaults = buildDefaultAiProviderSettings();
  const provider = AI_PROVIDER_TYPES.includes(String(input.provider || defaults.provider).trim().toLowerCase())
    ? String(input.provider || defaults.provider).trim().toLowerCase()
    : defaults.provider;
  const providerDefaults = getProviderDefaults(provider);
  const endpoint = String(input.endpoint ?? providerDefaults.endpoint).trim();
  const model = String(input.model ?? providerDefaults.model).trim();
  const apiKey = String(input.apiKey ?? providerDefaults.apiKey).trim();

  return {
    version: AI_PROVIDER_VERSION,
    provider,
    enabled: input.enabled === true,
    mode: ['off', 'advisory', 'hybrid'].includes(String(input.mode || '').toLowerCase())
      ? String(input.mode).toLowerCase()
      : defaults.mode,
    endpoint: endpoint || providerDefaults.endpoint,
    model,
    apiKey: apiKey || providerDefaults.apiKey,
    timeoutMs: clamp(Number(input.timeoutMs || providerDefaults.timeoutMs), 1000, 60000),
    cooldownMs: clamp(Number(input.cooldownMs || defaults.cooldownMs), 2000, 5 * 60 * 1000),
    minRiskScore: clamp(Number(input.minRiskScore || defaults.minRiskScore), 0, 50),
    maxRecentEvents: clamp(Number(input.maxRecentEvents || defaults.maxRecentEvents), 2, 20),
    enableDynamicRuleCandidates:
      input.enableDynamicRuleCandidates !== false && defaults.enableDynamicRuleCandidates === true
  };
}

function getPersistableAiProviderSettings(input = {}) {
  const settings = normalizeAiProviderSettings(input);

  if (settings.provider === 'lmstudio') {
    return settings;
  }

  return normalizeAiProviderSettings({
    ...settings,
    apiKey: ''
  });
}

function resolveAiProviderSettings(input = {}, secret = '') {
  const settings = normalizeAiProviderSettings(input);
  const secretMap = typeof secret === 'string'
    ? { [settings.provider]: String(secret || '').trim() }
    : normalizeAiProviderSecrets(secret || {});
  if (settings.provider === 'lmstudio') {
    return settings;
  }

  return normalizeAiProviderSettings({
    ...settings,
    apiKey: String(secretMap[settings.provider] || '').trim()
  });
}

function redactAiProviderSettings(input = {}, secret = '') {
  const settings = resolveAiProviderSettings(input, secret);
  const hasApiKey = Boolean(settings.apiKey && settings.apiKey !== 'lm-studio');

  return {
    ...settings,
    apiKey: '',
    hasApiKey
  };
}

function normalizeAiProviderState(input = {}) {
  const defaults = buildDefaultAiProviderState();
  return {
    ...defaults,
    ...input,
    perHostLastRun:
      input.perHostLastRun && typeof input.perHostLastRun === 'object' ? input.perHostLastRun : {}
  };
}

function normalizeGeneratedRuleCandidates(input = {}) {
  if (!input || typeof input !== 'object') return {};
  const output = {};
  Object.entries(input).forEach(([hostname, value]) => {
    const normalizedHost = getHostname(hostname);
    if (!normalizedHost || !value || typeof value !== 'object') return;
    output[normalizedHost] = {
      hostname: normalizedHost,
      provider: String(value.provider || 'lmstudio'),
      model: String(value.model || ''),
      summary: String(value.summary || ''),
      generatedAt: Number(value.generatedAt || 0),
      selectorRules: Array.isArray(value.selectorRules)
        ? value.selectorRules
            .map((item) => ({
              selector: String(item?.selector || '').trim(),
              reason: String(item?.reason || '').trim()
            }))
            .filter((item) => item.selector)
            .slice(0, 24)
        : [],
      domainRules: Array.isArray(value.domainRules)
        ? value.domainRules
            .map((item) => ({
              pattern: String(item?.pattern || '').trim(),
              reason: String(item?.reason || '').trim()
            }))
            .filter((item) => item.pattern)
            .slice(0, 24)
        : []
    };
  });
  return output;
}

function normalizeAdListEntry(input = {}, index = 0) {
  if (!input || typeof input !== 'object') return null;
  const kind = ['domain', 'selector', 'pattern', 'token', 'iframe_host', 'click_signature'].includes(String(input.kind || '').trim())
    ? String(input.kind || '').trim()
    : '';
  const category = String(input.category || '').trim() || 'unknown';
  const value = typeof input.value === 'string'
    ? String(input.value || '').trim()
    : input.value && typeof input.value === 'object'
    ? input.value
    : '';
  if (!kind || (!value || (typeof value === 'string' && !value.trim()))) {
    return null;
  }

  return {
    id: String(input.id || `seed-${kind}-${index}`),
    kind,
    value,
    category,
    confidence: clamp(Number(input.confidence || 0.5), 0, 1),
    source: String(input.source || 'manual_seed'),
    action: String(input.action || 'observe_only')
  };
}

function normalizeKnowledgePattern(input = {}) {
  if (!input || typeof input !== 'object') return null;
  const kind = String(input.kind || '').trim();
  const value = String(input.value || '').trim();
  if (!kind || !value) return null;
  return {
    id: String(input.id || `pat_${Math.random().toString(36).slice(2, 10)}`),
    kind,
    value,
    category: String(input.category || 'unknown'),
    confidence: clamp(Number(input.confidence || 0.5), 0, 1),
    source: String(input.source || 'runtime_learning'),
    hostnames: Array.isArray(input.hostnames)
      ? normalizeDomainList(input.hostnames)
      : [],
    hitCount: Math.max(1, Number(input.hitCount || 1)),
    userVerified: input.userVerified === true,
    createdAt: Number(input.createdAt || getNow()),
    updatedAt: Number(input.updatedAt || input.createdAt || getNow())
  };
}

function normalizeKnowledgeObservation(input = {}) {
  if (!input || typeof input !== 'object') return null;
  const hostname = getHostname(input.hostname);
  const selector = String(input.selector || '').trim();
  if (!hostname || !selector) return null;
  return {
    id: String(input.id || `obs_${Math.random().toString(36).slice(2, 10)}`),
    hostname,
    pageUrl: String(input.pageUrl || ''),
    selector,
    tagName: String(input.tagName || ''),
    text: String(input.text || '').slice(0, 280),
    href: String(input.href || ''),
    src: String(input.src || ''),
    category: String(input.category || 'suspicious'),
    confidence: clamp(Number(input.confidence || 0.5), 0, 1),
    source: String(input.source || 'runtime_learning'),
    reason: String(input.reason || ''),
    createdAt: Number(input.createdAt || getNow())
  };
}

function normalizeKnowledgeCandidate(input = {}) {
  if (!input || typeof input !== 'object') return null;
  const hostname = getHostname(input.hostname);
  const selector = String(input.selector || '').trim();
  if (!hostname || !selector) return null;
  return {
    id: String(input.id || `cand_${Math.random().toString(36).slice(2, 10)}`),
    hostname,
    selector,
    category: String(input.category || 'suspicious'),
    confidence: clamp(Number(input.confidence || 0.5), 0, 1),
    source: String(input.source || 'runtime_learning'),
    observations: Math.max(1, Number(input.observations || 1)),
    requiredObservations: Math.max(1, Number(input.requiredObservations || AUTO_LEARNING_PROMOTION_THRESHOLD)),
    lastSeenAt: Number(input.lastSeenAt || getNow()),
    promoted: input.promoted === true
  };
}

function normalizeTeachSession(input = {}) {
  if (!input || typeof input !== 'object') return null;
  const hostname = getHostname(input.hostname);
  if (!hostname) return null;
  return {
    id: String(input.id || `teach_${Math.random().toString(36).slice(2, 10)}`),
    hostname,
    selector: String(input.selector || '').trim(),
    aiCategory: String(input.aiCategory || 'suspicious'),
    userCategory: String(input.userCategory || input.aiCategory || 'suspicious'),
    aiConfidence: clamp(Number(input.aiConfidence || 0.5), 0, 1),
    verified: input.verified !== false,
    createdAt: Number(input.createdAt || getNow())
  };
}

function buildDefaultAiKnowledgeStore() {
  return {
    version: AI_KNOWLEDGE_VERSION,
    adListVersion: '',
    lastSeededAt: 0,
    lastUpdatedAt: 0,
    seeds: [],
    confirmedPatterns: [],
    candidates: [],
    observations: [],
    teachSessions: [],
    stats: {
      seedCount: 0,
      confirmedCount: 0,
      candidateCount: 0,
      observationCount: 0,
      teachSessionCount: 0,
      promotedCandidateCount: 0,
      userVerifiedCount: 0
    }
  };
}

function recalculateAiKnowledgeStats(store) {
  return {
    ...store,
    stats: {
      seedCount: store.seeds.length,
      confirmedCount: store.confirmedPatterns.length,
      candidateCount: store.candidates.length,
      observationCount: store.observations.length,
      teachSessionCount: store.teachSessions.length,
      promotedCandidateCount: store.candidates.filter((item) => item.promoted === true).length,
      userVerifiedCount: store.confirmedPatterns.filter((item) => item.userVerified === true).length
    },
    lastUpdatedAt: getNow()
  };
}

function normalizeAiKnowledgeStore(input = {}) {
  const defaults = buildDefaultAiKnowledgeStore();
  const store = {
    ...defaults,
    ...input,
    seeds: Array.isArray(input.seeds)
      ? input.seeds.map((item, index) => normalizeAdListEntry(item, index)).filter(Boolean)
      : [],
    confirmedPatterns: Array.isArray(input.confirmedPatterns)
      ? input.confirmedPatterns.map(normalizeKnowledgePattern).filter(Boolean).slice(0, AI_KNOWLEDGE_MAX_CANDIDATES)
      : [],
    candidates: Array.isArray(input.candidates)
      ? input.candidates.map(normalizeKnowledgeCandidate).filter(Boolean).slice(0, AI_KNOWLEDGE_MAX_CANDIDATES)
      : [],
    observations: Array.isArray(input.observations)
      ? input.observations.map(normalizeKnowledgeObservation).filter(Boolean).slice(-AI_KNOWLEDGE_MAX_OBSERVATIONS)
      : [],
    teachSessions: Array.isArray(input.teachSessions)
      ? input.teachSessions.map(normalizeTeachSession).filter(Boolean).slice(-AI_KNOWLEDGE_MAX_TEACH_SESSIONS)
      : []
  };
  return recalculateAiKnowledgeStats(store);
}

function upsertKnowledgeCandidate(store, candidate) {
  const normalized = normalizeKnowledgeCandidate(candidate);
  if (!normalized) return store;
  const next = normalizeAiKnowledgeStore(store || {});
  const existingIndex = next.candidates.findIndex((item) =>
    item.hostname === normalized.hostname &&
    item.selector === normalized.selector &&
    item.category === normalized.category
  );

  if (existingIndex >= 0) {
    const current = next.candidates[existingIndex];
    next.candidates[existingIndex] = {
      ...current,
      confidence: Math.max(current.confidence, normalized.confidence),
      observations: current.observations + 1,
      lastSeenAt: getNow()
    };
  } else {
    next.candidates.unshift(normalized);
  }

  if (next.candidates.length > AI_KNOWLEDGE_MAX_CANDIDATES) {
    next.candidates.length = AI_KNOWLEDGE_MAX_CANDIDATES;
  }
  return recalculateAiKnowledgeStats(next);
}

function promoteKnowledgeCandidate(store, candidate) {
  const normalized = normalizeKnowledgeCandidate(candidate);
  if (!normalized) return store;
  const next = normalizeAiKnowledgeStore(store || {});
  next.candidates = next.candidates.map((item) =>
    item.hostname === normalized.hostname &&
    item.selector === normalized.selector &&
    item.category === normalized.category
      ? { ...item, promoted: true, observations: Math.max(item.observations, normalized.observations) }
      : item
  );
  const confirmed = normalizeKnowledgePattern({
    id: `learned_${normalized.hostname}_${normalized.selector}`.replace(/[^a-z0-9_:-]+/gi, '_'),
    kind: 'selector',
    value: normalized.selector,
    category: normalized.category,
    confidence: normalized.confidence,
    source: normalized.source,
    hostnames: [normalized.hostname],
    hitCount: normalized.observations,
    userVerified: normalized.source === 'teaching_mode',
    createdAt: getNow(),
    updatedAt: getNow()
  });
  const exists = next.confirmedPatterns.some((item) => item.kind === confirmed.kind && item.value === confirmed.value && item.category === confirmed.category);
  if (!exists) {
    next.confirmedPatterns.unshift(confirmed);
  }
  return recalculateAiKnowledgeStats(next);
}

function seedAiKnowledgeStore() {
  const next = normalizeAiKnowledgeStore(aiState.knowledgeStore || {});
  const seedVersion = String(getNow());
  const normalizedSeeds = adListEntries.map((entry, index) => normalizeAdListEntry(entry, index)).filter(Boolean);
  const seedSignature = JSON.stringify(normalizedSeeds);
  if (JSON.stringify(next.seeds) === seedSignature) {
    aiState.knowledgeStore = next;
    return;
  }
  aiState.knowledgeStore = recalculateAiKnowledgeStats({
    ...next,
    seeds: normalizedSeeds,
    adListVersion: seedVersion,
    lastSeededAt: getNow()
  });
}

function resolveLmStudioBaseUrl(endpoint) {
  const fallback = new URL(LM_STUDIO_DEFAULT_ENDPOINT);
  try {
    const url = new URL(endpoint || fallback.toString());
    let path = url.pathname.replace(/\/+$/, '');

    if (path.endsWith('/chat/completions')) {
      path = path.slice(0, -'/chat/completions'.length);
    } else if (path.endsWith('/responses')) {
      path = path.slice(0, -'/responses'.length);
    } else if (path.endsWith('/models')) {
      path = path.slice(0, -'/models'.length);
    }

    if (!path) {
      path = '/v1';
    } else if (!path.endsWith('/v1')) {
      path += '/v1';
    }

    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch (_) {
    return `${fallback.origin}/v1`;
  }
}

function resolveGatewayBaseUrl(endpoint) {
  const value = String(endpoint || '').trim();
  if (!value) return '';

  try {
    const url = new URL(value);
    let path = url.pathname.replace(/\/+$/, '');

    if (path.endsWith('/policy/recommend')) {
      path = path.slice(0, -'/policy/recommend'.length);
    } else if (path.endsWith('/policy/validate')) {
      path = path.slice(0, -'/policy/validate'.length);
    } else if (path.endsWith('/health')) {
      path = path.slice(0, -'/health'.length);
    }

    if (!path) {
      path = '/v1';
    } else if (!path.endsWith('/v1')) {
      path += '/v1';
    }

    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

function resolveOpenAiBaseUrl(endpoint) {
  const fallback = new URL(OPENAI_DEFAULT_ENDPOINT);
  try {
    const url = new URL(endpoint || fallback.toString());
    let path = url.pathname.replace(/\/+$/, '');

    if (path.endsWith('/responses')) {
      path = path.slice(0, -'/responses'.length);
    } else if (path.endsWith('/models')) {
      path = path.slice(0, -'/models'.length);
    }

    if (!path) {
      path = '/v1';
    } else if (!path.endsWith('/v1')) {
      path += '/v1';
    }

    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch (_) {
    return `${fallback.origin}/v1`;
  }
}

function resolveGeminiModelRequest(endpoint, model = GEMINI_DEFAULT_MODEL) {
  const fallback = new URL(GEMINI_DEFAULT_ENDPOINT);
  const normalizedModel = String(model || GEMINI_DEFAULT_MODEL).trim() || GEMINI_DEFAULT_MODEL;

  try {
    const url = new URL(endpoint || fallback.toString());
    let path = url.pathname.replace(/\/+$/, '');
    const suffixes = [
      ':generateContent',
      ':streamGenerateContent',
      ':countTokens'
    ];

    for (const suffix of suffixes) {
      if (path.endsWith(suffix)) {
        path = path.slice(0, -suffix.length);
        break;
      }
    }

    if (!/\/models\/[^/]+$/i.test(path)) {
      path = `/v1beta/models/${normalizedModel}`;
    }

    url.pathname = path;
    url.search = '';
    url.hash = '';
    return {
      modelPath: url.toString().replace(/\/$/, ''),
      generateContentUrl: `${url.toString().replace(/\/$/, '')}:generateContent`
    };
  } catch (_) {
    return {
      modelPath: `https://generativelanguage.googleapis.com/v1beta/models/${normalizedModel}`,
      generateContentUrl: `https://generativelanguage.googleapis.com/v1beta/models/${normalizedModel}:generateContent`
    };
  }
}

function sanitizeStringList(values, limit = 12) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .slice(0, limit)
    )
  );
}

function normalizeRecommendedActionTokens(values, advisory = {}) {
  const tokens = new Set();
  const items = Array.isArray(values) ? values : [];
  const exactTokens = new Set([
    'tighten_popup_guard',
    'tune_overlay_scan',
    'guard_external_navigation',
    'apply_extra_blocked_domains'
  ]);

  items.forEach((value) => {
    const source = String(value || '').trim().toLowerCase();
    if (!source) return;

    if (exactTokens.has(source)) {
      tokens.add(source);
      return;
    }

    if (
      source.includes('tighten popup guard') ||
      source.includes('popup guard mode') ||
      source.includes('popup strict mode')
    ) {
      tokens.add('tighten_popup_guard');
    }
    if (
      source.includes('tune overlay scan') ||
      source.includes('increase overlay scan') ||
      source.includes('overlay scan duration') ||
      source.includes('overlay scan window')
    ) {
      tokens.add('tune_overlay_scan');
    }
    if (
      source.includes('guard external navigation') ||
      source.includes('external navigation guard') ||
      source.includes('navigation guard mode')
    ) {
      tokens.add('guard_external_navigation');
    }
    if (
      source.includes('apply extra blocked domains') ||
      source.includes('expand blocked domains') ||
      source.includes('extra blocked domains')
    ) {
      tokens.add('apply_extra_blocked_domains');
    }
  });

  if (advisory.popupStrictMode === true) {
    tokens.add('tighten_popup_guard');
  }
  if (advisory.guardExternalNavigation === true) {
    tokens.add('guard_external_navigation');
  }
  if (Number.isFinite(Number(advisory.overlayScanMs)) && Number(advisory.overlayScanMs) > 0) {
    tokens.add('tune_overlay_scan');
  }
  if (Array.isArray(advisory.extraBlockedDomains) && advisory.extraBlockedDomains.length > 0) {
    tokens.add('apply_extra_blocked_domains');
  }

  return Array.from(tokens).slice(0, 4);
}

function getRecentTelemetryForHost(hostname, limit = LM_STUDIO_DEFAULT_MAX_RECENT_EVENTS) {
  const normalized = getHostname(hostname);
  if (!normalized) return [];

  return aiState.telemetryLog
    .filter((entry) => entry?.hostname === normalized)
    .slice(-Math.max(1, limit))
    .map((entry) => ({
      type: String(entry?.event?.type || ''),
      severity: Number(entry?.event?.severity || 0),
      confidence: Number(entry?.event?.confidence || 0),
      source: String(entry?.event?.source || ''),
      detail: entry?.event?.detail || {},
      ingestedAt: Number(entry?.ingestedAt || 0)
    }));
}

function normalizeBlockingLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return BLOCKING_LEVEL_DEFAULT;
  const rounded = Math.round(numeric);
  return Math.max(BLOCKING_LEVEL_MIN, Math.min(BLOCKING_LEVEL_MAX, rounded));
}

function normalizeActiveBlockingLevel(value) {
  const level = normalizeBlockingLevel(value);
  return level <= 0 ? BLOCKING_LEVEL_DEFAULT : level;
}

function resolveEnabledByBlockingLevel(level) {
  return normalizeBlockingLevel(level) > 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createEmptyProfile(hostname) {
  return {
    hostname,
    riskScore: 0,
    lastUpdatedAt: getNow(),
    events: {},
    recentSignals: []
  };
}

function createEmptyHostMetrics(hostname) {
  return {
    hostname,
    policy_apply_latency: {
      count: 0,
      totalMs: 0,
      avgMs: 0,
      maxMs: 0,
      lastMs: 0,
      lastAt: 0
    },
    policy_conflict_count: 0,
    lastConflictAt: 0
  };
}

function getOrCreateHostMetrics(hostname) {
  const normalized = getHostname(hostname) || 'unknown-host';
  if (!aiState.hostMetrics[normalized]) {
    aiState.hostMetrics[normalized] = createEmptyHostMetrics(normalized);
  }
  return aiState.hostMetrics[normalized];
}

function recordPolicyApplyLatency(hostname, latencyMs, appliedAt) {
  const latency = Number(latencyMs);
  if (!Number.isFinite(latency) || latency < 0) return;

  const metrics = getOrCreateHostMetrics(hostname);
  const bucket = metrics.policy_apply_latency;
  bucket.count += 1;
  bucket.totalMs = Number((bucket.totalMs + latency).toFixed(3));
  bucket.avgMs = Number((bucket.totalMs / bucket.count).toFixed(3));
  bucket.maxMs = Math.max(bucket.maxMs, latency);
  bucket.lastMs = Number(latency.toFixed(3));
  bucket.lastAt = Number(appliedAt || getNow());
}

function recordPolicyConflict(hostname) {
  const metrics = getOrCreateHostMetrics(hostname);
  metrics.policy_conflict_count += 1;
  metrics.lastConflictAt = getNow();
}

function getHostFallbackState(hostname, nowTs = getNow()) {
  const normalized = getHostname(hostname);
  if (!normalized) {
    return {
      hostname: 'unknown-host',
      active: false,
      activeUntil: 0,
      cooldownUntil: 0,
      reason: '',
      source: ''
    };
  }

  const state = aiState.hostFallbacks[normalized];
  if (!state) {
    return {
      hostname: normalized,
      active: false,
      activeUntil: 0,
      cooldownUntil: 0,
      reason: '',
      source: ''
    };
  }

  const activeUntil = Number(state.activeUntil || 0);
  const cooldownUntil = Number(state.cooldownUntil || 0);
  const active = nowTs < activeUntil;

  if (!active && nowTs >= cooldownUntil) {
    delete aiState.hostFallbacks[normalized];
    scheduleAiPersist();
    return {
      hostname: normalized,
      active: false,
      activeUntil: 0,
      cooldownUntil: 0,
      reason: '',
      source: ''
    };
  }

  return {
    ...state,
    hostname: normalized,
    active,
    activeUntil,
    cooldownUntil
  };
}

function activateHostFallback(hostname, options = {}) {
  const normalized = getHostname(hostname);
  if (!normalized) {
    return { activated: false, reason: 'invalid_hostname' };
  }

  const nowTs = getNow();
  const durationMs = Math.max(1000, Number(options.durationMs || AI_HOST_FALLBACK_DURATION_MS));
  const cooldownMs = Math.max(1000, Number(options.cooldownMs || AI_HOST_FALLBACK_COOLDOWN_MS));
  const prevState = getHostFallbackState(normalized, nowTs);

  if (!options.force && prevState.cooldownUntil > nowTs) {
    return {
      activated: false,
      hostname: normalized,
      reason: 'cooldown',
      cooldownRemainingMs: Math.max(0, prevState.cooldownUntil - nowTs),
      state: prevState
    };
  }

  const nextState = {
    hostname: normalized,
    activeUntil: nowTs + durationMs,
    cooldownUntil: nowTs + cooldownMs,
    reason: String(options.reason || 'manual_override'),
    source: String(options.source || 'host_fallback_manual'),
    triggeredAt: nowTs,
    active: true
  };

  aiState.hostFallbacks[normalized] = nextState;
  scheduleAiPersist();

  return {
    activated: true,
    hostname: normalized,
    state: nextState
  };
}

function normalizeAiEvent(input) {
  if (!input || typeof input !== 'object') return null;

  const type = String(input.type || '').trim();
  if (!type) return null;

  const severity = clamp(Number(input.severity || 1), 0.1, 3);
  const confidence = clamp(Number(input.confidence || 0.7), 0.1, 1);

  return {
    type,
    source: String(input.source || 'unknown'),
    severity,
    confidence,
    detail: input.detail || {},
    ts: Number(input.ts || getNow())
  };
}

function applyRiskDecay(profile, nowTs) {
  const deltaMs = Math.max(0, nowTs - Number(profile.lastUpdatedAt || nowTs));
  const deltaMinutes = deltaMs / 60000;
  const decayFactor = Math.pow(AI_DECAY_PER_MINUTE, deltaMinutes);
  profile.riskScore = clamp(profile.riskScore * decayFactor, 0, 200);
  profile.lastUpdatedAt = nowTs;
}

function pushRecentSignal(profile, eventType, delta, ts) {
  if (!Array.isArray(profile.recentSignals)) {
    profile.recentSignals = [];
  }
  profile.recentSignals.push({ type: eventType, delta, ts });
  if (profile.recentSignals.length > 40) {
    profile.recentSignals.splice(0, profile.recentSignals.length - 40);
  }
}

function updateRiskProfile(profile, event) {
  const nowTs = Number(event.ts || getNow());
  applyRiskDecay(profile, nowTs);

  const weight = AI_EVENT_WEIGHTS[event.type] || 1;
  const delta = weight * event.severity * event.confidence;
  profile.riskScore = clamp(profile.riskScore + delta, 0, 200);

  profile.events[event.type] = (profile.events[event.type] || 0) + 1;
  pushRecentSignal(profile, event.type, delta, nowTs);
}

function resolveRiskTier(riskScore) {
  if (riskScore >= 30) return 'critical';
  if (riskScore >= 18) return 'high';
  if (riskScore >= 8) return 'medium';
  return 'low';
}

function isTrustedExtensionPageSender(sender) {
  const senderId = String(sender?.id || '');
  const extensionOrigin = chrome.runtime.getURL('');
  const senderUrls = [sender?.url, sender?.origin, sender?.documentUrl, sender?.tab?.url]
    .map((value) => String(value || ''))
    .filter(Boolean);

  return senderId === chrome.runtime.id && senderUrls.some((value) => value.startsWith(extensionOrigin));
}

function buildPolicyEvidence(profile, fallbackState = null) {
  const events = profile?.events && typeof profile.events === 'object' ? profile.events : {};
  const recentSignals = Array.isArray(profile?.recentSignals) ? profile.recentSignals : [];
  const topSignals = Object.entries(events)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => ({
      type: String(type || ''),
      count: Number(count || 0)
    }));

  const recentSignalSummary = recentSignals
    .slice(-3)
    .reverse()
    .map((signal) => ({
      type: String(signal?.type || ''),
      delta: Number(Number(signal?.delta || 0).toFixed(2)),
      ts: Number(signal?.ts || 0)
    }));

  return {
    topSignals,
    recentSignals: recentSignalSummary,
    fallbackReason: String(fallbackState?.reason || ''),
    fallbackSource: String(fallbackState?.source || '')
  };
}

function buildLmStudioMessages(hostname, context, policy, recentEvents) {
  return [
    {
      role: 'system',
      content:
        'You are the local browser ad-obstruction classifier for Falcon-Player-Enhance. Return JSON only. Focus on player overlays, fake video traps, redirect blockers, and safe reversible mitigations.'
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'classify_player_ad_obstruction',
        hostname,
        url: String(context?.url || ''),
        heuristicPolicy: {
          riskTier: String(policy?.riskTier || 'low'),
          riskScore: Number(policy?.riskScore || 0),
          popupStrictMode: Boolean(policy?.popupStrictMode),
          guardExternalNavigation: Boolean(policy?.guardExternalNavigation),
          overlayScanMs: Number(policy?.overlayScanMs || 3000),
          sensitivityBoost: Number(policy?.sensitivityBoost || 0)
        },
        recentEvents,
        instructions: {
          outputSchema: {
            summary: 'short string',
            confidence: '0.1-1.0',
            riskScoreDelta: 'number between -6 and 12',
            popupStrictMode: 'boolean',
            guardExternalNavigation: 'boolean',
            overlayScanMs: 'integer 600-5000 or null',
            sensitivityBoost: 'integer 0-3',
            extraBlockedDomains: ['domain keyword strings'],
            candidateSelectors: ['CSS selectors'],
            candidateDomains: ['hostnames or keywords'],
            recommendedActions: ['tune_overlay_scan', 'tighten_popup_guard', 'guard_external_navigation', 'apply_extra_blocked_domains']
          },
          constraints: [
            'Do not generate arbitrary executable code',
            'Prefer reversible mitigations',
            'Return compact JSON without markdown'
          ]
        }
      })
    }
  ];
}

function buildOpenAiInstructions() {
  return [
    'You are the policy compiler for Falcon-Player-Enhance.',
    'Return JSON only.',
    'Do not include markdown or prose outside the JSON object.',
    'Output either a full policy object or an object with a top-level "policy" field.',
    'The policy must contain schemaVersion, policyVersion, decisionId, source, generatedAt, ttlMs, scope, risk, and actions.',
    'Use schemaVersion "1.0.0" and source "ai_model".',
    'risk.tier must be one of low, medium, high, critical.',
    'risk.reasonCodes must be a non-empty array of short snake_case strings.',
    'actions.popupStrictMode and actions.guardExternalNavigation must be booleans.',
    'actions.overlayScanMs must be an integer from 600 to 5000.',
    'actions.sensitivityBoost must be an integer from 0 to 4.',
    'actions.forceSandbox must be a boolean.',
    'actions.extraBlockedDomains must be an array of plain domain fragments.',
    'Prefer reversible mitigations and avoid over-blocking.',
    'If you output recommendedActions, use tokens only from this exact enum: tighten_popup_guard, tune_overlay_scan, guard_external_navigation, apply_extra_blocked_domains.',
    'Never output natural-language sentences inside recommendedActions.',
    'Keep candidateSelectors narrow and specific to the player obstruction surface.'
  ].join(' ');
}

function buildOpenAiInput(hostname, context, policy, recentEvents, settings) {
  return JSON.stringify({
    task: 'compile_browser_ad_policy',
    request: buildGatewayPolicyRequest(hostname, context, policy, recentEvents, settings),
    outputSchema: {
      policy: {
        schemaVersion: '1.0.0',
        policyVersion: 'integer',
        decisionId: 'string',
        source: 'ai_model',
        generatedAt: 'unix epoch ms',
        ttlMs: '1000-1800000',
        scope: {
          host: 'hostname',
          frame: 'top|all|same_origin|cross_origin',
          selectorClusters: ['string']
        },
        risk: {
          tier: 'low|medium|high|critical',
          score: '0-200',
          reasonCodes: ['snake_case strings']
        },
        actions: {
          popupStrictMode: 'boolean',
          guardExternalNavigation: 'boolean',
          overlayScanMs: 'integer 600-5000',
          sensitivityBoost: 'integer 0-4',
          forceSandbox: 'boolean',
          extraBlockedDomains: ['domain fragments']
        },
        recommendedActions: [
          'tighten_popup_guard',
          'tune_overlay_scan',
          'guard_external_navigation',
          'apply_extra_blocked_domains'
        ],
        candidateSelectors: ['specific CSS selectors only']
      },
      constraints: [
        'recommendedActions must be enum tokens only, not sentences',
        'candidateSelectors should usually contain 1-8 specific selectors',
        'prefer host-scoped and reversible mitigations'
      ]
    }
  });
}

function buildGeminiSystemInstruction() {
  return {
    parts: [
      {
        text: [
          'You are the policy compiler for Falcon-Player-Enhance.',
          'Return JSON only.',
          'Do not include markdown or prose outside the JSON object.',
          'Output either a full policy object or an object with a top-level "policy" field.',
          'The policy must contain schemaVersion, policyVersion, decisionId, source, generatedAt, ttlMs, scope, risk, and actions.',
          'Use schemaVersion "1.0.0" and source "ai_model".',
          'risk.tier must be one of low, medium, high, critical.',
          'risk.reasonCodes must be a non-empty array of short snake_case strings.',
          'actions.popupStrictMode and actions.guardExternalNavigation must be booleans.',
          'actions.overlayScanMs must be an integer from 600 to 5000.',
          'actions.sensitivityBoost must be an integer from 0 to 4.',
          'actions.forceSandbox must be a boolean.',
          'actions.extraBlockedDomains must be an array of plain domain fragments.',
          'Prefer reversible mitigations and avoid over-blocking.'
        ].join(' ')
      }
    ]
  };
}

function buildGeminiGenerateContentBody(hostname, context, policy, recentEvents, settings) {
  return {
    system_instruction: buildGeminiSystemInstruction(),
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: buildOpenAiInput(hostname, context, policy, recentEvents, settings)
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  };
}

function extractJsonObjectFromText(text) {
  const source = String(text || '').trim();
  if (!source) return null;

  try {
    return JSON.parse(source);
  } catch (_) {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(source.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
  }

  return null;
}

function extractOpenAiOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload?.output)) return '';

  return payload.output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((item) => item?.type === 'output_text')
    .map((item) => String(item?.text || ''))
    .join('\n')
    .trim();
}

function extractGeminiOutputText(payload) {
  const parts = Array.isArray(payload?.candidates?.[0]?.content?.parts)
    ? payload.candidates[0].content.parts
    : [];
  return parts
    .map((item) => String(item?.text || ''))
    .join('\n')
    .trim();
}

function buildTeachFeatureSummary(features = {}) {
  const tokens = [
    String(features.selector || ''),
    String(features.text || ''),
    String(features.href || ''),
    String(features.src || ''),
    String(features.className || ''),
    String(features.id || '')
  ]
    .join(' ')
    .toLowerCase();

  return {
    selector: String(features.selector || '').trim(),
    text: String(features.text || '').trim().slice(0, 280),
    href: String(features.href || '').trim(),
    src: String(features.src || '').trim(),
    className: String(features.className || '').trim(),
    id: String(features.id || '').trim(),
    position: String(features.computedStyle?.position || '').trim(),
    zIndex: String(features.computedStyle?.zIndex || '').trim(),
    width: Number(features.rect?.width || 0),
    height: Number(features.rect?.height || 0),
    tokens
  };
}

function matchKnowledgeSeeds(features = {}) {
  const summary = buildTeachFeatureSummary(features);
  const hrefHost = getHostname(summary.href);
  const srcHost = getHostname(summary.src);
  return (aiState.knowledgeStore?.seeds || []).filter((entry) => {
    if (entry.kind === 'domain') {
      const value = String(entry.value || '').toLowerCase();
      return Boolean(
        (hrefHost && hrefHost.includes(value)) ||
        (srcHost && srcHost.includes(value))
      );
    }
    if (entry.kind === 'token') {
      return summary.tokens.includes(String(entry.value || '').toLowerCase());
    }
    if (entry.kind === 'selector') {
      const selectorToken = String(entry.value || '').toLowerCase().replace(/[[\]()*="':]/g, '');
      return selectorToken && summary.tokens.includes(selectorToken.replace(/\s+/g, ''));
    }
    return false;
  });
}

function classifyElementLocally(hostname, features = {}) {
  const summary = buildTeachFeatureSummary(features);
  const matches = matchKnowledgeSeeds(features);
  const categories = {
    ad: 0.08,
    suspicious: 0.1,
    benign: 0.2,
    tracker: 0.05
  };

  matches.forEach((entry) => {
    if (entry.category === 'ad_network') categories.tracker += 0.45;
    if (entry.category === 'overlay') categories.ad += 0.26;
    if (entry.category === 'redirect_lure' || entry.category === 'external_navigation_lure') categories.suspicious += 0.32;
  });

  if (summary.href && getHostname(summary.href) && getHostname(summary.href) !== getHostname(hostname)) {
    categories.suspicious += 0.24;
  }
  if (summary.src && AI_HIGH_RISK_EXTRA_DOMAINS.some((token) => summary.src.toLowerCase().includes(token))) {
    categories.tracker += 0.4;
  }
  if (/(ad|ads|banner|promo|sponsor|pop|redirect|track)/i.test(summary.tokens)) {
    categories.ad += 0.24;
    categories.suspicious += 0.18;
  }
  if (summary.position === 'fixed' || summary.position === 'sticky') {
    categories.ad += 0.12;
  }
  if (Number(summary.zIndex || 0) >= 1000) {
    categories.ad += 0.12;
  }
  if (summary.width >= 250 && summary.height >= 90) {
    categories.ad += 0.08;
  }
  if (summary.text.length === 0 && !summary.href && !summary.src) {
    categories.benign += 0.08;
  }

  const ordered = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const [category, score] = ordered[0];
  return {
    category,
    confidence: clamp(Number(score.toFixed(2)), 0, 0.95),
    reason: matches.length > 0
      ? `matched ${matches.length} AD LIST seed(s)`
      : category === 'benign'
      ? 'no strong ad signals found'
      : 'heuristic ad-like signals detected',
    matchedSeedIds: matches.map((entry) => entry.id),
    provider: 'local-heuristic'
  };
}

function buildElementClassificationPrompt(hostname, features = {}, localResult = null) {
  return [
    'Classify whether the clicked page element is an ad, suspicious element, benign content, or tracker.',
    'Return JSON only with keys: category, confidence, reason, suggestedAction.',
    'Allowed category values: ad, suspicious, benign, tracker.',
    'Allowed suggestedAction values: observe_only, hide_element, guard_navigation, block_request.',
    `Hostname: ${hostname}`,
    `Selector: ${String(features.selector || '')}`,
    `Text: ${String(features.text || '').slice(0, 280)}`,
    `Href: ${String(features.href || '')}`,
    `Src: ${String(features.src || '')}`,
    `ClassName: ${String(features.className || '')}`,
    `Id: ${String(features.id || '')}`,
    `Position: ${String(features.computedStyle?.position || '')}`,
    `ZIndex: ${String(features.computedStyle?.zIndex || '')}`,
    `Rect: ${Number(features.rect?.width || 0)}x${Number(features.rect?.height || 0)}`,
    localResult
      ? `Local heuristic prior: ${JSON.stringify({ category: localResult.category, confidence: localResult.confidence, reason: localResult.reason })}`
      : ''
  ].filter(Boolean).join('\n');
}

function normalizeElementClassification(raw = {}, fallback = null) {
  const allowedCategories = ['ad', 'suspicious', 'benign', 'tracker'];
  const allowedActions = ['observe_only', 'hide_element', 'guard_navigation', 'block_request'];
  const category = allowedCategories.includes(String(raw.category || '').trim().toLowerCase())
    ? String(raw.category || '').trim().toLowerCase()
    : fallback?.category || 'suspicious';
  return {
    category,
    confidence: clamp(Number(raw.confidence || fallback?.confidence || 0.5), 0, 1),
    reason: String(raw.reason || fallback?.reason || ''),
    suggestedAction: allowedActions.includes(String(raw.suggestedAction || '').trim())
      ? String(raw.suggestedAction || '').trim()
      : category === 'ad'
      ? 'hide_element'
      : category === 'tracker'
      ? 'block_request'
      : category === 'benign'
      ? 'observe_only'
      : 'guard_navigation'
  };
}

function normalizeProviderAdvisory(hostname, raw, meta = {}) {
  if (!raw || typeof raw !== 'object') return null;

  const popupStrictMode = raw.popupStrictMode === true;
  const guardExternalNavigation = raw.guardExternalNavigation === true;
  const overlayScanMs =
    raw.overlayScanMs == null ? null : clamp(Number(raw.overlayScanMs || 0), 600, 5000);
  const extraBlockedDomains = sanitizeStringList(raw.extraBlockedDomains, 12);
  const recommendedActions = normalizeRecommendedActionTokens(raw.recommendedActions, {
    popupStrictMode,
    guardExternalNavigation,
    overlayScanMs,
    extraBlockedDomains
  });

  return {
    hostname: getHostname(hostname) || 'unknown-host',
    provider: String(meta.provider || raw.provider || 'lmstudio'),
    model: String(meta.model || ''),
    generatedAt: Number(meta.generatedAt || getNow()),
    summary: String(raw.summary || '').trim(),
    confidence: clamp(Number(raw.confidence || 0.65), 0.1, 1),
    riskScoreDelta: clamp(Number(raw.riskScoreDelta || 0), -6, 12),
    popupStrictMode,
    guardExternalNavigation,
    overlayScanMs,
    sensitivityBoost: clamp(Number(raw.sensitivityBoost || 0), 0, 3),
    extraBlockedDomains,
    candidateSelectors: sanitizeStringList(raw.candidateSelectors, 16),
    candidateDomains: sanitizeStringList(raw.candidateDomains, 12),
    recommendedActions
  };
}

function mergePolicyWithProviderAdvisory(policy, advisory, options = {}) {
  if (!policy || !advisory) return policy;

  const mode = String(options.mode || 'hybrid');
  const merged = { ...policy };
  const nextEvidence = {
    ...(merged.evidence || {}),
    modelSummary: String(advisory.summary || ''),
    modelConfidence: Number(advisory.confidence || 0),
    modelGeneratedAt: Number(advisory.generatedAt || 0)
  };

  if (mode === 'hybrid') {
    merged.riskScore = clamp(Number(merged.riskScore || 0) + Number(advisory.riskScoreDelta || 0), 0, 200);
    merged.riskTier = resolveRiskTier(merged.riskScore);
    merged.popupStrictMode = Boolean(merged.popupStrictMode || advisory.popupStrictMode);
    merged.guardExternalNavigation = Boolean(
      merged.guardExternalNavigation || advisory.guardExternalNavigation
    );
    if (Number.isFinite(Number(advisory.overlayScanMs)) && Number(advisory.overlayScanMs) > 0) {
      merged.overlayScanMs = Math.min(
        Number(merged.overlayScanMs || 3000),
        Number(advisory.overlayScanMs)
      );
    }
    merged.sensitivityBoost = Math.max(
      Number(merged.sensitivityBoost || 0),
      Number(advisory.sensitivityBoost || 0)
    );
    merged.extraBlockedDomains = Array.from(
      new Set([
        ...(Array.isArray(merged.extraBlockedDomains) ? merged.extraBlockedDomains : []),
        ...advisory.extraBlockedDomains
      ])
    ).slice(0, 12);
    merged.policyGate = buildPolicyGate(merged.riskTier, merged.riskScore, {
      fallbackActive: Boolean(policy?.fallbackActive)
    });
  }

  merged.source =
    mode === 'hybrid'
      ? `${String(policy.source || 'ai_profile')}+${String(advisory.provider || 'provider')}`
      : String(policy.source || 'ai_profile');
  merged.evidence = nextEvidence;
  merged.aiProvider = {
    provider: String(advisory.provider || 'lmstudio'),
    mode,
    model: String(advisory.model || ''),
    confidence: Number(advisory.confidence || 0),
    generatedAt: Number(advisory.generatedAt || 0)
  };
  merged.candidateSelectors = advisory.candidateSelectors;
  merged.candidateDomains = advisory.candidateDomains;
  merged.recommendedActions = advisory.recommendedActions;
  return merged;
}

function buildRuleCandidateSet(hostname, advisory) {
  if (!advisory) return null;
  const provider = String(advisory.provider || 'provider');
  const selectorRules = (Array.isArray(advisory.candidateSelectors) ? advisory.candidateSelectors : [])
    .map((selector) => ({
      selector: String(selector || '').trim(),
      reason: `${provider}_candidate_selector`
    }))
    .filter((item) => item.selector);
  const domainRules = (Array.isArray(advisory.candidateDomains) ? advisory.candidateDomains : [])
    .map((pattern) => ({
      pattern: String(pattern || '').trim(),
      reason: `${provider}_candidate_domain`
    }))
    .filter((item) => item.pattern);

  if (selectorRules.length === 0 && domainRules.length === 0) {
    return null;
  }

  return {
    hostname: getHostname(hostname) || 'unknown-host',
    provider: String(advisory.provider || 'lmstudio'),
    model: String(advisory.model || ''),
    summary: String(advisory.summary || ''),
    generatedAt: Number(advisory.generatedAt || getNow()),
    selectorRules,
    domainRules
  };
}

async function fetchLmStudioModels(settings) {
  const baseUrl = resolveLmStudioBaseUrl(settings.endpoint);
  const startedAt = getNow();
  const timeout = createRequestTimeout(settings.timeoutMs || LM_STUDIO_DEFAULT_TIMEOUT_MS);
  let response = null;
  try {
    response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${settings.apiKey || 'lm-studio'}`
      },
      signal: timeout.signal
    });
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw new Error(`lmstudio_models_http_${response.status}`);
  }

  const payload = await response.json();
  const models = Array.isArray(payload?.data)
    ? payload.data.map((item) => ({
        id: String(item?.id || ''),
        object: String(item?.object || ''),
        ownedBy: String(item?.owned_by || '')
      }))
    : [];

  aiState.providerState = normalizeAiProviderState({
    ...aiState.providerState,
    lastHealthCheckAt: getNow(),
    lastHealthOk: true,
    lastLatencyMs: getNow() - startedAt,
    lastError: '',
    lastModelCount: models.length,
    lastProvider: 'lmstudio',
    lastService: 'lmstudio'
  });

  return models.filter((item) => item.id);
}

async function resolveLmStudioModel(settings) {
  if (settings.model) return settings.model;
  const models = await fetchLmStudioModels(settings);
  const selected = models[0]?.id || '';
  aiState.providerState = normalizeAiProviderState({
    ...aiState.providerState,
    lastResolvedModel: selected,
    lastProvider: 'lmstudio'
  });
  return selected;
}

async function runLmStudioHealthCheck(settings = aiState.providerSettings) {
  try {
    const normalized = normalizeAiProviderSettings(settings || {});
    const models = await fetchLmStudioModels(normalized);
    scheduleAiPersist();
    return {
      success: true,
      provider: 'lmstudio',
      endpoint: normalized.endpoint,
      modelCount: models.length,
      models,
      resolvedModel: normalized.model || models[0]?.id || ''
    };
  } catch (error) {
    aiState.providerState = normalizeAiProviderState({
      ...aiState.providerState,
      lastHealthCheckAt: getNow(),
      lastHealthOk: false,
      lastError: String(error?.message || error),
      lastProvider: 'lmstudio'
    });
    scheduleAiPersist();
    return {
      success: false,
      provider: 'lmstudio',
      endpoint: settings?.endpoint || LM_STUDIO_DEFAULT_ENDPOINT,
      error: String(error?.message || error)
    };
  }
}

function buildGatewayRequestId(hostname) {
  return `req_${getNow()}_${String(hostname || 'host').replace(/[^a-z0-9]+/gi, '_').slice(0, 24)}`;
}

function buildGatewayRecommendedActions(actions = {}, policy = {}) {
  const output = [];

  if (actions.popupStrictMode === true && policy.popupStrictMode !== true) {
    output.push('tighten_popup_guard');
  }
  if (actions.guardExternalNavigation === true && policy.guardExternalNavigation !== true) {
    output.push('guard_external_navigation');
  }
  if (
    Number.isFinite(Number(actions.overlayScanMs)) &&
    Number(actions.overlayScanMs) > 0 &&
    Number(actions.overlayScanMs) < Number(policy.overlayScanMs || 3000)
  ) {
    output.push('tune_overlay_scan');
  }
  if (Array.isArray(actions.extraBlockedDomains) && actions.extraBlockedDomains.length > 0) {
    output.push('apply_extra_blocked_domains');
  }

  return output;
}

function buildGatewayPolicyRequest(hostname, context, policy, recentEvents, settings) {
  const eventCounts = recentEvents.reduce((result, event) => {
    const key = String(event?.type || '').trim();
    if (!key) return result;
    result[key] = Number(result[key] || 0) + 1;
    return result;
  }, {});

  return {
    requestId: buildGatewayRequestId(hostname),
    timestamp: getNow(),
    hostContext: {
      hostname: getHostname(hostname) || 'unknown-host',
      url: String(context?.url || ''),
      topFrame: context?.frame !== 'sub_frame',
      tabRiskTier: String(policy?.riskTier || 'low')
    },
    trigger: {
      type: String(recentEvents[recentEvents.length - 1]?.type || 'telemetry_update'),
      reason: String(policy?.source || 'ai_profile')
    },
    features: {
      windowSec: 30,
      eventCounts,
      riskScore: Number(policy?.riskScore || 0),
      currentPolicyVersion: Number(policy?.policyVersion || policy?.version || AI_POLICY_VERSION),
      currentActions: {
        popupStrictMode: Boolean(policy?.popupStrictMode),
        guardExternalNavigation: Boolean(policy?.guardExternalNavigation),
        overlayScanMs: Number(policy?.overlayScanMs || 3000),
        sensitivityBoost: Number(policy?.sensitivityBoost || 0),
        extraBlockedDomains: Array.isArray(policy?.extraBlockedDomains) ? policy.extraBlockedDomains : []
      },
      recentEvents
    },
    constraints: {
      maxTtlMs: AI_HOST_FALLBACK_DURATION_MS,
      allowForceSandbox: true,
      allowedFrames: ['top', 'all']
    },
    providerHints: settings.model ? { preferredModel: settings.model } : undefined
  };
}

function normalizeGatewayAdvisory(hostname, payload, policy, settings) {
  const responsePolicy = payload?.policy;
  if (!responsePolicy || typeof responsePolicy !== 'object') return null;

  const actions = responsePolicy.actions && typeof responsePolicy.actions === 'object'
    ? responsePolicy.actions
    : {};
  const reasonCodes = sanitizeStringList(responsePolicy?.risk?.reasonCodes, 8);
  const summary = String(
    payload?.summary ||
      responsePolicy?.summary ||
      (reasonCodes.length > 0 ? reasonCodes.join(', ') : `gateway policy ${String(responsePolicy?.risk?.tier || 'low')}`)
  ).trim();

  return normalizeProviderAdvisory(
    hostname,
    {
      summary,
      confidence: Number(payload?.confidence || (payload?.audit?.compiled === true ? 0.9 : 0.75)),
      riskScoreDelta: Number(responsePolicy?.risk?.score || policy?.riskScore || 0) - Number(policy?.riskScore || 0),
      popupStrictMode: actions.popupStrictMode === true,
      guardExternalNavigation: actions.guardExternalNavigation === true,
      overlayScanMs: actions.overlayScanMs,
      sensitivityBoost: actions.sensitivityBoost,
      extraBlockedDomains: actions.extraBlockedDomains,
      candidateSelectors: payload?.candidateSelectors || payload?.selectorCandidates || responsePolicy?.scope?.selectorClusters,
      candidateDomains: payload?.candidateDomains || payload?.domainCandidates || actions.extraBlockedDomains,
      recommendedActions: payload?.recommendedActions || buildGatewayRecommendedActions(actions, policy)
    },
    {
      provider: 'gateway',
      model: String(payload?.model?.name || payload?.model?.id || settings.model || ''),
      generatedAt: Number(responsePolicy?.generatedAt || getNow())
    }
  );
}

function normalizeOpenAiAdvisory(hostname, payload, policy, settings) {
  const rawText = extractOpenAiOutputText(payload);
  const parsed = extractJsonObjectFromText(rawText);
  if (!parsed || typeof parsed !== 'object') return null;

  const responsePolicy = parsed?.policy && typeof parsed.policy === 'object'
    ? parsed.policy
    : parsed;

  return normalizeGatewayAdvisory(
    hostname,
    {
      summary: String(parsed?.summary || responsePolicy?.summary || '').trim(),
      confidence: Number(parsed?.confidence || 0.88),
      candidateSelectors: parsed?.candidateSelectors,
      candidateDomains: parsed?.candidateDomains,
      recommendedActions: parsed?.recommendedActions,
      model: {
        name: String(settings?.model || OPENAI_DEFAULT_MODEL)
      },
      audit: {
        compiled: true
      },
      policy: responsePolicy
    },
    policy,
    settings
  );
}

function normalizeGeminiAdvisory(hostname, payload, policy, settings) {
  const rawText = extractGeminiOutputText(payload);
  const parsed = extractJsonObjectFromText(rawText);
  if (!parsed || typeof parsed !== 'object') return null;

  const responsePolicy = parsed?.policy && typeof parsed.policy === 'object'
    ? parsed.policy
    : parsed;

  return normalizeGatewayAdvisory(
    hostname,
    {
      summary: String(parsed?.summary || responsePolicy?.summary || '').trim(),
      confidence: Number(parsed?.confidence || 0.82),
      candidateSelectors: parsed?.candidateSelectors,
      candidateDomains: parsed?.candidateDomains,
      recommendedActions: parsed?.recommendedActions,
      model: {
        name: String(settings?.model || GEMINI_DEFAULT_MODEL)
      },
      audit: {
        compiled: true
      },
      policy: responsePolicy
    },
    policy,
    settings
  );
}

async function runOpenAiHealthCheck(settings = aiState.providerSettings) {
  try {
    const normalized = resolveAiProviderSettings(settings || {}, settings?.apiKey || aiState.providerSecrets);
    const baseUrl = resolveOpenAiBaseUrl(normalized.endpoint);
    if (!normalized.apiKey) {
      throw new Error('openai_api_key_required');
    }

    const startedAt = getNow();
    const timeout = createRequestTimeout(normalized.timeoutMs || OPENAI_DEFAULT_TIMEOUT_MS);
    let response = null;
    try {
      response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${normalized.apiKey}`
        },
        signal: timeout.signal
      });
    } finally {
      timeout.cleanup();
    }

    if (!response.ok) {
      throw new Error(`openai_health_http_${response.status}`);
    }

    const payload = await response.json();
    const models = Array.isArray(payload?.data)
      ? payload.data
        .map((item) => String(item?.id || '').trim())
        .filter(Boolean)
      : [];
    const modelCount = models.length;
    const resolvedModel = String(normalized.model || OPENAI_DEFAULT_MODEL).trim();

    aiState.providerState = normalizeAiProviderState({
      ...aiState.providerState,
      lastHealthCheckAt: getNow(),
      lastHealthOk: true,
      lastLatencyMs: getNow() - startedAt,
      lastError: '',
      lastModelCount: modelCount,
      lastResolvedModel: resolvedModel,
      lastProvider: 'openai',
      lastService: 'openai'
    });
    scheduleAiPersist();

    return {
      success: true,
      provider: 'openai',
      endpoint: normalized.endpoint,
      service: 'openai',
      resolvedModel,
      modelCount
    };
  } catch (error) {
    aiState.providerState = normalizeAiProviderState({
      ...aiState.providerState,
      lastHealthCheckAt: getNow(),
      lastHealthOk: false,
      lastError: String(error?.message || error),
      lastProvider: 'openai'
    });
    scheduleAiPersist();
    return {
      success: false,
      provider: 'openai',
      endpoint: settings?.endpoint || OPENAI_DEFAULT_ENDPOINT,
      error: String(error?.message || error)
    };
  }
}

async function runGeminiHealthCheck(settings = aiState.providerSettings) {
  try {
    const normalized = resolveAiProviderSettings(settings || {}, settings?.apiKey || aiState.providerSecrets);
    const requestInfo = resolveGeminiModelRequest(normalized.endpoint, normalized.model);
    if (!normalized.apiKey) {
      throw new Error('gemini_api_key_required');
    }

    const startedAt = getNow();
    const timeout = createRequestTimeout(normalized.timeoutMs || GEMINI_DEFAULT_TIMEOUT_MS);
    let response = null;
    try {
      const url = new URL(requestInfo.modelPath);
      url.searchParams.set('key', normalized.apiKey);
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: timeout.signal
      });
    } finally {
      timeout.cleanup();
    }

    if (!response.ok) {
      throw new Error(`gemini_health_http_${response.status}`);
    }

    const payload = await response.json();
    const resolvedModel = String(payload?.name || normalized.model || GEMINI_DEFAULT_MODEL).split('/').pop() || GEMINI_DEFAULT_MODEL;

    aiState.providerState = normalizeAiProviderState({
      ...aiState.providerState,
      lastHealthCheckAt: getNow(),
      lastHealthOk: true,
      lastLatencyMs: getNow() - startedAt,
      lastError: '',
      lastModelCount: 1,
      lastResolvedModel: resolvedModel,
      lastProvider: 'gemini',
      lastService: 'gemini'
    });
    scheduleAiPersist();

    return {
      success: true,
      provider: 'gemini',
      endpoint: normalized.endpoint,
      service: 'gemini',
      resolvedModel,
      modelCount: 1
    };
  } catch (error) {
    aiState.providerState = normalizeAiProviderState({
      ...aiState.providerState,
      lastHealthCheckAt: getNow(),
      lastHealthOk: false,
      lastError: String(error?.message || error),
      lastProvider: 'gemini'
    });
    scheduleAiPersist();
    return {
      success: false,
      provider: 'gemini',
      endpoint: settings?.endpoint || GEMINI_DEFAULT_ENDPOINT,
      error: String(error?.message || error)
    };
  }
}

async function runGatewayHealthCheck(settings = aiState.providerSettings) {
  try {
    const normalized = resolveAiProviderSettings(settings || {}, settings?.apiKey || aiState.providerSecrets);
    const baseUrl = resolveGatewayBaseUrl(normalized.endpoint);
    if (!baseUrl) {
      throw new Error('gateway_endpoint_required');
    }

    const startedAt = getNow();
    const timeout = createRequestTimeout(normalized.timeoutMs || GATEWAY_DEFAULT_TIMEOUT_MS);
    let response = null;
    try {
      response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(normalized.apiKey ? { Authorization: `Bearer ${normalized.apiKey}` } : {})
        },
        signal: timeout.signal
      });
    } finally {
      timeout.cleanup();
    }

    if (!response.ok) {
      throw new Error(`gateway_health_http_${response.status}`);
    }

    const payload = await response.json();
    aiState.providerState = normalizeAiProviderState({
      ...aiState.providerState,
      lastHealthCheckAt: getNow(),
      lastHealthOk: true,
      lastLatencyMs: getNow() - startedAt,
      lastError: '',
      lastModelCount: 0,
      lastResolvedModel: normalized.model || '',
      lastProvider: 'gateway',
      lastService: String(payload?.service || 'gateway')
    });
    scheduleAiPersist();

    return {
      success: true,
      provider: 'gateway',
      endpoint: normalized.endpoint,
      service: String(payload?.service || 'gateway'),
      version: String(payload?.version || ''),
      resolvedModel: normalized.model || '',
      modelCount: 0
    };
  } catch (error) {
    aiState.providerState = normalizeAiProviderState({
      ...aiState.providerState,
      lastHealthCheckAt: getNow(),
      lastHealthOk: false,
      lastError: String(error?.message || error),
      lastProvider: 'gateway'
    });
    scheduleAiPersist();
    return {
      success: false,
      provider: 'gateway',
      endpoint: settings?.endpoint || GATEWAY_DEFAULT_ENDPOINT,
      error: String(error?.message || error)
    };
  }
}

async function runAiProviderHealthCheck(settings = aiState.providerSettings) {
  const normalized = resolveAiProviderSettings(settings || {}, settings?.apiKey || aiState.providerSecrets);
  if (normalized.provider === 'openai') {
    return runOpenAiHealthCheck(normalized);
  }
  if (normalized.provider === 'gemini') {
    return runGeminiHealthCheck(normalized);
  }
  if (normalized.provider === 'gateway') {
    return runGatewayHealthCheck(normalized);
  }
  return runLmStudioHealthCheck(normalized);
}

function shouldQueryAiProvider(hostname, policy, events = []) {
  const settings = resolveAiProviderSettings(aiState.providerSettings || {}, aiState.providerSecrets);
  if (settings.enabled !== true) return false;
  if (settings.mode === 'off') return false;

  const nowTs = getNow();
  const normalized = getHostname(hostname);
  const lastRun = Number(aiState.providerState?.perHostLastRun?.[normalized] || 0);
  const hasPriorityEvent = events.some((event) =>
    ['blocked_malicious_navigation', 'clickjacking_detected', 'blocked_popup'].includes(event.type)
  );

  if (!hasPriorityEvent && Number(policy?.riskScore || 0) < Number(settings.minRiskScore || 0)) {
    return false;
  }

  return nowTs - lastRun >= Number(settings.cooldownMs || LM_STUDIO_DEFAULT_COOLDOWN_MS);
}

async function requestLmStudioAdvisory(hostname, context, policy) {
  const settings = resolveAiProviderSettings(aiState.providerSettings || {}, aiState.providerSecrets);
  const recentEvents = getRecentTelemetryForHost(hostname, settings.maxRecentEvents);
  const model = await resolveLmStudioModel(settings);
  if (!model) {
    throw new Error('lmstudio_no_model_available');
  }

  const startedAt = getNow();
  const timeout = createRequestTimeout(settings.timeoutMs || LM_STUDIO_DEFAULT_TIMEOUT_MS);
  let response = null;
  try {
    response = await fetch(settings.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${settings.apiKey || 'lm-studio'}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 600,
        messages: buildLmStudioMessages(hostname, context, policy, recentEvents)
      }),
      signal: timeout.signal
    });
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw new Error(`lmstudio_chat_http_${response.status}`);
  }

  const payload = await response.json();
  const rawText =
    payload?.choices?.[0]?.message?.content ||
    payload?.output_text ||
    payload?.response ||
    '';
  const parsed = extractJsonObjectFromText(rawText);
  const advisory = normalizeProviderAdvisory(hostname, parsed, {
    provider: 'lmstudio',
    model,
    generatedAt: getNow()
  });

  if (!advisory) {
    throw new Error('lmstudio_invalid_json');
  }

  const normalizedHost = getHostname(hostname) || 'unknown-host';
  aiState.providerState = normalizeAiProviderState({
    ...aiState.providerState,
    lastHealthCheckAt: getNow(),
    lastHealthOk: true,
    lastLatencyMs: getNow() - startedAt,
    lastError: '',
    lastResolvedModel: model,
    lastProvider: 'lmstudio',
    lastService: 'lmstudio',
    perHostLastRun: {
      ...(aiState.providerState?.perHostLastRun || {}),
      [normalizedHost]: getNow()
    }
  });
  aiState.providerAdvisories[normalizedHost] = advisory;
  if (settings.enableDynamicRuleCandidates === true) {
    const candidateSet = buildRuleCandidateSet(normalizedHost, advisory);
    if (candidateSet) {
      aiState.generatedRuleCandidates[normalizedHost] = candidateSet;
      aiState.providerState = normalizeAiProviderState({
        ...aiState.providerState,
        lastRulePreviewAt: getNow()
      });
    }
  }
  scheduleAiPersist();
  return advisory;
}

async function requestGatewayAdvisory(hostname, context, policy) {
  const settings = resolveAiProviderSettings(aiState.providerSettings || {}, aiState.providerSecrets);
  const baseUrl = resolveGatewayBaseUrl(settings.endpoint);
  if (!baseUrl) {
    throw new Error('gateway_endpoint_required');
  }

  const recentEvents = getRecentTelemetryForHost(hostname, settings.maxRecentEvents);
  const startedAt = getNow();
  const timeout = createRequestTimeout(settings.timeoutMs || GATEWAY_DEFAULT_TIMEOUT_MS);
  let response = null;
  try {
    response = await fetch(`${baseUrl}/policy/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
        'X-Client-Version': `${APP_BRAND}/${APP_VERSION}`
      },
      body: JSON.stringify(buildGatewayPolicyRequest(hostname, context, policy, recentEvents, settings)),
      signal: timeout.signal
    });
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw new Error(`gateway_policy_http_${response.status}`);
  }

  const payload = await response.json();
  const advisory = normalizeGatewayAdvisory(hostname, payload, policy, settings);
  if (!advisory) {
    throw new Error('gateway_invalid_policy');
  }

  const normalizedHost = getHostname(hostname) || 'unknown-host';
  aiState.providerState = normalizeAiProviderState({
    ...aiState.providerState,
    lastHealthCheckAt: getNow(),
    lastHealthOk: true,
    lastLatencyMs: getNow() - startedAt,
    lastError: '',
    lastResolvedModel: String(advisory.model || settings.model || ''),
    lastProvider: 'gateway',
    lastService: String(payload?.service || 'gateway'),
    perHostLastRun: {
      ...(aiState.providerState?.perHostLastRun || {}),
      [normalizedHost]: getNow()
    }
  });
  aiState.providerAdvisories[normalizedHost] = advisory;
  if (settings.enableDynamicRuleCandidates === true) {
    const candidateSet = buildRuleCandidateSet(normalizedHost, advisory);
    if (candidateSet) {
      aiState.generatedRuleCandidates[normalizedHost] = candidateSet;
      aiState.providerState = normalizeAiProviderState({
        ...aiState.providerState,
        lastRulePreviewAt: getNow()
      });
    }
  }
  scheduleAiPersist();
  return advisory;
}

async function requestOpenAiAdvisory(hostname, context, policy) {
  const settings = resolveAiProviderSettings(aiState.providerSettings || {}, aiState.providerSecrets);
  if (!settings.apiKey) {
    throw new Error('openai_api_key_required');
  }

  const recentEvents = getRecentTelemetryForHost(hostname, settings.maxRecentEvents);
  const startedAt = getNow();
  const timeout = createRequestTimeout(settings.timeoutMs || OPENAI_DEFAULT_TIMEOUT_MS);
  let response = null;
  try {
    response = await fetch(settings.endpoint || OPENAI_DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model || OPENAI_DEFAULT_MODEL,
        reasoning: { effort: 'low' },
        instructions: buildOpenAiInstructions(),
        input: buildOpenAiInput(hostname, context, policy, recentEvents, settings),
        max_output_tokens: 900
      }),
      signal: timeout.signal
    });
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw new Error(`openai_responses_http_${response.status}`);
  }

  const payload = await response.json();
  const advisory = normalizeOpenAiAdvisory(hostname, payload, policy, settings);
  if (!advisory) {
    throw new Error('openai_invalid_policy');
  }

  const normalizedHost = getHostname(hostname) || 'unknown-host';
  aiState.providerState = normalizeAiProviderState({
    ...aiState.providerState,
    lastHealthCheckAt: getNow(),
    lastHealthOk: true,
    lastLatencyMs: getNow() - startedAt,
    lastError: '',
    lastResolvedModel: String(advisory.model || settings.model || OPENAI_DEFAULT_MODEL),
    lastProvider: 'openai',
    lastService: 'openai',
    perHostLastRun: {
      ...(aiState.providerState?.perHostLastRun || {}),
      [normalizedHost]: getNow()
    }
  });
  aiState.providerAdvisories[normalizedHost] = advisory;
  if (settings.enableDynamicRuleCandidates === true) {
    const candidateSet = buildRuleCandidateSet(normalizedHost, advisory);
    if (candidateSet) {
      aiState.generatedRuleCandidates[normalizedHost] = candidateSet;
      aiState.providerState = normalizeAiProviderState({
        ...aiState.providerState,
        lastRulePreviewAt: getNow()
      });
    }
  }
  scheduleAiPersist();
  return advisory;
}

async function requestGeminiAdvisory(hostname, context, policy) {
  const settings = resolveAiProviderSettings(aiState.providerSettings || {}, aiState.providerSecrets);
  if (!settings.apiKey) {
    throw new Error('gemini_api_key_required');
  }

  const recentEvents = getRecentTelemetryForHost(hostname, settings.maxRecentEvents);
  const requestInfo = resolveGeminiModelRequest(settings.endpoint, settings.model);
  const startedAt = getNow();
  const timeout = createRequestTimeout(settings.timeoutMs || GEMINI_DEFAULT_TIMEOUT_MS);
  let response = null;
  try {
    const url = new URL(requestInfo.generateContentUrl);
    url.searchParams.set('key', settings.apiKey);
    response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(buildGeminiGenerateContentBody(hostname, context, policy, recentEvents, settings)),
      signal: timeout.signal
    });
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw new Error(`gemini_generate_content_http_${response.status}`);
  }

  const payload = await response.json();
  const advisory = normalizeGeminiAdvisory(hostname, payload, policy, settings);
  if (!advisory) {
    throw new Error('gemini_invalid_policy');
  }

  const normalizedHost = getHostname(hostname) || 'unknown-host';
  aiState.providerState = normalizeAiProviderState({
    ...aiState.providerState,
    lastHealthCheckAt: getNow(),
    lastHealthOk: true,
    lastLatencyMs: getNow() - startedAt,
    lastError: '',
    lastResolvedModel: String(advisory.model || settings.model || GEMINI_DEFAULT_MODEL),
    lastProvider: 'gemini',
    lastService: 'gemini',
    perHostLastRun: {
      ...(aiState.providerState?.perHostLastRun || {}),
      [normalizedHost]: getNow()
    }
  });
  aiState.providerAdvisories[normalizedHost] = advisory;
  if (settings.enableDynamicRuleCandidates === true) {
    const candidateSet = buildRuleCandidateSet(normalizedHost, advisory);
    if (candidateSet) {
      aiState.generatedRuleCandidates[normalizedHost] = candidateSet;
      aiState.providerState = normalizeAiProviderState({
        ...aiState.providerState,
        lastRulePreviewAt: getNow()
      });
    }
  }
  scheduleAiPersist();
  return advisory;
}

async function requestAiProviderAdvisory(hostname, context, policy) {
  const settings = getPersistableAiProviderSettings(aiState.providerSettings || {});
  if (settings.provider === 'openai') {
    return requestOpenAiAdvisory(hostname, context, policy);
  }
  if (settings.provider === 'gemini') {
    return requestGeminiAdvisory(hostname, context, policy);
  }
  if (settings.provider === 'gateway') {
    return requestGatewayAdvisory(hostname, context, policy);
  }
  return requestLmStudioAdvisory(hostname, context, policy);
}

async function requestAiElementClassification(hostname, features = {}) {
  const settings = resolveAiProviderSettings(aiState.providerSettings || {}, aiState.providerSecrets);
  const localResult = classifyElementLocally(hostname, features);
  if (settings.enabled !== true || settings.mode === 'off') {
    return localResult;
  }

  const prompt = buildElementClassificationPrompt(hostname, features, localResult);
  try {
    if (settings.provider === 'openai' && settings.apiKey) {
      const timeout = createRequestTimeout(settings.timeoutMs || OPENAI_DEFAULT_TIMEOUT_MS);
      let response = null;
      try {
        response = await fetch(settings.endpoint || OPENAI_DEFAULT_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${settings.apiKey}`
          },
          body: JSON.stringify({
            model: settings.model || OPENAI_DEFAULT_MODEL,
            reasoning: { effort: 'low' },
            input: prompt,
            max_output_tokens: 220
          }),
          signal: timeout.signal
        });
      } finally {
        timeout.cleanup();
      }
      if (!response?.ok) throw new Error(`openai_element_http_${response?.status || 0}`);
      const payload = await response.json();
      return {
        ...normalizeElementClassification(extractJsonObjectFromText(extractOpenAiOutputText(payload)), localResult),
        provider: 'openai'
      };
    }

    if (settings.provider === 'gemini' && settings.apiKey) {
      const requestInfo = resolveGeminiModelRequest(settings.endpoint, settings.model);
      const timeout = createRequestTimeout(settings.timeoutMs || GEMINI_DEFAULT_TIMEOUT_MS);
      let response = null;
      try {
        const url = new URL(requestInfo.generateContentUrl);
        url.searchParams.set('key', settings.apiKey);
        response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          }),
          signal: timeout.signal
        });
      } finally {
        timeout.cleanup();
      }
      if (!response?.ok) throw new Error(`gemini_element_http_${response?.status || 0}`);
      const payload = await response.json();
      return {
        ...normalizeElementClassification(extractJsonObjectFromText(extractGeminiOutputText(payload)), localResult),
        provider: 'gemini'
      };
    }

    if (settings.provider === 'lmstudio') {
      const model = await resolveLmStudioModel(settings);
      if (!model) return localResult;
      const timeout = createRequestTimeout(settings.timeoutMs || LM_STUDIO_DEFAULT_TIMEOUT_MS);
      let response = null;
      try {
        response = await fetch(settings.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${settings.apiKey || 'lm-studio'}`
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 220,
            messages: [
              { role: 'system', content: 'You classify suspicious page elements. Return JSON only.' },
              { role: 'user', content: prompt }
            ]
          }),
          signal: timeout.signal
        });
      } finally {
        timeout.cleanup();
      }
      if (!response?.ok) throw new Error(`lmstudio_element_http_${response?.status || 0}`);
      const payload = await response.json();
      const rawText =
        payload?.choices?.[0]?.message?.content ||
        payload?.output_text ||
        payload?.response ||
        '';
      return {
        ...normalizeElementClassification(extractJsonObjectFromText(rawText), localResult),
        provider: 'lmstudio'
      };
    }
  } catch (error) {
    return {
      ...localResult,
      reason: `${localResult.reason}; ai_fallback=${String(error?.message || error)}`
    };
  }

  return localResult;
}

function buildPolicyGate(riskTier, riskScore, options = {}) {
  const fallbackActive = options.fallbackActive === true;
  const thresholds = {
    ...AI_POLICY_GATE_DEFAULT_THRESHOLDS
  };
  let tier = 'T1';
  let mode = 'advisory-only';
  let reason = fallbackActive ? 'host_fallback_active' : 'runtime_default';
  let allowReversibleActions = false;
  let allowedActions = [];
  let escalateToCodexReview = false;

  if (fallbackActive) {
    tier = 'T1';
    mode = 'advisory-only';
    reason = 'host_fallback_active';
  } else if (riskTier === 'high' || riskTier === 'critical') {
    tier = 'T2';
    mode = 'reversible-actions';
    reason = 'high_risk_runtime_alignment';
    allowReversibleActions = true;
    allowedActions = [
      'tune_overlay_scan',
      'tighten_popup_guard',
      'guard_external_navigation',
      'apply_extra_blocked_domains'
    ];
  }

  if (Number(riskScore || 0) >= thresholds.devEscalationMinRiskScore || riskTier === 'critical') {
    escalateToCodexReview = true;
  }

  return {
    version: AI_POLICY_GATE_VERSION,
    tier,
    mode,
    reason,
    allowAiAdvisory: true,
    allowReversibleActions,
    allowDurableMutation: false,
    escalateToCodexReview,
    thresholds,
    actionBudget: {
      ...AI_POLICY_GATE_ACTION_BUDGET
    },
    allowedActions
  };
}

function buildPolicyFromProfile(hostname, profile, source = 'ai_profile', nowTs = getNow()) {
  const riskScore = Number(profile?.riskScore || 0);
  const riskTier = resolveRiskTier(riskScore);
  const policyGate = buildPolicyGate(riskTier, riskScore);
  const evidence = buildPolicyEvidence(profile);

  const policy = {
    version: AI_POLICY_VERSION,
    policyVersion: AI_POLICY_VERSION,
    policyGateVersion: AI_POLICY_GATE_VERSION,
    hostname,
    source,
    generatedAt: Number(nowTs || getNow()),
    appliedAt: 0,
    riskTier,
    riskScore: Number(riskScore.toFixed(2)),
    popupStrictMode: false,
    guardExternalNavigation: false,
    overlayScanMs: 3000,
    sensitivityBoost: 0,
    forceSandbox: false,
    extraBlockedDomains: [],
    evidence,
    policyGate,
    fallbackActive: false,
    fallbackReason: '',
    fallbackUntil: 0
  };

  if (riskTier === 'medium') {
    policy.popupStrictMode = true;
    policy.overlayScanMs = 1800;
    policy.sensitivityBoost = 1;
  }

  if (riskTier === 'high') {
    policy.popupStrictMode = true;
    policy.guardExternalNavigation = true;
    policy.overlayScanMs = 1000;
    policy.sensitivityBoost = 2;
    policy.extraBlockedDomains = AI_HIGH_RISK_EXTRA_DOMAINS.slice(0, 6);
  }

  if (riskTier === 'critical') {
    policy.popupStrictMode = true;
    policy.guardExternalNavigation = true;
    policy.overlayScanMs = 700;
    policy.sensitivityBoost = 3;
    policy.forceSandbox = true;
    policy.extraBlockedDomains = [...AI_HIGH_RISK_EXTRA_DOMAINS];
  }

  return policy;
}

function applyHostFallbackToPolicy(policy, fallbackState) {
  if (!fallbackState?.active) return policy;
  const fallbackRiskScore = Number(Math.min(Number(policy.riskScore || 0), 6.99).toFixed(2));
  return {
    ...policy,
    source: String(fallbackState.source || 'host_fallback_manual'),
    riskTier: 'low',
    riskScore: fallbackRiskScore,
    popupStrictMode: false,
    guardExternalNavigation: false,
    overlayScanMs: Math.max(3000, Number(policy.overlayScanMs || 3000)),
    sensitivityBoost: 0,
    forceSandbox: false,
    extraBlockedDomains: [],
    evidence: buildPolicyEvidence(
      {
        events: policy?.evidence?.topSignals?.reduce?.((acc, item) => {
          if (item?.type) acc[item.type] = Number(item.count || 0);
          return acc;
        }, {}) || {},
        recentSignals: policy?.evidence?.recentSignals || []
      },
      fallbackState
    ),
    policyGateVersion: AI_POLICY_GATE_VERSION,
    policyGate: buildPolicyGate('low', fallbackRiskScore, { fallbackActive: true }),
    fallbackActive: true,
    fallbackReason: String(fallbackState.reason || 'manual_override'),
    fallbackUntil: Number(fallbackState.activeUntil || 0)
  };
}

function buildResolvedPolicy(hostname, profile, previousPolicy, options = {}) {
  const nowTs = Number(options.nowTs || getNow());
  let policy = buildPolicyFromProfile(hostname, profile, options.source || 'ai_profile', nowTs);
  policy.appliedAt = Number(previousPolicy?.appliedAt || 0);

  const normalizedHost = getHostname(hostname) || 'unknown-host';
  const advisory = aiState.providerAdvisories?.[normalizedHost] || null;
  const providerSettings = normalizeAiProviderSettings(aiState.providerSettings || {});
  if (advisory && providerSettings.enabled === true && providerSettings.mode !== 'off') {
    policy = mergePolicyWithProviderAdvisory(policy, advisory, {
      mode: providerSettings.mode
    });
  }

  const fallbackState = getHostFallbackState(hostname, nowTs);
  if (fallbackState.active) {
    policy = applyHostFallbackToPolicy(policy, fallbackState);
  }

  return policy;
}

function policySignature(policy) {
  if (!policy || typeof policy !== 'object') return '';
  return JSON.stringify({
    policyVersion: Number(policy.policyVersion || policy.version || 0),
    hostname: String(policy.hostname || ''),
    riskTier: String(policy.riskTier || 'low'),
    riskScore: Number(policy.riskScore || 0),
    popupStrictMode: Boolean(policy.popupStrictMode),
    guardExternalNavigation: Boolean(policy.guardExternalNavigation),
    overlayScanMs: Number(policy.overlayScanMs || 0),
    sensitivityBoost: Number(policy.sensitivityBoost || 0),
    forceSandbox: Boolean(policy.forceSandbox),
    extraBlockedDomains: Array.isArray(policy.extraBlockedDomains) ? policy.extraBlockedDomains : [],
    policyGateVersion: Number(policy.policyGateVersion || 0),
    policyGateTier: String(policy.policyGate?.tier || 'T1'),
    policyGateMode: String(policy.policyGate?.mode || 'advisory-only'),
    policyGateReason: String(policy.policyGate?.reason || ''),
    policyGateAllowedActions: Array.isArray(policy.policyGate?.allowedActions)
      ? policy.policyGate.allowedActions
      : [],
    source: String(policy.source || ''),
    aiProvider: String(policy.aiProvider?.provider || ''),
    aiProviderMode: String(policy.aiProvider?.mode || ''),
    aiProviderModel: String(policy.aiProvider?.model || ''),
    candidateSelectorCount: Array.isArray(policy.candidateSelectors) ? policy.candidateSelectors.length : 0,
    candidateDomainCount: Array.isArray(policy.candidateDomains) ? policy.candidateDomains.length : 0,
    fallbackActive: Boolean(policy.fallbackActive),
    fallbackUntil: Number(policy.fallbackUntil || 0)
  });
}

function getOrCreateProfile(hostname) {
  if (!hostname) {
    hostname = 'unknown-host';
  }
  if (!aiState.profiles[hostname]) {
    aiState.profiles[hostname] = createEmptyProfile(hostname);
  }
  return aiState.profiles[hostname];
}

function appendTelemetry(hostname, event, context) {
  aiState.telemetryLog.push({
    hostname,
    event,
    context: context || {},
    ingestedAt: getNow()
  });

  if (aiState.telemetryLog.length > AI_MAX_TELEMETRY) {
    aiState.telemetryLog.splice(0, aiState.telemetryLog.length - AI_MAX_TELEMETRY);
  }
}

function getPolicyForHostname(hostname, options = {}) {
  const normalized = getHostname(hostname);
  if (!normalized) {
    return buildPolicyFromProfile('unknown-host', createEmptyProfile('unknown-host'), 'unknown_host');
  }

  const nowTs = Number(options.nowTs || getNow());
  const cached = aiState.policyCache[normalized];
  const fallbackState = getHostFallbackState(normalized, nowTs);
  const fallbackMismatch = Boolean(cached?.fallbackActive) !== Boolean(fallbackState.active);
  const fallbackWindowChanged =
    Boolean(fallbackState.active) && Number(cached?.fallbackUntil || 0) !== Number(fallbackState.activeUntil || 0);

  if (cached && options.forceRebuild !== true && !fallbackMismatch && !fallbackWindowChanged) {
    return cached;
  }

  const profile = getOrCreateProfile(normalized);
  const policy = buildResolvedPolicy(normalized, profile, cached || null, { nowTs });
  aiState.policyCache[normalized] = policy;
  return policy;
}

function getPolicyForUrl(url) {
  const hostname = getHostname(url);
  return getPolicyForHostname(hostname || 'unknown-host');
}

function buildTeachObservationRecord(hostname, features = {}, classification = {}, source = 'teaching_mode') {
  return normalizeKnowledgeObservation({
    hostname,
    pageUrl: String(features.pageUrl || features.url || ''),
    selector: String(features.selector || ''),
    tagName: String(features.tagName || ''),
    text: String(features.text || ''),
    href: String(features.href || ''),
    src: String(features.src || ''),
    category: String(classification.category || 'suspicious'),
    confidence: Number(classification.confidence || 0.5),
    source,
    reason: String(classification.reason || ''),
    createdAt: getNow()
  });
}

function commitTeachObservation(hostname, features = {}, classification = {}, userCategory = '') {
  const normalizedHost = getHostname(hostname);
  if (!normalizedHost) return null;

  let store = normalizeAiKnowledgeStore(aiState.knowledgeStore || {});
  const category = String(userCategory || classification.category || 'suspicious');
  const observation = buildTeachObservationRecord(normalizedHost, features, {
    ...classification,
    category
  });
  if (!observation) return null;

  store.observations.unshift(observation);
  if (store.observations.length > AI_KNOWLEDGE_MAX_OBSERVATIONS) {
    store.observations.length = AI_KNOWLEDGE_MAX_OBSERVATIONS;
  }

  const session = normalizeTeachSession({
    hostname: normalizedHost,
    selector: observation.selector,
    aiCategory: classification.category,
    userCategory: category,
    aiConfidence: classification.confidence,
    verified: true,
    createdAt: getNow()
  });
  if (session) {
    store.teachSessions.unshift(session);
    if (store.teachSessions.length > AI_KNOWLEDGE_MAX_TEACH_SESSIONS) {
      store.teachSessions.length = AI_KNOWLEDGE_MAX_TEACH_SESSIONS;
    }
  }

  if (category === 'ad' || category === 'tracker' || category === 'suspicious') {
    const candidate = {
      hostname: normalizedHost,
      selector: observation.selector,
      category,
      confidence: Math.max(Number(classification.confidence || 0.5), category === 'ad' ? 0.82 : 0.7),
      source: 'teaching_mode',
      observations: 1,
      requiredObservations: TEACHING_CONFIRMATION_THRESHOLD,
      lastSeenAt: getNow()
    };
    store = upsertKnowledgeCandidate(store, candidate);
    const promotedCandidate = store.candidates.find((item) =>
      item.hostname === normalizedHost &&
      item.selector === observation.selector &&
      item.category === category
    );
    if (promotedCandidate && promotedCandidate.observations >= promotedCandidate.requiredObservations) {
      store = promoteKnowledgeCandidate(store, promotedCandidate);
    }
  }

  aiState.knowledgeStore = recalculateAiKnowledgeStats(store);
  scheduleAiPersist();
  return {
    observation,
    knowledge: aiState.knowledgeStore
  };
}

function processAiTelemetry(request, sender) {
  if (!aiState.enabled) {
    const fallbackHostname =
      getHostname(request?.context?.hostname) || getHostname(sender?.tab?.url) || 'unknown-host';
    return {
      hostname: fallbackHostname,
      policy: buildPolicyFromProfile(fallbackHostname, createEmptyProfile(fallbackHostname), 'ai_disabled'),
      policyChanged: false,
      acceptedEvents: 0
    };
  }

  const context = request.context || {};
  const hostname =
    getHostname(context.hostname) || getHostname(context.url) || getHostname(sender?.tab?.url) || 'unknown-host';

  const rawEvents = Array.isArray(request.events)
    ? request.events
    : request.event
    ? [request.event]
    : [];

  const events = rawEvents.map(normalizeAiEvent).filter(Boolean);
  if (events.length === 0) {
    return {
      hostname,
      policy: getPolicyForHostname(hostname),
      policyChanged: false,
      acceptedEvents: 0
    };
  }

  const profile = getOrCreateProfile(hostname);
  const beforeSignature = policySignature(getPolicyForHostname(hostname));
  const nowTs = getNow();
  let fallbackTriggered = false;

  events.forEach((event) => {
    updateRiskProfile(profile, event);
    appendTelemetry(hostname, event, context);

    if (event.type === 'false_positive_signal' || event.type === 'user_override') {
      const fallbackResult = activateHostFallback(hostname, {
        reason: event.type,
        source: `host_fallback_auto:${event.type}`,
        force: false
      });
      if (fallbackResult.activated) {
        fallbackTriggered = true;
      }
    }
  });

  const policy = buildResolvedPolicy(hostname, profile, aiState.policyCache[hostname] || null, {
    source: 'ai_profile',
    nowTs
  });
  aiState.policyCache[hostname] = policy;
  const afterSignature = policySignature(policy);

  scheduleAiPersist();

  return {
    hostname,
    policy,
    policyChanged: beforeSignature !== afterSignature,
    acceptedEvents: events.length,
    riskScore: policy.riskScore,
    riskTier: policy.riskTier,
    fallbackTriggered
  };
}

function sendPolicyToTab(tabId, url) {
  if (!tabId || !aiState.enabled || !isManagedPageUrl(url)) return;
  const policy = getPolicyForUrl(url);
  const dispatchPolicy = {
    ...policy,
    dispatchIssuedAt: getNow()
  };
  chrome.tabs.sendMessage(tabId, { action: 'applyAiPolicy', policy: dispatchPolicy }).catch(() => {});
}

function notifyAllPoliciesToAllTabs() {
  if (!aiState.enabled) return;
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id && tab.url && isManagedPageUrl(tab.url)) {
        sendPolicyToTab(tab.id, tab.url);
      }
    });
  });
}

function disableAiMonitorForAllTabs() {
  notifyAllTabs({ action: 'disableAiMonitor' });
  notifyAllTabs({ action: 'clearAIPolicy' });
}

function enableAiMonitorForAllTabs() {
  notifyAllTabs({ action: 'enableAiMonitor' });
}

function buildAiInsightsSnapshot() {
  const profiles = Object.values(aiState.profiles || {});
  profiles.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
  const nowTs = getNow();
  const providerSettings = redactAiProviderSettings(aiState.providerSettings || {}, aiState.providerSecrets);
  const providerState = normalizeAiProviderState(aiState.providerState || {});
  const advisoryHosts = Object.values(aiState.providerAdvisories || {})
    .filter((item) => item && typeof item === 'object')
    .slice(0, 20)
    .map((item) => ({
      hostname: String(item.hostname || ''),
      generatedAt: Number(item.generatedAt || 0),
      confidence: Number(item.confidence || 0),
      model: String(item.model || ''),
      selectorCount: Array.isArray(item.candidateSelectors) ? item.candidateSelectors.length : 0,
      domainCount: Array.isArray(item.candidateDomains) ? item.candidateDomains.length : 0
    }))
    .filter((item) => item.hostname);
  const generatedRuleCandidates = Object.values(normalizeGeneratedRuleCandidates(aiState.generatedRuleCandidates || {}))
    .sort((a, b) => Number(b.generatedAt || 0) - Number(a.generatedAt || 0))
    .slice(0, 20)
    .map((item) => ({
      hostname: item.hostname,
      generatedAt: Number(item.generatedAt || 0),
      model: String(item.model || ''),
      selectorCount: Array.isArray(item.selectorRules) ? item.selectorRules.length : 0,
      domainCount: Array.isArray(item.domainRules) ? item.domainRules.length : 0,
      summary: String(item.summary || '')
    }));

  const activeFallbackHosts = Object.values(aiState.hostFallbacks || {})
    .map((state) => ({
      hostname: String(state.hostname || ''),
      activeUntil: Number(state.activeUntil || 0),
      cooldownUntil: Number(state.cooldownUntil || 0),
      reason: String(state.reason || ''),
      source: String(state.source || '')
    }))
    .filter((state) => state.hostname && nowTs < state.activeUntil)
    .slice(0, 20);

  const hostMetrics = Object.values(aiState.hostMetrics || {})
    .map((metrics) => ({
      hostname: String(metrics.hostname || ''),
      policy_apply_latency: metrics.policy_apply_latency || {
        count: 0,
        totalMs: 0,
        avgMs: 0,
        maxMs: 0,
        lastMs: 0,
        lastAt: 0
      },
      policy_conflict_count: Number(metrics.policy_conflict_count || 0),
      lastConflictAt: Number(metrics.lastConflictAt || 0)
    }))
    .filter((item) => item.hostname)
    .slice(0, 50);
  const knowledge = normalizeAiKnowledgeStore(aiState.knowledgeStore || {});

  return {
    enabled: aiState.enabled,
    policyVersion: AI_POLICY_VERSION,
    policyGateVersion: AI_POLICY_GATE_VERSION,
    providerVersion: AI_PROVIDER_VERSION,
    telemetrySize: aiState.telemetryLog.length,
    provider: {
      settings: providerSettings,
      state: providerState,
      advisoryHosts,
      generatedRuleCandidates
    },
    knowledge: {
      seedCount: Number(knowledge.stats.seedCount || 0),
      confirmedCount: Number(knowledge.stats.confirmedCount || 0),
      candidateCount: Number(knowledge.stats.candidateCount || 0),
      observationCount: Number(knowledge.stats.observationCount || 0),
      teachSessionCount: Number(knowledge.stats.teachSessionCount || 0)
    },
    activeFallbackHosts,
    hostMetrics,
    highRiskHosts: profiles
      .filter((profile) => resolveRiskTier(profile.riskScore || 0) !== 'low')
      .slice(0, 20)
      .map((profile) => {
        const resolvedPolicy = getPolicyForHostname(profile.hostname);
        const fallbackState = getHostFallbackState(profile.hostname, nowTs);
        return {
          hostname: profile.hostname,
          riskScore: Number((profile.riskScore || 0).toFixed(2)),
          riskTier: resolveRiskTier(profile.riskScore || 0),
          events: profile.events || {},
          lastUpdatedAt: profile.lastUpdatedAt || 0,
          policyGateTier: String(resolvedPolicy?.policyGate?.tier || 'T1'),
          policyGateMode: String(resolvedPolicy?.policyGate?.mode || 'advisory-only'),
          policyGateReason: String(resolvedPolicy?.policyGate?.reason || ''),
          fallbackActive: Boolean(resolvedPolicy?.fallbackActive),
          allowedActions: Array.isArray(resolvedPolicy?.policyGate?.allowedActions)
            ? resolvedPolicy.policyGate.allowedActions
            : [],
          evidence: buildPolicyEvidence(profile, fallbackState.active ? fallbackState : null)
        };
      })
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStats') {
    chrome.storage.local.get(['stats'], (result) => {
      sendResponse(result.stats || stats);
    });
    return true;
  }

  if (request.action === 'injectElementPicker') {
    (async () => {
      const tabId = request.tabId || sender.tab?.id;
      if (!tabId) { sendResponse({ success: false, error: 'no tab' }); return; }
      try {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ['content/element-picker.js']
        });
        await dispatchElementPickerEvent(tabId, '__shield_pro_activate_picker__');
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: String(error?.message || error) });
      }
    })();
    return true;
  }

  if (request.action === 'deactivateElementPicker') {
    (async () => {
      const tabId = request.tabId || sender.tab?.id;
      if (!tabId) { sendResponse({ success: false, error: 'no tab' }); return; }
      await dispatchElementPickerEvent(tabId, '__shield_pro_deactivate_picker__');
      sendResponse({ success: true });
    })().catch((error) => {
      sendResponse({ success: false, error: String(error?.message || error) });
    });
    return true;
  }

  if (request.action === 'setExtensionEnabled') {
    (async () => {
      const enabled = request.enabled !== false;
      const targetLevel = enabled ? normalizeActiveBlockingLevel(lastActiveBlockingLevel) : 0;
      const result = await setBlockingLevel(targetLevel, 'setExtensionEnabled');
      sendResponse({ success: true, ...result });
    })().catch((error) => {
      sendResponse({ success: false, error: String(error?.message || error) });
    });
    return true;
  }

  if (request.action === 'setBlockingLevel') {
    (async () => {
      const level = normalizeBlockingLevel(request.level);
      const result = await setBlockingLevel(level, 'setBlockingLevel');
      sendResponse({ success: true, ...result });
    })().catch((error) => {
      sendResponse({ success: false, error: String(error?.message || error) });
    });
    return true;
  }

  if (request.action === 'getBlockingLevel') {
    sendResponse({
      success: true,
      blockingLevel,
      lastActiveBlockingLevel,
      enabled: resolveEnabledByBlockingLevel(blockingLevel)
    });
    return true;
  }

  if (request.action === 'setAiMonitorEnabled') {
    (async () => {
      aiState.enabled = request.enabled !== false;
      scheduleAiPersist();

      if (!aiState.enabled) {
        disableAiMonitorForAllTabs();
      } else if (await isExtensionEnabled()) {
        enableAiMonitorForAllTabs();
        notifyAllPoliciesToAllTabs();
      }

      sendResponse({ success: true, enabled: aiState.enabled });
    })().catch((error) => {
      sendResponse({ success: false, error: String(error?.message || error) });
    });
    return true;
  }

  if (request.action === 'getAiProviderSettings') {
    if (!isTrustedExtensionPageSender(sender)) {
      sendResponse({ success: false, error: 'forbidden_sender' });
      return true;
    }
    sendResponse({
      success: true,
      settings: redactAiProviderSettings(aiState.providerSettings || {}, aiState.providerSecrets),
      keyStates: getAiProviderSecretKeyState(aiState.providerSecrets || {}),
      state: normalizeAiProviderState(aiState.providerState || {})
    });
    return true;
  }

  if (request.action === 'setAiProviderSettings') {
    if (!isTrustedExtensionPageSender(sender)) {
      sendResponse({ success: false, error: 'forbidden_sender' });
      return true;
    }
    (async () => {
      const currentSettings = resolveAiProviderSettings(aiState.providerSettings || {}, aiState.providerSecrets);
      const nextSettings = normalizeAiProviderSettings(request.settings || {});
      const nextSecrets = normalizeAiProviderSecrets(aiState.providerSecrets || {});
      const submittedApiKey = String(nextSettings.apiKey || '').trim();
      if (nextSettings.provider !== 'lmstudio') {
        if (submittedApiKey) {
          nextSecrets[nextSettings.provider] = submittedApiKey;
        } else if (nextSettings.provider === currentSettings.provider && currentSettings.apiKey) {
          nextSecrets[nextSettings.provider] = String(currentSettings.apiKey || '').trim();
        }
      }
      aiState.providerSecrets = nextSecrets;
      aiState.providerSecret = String(nextSecrets[nextSettings.provider] || '').trim();
      aiState.providerSettings = getPersistableAiProviderSettings(nextSettings);
      scheduleAiPersist();
      sendResponse({
        success: true,
        settings: redactAiProviderSettings(aiState.providerSettings, aiState.providerSecrets),
        keyStates: getAiProviderSecretKeyState(aiState.providerSecrets || {}),
        state: normalizeAiProviderState(aiState.providerState || {})
      });
    })().catch((error) => {
      sendResponse({ success: false, error: String(error?.message || error) });
    });
    return true;
  }

  if (request.action === 'runAiProviderHealthCheck') {
    if (!isTrustedExtensionPageSender(sender)) {
      sendResponse({ success: false, error: 'forbidden_sender' });
      return true;
    }
    (async () => {
      const result = await runAiProviderHealthCheck(request.settings || aiState.providerSettings);
      sendResponse(result);
    })().catch((error) => {
      sendResponse({ success: false, error: String(error?.message || error) });
    });
    return true;
  }

  if (request.action === 'resetAiLearning') {
    aiState.profiles = {};
    aiState.telemetryLog = [];
    aiState.policyCache = {};
    aiState.hostMetrics = {};
    aiState.hostFallbacks = {};
    aiState.providerAdvisories = {};
    aiState.generatedRuleCandidates = {};
    aiState.knowledgeStore = buildDefaultAiKnowledgeStore();
    seedAiKnowledgeStore();
    scheduleAiPersist();
    notifyAllTabs({ action: 'clearAIPolicy' });
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'aiClassifyElement') {
    (async () => {
      const hostname =
        getHostname(request.hostname) ||
        getHostname(request.features?.pageUrl) ||
        getHostname(sender?.tab?.url) ||
        'unknown-host';
      const classification = await requestAiElementClassification(hostname, request.features || {});
      sendResponse({
        success: true,
        hostname,
        classification
      });
    })().catch((error) => {
      sendResponse({ success: false, error: String(error?.message || error) });
    });
    return true;
  }

  if (request.action === 'commitTeachObservation') {
    const hostname =
      getHostname(request.hostname) ||
      getHostname(request.features?.pageUrl) ||
      getHostname(sender?.tab?.url) ||
      'unknown-host';
    const result = commitTeachObservation(
      hostname,
      request.features || {},
      request.classification || {},
      String(request.userCategory || '')
    );
    sendResponse({
      success: Boolean(result),
      ...(result || {}),
      snapshot: buildAiInsightsSnapshot()
    });
    return true;
  }

  if (request.action === 'aiTelemetry') {
    (async () => {
      const result = processAiTelemetry(request, sender);
      const hostname = getHostname(result.hostname) || 'unknown-host';

      if (shouldQueryAiProvider(hostname, result.policy, Array.isArray(request.events) ? request.events : [request.event].filter(Boolean))) {
        try {
          const advisory = await requestAiProviderAdvisory(hostname, request.context || {}, result.policy);
          const providerSettings = normalizeAiProviderSettings(aiState.providerSettings || {});
          const mergedPolicy = mergePolicyWithProviderAdvisory(result.policy, advisory, {
            mode: providerSettings.mode
          });
          const updatedPolicy = buildResolvedPolicy(
            hostname,
            getOrCreateProfile(hostname),
            aiState.policyCache[hostname] || null,
            {
              source: 'ai_profile',
              nowTs: getNow()
            }
          );
          aiState.policyCache[hostname] = updatedPolicy || mergedPolicy;
          result.policy = aiState.policyCache[hostname];
          result.policyChanged = true;
          result.provider = {
            advisoryApplied: true,
            provider: advisory.provider || providerSettings.provider,
            model: advisory.model,
            confidence: advisory.confidence
          };
        } catch (error) {
          const providerSettings = normalizeAiProviderSettings(aiState.providerSettings || {});
          aiState.providerState = normalizeAiProviderState({
            ...aiState.providerState,
            lastHealthCheckAt: getNow(),
            lastHealthOk: false,
            lastError: String(error?.message || error),
            lastProvider: providerSettings.provider
          });
          scheduleAiPersist();
          result.provider = {
            advisoryApplied: false,
            provider: providerSettings.provider,
            error: String(error?.message || error)
          };
        }
      }

      if (sender?.tab?.id && result.policyChanged) {
        sendPolicyToTab(sender.tab.id, sender.tab.url || request?.context?.url || '');
      }

      sendResponse({ success: true, ...result });
    })().catch((error) => {
      sendResponse({ success: false, error: String(error?.message || error) });
    });
    return true;
  }

  if (request.action === 'aiPolicyApplied') {
    const payload = request.payload || {};
    const hostname =
      getHostname(payload.hostname) || getHostname(payload.url) || getHostname(sender?.tab?.url) || 'unknown-host';
    const currentPolicy = getPolicyForHostname(hostname);
    const appliedAt = Number(payload.appliedAt || getNow());
    const policyVersion = Number(payload.policyVersion || payload.version || 0);
    const currentVersion = Number(currentPolicy.policyVersion || currentPolicy.version || 0);
    const latencyMs = Number(payload.applyLatencyMs);
    let conflict = Boolean(payload.conflict);

    if (policyVersion > 0 && currentVersion > 0 && policyVersion !== currentVersion) {
      conflict = true;
    }
    if (conflict) {
      recordPolicyConflict(hostname);
    }
    if (Number.isFinite(latencyMs) && latencyMs >= 0) {
      recordPolicyApplyLatency(hostname, latencyMs, appliedAt);
    }

    aiState.policyCache[hostname] = {
      ...currentPolicy,
      appliedAt,
      source: String(payload.source || currentPolicy.source || 'ai_profile')
    };
    scheduleAiPersist();

    sendResponse({
      success: true,
      hostname,
      conflict,
      metrics: getOrCreateHostMetrics(hostname),
      policy: aiState.policyCache[hostname]
    });
    return true;
  }

  if (request.action === 'activateHostFallback') {
    const hostname =
      getHostname(request.hostname) || getHostname(request.url) || getHostname(sender?.tab?.url) || 'unknown-host';
    const activation = activateHostFallback(hostname, {
      reason: String(request.reason || 'manual_override'),
      source: String(request.source || 'host_fallback_manual'),
      durationMs: Number(request.durationMs || AI_HOST_FALLBACK_DURATION_MS),
      cooldownMs: Number(request.cooldownMs || AI_HOST_FALLBACK_COOLDOWN_MS),
      force: request.force === true
    });
    const policy = getPolicyForHostname(hostname, { forceRebuild: true });
    scheduleAiPersist();

    const targetTabId = Number(request.tabId || sender?.tab?.id || 0);
    if (targetTabId > 0 && aiState.enabled) {
      sendPolicyToTab(targetTabId, request.url || sender?.tab?.url || `https://${hostname}`);
    }

    sendResponse({
      success: true,
      hostname,
      activation,
      fallback: getHostFallbackState(hostname),
      policy
    });
    return true;
  }

  if (request.action === 'getAiPolicy') {
    const hostname =
      getHostname(request.hostname) || getHostname(request.url) || getHostname(sender?.tab?.url) || 'unknown-host';
    const policy = getPolicyForHostname(hostname);
    sendResponse({
      success: true,
      enabled: aiState.enabled,
      policy,
      fallback: getHostFallbackState(hostname),
      metrics: getOrCreateHostMetrics(hostname)
    });
    return true;
  }

  if (request.action === 'getAiInsights') {
    sendResponse({ success: true, snapshot: buildAiInsightsSnapshot() });
    return true;
  }

  if (request.action === 'exportAiDataset') {
    sendResponse({
      success: true,
      dataset: {
        exportedAt: getNow(),
        policyVersion: AI_POLICY_VERSION,
        providerVersion: AI_PROVIDER_VERSION,
        telemetry: aiState.telemetryLog,
        profiles: aiState.profiles,
        hostMetrics: aiState.hostMetrics,
        hostFallbacks: aiState.hostFallbacks,
        providerSettings: redactAiProviderSettings(aiState.providerSettings || {}, aiState.providerSecrets),
        providerState: normalizeAiProviderState(aiState.providerState || {}),
        providerAdvisories: aiState.providerAdvisories || {},
        generatedRuleCandidates: normalizeGeneratedRuleCandidates(aiState.generatedRuleCandidates || {}),
        knowledgeStore: normalizeAiKnowledgeStore(aiState.knowledgeStore || {})
      }
    });
    return true;
  }

  if (request.action === 'getAiRuleCandidates') {
    sendResponse({
      success: true,
      candidates: normalizeGeneratedRuleCandidates(aiState.generatedRuleCandidates || {})
    });
    return true;
  }

  if (request.action === 'openPopupPlayer') {
    (async () => {
      const payload = withSenderPopupPlayerContext(request, sender);
      const window = await createPopupPlayerWindow(payload);
      console.log('✅ 彈窗視窗已開啟 (Window ID:', window.id, ')');
      sendResponse({ success: true, windowId: window.id });
    })().catch((error) => {
      const message = String(error?.message || error);
      console.error('❌ 無法開啟彈窗視窗:', message);
      sendResponse({ success: false, error: message });
    });
    return true;
  }

  if (request.action === 'openPinnedControlPopup') {
    (async () => {
      const targetTabId = Number(request.tabId || sender?.tab?.id || 0);
      const result = await openPinnedControlSidePanel(targetTabId);
      sendResponse({ success: true, tabId: result.tabId });
    })().catch((error) => {
      const message = String(error?.message || error);
      console.error('❌ 無法開啟釘選控制視窗:', message);
      sendResponse({ success: false, error: message });
    });
    return true;
  }

  if (request.action === 'closePinnedControlPopup') {
    (async () => {
      const targetTabId = Number(request.tabId || sender?.tab?.id || 0);
      const result = await closePinnedControlSidePanel(targetTabId);
      let popupOpened = false;
      let popupOpenError = '';

      if (request.reopenActionPopup === true) {
        try {
          const openResult = await openActionPopupForTab(targetTabId);
          popupOpened = openResult.opened === true;
        } catch (error) {
          popupOpenError = String(error?.message || error);
        }
      }

      sendResponse({
        success: true,
        tabId: result.tabId,
        popupOpened,
        popupOpenError
      });
    })().catch((error) => {
      const message = String(error?.message || error);
      console.error('❌ 無法關閉釘選控制視窗:', message);
      sendResponse({ success: false, error: message });
    });
    return true;
  }

  if (request.action === 'getPinnedControlPopupState') {
    (async () => {
      const targetTabId = Number(request.tabId || sender?.tab?.id || 0);
      if (!Number.isFinite(targetTabId) || targetTabId <= 0) {
        sendResponse({ success: false, error: 'missing_tab_id' });
        return;
      }
      if (!chrome.sidePanel?.getOptions) {
        sendResponse({ success: true, enabled: false, tabId: targetTabId });
        return;
      }
      const options = await chrome.sidePanel.getOptions({ tabId: targetTabId });
      // manifest declares side_panel.default_path, so getOptions always returns
      // enabled:true.  Only consider it "pinned" when the path was explicitly set
      // by openPinnedControlSidePanel (which appends ?pinned=1).
      const isPinned = options?.enabled === true &&
        String(options?.path || '').includes('pinned=1');
      sendResponse({
        success: true,
        tabId: targetTabId,
        enabled: isPinned,
        path: String(options?.path || '')
      });
    })().catch((error) => {
      const message = String(error?.message || error);
      sendResponse({ success: false, error: message });
    });
    return true;
  }

  if (request.action === 'setPopupPlayerPin') {
    const windowId = String(request.chromeWindowId || '');
    if (!windowId) {
      sendResponse({ success: false, error: 'missing_window_id' });
      return true;
    }

    const pinned = request.pinned === true;
    if (!pinned) {
      delete pinnedPopupPlayers[windowId];
      persistPinnedPopupPlayers().catch(() => {});
      sendResponse({ success: true, pinned: false, windowId: Number(windowId) });
      return true;
    }

    const payload = sanitizePopupPlayerPayload(request);
    payload.pin = true;
    pinnedPopupPlayers[windowId] = {
      pinned: true,
      payload,
      updatedAt: getNow()
    };
    persistPinnedPopupPlayers().catch(() => {});
    sendResponse({ success: true, pinned: true, windowId: Number(windowId) });
    return true;
  }

  if (request.type === 'UPDATE_STATS') {
    updateStatsWith((next) => {
      next.totalBlocked += Number(request.count || 0);
    }).catch(() => {});
    return;
  }

  if (request.action === 'popupBlocked') {
    updateStatsWith((next) => {
      next.popupsBlocked += 1;
      next.totalBlocked += 1;
    }).catch(() => {});
    return;
  }

  if (request.action === 'updateOverlayStats') {
    const removed = Math.max(0, Number(request.removed || 0));
    updateStatsWith((next) => {
      next.overlaysRemoved += removed;
      next.totalBlocked += removed;
    }).catch(() => {});
    return;
  }

  if (request.action === 'updatePlayerCount') {
    console.log(`🎬 偵測到 ${request.count} 個播放器`);
    return;
  }

  if (request.action === 'checkWhitelist') {
    isWhitelisted(request.url).then((result) => {
      sendResponse({ whitelisted: result });
    });
    return true;
  }

  if (request.action === 'hideElement') {
    chrome.storage.local.get(['hiddenElements'], (result) => {
      const rules = result.hiddenElements || [];
      const selector = String(request.selector || '').trim();
      const selectors = [...new Set(
        (Array.isArray(request.selectors) ? request.selectors : [selector])
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )];
      const hostname = String(request.hostname || '').trim().toLowerCase();
      const duplicateIndex = rules.findIndex((rule) => rule.selector === selector && String(rule.hostname || '').trim().toLowerCase() === hostname);
      const duplicate = duplicateIndex >= 0;
      const nextRules = duplicate
        ? rules.map((rule, index) => {
            if (index !== duplicateIndex) return rule;
            const existingSelectors = Array.isArray(rule.selectors) ? rule.selectors : [rule.selector].filter(Boolean);
            return {
              ...rule,
              selectors: [...new Set(existingSelectors.concat(selectors))]
            };
          })
        : rules.concat({
            selector,
            selectors,
            hostname,
            timestamp: Date.now()
          });
      chrome.storage.local.set({ hiddenElements: nextRules }, () => {
        if (!duplicate) {
          console.log('🎯 已儲存隱藏規則:', selector);
        }
        refreshCosmeticRulesForAllTabs();
        sendResponse({ success: true, duplicate });
      });
    });
    return true;
  }

  if (request.action === 'getCustomRules') {
    chrome.storage.local.get(['hiddenElements'], (result) => {
      sendResponse(result.hiddenElements || []);
    });
    return true;
  }

  if (request.action === 'activatePicker') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'activatePicker' }, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse({ success: false });
      }
    });
    return true;
  }

  if (request.action === 'deactivatePicker') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'deactivatePicker' }, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse({ success: false });
      }
    });
    return true;
  }

  if (request.action === 'clearHiddenRules') {
    chrome.storage.local.set({ hiddenElements: [] }, () => {
      console.log('🗑️ 已清除所有隱藏規則');
      refreshCosmeticRulesForAllTabs();
      sendResponse({ success: true });
    });
    return true;
  }
  if (request.action === 'getSiteRegistry') {
    (async () => {
      await loadSiteRegistry();
      sendResponse({
        success: true,
        domains: getBuiltinEnhancedDomains(),
        keywords: SITE_REGISTRY.toDomainKeywords()
      });
    })().catch((error) => {
      sendResponse({ success: false, error: String(error?.message || error) });
    });
    return true;
  }

  if (request.action === 'openInSandbox') {
    const sandboxUrl = chrome.runtime.getURL('sandbox/sandbox.html') + '?url=' + encodeURIComponent(request.url);
    chrome.tabs.create({ url: sandboxUrl });
    return;
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) {
    return;
  }

  if (!isManagedPageUrl(tab.url)) {
    return;
  }

  if (directPopupOverlayTabs[String(tabId)]) {
    injectDirectPopupOverlay(tabId, tab.url).catch(() => {});
  }

  const [enabled, whitelisted] = await Promise.all([isExtensionEnabled(), isWhitelisted(tab.url)]);

  if (!enabled || whitelisted) {
    chrome.tabs.sendMessage(tabId, { action: 'disableBlocking' }).catch(() => {});
    sendMessageToTab(tabId, { action: 'deactivateElementPicker' }).catch(() => {});
    chrome.tabs.sendMessage(tabId, { action: 'disableAiMonitor' }).catch(() => {});

    if (whitelisted) {
      console.log('⚪ 白名單網站:', tab.url);
    }
    return;
  }

  if (aiState.enabled) {
    sendPolicyToTab(tabId, tab.url);
  }

  chrome.tabs
    .sendMessage(tabId, {
      action: 'applyBlockingLevel',
      level: blockingLevel,
      source: 'tab_updated'
    })
    .catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const key = String(tabId);
  if (directPopupOverlayTabs[key]) {
    delete directPopupOverlayTabs[key];
  }
});

chrome.action?.onClicked?.addListener((tab) => {
  const targetTabId = Number(tab?.id || 0);
  if (!Number.isFinite(targetTabId) || targetTabId <= 0) {
    return;
  }
  openDefaultControlSidePanel(targetTabId).catch(() => {});
});

chrome.contextMenus?.onClicked?.addListener(async (info, tab) => {
  if (info?.menuItemId === ACTION_MENU_IDS.openSidebar) {
    const targetTabId = Number(tab?.id || info?.tabId || 0);
    await openDefaultControlSidePanel(targetTabId).catch((error) => {
      console.error('❌ 無法開啟 SIDEBAR 視窗:', String(error?.message || error));
    });
    return;
  }

  if (info?.menuItemId === ACTION_MENU_IDS.openPopup) {
    const targetTabId = Number(tab?.id || info?.tabId || 0);
    await openActionPopupWindowForTab(targetTabId).catch((error) => {
      console.error('❌ 無法開啟 POPUP 視窗:', String(error?.message || error));
    });
  }
});

chrome.windows.onRemoved.addListener((removedWindowId) => {
  Object.keys(directPopupOverlayTabs).forEach((tabId) => {
    if (directPopupOverlayTabs[tabId]?.windowId === removedWindowId) {
      delete directPopupOverlayTabs[tabId];
    }
  });

  const key = String(removedWindowId);
  const entry = pinnedPopupPlayers[key];
  if (!entry || !entry.pinned) {
    if (entry) {
      delete pinnedPopupPlayers[key];
      persistPinnedPopupPlayers().catch(() => {});
    }
    return;
  }

  const payload = sanitizePopupPlayerPayload(entry.payload || {});
  payload.pin = true;
  delete pinnedPopupPlayers[key];

  createPopupPlayerWindow(payload)
    .then((newWindow) => {
      const nextKey = String(newWindow.id);
      pinnedPopupPlayers[nextKey] = {
        pinned: true,
        payload: {
          ...payload,
          pin: true
        },
        updatedAt: getNow()
      };
      return persistPinnedPopupPlayers();
    })
    .catch((error) => {
      console.error('❌ 無法重建已釘選彈窗視窗:', String(error?.message || error));
      persistPinnedPopupPlayers().catch(() => {});
    });
});

setInterval(() => {
  chrome.storage.local.get(['stats']).then((result) => {
    const merged = normalizeStats({ ...(result.stats || {}), ...stats });
    stats = merged;
    return chrome.storage.local.set({ stats: merged });
  }).catch(() => {});
}, 5 * 60 * 1000);

setInterval(() => {
  persistAiState().catch(() => {});
}, 2 * 60 * 1000);





