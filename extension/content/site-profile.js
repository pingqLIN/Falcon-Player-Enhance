(function () {
    'use strict';

    const SITE_BEHAVIORS_RESOURCE_PATH = 'rules/site-behaviors.json';
    const cache = {
        loadPromise: null,
        profiles: [],
        primaryProfile: null,
        matchedProfiles: []
    };

    function normalizeSiteBehaviorText(value) {
        return String(value || '').trim().toLowerCase();
    }

    function normalizeSiteBehaviorHost(value) {
        return normalizeSiteBehaviorText(value).replace(/^www\./, '');
    }

    function isSiteBehaviorHostMatch(hostname, hostSuffixes) {
        const host = normalizeSiteBehaviorHost(hostname);
        if (!host) return false;
        return (Array.isArray(hostSuffixes) ? hostSuffixes : []).some((domain) => {
            const normalized = normalizeSiteBehaviorHost(domain);
            return normalized && (host === normalized || host.endsWith(`.${normalized}`));
        });
    }

    function isSiteBehaviorIframeMatch(frameContext, iframeSrcIncludes) {
        const source = normalizeSiteBehaviorText(frameContext?.iframeSrc);
        if (!source) return false;
        return (Array.isArray(iframeSrcIncludes) ? iframeSrcIncludes : []).some((token) => {
            const normalized = normalizeSiteBehaviorText(token);
            return normalized && source.includes(normalized);
        });
    }

    function matchSiteBehaviorProfile(profiles, hostname, frameContext = {}) {
        return (Array.isArray(profiles) ? profiles : []).find((profile) => {
            const match = profile?.match || {};
            return isSiteBehaviorHostMatch(hostname, match.hostSuffixes) ||
                isSiteBehaviorIframeMatch(frameContext, match.iframeSrcIncludes);
        }) || null;
    }

    function matchSiteBehaviorProfiles(profiles, hostname, frameContext = {}) {
        return (Array.isArray(profiles) ? profiles : []).filter((profile) => {
            const match = profile?.match || {};
            return isSiteBehaviorHostMatch(hostname, match.hostSuffixes) ||
                isSiteBehaviorIframeMatch(frameContext, match.iframeSrcIncludes);
        });
    }

    function getCurrentFrameContext() {
        return {
            iframeSrc: window.location.href
        };
    }

    async function loadSiteBehaviorProfiles() {
        if (cache.loadPromise) return cache.loadPromise;

        cache.loadPromise = (async () => {
            const response = await fetch(chrome.runtime.getURL(SITE_BEHAVIORS_RESOURCE_PATH), {
                cache: 'no-store'
            });
            if (!response.ok) {
                throw new Error(`site_behaviors_http_${response.status}`);
            }

            const payload = await response.json();
            cache.profiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
            const frameContext = getCurrentFrameContext();
            cache.matchedProfiles = matchSiteBehaviorProfiles(cache.profiles, window.location.hostname, frameContext);
            cache.primaryProfile = matchSiteBehaviorProfile(cache.profiles, window.location.hostname, frameContext);
            return cache.profiles;
        })();

        try {
            await cache.loadPromise;
        } catch (error) {
            cache.loadPromise = null;
            cache.profiles = [];
            cache.matchedProfiles = [];
            cache.primaryProfile = null;
            throw error;
        }

        return cache.profiles;
    }

    function getPrimaryProfile() {
        return cache.primaryProfile;
    }

    function getMatchedProfiles() {
        return [...cache.matchedProfiles];
    }

    function getCapability(name, fallback = undefined) {
        const value = cache.primaryProfile?.capabilities?.[name];
        return value === undefined ? fallback : value;
    }

    function hasCapability(name) {
        return getCapability(name, false) === true;
    }

    const api = {
        ready: Promise.resolve(),
        load: loadSiteBehaviorProfiles,
        getPrimaryProfile,
        getMatchedProfiles,
        getCapability,
        hasCapability
    };

    window.FalconSiteProfiles = api;

    api.ready = loadSiteBehaviorProfiles().catch((error) => {
        console.warn('site profile init failed:', error);
        return [];
    });
})();
