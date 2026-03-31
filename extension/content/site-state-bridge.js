// ============================================================================
// Falcon-Player-Enhance - Site State Bridge
// ============================================================================
// document_start / ISOLATED
// 將 extension storage 的最小站點狀態橋接到頁面，供 MAIN world 腳本使用
// ============================================================================

(function () {
    'use strict';

    function normalizeDomainList(domains) {
        if (!Array.isArray(domains)) return [];
        return [...new Set(
            domains
                .map((domain) => String(domain || '').trim().toLowerCase())
                .filter(Boolean)
        )];
    }

    function emitSiteState() {
        chrome.storage.local.get(['whitelist', 'whitelistEnhanceOnly'], (result) => {
            window.postMessage({
                type: '__SHIELD_SITE_STATE__',
                payload: {
                    whitelistDomains: normalizeDomainList(result.whitelist),
                    whitelistEnhanceOnly: result.whitelistEnhanceOnly !== false
                }
            }, '*');
        });
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== '__SHIELD_REQUEST_SITE_STATE__') return;
        emitSiteState();
    });

    emitSiteState();
})();
