// Falcon AI Observability: explicit, temporary, host-scoped diagnostics.
// No capture or outbound transfer occurs unless the user starts a session.
(function (scope) {
  'use strict';

  const STORAGE_KEY = 'falconAiObserverV1';
  const TTL_MS = 15 * 60 * 1000;
  const MAX_EVENTS = 250;
  const MAX_TEXT = 1600;
  const BRIDGE_URL = 'http://127.0.0.1:38271/ingest';
  const SAFE_FIELDS = new Set([
    'tabId', 'frameId', 'source', 'kind', 'task', 'provider',
    'type', 'count', 'events', 'severity', 'confidence', 'scoreBefore',
    'scoreAfter', 'riskTier', 'gateMode', 'gateReason', 'fallbackActive',
    'availability', 'samplingMode', 'temperature', 'topK', 'languages',
    'responseConstraint', 'promptChars', 'responseChars', 'latencyMs',
    'category', 'suggestedAction', 'riskScoreDelta', 'errorCode', 'success',
    'candidateCount', 'selectorCount', 'domainCount', 'scoredEventCount',
    'eventTypes', 'model', 'timeoutMs'
  ]);

  function normalizeHost(value) {
    const input = String(value || '').trim().toLowerCase();
    let hostname = input;
    try { if (input.includes('://')) hostname = new URL(input).hostname; } catch (_) { return ''; }
    return hostname.length <= 253 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname) &&
      !hostname.includes('..') ? hostname : '';
  }

  function scrubText(value) {
    return String(value || '').slice(0, MAX_TEXT)
      .replace(/https?:\/\/[^\s"'<>]+/gi, (text) => {
        try { const url = new URL(text); return url.origin + '/[path-redacted]'; } catch (_) { return '[url-redacted]'; }
      })
      .replace(/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[email-redacted]')
      .replace(/\b(sk-[\w-]{8,}|AIza[\w-]{15,})\b/gi, '[credential-redacted]')
      .replace(/\b(bearer|api[_-]?key|secret|token|authorization)\s*[:=]\s*\S+/gi, '$1=[redacted]');
  }

  function sanitize(value, depth = 0) {
    if (depth > 3) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return scrubText(value).slice(0, 120);
    if (Array.isArray(value)) return value.slice(0, 15).map((item) => sanitize(item, depth + 1));
    if (!value || typeof value !== 'object') return null;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (SAFE_FIELDS.has(key)) result[key] = sanitize(item, depth + 1);
    }
    return result;
  }

  function createObserver({ storage, clock = () => Date.now(), transport = () => {} } = {}) {
    let config = null;
    let events = [];
    let sequence = 0;
    let saveTimer = null;

    function retained() {
      if (config && clock() >= config.expiresAt) {
        config = null;
        events = [];
        if (storage?.set) storage.set({ [STORAGE_KEY]: { config, events, sequence: 0 } }).catch(() => {});
      }
      return Boolean(config);
    }

    function active() {
      return retained() && config.enabled === true;
    }

    function publicConfig() {
      return retained() ? {
        enabled: active(), hostname: config.hostname,
        expiresAt: config.expiresAt, includeModelOutput: config.includeModelOutput,
        bridgeEnabled: Boolean(config.bridgeToken)
      } : { enabled: false };
    }

    async function persist() {
      if (!storage?.set) return;
      await storage.set({ [STORAGE_KEY]: { config, events, sequence } });
    }

    function schedulePersist() {
      if (saveTimer !== null) return;
      saveTimer = setTimeout(() => {
        saveTimer = null;
        persist().catch(() => {});
      }, 500);
    }

    async function restore() {
      const state = (await storage?.get?.([STORAGE_KEY]))?.[STORAGE_KEY] || {};
      config = state.config && typeof state.config === 'object' ? state.config : null;
      events = Array.isArray(state.events) ? state.events.slice(-MAX_EVENTS) : [];
      sequence = Number(state.sequence || 0);
      if (!retained()) {
        events = [];
        await persist();
      }
      return publicConfig();
    }

    async function start(input = {}) {
      const hostname = normalizeHost(input.hostname);
      if (!hostname) throw new Error('A valid HTTP(S) site hostname is required.');
      const bridgeToken = String(input.bridgeToken || '').trim();
      if (bridgeToken && !/^[a-f0-9]{48,128}$/i.test(bridgeToken)) {
        throw new Error('Invalid localhost observer token.');
      }
      config = {
        enabled: true, hostname, startedAt: clock(), expiresAt: clock() + TTL_MS,
        includeModelOutput: input.includeModelOutput === true,
        bridgeToken
      };
      events = [];
      sequence = 0;
      await persist();
      return publicConfig();
    }

    async function stop() {
      if (retained()) {
        config.enabled = false;
        config.bridgeToken = '';
      }
      await persist();
      return publicConfig();
    }

    async function clear() {
      events = [];
      sequence = 0;
      await persist();
    }

    function record(hostname, kind, fields = {}, modelOutput = '') {
      if (!active() || normalizeHost(hostname) !== config.hostname) return null;
      const entry = {
        version: 1,
        seq: ++sequence,
        at: clock(),
        hostname: config.hostname,
        kind: String(kind || 'unknown').slice(0, 60),
        details: sanitize(fields)
      };
      if (config.includeModelOutput && modelOutput) entry.modelOutput = scrubText(modelOutput);
      events.push(entry);
      if (events.length > MAX_EVENTS) events.shift();
      schedulePersist();
      if (config.bridgeToken) {
        Promise.resolve().then(() => transport(entry, config.bridgeToken)).catch(() => {});
      }
      return entry;
    }

    function snapshot() {
      return {
        schemaVersion: 1,
        recordedAt: clock(),
        scope: publicConfig(),
        events: retained() ? events.slice() : []
      };
    }
    return { start, stop, clear, restore, record, snapshot, publicConfig };
  }

  const api = Object.freeze({ createObserver, normalizeHost, scrubText, sanitize, BRIDGE_URL });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.FalconAiObservability = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
