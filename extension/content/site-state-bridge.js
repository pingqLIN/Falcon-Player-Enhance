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
        return {
            whitelistDomains: [...state.whitelistDomains],
            whitelistEnhanceOnly: state.whitelistEnhanceOnly
        };
    }

    function emitSiteState(payload = null) {
        window.postMessage({
            type: '__SHIELD_SITE_STATE__',
            payload: payload || {
                whitelistDomains: [...state.whitelistDomains],
                whitelistEnhanceOnly: state.whitelistEnhanceOnly
            }
        }, '*');
    }

    function loadStateFromStorage() {
        chrome.storage.local.get(['whitelist', 'whitelistEnhanceOnly'], (result) => {
            emitSiteState(applyState({
                whitelistDomains: result.whitelist,
                whitelistEnhanceOnly: result.whitelistEnhanceOnly
            }));
        });
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== '__SHIELD_REQUEST_SITE_STATE__') return;
        emitSiteState();
    });

    if (chrome.storage?.onChanged?.addListener) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            if (!changes.whitelist && !changes.whitelistEnhanceOnly) return;

            emitSiteState(applyState({
                whitelistDomains: changes.whitelist
                    ? changes.whitelist.newValue
                    : state.whitelistDomains,
                whitelistEnhanceOnly: changes.whitelistEnhanceOnly
                    ? changes.whitelistEnhanceOnly.newValue
                    : state.whitelistEnhanceOnly
            }));
        });
    }

    loadStateFromStorage();
})();
