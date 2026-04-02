// ============================================================================
// Falcon-Player-Enhance - Site State Bridge
// ============================================================================
// document_start / ISOLATED
// 將 extension storage 的最小站點狀態橋接到頁面，供 MAIN world 腳本使用
// ============================================================================

(function () {
    'use strict';

    let state = {
        whitelistDomains: [],
        whitelistEnhanceOnly: true
    };
    let stateReady = false;

    function buildPayload() {
        return {
            whitelistDomains: [...state.whitelistDomains],
            whitelistEnhanceOnly: state.whitelistEnhanceOnly,
            siteStateHydrated: stateReady
        };
    }

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

    function applyState(nextState = {}) {
        state = {
            whitelistDomains: normalizeDomainList(nextState.whitelistDomains),
            whitelistEnhanceOnly: nextState.whitelistEnhanceOnly !== false
        };
        return buildPayload();
    }

    function emitSiteState(payload = null) {
        window.postMessage({
            type: '__SHIELD_SITE_STATE__',
            payload: payload
                ? {
                    ...payload,
                    siteStateHydrated: true
                }
                : buildPayload()
        }, '*');
    }

    function loadStateFromStorage() {
        chrome.storage.local.get(['whitelist', 'whitelistEnhanceOnly'], (result) => {
            applyState({
                whitelistDomains: result.whitelist,
                whitelistEnhanceOnly: result.whitelistEnhanceOnly
            });
            stateReady = true;
            emitSiteState();
        });
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== '__SHIELD_REQUEST_SITE_STATE__') return;
        if (!stateReady) return;
        emitSiteState();
    });

    if (chrome.storage?.onChanged?.addListener) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            if (!changes.whitelist && !changes.whitelistEnhanceOnly) return;

            applyState({
                whitelistDomains: changes.whitelist
                    ? changes.whitelist.newValue
                    : state.whitelistDomains,
                whitelistEnhanceOnly: changes.whitelistEnhanceOnly
                    ? changes.whitelistEnhanceOnly.newValue
                    : state.whitelistEnhanceOnly
            });
            stateReady = true;
            emitSiteState();
        });
    }

    loadStateFromStorage();
})();
