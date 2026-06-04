// ============================================================================
// Falcon-Player-Enhance - Cosmetic Filter v4 (Player Sites Edition)
// ============================================================================
// 簡化版 - 僅保留播放器網站相關規則
// 通用廣告隱藏已委託 uBlock Origin Lite
// ============================================================================

(function () {
    'use strict';

    let cosmeticFilterConfig = {
        globalSelectors: [],
        siteSelectorGroups: []
    };
    let cosmeticFilterConfigLoadPromise = null;
    let styleElement = null;
    let customRules = [];
    const RESCUED_ATTRIBUTE = 'data-shield-rescued';
    const ACTION_ATTRIBUTE = 'data-shield-action-id';
    const MAX_COLLECTED_ACTIONS = 100;

    function normalizeDomainList(domains = []) {
        return [...new Set(
            (Array.isArray(domains) ? domains : [])
                .map((domain) => String(domain || '').trim().toLowerCase())
                .filter(Boolean)
        )];
    }

    function normalizeSelectorList(selectors = []) {
        return [...new Set(
            (Array.isArray(selectors) ? selectors : [])
                .map((selector) => String(selector || '').trim())
                .filter(Boolean)
        )];
    }

    function normalizeCosmeticFilterConfig(payload = {}) {
        const source = payload && typeof payload === 'object' ? payload : {};
        const groups = Array.isArray(source.siteSelectorGroups) ? source.siteSelectorGroups : [];
        return {
            globalSelectors: normalizeSelectorList(source.globalSelectors),
            siteSelectorGroups: groups
                .map((group) => {
                    const item = group && typeof group === 'object' ? group : {};
                    return {
                        domains: normalizeDomainList(item.domains),
                        selectors: normalizeSelectorList(item.selectors)
                    };
                })
                .filter((group) => group.domains.length > 0 && group.selectors.length > 0)
        };
    }

    function isDomainOrSubdomain(hostname, domain) {
        return hostname === domain || hostname.endsWith(`.${domain}`);
    }

    function loadCosmeticFilterConfig(force = false) {
        if (force) {
            cosmeticFilterConfigLoadPromise = null;
        }

        if (cosmeticFilterConfigLoadPromise) {
            return cosmeticFilterConfigLoadPromise;
        }

        cosmeticFilterConfigLoadPromise = new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getSiteRegistry' }, (response) => {
                if (chrome.runtime.lastError || !response?.success) {
                    cosmeticFilterConfig = normalizeCosmeticFilterConfig();
                    resolve(cosmeticFilterConfig);
                    return;
                }

                cosmeticFilterConfig = normalizeCosmeticFilterConfig(response?.profiles?.cosmeticFilter);
                resolve(cosmeticFilterConfig);
            });
        });

        return cosmeticFilterConfigLoadPromise;
    }

    async function loadCustomRules() {
        try {
            const result = await chrome.storage.local.get(['hiddenElements']);
            if (result.hiddenElements) {
                customRules = result.hiddenElements;
            }
        } catch (e) {
            const stored = localStorage.getItem('__hidden_elements__');
            if (stored) {
                customRules = JSON.parse(stored);
            }
        }
    }

    function scheduleRuleRefresh(force = false) {
        Promise.all([loadCustomRules(), loadCosmeticFilterConfig(force)]).then(() => {
            injectStyles();
        });
    }

    function appendRescueGuard(selector) {
        const source = String(selector || '').trim();
        if (!source || source.includes('::')) return source;
        return source
            .split(',')
            .map((part) => {
                const item = part.trim();
                if (!item || item.includes(`[${RESCUED_ATTRIBUTE}]`)) return item;
                return `${item}:not([${RESCUED_ATTRIBUTE}])`;
            })
            .join(', ');
    }

    function buildActiveSelectorEntries() {
        const hostname = window.location.hostname.toLowerCase();
        const entries = [];

        cosmeticFilterConfig.globalSelectors.forEach((selector) => {
            entries.push({
                selector,
                source: 'cosmetic-filter',
                reason: 'site_registry_global_selector',
                policyTier: 'T0'
            });
        });

        for (const group of cosmeticFilterConfig.siteSelectorGroups) {
            if (group.domains.some((domain) => isDomainOrSubdomain(hostname, domain))) {
                group.selectors.forEach((selector) => {
                    entries.push({
                        selector,
                        source: 'cosmetic-filter',
                        reason: 'site_registry_host_selector',
                        policyTier: 'T0'
                    });
                });
            }
        }

        for (const rule of customRules) {
            const ruleHostname = String(rule.hostname || '').trim().toLowerCase();
            if (!ruleHostname || isDomainOrSubdomain(hostname, ruleHostname)) {
                entries.push({
                    selector: rule.selector,
                    source: 'element-picker',
                    reason: 'hidden_element_rule',
                    policyTier: 'T1'
                });
            }
        }

        const seen = new Set();
        return entries.filter((entry) => {
            const selector = String(entry.selector || '').trim();
            if (!selector || seen.has(selector)) return false;
            seen.add(selector);
            return true;
        });
    }

    function generateCSS() {
        const selectors = buildActiveSelectorEntries().map((entry) => appendRescueGuard(entry.selector));

        return [...new Set(selectors)].map((sel) => {
            return `${sel} { display: none !important; visibility: hidden !important; }`;
        }).join('\n');
    }

    function injectStyles() {
        if (styleElement) {
            styleElement.remove();
        }

        styleElement = document.createElement('style');
        styleElement.id = '__shield_pro_cosmetic__';
        styleElement.textContent = generateCSS();

        const target = document.head || document.documentElement;
        if (target) {
            target.appendChild(styleElement);
        }
    }

    let pageStats = { popupsBlocked: 0, overlaysRemoved: 0 };
    let statsCallbacks = [];

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data && event.data.type === '__SHIELD_PRO_PAGE_STATS__') {
            pageStats = event.data.stats || pageStats;
            while (statsCallbacks.length > 0) {
                const callback = statsCallbacks.shift();
                callback(pageStats);
            }
        }
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        if (!changes.hiddenElements) return;
        scheduleRuleRefresh();
    });

    function requestPageStats() {
        window.postMessage({ type: '__SHIELD_PRO_GET_STATS__' }, '*');
    }

    function requestPageStatsAsync(timeout = 100) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                resolve(pageStats);
            }, timeout);

            statsCallbacks.push((stats) => {
                clearTimeout(timer);
                resolve(stats);
            });

            requestPageStats();
        });
    }

    setInterval(requestPageStats, 500);
    requestPageStats();
    setTimeout(requestPageStats, 50);

    function runtimeMessage(message) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    resolve(response || null);
                });
            } catch (_) {
                resolve(null);
            }
        });
    }

    function getElementSignature(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        let hrefHost = '';
        try {
            hrefHost = element.href ? new URL(element.href, window.location.href).hostname : '';
        } catch (_) {
            hrefHost = '';
        }
        return {
            tagName: String(element.tagName || '').toLowerCase(),
            classTokenSummary: String(element.className || '').replace(/\s+/g, ' ').trim().slice(0, 160),
            idTokenSummary: String(element.id || '').trim().slice(0, 80),
            positionBucket: style.position || 'static',
            zIndexBucket: Number.parseInt(style.zIndex, 10) >= 1000 ? 'high' : 'low',
            sizeBucket: rect.width >= 728 && rect.height >= 60 ? 'banner' : 'small',
            hrefHost,
            nearPlayer: Boolean(element.closest('.shield-detected-player, .shield-detected-container, .player-enhanced-active, video'))
        };
    }

    async function collectFalconActions() {
        await Promise.all([loadCustomRules(), loadCosmeticFilterConfig(false)]);
        const entries = buildActiveSelectorEntries();
        const records = [];

        for (const entry of entries) {
            if (records.length >= MAX_COLLECTED_ACTIONS) break;
            let elements = [];
            try {
                elements = Array.from(document.querySelectorAll(entry.selector));
            } catch (_) {
                continue;
            }

            for (let index = 0; index < elements.length && records.length < MAX_COLLECTED_ACTIONS; index += 1) {
                const element = elements[index];
                if (!(element instanceof HTMLElement)) continue;
                if (element.hasAttribute(RESCUED_ATTRIBUTE)) continue;
                const record = {
                    id: element.getAttribute(ACTION_ATTRIBUTE) || undefined,
                    selector: entry.selector,
                    elementIndex: index,
                    kind: 'cosmetic_selector',
                    source: entry.source,
                    policyTier: entry.policyTier,
                    action: 'hide_element',
                    reason: entry.reason,
                    pageUrl: window.location.href,
                    hostname: window.location.hostname,
                    signature: getElementSignature(element)
                };
                const response = await runtimeMessage({ action: 'recordFalconAction', record });
                if (response?.success && response.record?.id) {
                    element.setAttribute(ACTION_ATTRIBUTE, response.record.id);
                    records.push(response.record);
                }
            }
        }

        return records;
    }

    function rescueFalconAction(record = {}) {
        const actionId = String(record.id || '').trim();
        const selector = String(record.selector || '').trim();
        if (!actionId || !selector) return false;
        let target = document.querySelector(`[${ACTION_ATTRIBUTE}="${CSS.escape(actionId)}"]`);
        if (!target) {
            try {
                const candidates = Array.from(document.querySelectorAll(selector));
                const elementIndex = Number(record.elementIndex ?? -1);
                target = elementIndex >= 0 ? candidates[elementIndex] : candidates[0];
            } catch (_) {
                target = null;
            }
        }
        if (!(target instanceof HTMLElement)) return false;
        target.setAttribute(RESCUED_ATTRIBUTE, actionId);
        target.removeAttribute(ACTION_ATTRIBUTE);
        clearFalconActionPreview();
        injectStyles();
        return true;
    }

    let previewCleanupTimer = null;

    function buildPreviewDataAttr(property, suffix = 'value') {
        const normalized = String(property || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        return `data-shield-preview-${normalized}-${suffix}`;
    }

    function storePreviewStyleState(target, property) {
        target.setAttribute(buildPreviewDataAttr(property), target.style.getPropertyValue(property) || '');
        target.setAttribute(buildPreviewDataAttr(property, 'priority'), target.style.getPropertyPriority(property) || '');
    }

    function restorePreviewStyleState(target, property) {
        const value = target.getAttribute(buildPreviewDataAttr(property)) || '';
        const priority = target.getAttribute(buildPreviewDataAttr(property, 'priority')) || '';
        if (value) {
            target.style.setProperty(property, value, priority);
        } else {
            target.style.removeProperty(property);
        }
        target.removeAttribute(buildPreviewDataAttr(property));
        target.removeAttribute(buildPreviewDataAttr(property, 'priority'));
    }

    function getFalconActionPreviewKind(record = {}) {
        const action = String(record.action || '').trim().toLowerCase();
        const restore = record.restore && typeof record.restore === 'object' ? record.restore : {};
        if (action === 'disable_pointer_events') {
            return 'interaction_blocked';
        }
        if (Object.prototype.hasOwnProperty.call(restore, 'pointerEvents') && !Object.prototype.hasOwnProperty.call(restore, 'display')) {
            return 'interaction_blocked';
        }
        return 'hidden_element';
    }

    function clearFalconActionPreview() {
        document.querySelectorAll('[data-shield-rescue-preview="1"]').forEach((element) => {
            if (!(element instanceof HTMLElement)) return;
            ['display', 'visibility', 'pointer-events', 'outline', 'outline-offset', 'opacity', 'box-shadow', 'transition'].forEach((property) => {
                restorePreviewStyleState(element, property);
            });
            element.removeAttribute('data-shield-rescue-preview');
        });
        if (previewCleanupTimer) {
            clearTimeout(previewCleanupTimer);
            previewCleanupTimer = null;
        }
    }

    function findFalconActionTarget(record = {}) {
        const actionId = String(record.id || '').trim();
        const selector = String(record.selector || '').trim();
        let target = null;
        if (actionId) {
            target = document.querySelector(`[${ACTION_ATTRIBUTE}="${CSS.escape(actionId)}"]`);
        }
        if (!target && selector) {
            try {
                const candidates = Array.from(document.querySelectorAll(selector));
                const elementIndex = Number(record.elementIndex ?? -1);
                target = elementIndex >= 0 ? candidates[elementIndex] : candidates[0];
            } catch (_) {
                target = null;
            }
        }
        return target instanceof HTMLElement ? target : null;
    }

    function previewFalconAction(record = {}, options = {}) {
        const target = findFalconActionTarget(record);
        if (!target) return false;
        const previewKind = getFalconActionPreviewKind(record);
        if (target.getAttribute('data-shield-rescue-preview') !== '1') {
            ['display', 'visibility', 'pointer-events', 'outline', 'outline-offset', 'opacity', 'box-shadow', 'transition'].forEach((property) => {
                storePreviewStyleState(target, property);
            });
        }
        target.setAttribute('data-shield-rescue-preview', '1');
        target.style.setProperty('transition', 'opacity 140ms ease, outline-color 140ms ease, box-shadow 140ms ease', 'important');
        target.style.setProperty('outline', '2px solid rgba(255, 133, 27, 0.95)', 'important');
        target.style.setProperty('outline-offset', '2px', 'important');
        target.style.setProperty('box-shadow', '0 0 0 9999px rgba(255, 133, 27, 0.10)', 'important');
        if (previewKind === 'hidden_element') {
            target.style.setProperty('display', target.getAttribute(buildPreviewDataAttr('display')) || 'block', 'important');
            target.style.setProperty('visibility', 'visible', 'important');
            target.style.setProperty('pointer-events', 'auto', 'important');
            target.style.setProperty('opacity', '0.72', 'important');
        } else {
            target.style.setProperty('pointer-events', 'auto', 'important');
            target.style.setProperty('opacity', target.getAttribute(buildPreviewDataAttr('opacity')) || '1', 'important');
        }

        if (previewCleanupTimer) clearTimeout(previewCleanupTimer);
        const requestedDurationMs = Number(options.durationMs || 0);
        const shouldAutoClear = !(options.persistent === true && requestedDurationMs <= 0);
        if (shouldAutoClear) {
            previewCleanupTimer = setTimeout(
                clearFalconActionPreview,
                Math.max(800, requestedDurationMs || 3500)
            );
        }
        return true;
    }

    function previewHiddenRule(selector = '', options = {}) {
        const normalizedSelector = String(selector || '').trim();
        if (!normalizedSelector) return { success: false, count: 0 };
        let matched = [];
        try {
            matched = Array.from(document.querySelectorAll(normalizedSelector)).filter((element) => element instanceof HTMLElement);
        } catch (_) {
            return { success: false, count: 0 };
        }
        matched.slice(0, 20).forEach((element, index) => {
            previewFalconAction({
                selector: normalizedSelector,
                elementIndex: index,
                action: 'hide_element'
            }, options);
        });
        return { success: matched.length > 0, count: matched.length };
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'refreshCosmeticRules') {
            scheduleRuleRefresh(true);
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'getPageStats') {
            requestPageStatsAsync(150).then((stats) => {
                sendResponse(stats);
            });
            return true;
        }

        if (request.action === 'collectFalconActions') {
            collectFalconActions()
                .then((records) => {
                    sendResponse({ success: true, records });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: String(error?.message || error), records: [] });
                });
            return true;
        }

        if (request.action === 'rescueFalconAction') {
            try {
                const restored = rescueFalconAction(request.record || {});
                sendResponse({ success: restored, restored });
            } catch (error) {
                sendResponse({ success: false, error: String(error?.message || error), restored: false });
            }
            return true;
        }

        if (request.action === 'previewFalconAction') {
            try {
                const previewed = previewFalconAction(request.record || {}, request);
                sendResponse({ success: previewed, previewed });
            } catch (error) {
                sendResponse({ success: false, error: String(error?.message || error), previewed: false });
            }
            return true;
        }

        if (request.action === 'previewHiddenElementRule') {
            try {
                const result = previewHiddenRule(request.selector || '', request);
                sendResponse(result);
            } catch (error) {
                sendResponse({ success: false, error: String(error?.message || error), count: 0 });
            }
            return true;
        }

        if (request.action === 'clearFalconActionPreview') {
            clearFalconActionPreview();
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'activateElementPicker' || request.action === 'activatePicker') {
            window.dispatchEvent(new CustomEvent('__shield_pro_activate_picker__'));
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'deactivateElementPicker' || request.action === 'deactivatePicker') {
            window.dispatchEvent(new CustomEvent('__shield_pro_deactivate_picker__'));
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'disableBlocking') {
            if (styleElement) {
                styleElement.remove();
                styleElement = null;
            }
            window.dispatchEvent(new CustomEvent('__shield_pro_deactivate_picker__'));
            sendResponse({ success: true });
            return true;
        }
    });

    async function init() {
        await Promise.all([loadCustomRules(), loadCosmeticFilterConfig(true)]);
        injectStyles();
        console.log('🎨 [Falcon-Player-Enhance] Cosmetic Filter (播放器版) 已啟動');
    }

    init();
})();
