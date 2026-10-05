(function () {
  const LANGUAGES = ['en', 'es', 'ja', 'de', 'fr'];
  const panel = document.getElementById('chrome-builtin-panel');
  if (!panel) return;

  const samplingSelect = document.getElementById('chrome-sampling-mode');
  const languageBox = document.getElementById('chrome-language-options');
  const constraintToggle = document.getElementById('chrome-response-constraint');
  const paramsBox = document.getElementById('chrome-params-summary');
  const flagsBox = document.getElementById('chrome-flags-list');
  const docsBox = document.getElementById('chrome-docs-links');
  const probeStatus = document.getElementById('chrome-probe-status');

  function message(key, fallback) {
    const value = chrome?.i18n?.getMessage?.(key);
    return value || fallback;
  }

  function renderLanguages(selected) {
    if (!languageBox) return;
    const active = new Set(Array.isArray(selected) && selected.length ? selected : ['en']);
    languageBox.innerHTML = '';
    LANGUAGES.forEach((language) => {
      const label = document.createElement('label');
      label.className = 'chrome-language-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = language;
      input.checked = active.has(language);
      label.append(input, document.createTextNode(language));
      languageBox.appendChild(label);
    });
  }

  function selectedLanguages() {
    const values = Array.from(languageBox?.querySelectorAll('input:checked') || []).map((input) => input.value);
    return values.length ? values : ['en'];
  }

  function renderDocs(docs) {
    if (!docsBox) return;
    docsBox.innerHTML = '';
    (docs || []).forEach((doc) => {
      const link = document.createElement('a');
      link.href = doc.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = doc.label;
      docsBox.appendChild(link);
    });
  }

  function renderFlags(flags) {
    if (!flagsBox) return;
    flagsBox.innerHTML = '';
    (flags || []).forEach((flag) => {
      const item = document.createElement('div');
      item.className = 'chrome-flag-item';
      const title = document.createElement('div');
      title.className = 'chrome-flag-title';
      title.textContent = flag.name;
      const meta = document.createElement('div');
      meta.className = 'info-text';
      meta.textContent = `chrome://flags/#${flag.flag} · ${(flag.options || []).join(', ')}`;
      const desc = document.createElement('div');
      desc.className = 'info-text';
      desc.textContent = flag.description || '';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn-secondary';
      copy.textContent = message('dashboardAiCopyFlag', 'Copy flag');
      copy.addEventListener('click', async () => {
        const url = `chrome://flags/#${flag.flag}`;
        try {
          await navigator.clipboard.writeText(url);
          copy.textContent = message('dashboardAiCopied', 'Copied');
        } catch (_) {
          copy.textContent = url;
        }
      });
      item.append(title, meta, desc, copy);
      flagsBox.appendChild(item);
    });
  }

  async function loadCatalog() {
    try {
      const response = await fetch(chrome.runtime.getURL('rules/chrome-builtin-ai.json'));
      const catalog = await response.json();
      renderDocs(catalog.docs);
      renderFlags(catalog.flags);
    } catch (_) {
      if (probeStatus) probeStatus.textContent = message('dashboardAiCatalogFailed', 'Unable to load the Chrome Built-in AI catalog.');
    }
  }

  async function probe() {
    const api = globalThis.LanguageModel || globalThis.ai?.languageModel;
    if (!api?.availability || !api?.create) {
      const result = {
        success: false,
        availability: 'unavailable',
        error: 'prompt_api_unavailable_in_page'
      };
      if (probeStatus) {
        probeStatus.textContent = message('dashboardAiPromptMissing', 'Prompt API is not exposed in this extension page. Chrome 138+ extensions should have it without a flag; older Chrome still needs chrome://flags/#prompt-api.');
      }
      return result;
    }
    const params = typeof api.params === 'function' ? await api.params() : null;
    const availability = await api.availability();
    if (paramsBox) {
      paramsBox.textContent = params
        ? `defaultTemperature ${params.defaultTemperature} / max ${params.maxTemperature} · defaultTopK ${params.defaultTopK} / max ${params.maxTopK}`
        : message('dashboardAiParamsMissing', 'LanguageModel.params() is only available in extension contexts.');
    }
    if (probeStatus) {
      probeStatus.textContent = `Prompt API ${availability}. Extension sessions use temperature + topK together, or runtime defaults.`;
    }
    return { success: true, availability: String(availability || ''), params };
  }

  window.FalconChromeBuiltin = {
    apply(settings = {}) {
      if (samplingSelect) samplingSelect.value = settings.chromeSampling === 'custom' ? 'custom' : 'runtime';
      if (constraintToggle) constraintToggle.checked = settings.chromeResponseConstraint !== false;
      renderLanguages(settings.chromeLanguages);
    },
    collect() {
      return {
        chromeSampling: samplingSelect?.value === 'custom' ? 'custom' : 'runtime',
        chromeLanguages: selectedLanguages(),
        chromeResponseConstraint: constraintToggle?.checked !== false
      };
    },
    async probe() {
      return probe();
    }
  };

  renderLanguages(['en']);
  loadCatalog();
})();
