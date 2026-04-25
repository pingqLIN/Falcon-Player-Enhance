(function initProtectionStatusContract(globalScope) {
  'use strict';

  const MODES = Object.freeze({
    DISABLED: 'disabled',
    WHITELIST_ONLY: 'whitelist_only',
    COMPANION: 'companion',
    STANDALONE: 'standalone',
    AI_EXPANDED: 'ai_expanded'
  });

  const LEVELS = Object.freeze({
    OFF: 'off',
    STANDARD: 'standard',
    HARDENED: 'hardened'
  });

  function normalizeLevel(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return LEVELS.OFF;
    if (numeric >= 3) return LEVELS.HARDENED;
    return LEVELS.STANDARD;
  }

  function normalizeLastEvent(event) {
    if (!event || typeof event !== 'object') return null;
    return {
      type: String(event.type || 'unknown'),
      at: String(event.at || ''),
      source: String(event.source || ''),
      detail: event.detail && typeof event.detail === 'object' ? { ...event.detail } : {}
    };
  }

  function buildActiveGuards(input, level, mode) {
    if (mode === MODES.DISABLED || mode === MODES.WHITELIST_ONLY) return [];

    const guards = [];
    if (input.popupGuardEnabled !== false) guards.push('popup_guard');
    if (input.sameTabRedirectGuardEnabled !== false) guards.push('external_navigation_guard');
    if (input.overlayCleanupEnabled !== false) guards.push('overlay_cleanup');
    if (input.fakeVideoCleanupEnabled !== false) guards.push('fake_video_cleanup');
    if (level === LEVELS.HARDENED) guards.push('strict_mode');
    if (mode === MODES.AI_EXPANDED) guards.push('ai_advisory');
    return guards;
  }

  function buildUserOverride(input) {
    return {
      whitelisted: input.hostWhitelisted === true,
      whitelistEnhanceOnly: input.whitelistEnhanceOnly !== false,
      siteDisabled: input.siteDisabled === true,
      temporaryAllowNavigation: input.temporaryAllowNavigation === true
    };
  }

  function resolveMode(input, level, override) {
    if (input.extensionEnabled === false || level === LEVELS.OFF || override.siteDisabled) {
      return MODES.DISABLED;
    }

    if (override.whitelisted && override.whitelistEnhanceOnly) {
      return MODES.WHITELIST_ONLY;
    }

    if (
      input.aiMonitorEnabled === true &&
      input.aiAdvisoryActive === true &&
      input.aiPolicyAllowsReversibleActions !== false
    ) {
      return MODES.AI_EXPANDED;
    }

    if (input.standaloneMode === true) {
      return MODES.STANDALONE;
    }

    return MODES.COMPANION;
  }

  function buildProtectionStatus(input) {
    const source = input && typeof input === 'object' ? input : {};
    const level = normalizeLevel(source.blockingLevel);
    const userOverride = buildUserOverride(source);
    const mode = resolveMode(source, level, userOverride);

    return {
      schemaVersion: 1,
      mode,
      protectionLevel: mode === MODES.DISABLED || mode === MODES.WHITELIST_ONLY ? LEVELS.OFF : level,
      activeGuards: buildActiveGuards(source, level, mode),
      lastEvent: normalizeLastEvent(source.lastEvent),
      userOverride,
      labels: {
        mode,
        protectionLevel: mode === MODES.DISABLED || mode === MODES.WHITELIST_ONLY ? LEVELS.OFF : level
      }
    };
  }

  const api = Object.freeze({
    MODES,
    LEVELS,
    buildProtectionStatus
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.FalconProtectionStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
