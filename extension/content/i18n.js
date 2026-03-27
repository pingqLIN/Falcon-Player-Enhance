(function () {
    const DEFAULT_LOCALE = chrome?.runtime?.getManifest?.().default_locale || 'zh_TW';
    const UI_LANGUAGE_AUTO = 'auto';
    const SUPPORTED_LOCALES = ['zh_TW', 'en'];
    const cache = new Map();
    const state = {
        locale: DEFAULT_LOCALE,
        preference: UI_LANGUAGE_AUTO,
        messages: {}
    };

    function normalizeLocale(value) {
        const text = String(value || '').trim().replace('-', '_');
        if (!text) return DEFAULT_LOCALE;
        const lower = text.toLowerCase();
        if (lower.startsWith('zh')) return 'zh_TW';
        if (lower.startsWith('en')) return 'en';
        return SUPPORTED_LOCALES.includes(text) ? text : DEFAULT_LOCALE;
    }

    function normalizePreference(value) {
        const text = String(value || '').trim();
        if (!text || text === UI_LANGUAGE_AUTO) return UI_LANGUAGE_AUTO;
        return normalizeLocale(text);
    }

    function substitute(message, substitutions = []) {
        return String(message || '').replace(/\$(\d+)/g, (_, index) => {
            const position = Number(index) - 1;
            return position >= 0 && position < substitutions.length
                ? String(substitutions[position])
                : '';
        });
    }

    async function loadMessages(locale) {
        const normalized = normalizeLocale(locale);
        if (cache.has(normalized)) return cache.get(normalized);

        const response = await fetch(chrome.runtime.getURL(`_locales/${normalized}/messages.json`), {
            cache: 'no-store'
        });
        if (!response.ok) {
            throw new Error(`i18n_http_${normalized}_${response.status}`);
        }

        const messages = await response.json();
        cache.set(normalized, messages);
        return messages;
    }

    function t(key, substitutions) {
        const message = state.messages?.[key]?.message;
        if (!message) return '';
        return substitute(message, Array.isArray(substitutions) ? substitutions : []);
    }

    function applyText(selector, resolver) {
        document.querySelectorAll(selector).forEach((element) => {
            const key = resolver(element);
            const value = t(key);
            if (value) {
                element.textContent = value;
            }
        });
    }

    function applyAttribute(selector, attrName, resolver) {
        document.querySelectorAll(selector).forEach((element) => {
            const key = resolver(element);
            const value = t(key);
            if (value) {
                element.setAttribute(attrName, value);
            }
        });
    }

    function applyI18n() {
        const langCode = t('langCode') || state.locale;
        if (langCode) {
            document.documentElement.lang = String(langCode).replace('_', '-');
        }

        applyText('[data-i18n]', (element) => element.dataset.i18n);
        applyAttribute('[data-i18n-title]', 'title', (element) => element.dataset.i18nTitle);
        applyAttribute('[data-i18n-placeholder]', 'placeholder', (element) => element.dataset.i18nPlaceholder);
        applyAttribute('[data-i18n-aria-label]', 'aria-label', (element) => element.dataset.i18nAriaLabel);
    }

    async function refresh() {
        const stored = await chrome.storage.local.get(['uiLanguage']);
        const preference = normalizePreference(stored.uiLanguage);
        const locale = preference === UI_LANGUAGE_AUTO
            ? normalizeLocale(chrome.i18n?.getUILanguage?.() || navigator.language || DEFAULT_LOCALE)
            : preference;
        const fallback = normalizeLocale(DEFAULT_LOCALE);
        const [selectedMessages, fallbackMessages] = await Promise.all([
            loadMessages(locale),
            locale === fallback ? Promise.resolve(null) : loadMessages(fallback)
        ]);

        state.locale = locale;
        state.preference = preference;
        state.messages = fallbackMessages ? { ...fallbackMessages, ...selectedMessages } : selectedMessages;
        applyI18n();
    }

    const api = {
        get locale() {
            return state.locale;
        },
        get preference() {
            return state.preference;
        },
        ready: Promise.resolve(),
        refresh,
        t
    };

    window.FalconI18n = api;

    api.ready = refresh().catch((error) => {
        console.warn('i18n init failed:', error);
        state.locale = normalizeLocale(DEFAULT_LOCALE);
        state.preference = UI_LANGUAGE_AUTO;
        state.messages = {};
        applyI18n();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes.uiLanguage) return;
        refresh().catch((error) => {
            console.warn('i18n refresh failed:', error);
        });
    });
})();
