// ============================================================================
// Falcon-Player-Enhance - Site State Helper
// ============================================================================
// document_idle / ISOLATED
// 為 doc_idle content scripts 提供 canonical site state，避免各模組各自讀取 storage
// ============================================================================

(function () {
    'use strict';

    if (window.__ShieldSiteStateHelper) {
        return;
    }

    const DEFAULT_STATE = Object.freeze({
        whitelistDomains: [],
        whitelistEnhanceOnly: true
    });

    let state = {
        whitelistDomains: [],
        whitelistEnhanceOnly: true
    };
    let loadPromise = null;
    const listeners = new Set();

    function normalizeHostname(hostname) {
        return String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
    }

    function normalizeDomainList(domains) {
        if (!Array.isArray(domains)) return [];
        return [...new Set(
            domains
                .map((domain) => normalizeHostname(domain))
                .filter(Boolean)
        )];
    }

    function getStateSnapshot() {
        return {
            whitelistDomains: [...state.whitelistDomains],
            whitelistEnhanceOnly: state.whitelistEnhanceOnly !== false
        };
    }

    function applyState(nextState = {}) {
        state = {
            whitelistDomains: normalizeDomainList(nextState.whitelistDomains),
            whitelistEnhanceOnly: nextState.whitelistEnhanceOnly !== false
        };
        return getStateSnapshot();
    }

    function emitStateChange() {
        const snapshot = getStateSnapshot();
        listeners.forEach((listener) => {
            try {
                listener(snapshot);
            } catch (_) {}
        });
    }

    function readStateFromStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['whitelist', 'whitelistEnhanceOnly'], (result) => {
                resolve(applyState({
                    whitelistDomains: result.whitelist,
                    whitelistEnhanceOnly: result.whitelistEnhanceOnly
                }));
            });
        });
    }

    function loadState() {
        if (loadPromise) return loadPromise;
        loadPromise = readStateFromStorage().finally(() => {
            loadPromise = null;
        });
        return loadPromise;
    }

    function isWhitelistedHost(hostname = window.location.hostname) {
        const host = normalizeHostname(hostname);
        return state.whitelistDomains.some((domain) => host === domain || host.endsWith('.' + domain));
    }

    function shouldRunCleanup(hostname = window.location.hostname) {
        return !(isWhitelistedHost(hostname) && state.whitelistEnhanceOnly);
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }

    if (chrome.storage?.onChanged?.addListener) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            if (!changes.whitelist && !changes.whitelistEnhanceOnly) return;

            const nextWhitelist = changes.whitelist
                ? changes.whitelist.newValue
                : state.whitelistDomains;
            const nextWhitelistEnhanceOnly = changes.whitelistEnhanceOnly
                ? changes.whitelistEnhanceOnly.newValue
                : state.whitelistEnhanceOnly;

            applyState({
                whitelistDomains: nextWhitelist,
                whitelistEnhanceOnly: nextWhitelistEnhanceOnly
            });
            emitStateChange();
        });
    }

    applyState(DEFAULT_STATE);

    window.__ShieldSiteStateHelper = {
        load: loadState,
        getState: getStateSnapshot,
        isWhitelistedHost,
        shouldRunCleanup,
        subscribe
    };
})();
