'use strict';

// Document-owned broker for Chrome's Prompt API. LanguageModel is not exposed in MV3 workers.
// This context only accepts messages from this extension's own chrome-extension:// origin.
(() => {
  const ACTION = 'falconChromePromptHostRequest';
  const MAX_SESSIONS = 6;
  const SESSION_TTL_MS = 180000;
  const sessions = new Map();
  let nextSessionId = 0;

  function getLanguageModel() {
    const api = globalThis.LanguageModel;
    if (!api?.availability || !api?.create) {
      throw new Error('chrome_builtin_prompt_api_unavailable_in_document');
    }
    return api;
  }

  function publicError(error) {
    return {
      name: String(error?.name || 'Error').slice(0, 80),
      message: String(error?.message || error || 'unknown_error').slice(0, 400)
    };
  }

  function cleanupExpired() {
    const now = Date.now();
    for (const [id, entry] of sessions) {
      if (now - entry.touchedAt > SESSION_TTL_MS) {
        try { entry.session.destroy?.(); } catch (_) { /* best effort */ }
        sessions.delete(id);
      }
    }
  }

  function saveReadinessStatus(availability) {
    // Offscreen LOCAL_STORAGE is limited to non-sensitive readiness diagnostics.
    // Never persist prompts, page contents, session IDs, API keys, or model outputs.
    try {
      localStorage.setItem('falconChromePromptHostReadiness', JSON.stringify({
        checkedAt: Date.now(),
        availability: String(availability).slice(0, 32)
      }));
    } catch (_) { /* diagnostics are optional */ }
  }

  async function handle(operation, payload = {}) {
    cleanupExpired();
    if (operation === 'capabilities') {
      return {
        documentContext: true,
        hasLanguageModel: Boolean(globalThis.LanguageModel),
        hasCreate: typeof globalThis.LanguageModel?.create === 'function',
        hasAvailability: typeof globalThis.LanguageModel?.availability === 'function',
        hasParams: typeof globalThis.LanguageModel?.params === 'function'
      };
    }
    if (operation === 'params') {
      const api = getLanguageModel();
      if (typeof api.params !== 'function') {
        throw new Error('chrome_builtin_custom_sampling_unavailable');
      }
      return api.params();
    }
    if (operation === 'availability') {
      const availability = String(await getLanguageModel().availability(payload.options || {}));
      saveReadinessStatus(availability);
      return availability;
    }
    if (operation === 'create') {
      if (sessions.size >= MAX_SESSIONS) throw new Error('chrome_builtin_session_limit');
      const api = getLanguageModel();
      const options = payload.options || {};
      // Autonomous traffic must never initiate a model download.
      const availability = String(await api.availability(options)).toLowerCase();
      saveReadinessStatus(availability);
      if (!['available', 'readily', 'ready'].includes(availability)) {
        throw new Error('chrome_builtin_not_ready_' + availability);
      }
      const session = await api.create(options);
      const sessionId = String(++nextSessionId) + '-' + Date.now();
      sessions.set(sessionId, { session, touchedAt: Date.now() });
      return { sessionId };
    }
    if (operation === 'prompt') {
      const sessionId = String(payload.sessionId || '');
      const entry = sessions.get(sessionId);
      if (!entry) throw new Error('chrome_builtin_session_expired');
      const prompt = String(payload.prompt || '');
      if (!prompt || prompt.length > 100000) throw new Error('chrome_builtin_prompt_length_invalid');
      const options = payload.options || {};
      // Prompt timeout is not the short UI health timeout. Abort actual inference.
      const signal = AbortSignal.timeout(90000);
      entry.touchedAt = Date.now();
      return String(await entry.session.prompt(prompt, { ...options, signal }));
    }
    if (operation === 'destroy') {
      const sessionId = String(payload.sessionId || '');
      const entry = sessions.get(sessionId);
      if (entry) {
        sessions.delete(sessionId);
        try { entry.session.destroy?.(); } catch (_) { /* safe release */ }
      }
      return { destroyed: Boolean(entry) };
    }
    throw new Error('chrome_builtin_unknown_host_operation');
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.target !== ACTION) return false;
    const source = String(sender?.url || '');
    if (sender?.id !== chrome.runtime.id ||
        (source && !source.startsWith(chrome.runtime.getURL('')))) {
      sendResponse({ success: false, error: { name: 'SecurityError', message: 'untrusted_sender' } });
      return false;
    }
    Promise.resolve().then(() => handle(request.operation, request.payload))
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => sendResponse({ success: false, error: publicError(error) }));
    return true;
  });
})();
