(function () {
    function t(key, substitutions) {
        if (!key || !chrome?.i18n?.getMessage) return '';
        return chrome.i18n.getMessage(key, substitutions) || '';
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

    function initI18n() {
        const langCode = t('langCode');
        if (langCode) {
            document.documentElement.lang = langCode.replace('_', '-');
        }

        applyText('[data-i18n]', (element) => element.dataset.i18n);
        applyAttribute('[data-i18n-title]', 'title', (element) => element.dataset.i18nTitle);
        applyAttribute('[data-i18n-placeholder]', 'placeholder', (element) => element.dataset.i18nPlaceholder);
        applyAttribute('[data-i18n-aria-label]', 'aria-label', (element) => element.dataset.i18nAriaLabel);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initI18n, { once: true });
    } else {
        initI18n();
    }
})();
