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
  const downloadButton = document.getElementById('btn-download-chrome-model');
  const downloadProgress = document.getElementById('chrome-download-progress');
  const inferenceButton = document.getElementById('btn-chrome-test-inference');
  const inferenceStatus = document.getElementById('chrome-test-inference-status');

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

  function configuredSessionOptions() {
    const languages = selectedLanguages();
    const options = {
      expectedInputs: [{ type: 'text', languages: Array.from(new Set(['en', ...languages])) }],
      expectedOutputs: [{ type: 'text', languages }]
    };
    if (samplingSelect?.value === 'custom') {
      const temperatureText = document.getElementById('chrome-builtin-temperature')?.value;
      const topKText = document.getElementById('chrome-builtin-topk')?.value;
      const temperature = Number(temperatureText);
      const topK = Number(topKText);
      if (temperatureText === '' || topKText === '' ||
          !Number.isFinite(temperature) || temperature < 0 ||
          !Number.isInteger(topK) || topK < 1) {
        throw new Error('Invalid temperature or topK: both must be specified.');
      }
      options.temperature = temperature;
      options.topK = topK;
    }
    return options;
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
    const api = globalThis.LanguageModel;
    if (!api?.availability || !api?.create) {
      const error = 'Prompt API unavailable in this extension context. Check Chrome 138+ and on-device model support.';
      if (probeStatus) probeStatus.textContent = error;
      return { success: false, availability: 'unavailable', error };
    }
    try {
      const options = configuredSessionOptions();
      const availability = await api.availability(options);
      const params = typeof api.params === 'function' ? await api.params() : null;
      if (paramsBox) {
        paramsBox.textContent = params
          ? `defaultTemperature ${params.defaultTemperature} / max ${params.maxTemperature} · defaultTopK ${params.defaultTopK} / max ${params.maxTopK}`
          : 'Model sampling limits are unavailable.';
      }
      if (probeStatus) {
        probeStatus.textContent = `Prompt API ${availability}. Availability checked with the configured language and sampling options.`;
      }
      return { success: true, availability: String(availability || ''), params };
    } catch (error) {
      const reason = String(error?.message || error);
      if (probeStatus) probeStatus.textContent = `Prompt API configuration unsupported: ${reason}`;
      return { success: false, availability: 'unavailable', error: reason };
    }
  }

  async function startDownload() {
    // The create() call comes from this direct button click: no background
    // health check should initiate a potentially large model download.
    if (downloadButton?.disabled) return;
    const api = globalThis.LanguageModel;
    if (!api?.create) {
      if (downloadProgress) downloadProgress.textContent = 'Prompt API is not available in this Chrome extension.';
      return;
    }
    let session = null;
    if (downloadButton) downloadButton.disabled = true;
    if (downloadProgress) downloadProgress.textContent = 'Preparing model...';
    try {
      const options = configuredSessionOptions();
      session = await api.create({
        ...options,
        monitor(m) {
          m.addEventListener('downloadprogress', (event) => {
            const percent = Math.max(0, Math.min(100, Math.round(Number(event.loaded || 0) * 100)));
            if (downloadProgress) downloadProgress.textContent = `Downloading model: ${percent}%`;
          });
        }
      });
      if (downloadProgress) downloadProgress.textContent = 'Model is ready. Run Health check to validate the configuration.';
      await probe();
    } catch (error) {
      if (downloadProgress) downloadProgress.textContent = `Model preparation failed: ${String(error?.message || error)}`;
    } finally {
      try {
        session?.destroy?.();
      } catch (_) {
        // no-op
      }
      if (downloadButton) downloadButton.disabled = false;
    }
  }

  async function runDiagnosticInference() {
    if (!inferenceButton || inferenceButton.disabled) return;
    const api = globalThis.LanguageModel;
    if (!api?.availability || !api?.create) {
      if (inferenceStatus) inferenceStatus.textContent = 'LanguageModel unavailable in this extension page.';
      return;
    }
    inferenceButton.disabled = true;
    let session = null;
    const startedAt = Date.now();
    let taskStatus = 'error';
    let rawText = '';
    let errorCode = '';
    let options = {};
    try {
      options = configuredSessionOptions();
      const availability = String(await api.availability(options));
      if (!['available', 'readily', 'ready'].includes(availability.toLowerCase())) {
        throw new Error('Model is not ready: ' + availability + '. Use Prepare model first.');
      }
      session = await api.create(options);
      rawText = String(await session.prompt('Return the word OK, without any other text.', {
        signal: AbortSignal.timeout(10000)
      }));
      taskStatus = 'success';
      if (inferenceStatus) inferenceStatus.textContent =
        'Prompt API responded in ' + (Date.now() - startedAt) +
        ' ms; ' + rawText.length + ' characters. See AI Observability for the captured trace.';
    } catch (error) {
      errorCode = String(error?.name || 'PromptApiError');
      if (inferenceStatus) inferenceStatus.textContent = 'Diagnostic inference failed: ' + String(error?.message || error);
    } finally {
      try { session?.destroy?.(); } catch (_) { /* safe release */ }
      inferenceButton.disabled = false;
      // Only the background's active observability session may retain this sample.
      try {
        await chrome.runtime.sendMessage({
          action: 'recordAiObservabilityProbe',
          task: 'manual_extension_page_probe',
          success: taskStatus === 'success',
          errorCode,
          latencyMs: Date.now() - startedAt,
          responseChars: rawText.length,
          samplingMode: samplingSelect?.value,
          temperature: options.temperature,
          topK: options.topK,
          languages: selectedLanguages(),
          modelOutput: rawText
        });
      } catch (_) { /* observability is optional */ }
    }
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

  downloadButton?.addEventListener('click', startDownload);
  inferenceButton?.addEventListener('click', runDiagnosticInference);
  renderLanguages(['en']);
  loadCatalog();
})();
