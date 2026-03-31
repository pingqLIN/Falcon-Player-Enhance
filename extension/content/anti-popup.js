// ============================================================================
// Falcon-Player-Enhance - Anti-Popup v4 (Player Protection Edition)
// ============================================================================
// 專注於 DOM 層面的覆蓋層偵測與移除
// API 攔截已由 inject-blocker.js (MAIN world) 處理
// ============================================================================

(function () {
    'use strict';

    // 此腳本已透過 content script matches 限定只在播放器站點載入
    const IS_PLAYER_SITE = true;
    const DEFAULT_COMPATIBILITY_MODE_SITES = [
        'boyfriendtv.com'
    ];
    let compatibilityModeSites = DEFAULT_COMPATIBILITY_MODE_SITES.slice();
    let siteProfilesLoadPromise = null;

    function isCompatibilityModeSite() {
        const host = window.location.hostname.toLowerCase();
        return compatibilityModeSites.some((domain) => host === domain || host.endsWith('.' + domain));
    }

    function normalizeHostname(hostname) {
        return String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
    }

    function normalizeDomainList(domains = []) {
        return [...new Set(
            (Array.isArray(domains) ? domains : [])
                .map((domain) => normalizeHostname(domain))
                .filter(Boolean)
        )];
    }

    function loadSiteProfiles() {
        if (siteProfilesLoadPromise) return siteProfilesLoadPromise;

        siteProfilesLoadPromise = new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({ action: 'getSiteRegistry' }, (response) => {
                    const runtimeFailed = chrome.runtime.lastError || !response?.success;
                    if (runtimeFailed) {
                        compatibilityModeSites = DEFAULT_COMPATIBILITY_MODE_SITES.slice();
                        resolve(compatibilityModeSites);
                        return;
                    }

                    const profileDomains = response?.profiles?.compatibilityModeSites;
                    const configuredDomains = normalizeDomainList(profileDomains);
                    compatibilityModeSites = Array.isArray(profileDomains)
                        ? configuredDomains
                        : DEFAULT_COMPATIBILITY_MODE_SITES.slice();
                    resolve(compatibilityModeSites);
                });
            } catch (_) {
                compatibilityModeSites = DEFAULT_COMPATIBILITY_MODE_SITES.slice();
                resolve(compatibilityModeSites);
            }
        });

        return siteProfilesLoadPromise;
    }

    function isPlayerSite() {
        return IS_PLAYER_SITE;
    }

    // ========== 年齡驗證守衛 ==========
    const AGE_GATE_SIGNALS = [
        'age-gate', 'agegate', 'age-check', 'agecheck',
        'age-verify', 'ageverif', 'age-wall', 'agewall',
        'age-modal', 'age-overlay', 'age-confirm'
    ];
    const AGE_GATE_TEXT_KEYWORDS = [
        'age verification', 'verify your age', 'must be 18', 'are you 18',
        'i am 18', 'legal age', '18 years', 'adults only', 'enter site',
        'leave this site', 'by entering', 'confirm age'
    ];
    function isAgeVerificationOverlay(element) {
        if (!element) return false;
        const cl = (element.className || '').toString().toLowerCase();
        const id = (element.id || '').toLowerCase();
        if (AGE_GATE_SIGNALS.some(s => (cl + ' ' + id).includes(s))) return true;
        const text = (element.innerText || element.textContent || '').toLowerCase().substring(0, 1000);
        if (AGE_GATE_TEXT_KEYWORDS.some(kw => text.includes(kw))) {
            if (element.querySelector('button, a[href], input[type="submit"], form')) return true;
        }
        return false;
    }

    // ========== 移除 inset-0 fixed 覆蓋層 ==========
    function removeInsetOverlays() {
        const elements = document.querySelectorAll('div, span, section');

        elements.forEach(element => {
            try {
                let className = '';
                if (element.className) {
                    if (typeof element.className === 'string') {
                        className = element.className;
                    } else if (element.className.baseVal) {
                        className = element.className.baseVal;
                    }
                }

                // 偵測 inset-0 fixed 或 pointer-events-auto 模式
                const hasInset = className.includes('inset-0') || className.includes('inset-');
                const hasFixed = className.includes('fixed');
                const hasPointerEvents = className.includes('pointer-events-auto');

                if ((hasInset && hasFixed) || (hasFixed && hasPointerEvents)) {
                    // 檢查是否包含視頻播放器
                    const hasPlayer = element.querySelector('video, iframe');
                    if (!hasPlayer) {
                        // 保護年齡驗證對話框
                        if (isAgeVerificationOverlay(element)) return;

                        element.style.display = 'none';
                        element.style.pointerEvents = 'none';
                        element.remove();
                    }
                }
            } catch (e) { }
        });
    }

    // ========== 標記播放器 iframe ==========
    function protectPlayerIframes() {
        const iframes = document.querySelectorAll('iframe');

        iframes.forEach(iframe => {
            const src = iframe.src || '';
            const isPlayer =
                src.includes('player') ||
                src.includes('myvidplay') ||
                src.includes('embed') ||
                src.includes('video');

            if (isPlayer && !iframe.dataset.protected) {
                iframe.dataset.protected = 'true';
            }
        });
    }

    // ========== 初始化 ==========
    function startProtection() {
        if (!isPlayerSite()) {
            return;
        }

        if (isCompatibilityModeSite()) {
            console.log('🧩 [Falcon-Player-Enhance] Anti-Popup 相容模式啟用，已停用侵入式覆蓋層清理');
            return;
        }

        // 立即執行
        removeInsetOverlays();
        protectPlayerIframes();

        // 定期掃描
        setInterval(() => {
            removeInsetOverlays();
            protectPlayerIframes();
        }, 1000);

        // DOM 變化時掃描
        const observer = new MutationObserver(() => {
            removeInsetOverlays();
        });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, { childList: true, subtree: true });
            });
        }
        
        console.log('🛡️ [Falcon-Player-Enhance] Anti-Popup (播放器版) 已啟動');
    }

    function init() {
        loadSiteProfiles()
            .catch(() => [])
            .finally(() => {
                startProtection();
            });
    }

    init();
})();
