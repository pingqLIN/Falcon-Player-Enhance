// ============================================================================
// Falcon-Player-Enhance - Site State Helper
// ============================================================================
// document_idle / ISOLATED
// 為 doc_idle content scripts 提供 canonical site state，避免各模組各自讀取 storage
// 同時集中判定互動敏感頁，避免登入 / 表單 / OAuth 頁被 media automation 誤傷
// ============================================================================

(function () {
    'use strict';

    if (window.__ShieldSiteStateHelper) {
        return;
    }

    const AUTH_TEXT_PATTERN = /\b(sign[\s-]?in|log[\s-]?in|login|sign[\s-]?up|register|create account|continue with|sign in with|login with|verify|verification|password|passcode|magic link|two-factor|2fa|otp|one[-\s]?time|checkout|billing|payment)\b/i;
    const OAUTH_TEXT_PATTERN = /\b(google|github|microsoft|apple|discord|facebook|continue with|sign in with|login with)\b/i;
    const INPUT_NAME_PATTERN = /(email|user(name)?|login|password|passcode|otp|code|verify|card|payment|billing)/i;
    const OBSERVER_ATTRIBUTE_FILTER = ['type', 'name', 'id', 'class', 'style', 'hidden', 'autocomplete', 'role', 'src'];

    const DEFAULT_INTERACTION_SAFETY = Object.freeze({
        interactionSensitivePage: false,
        authLikePage: false,
        formLikePage: false,
        hasProminentMedia: false,
        signalCount: 0,
        signals: []
    });

    const DEFAULT_STATE = Object.freeze({
        whitelistDomains: [],
        whitelistEnhanceOnly: true,
        mediaAutomationExcludedDomains: [],
        interactionSafety: DEFAULT_INTERACTION_SAFETY
    });

    let state = {
        whitelistDomains: [],
        whitelistEnhanceOnly: true,
        mediaAutomationExcludedDomains: [],
        interactionSafety: { ...DEFAULT_INTERACTION_SAFETY }
    };
    let loadPromise = null;
    let siteProfilesPromise = null;
    let recomputeTimer = null;
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

    function normalizeInteractionSafety(nextSafety = {}) {
        return {
            interactionSensitivePage: nextSafety.interactionSensitivePage === true,
            authLikePage: nextSafety.authLikePage === true,
            formLikePage: nextSafety.formLikePage === true,
            hasProminentMedia: nextSafety.hasProminentMedia === true,
            signalCount: Math.max(0, Number(nextSafety.signalCount || 0)),
            signals: Array.isArray(nextSafety.signals)
                ? nextSafety.signals.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 16)
                : []
        };
    }

    function getStateSnapshot() {
        return {
            whitelistDomains: [...state.whitelistDomains],
            whitelistEnhanceOnly: state.whitelistEnhanceOnly !== false,
            mediaAutomationExcludedDomains: [...state.mediaAutomationExcludedDomains],
            interactionSafety: normalizeInteractionSafety(state.interactionSafety)
        };
    }

    function isElementVisible(element) {
        if (!(element instanceof Element)) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle(element);
        if (!style) return false;
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (parseFloat(style.opacity || '1') === 0) return false;
        return true;
    }

    function getElementText(element) {
        if (!(element instanceof Element)) return '';
        return [
            element.textContent || '',
            element.getAttribute?.('aria-label') || '',
            element.getAttribute?.('title') || '',
            element.getAttribute?.('value') || '',
            element.getAttribute?.('placeholder') || ''
        ].join(' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    }

    function collectVisibleElements(selector) {
        return Array.from(document.querySelectorAll(selector)).filter(isElementVisible);
    }

    function collectInteractionSafety() {
        const signals = new Set();
        const visibleForms = collectVisibleElements('form');
        const visibleInputs = collectVisibleElements('input, textarea, select').filter((element) => {
            const type = String(element.getAttribute('type') || '').toLowerCase();
            return !['hidden', 'submit', 'button', 'image', 'reset'].includes(type);
        });
        const passwordInputs = visibleInputs.filter((element) => String(element.getAttribute('type') || '').toLowerCase() === 'password');
        const namedSensitiveInputs = visibleInputs.filter((element) => {
            const tokens = [
                element.getAttribute('type') || '',
                element.getAttribute('name') || '',
                element.getAttribute('id') || '',
                element.getAttribute('autocomplete') || '',
                element.getAttribute('placeholder') || ''
            ].join(' ');
            return INPUT_NAME_PATTERN.test(tokens);
        });
        const clickableAuthElements = collectVisibleElements('button, input[type="submit"], input[type="button"], [role="button"], a[href]')
            .filter((element) => AUTH_TEXT_PATTERN.test(getElementText(element)));
        const oauthElements = clickableAuthElements.filter((element) => OAUTH_TEXT_PATTERN.test(getElementText(element)));
        const authTextSources = collectVisibleElements('main, form, section, article, h1, h2, h3, button, [role="button"]')
            .map(getElementText)
            .filter(Boolean)
            .slice(0, 24);
        const authTextHits = authTextSources.filter((text) => AUTH_TEXT_PATTERN.test(text)).length;
        const prominentMedia = collectVisibleElements('video, iframe').some((element) => {
            const rect = element.getBoundingClientRect();
            if (element.tagName === 'VIDEO' && element.controls && rect.width >= 240 && rect.height >= 135) {
                return true;
            }
            return rect.width >= 320 && rect.height >= 180;
        });

        if (passwordInputs.length > 0) signals.add('password_input');
        if (namedSensitiveInputs.length >= 2) signals.add('sensitive_inputs');
        if (visibleForms.length > 0 && visibleInputs.length >= 2) signals.add('multi_input_form');
        if (clickableAuthElements.length > 0) signals.add('auth_action');
        if (oauthElements.length > 0) signals.add('oauth_action');
        if (authTextHits > 0) signals.add('auth_text');
        if (prominentMedia) signals.add('prominent_media');

        const authLikePage =
            passwordInputs.length > 0 ||
            oauthElements.length > 0 ||
            (clickableAuthElements.length > 0 && authTextHits > 0);
        const formLikePage =
            visibleForms.length > 0 &&
            visibleInputs.length >= 2 &&
            clickableAuthElements.length > 0;
        const interactionSensitivePage = authLikePage || formLikePage;

        return normalizeInteractionSafety({
            interactionSensitivePage,
            authLikePage,
            formLikePage,
            hasProminentMedia: prominentMedia,
            signalCount: signals.size,
            signals: Array.from(signals)
        });
    }

    function applyState(nextState = {}) {
        state = {
            whitelistDomains: normalizeDomainList(nextState.whitelistDomains),
            whitelistEnhanceOnly: nextState.whitelistEnhanceOnly !== false,
            mediaAutomationExcludedDomains: normalizeDomainList(nextState.mediaAutomationExcludedDomains),
            interactionSafety: normalizeInteractionSafety(nextState.interactionSafety || state.interactionSafety)
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

    function recomputeInteractionSafety() {
        const nextSafety = collectInteractionSafety();
        const previous = JSON.stringify(state.interactionSafety);
        const next = JSON.stringify(nextSafety);
        if (previous === next) {
            return getStateSnapshot();
        }
        state = {
            ...state,
            interactionSafety: nextSafety
        };
        emitStateChange();
        return getStateSnapshot();
    }

    function scheduleInteractionSafetyRefresh() {
        clearTimeout(recomputeTimer);
        recomputeTimer = setTimeout(() => {
            recomputeInteractionSafety();
        }, 180);
    }

    function readStateFromStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['whitelist', 'whitelistEnhanceOnly'], (result) => {
                applyState({
                    whitelistDomains: result.whitelist,
                    whitelistEnhanceOnly: result.whitelistEnhanceOnly,
                    mediaAutomationExcludedDomains: state.mediaAutomationExcludedDomains,
                    interactionSafety: collectInteractionSafety()
                });
                resolve(getStateSnapshot());
            });
        });
    }

    function loadSiteProfiles() {
        if (siteProfilesPromise) return siteProfilesPromise;
        siteProfilesPromise = new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({ action: 'getSiteRegistry' }, (response) => {
                    const failed = chrome.runtime.lastError || !response?.success;
                    if (failed) {
                        resolve(getStateSnapshot());
                        return;
                    }

                    applyState({
                        whitelistDomains: state.whitelistDomains,
                        whitelistEnhanceOnly: state.whitelistEnhanceOnly,
                        mediaAutomationExcludedDomains: response?.profiles?.mediaAutomationExcludedDomains,
                        interactionSafety: state.interactionSafety
                    });
                    resolve(getStateSnapshot());
                });
            } catch (_) {
                resolve(getStateSnapshot());
            }
        }).finally(() => {
            siteProfilesPromise = null;
        });

        return siteProfilesPromise;
    }

    function loadState() {
        if (loadPromise) return loadPromise;
        loadPromise = Promise.all([loadSiteProfiles(), readStateFromStorage()]).then(() => getStateSnapshot()).finally(() => {
            loadPromise = null;
        });
        return loadPromise;
    }

    function isWhitelistedHost(hostname = window.location.hostname) {
        const host = normalizeHostname(hostname);
        return state.whitelistDomains.some((domain) => host === domain || host.endsWith('.' + domain));
    }

    function isMediaAutomationExcludedHost(hostname = window.location.hostname) {
        const host = normalizeHostname(hostname);
        return state.mediaAutomationExcludedDomains.some((domain) => host === domain || host.endsWith('.' + domain));
    }

    function shouldRunCleanup(hostname = window.location.hostname) {
        return !(isWhitelistedHost(hostname) && state.whitelistEnhanceOnly);
    }

    function shouldRunMediaAutomation(hostname = window.location.hostname) {
        if (isMediaAutomationExcludedHost(hostname)) return false;
        if (!shouldRunCleanup(hostname)) return false;
        const safety = normalizeInteractionSafety(state.interactionSafety);
        return !(safety.interactionSensitivePage && !safety.hasProminentMedia);
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

    function bindStorageUpdates() {
        if (!chrome.storage?.onChanged?.addListener) return;
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
                whitelistEnhanceOnly: nextWhitelistEnhanceOnly,
                interactionSafety: collectInteractionSafety()
            });
            emitStateChange();
        });
    }

    function bindDomUpdates() {
        const observer = new MutationObserver(() => {
            scheduleInteractionSafetyRefresh();
        });

        const root = document.documentElement || document.body;
        if (!root) return;

        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: OBSERVER_ATTRIBUTE_FILTER
        });

        window.addEventListener('load', scheduleInteractionSafetyRefresh, { once: true });
    }

    applyState(DEFAULT_STATE);
    bindStorageUpdates();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            recomputeInteractionSafety();
            bindDomUpdates();
        }, { once: true });
    } else {
        recomputeInteractionSafety();
        bindDomUpdates();
    }

    window.__ShieldSiteStateHelper = {
        load: loadState,
        getState: getStateSnapshot,
        getInteractionSafety: () => normalizeInteractionSafety(state.interactionSafety),
        isWhitelistedHost,
        isMediaAutomationExcludedHost,
        shouldRunCleanup,
        shouldRunMediaAutomation,
        subscribe
    };
})();
