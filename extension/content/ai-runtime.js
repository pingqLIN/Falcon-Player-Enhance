// ============================================================================
// Falcon-Player-Enhance - AI Runtime Sentinel
// ============================================================================
// 提供 AI 強化的常駐監控介面
// 1) 收集 main world / DOM 風險訊號
// 2) 接收背景策略並套用最小侵入防護
// 3) 對高風險站點啟用主動流量修飾（導向/點擊層）
// ============================================================================

(function () {
  'use strict';

  const SOURCE = 'ai-runtime';
  const FLUSH_INTERVAL_MS = 1200;
  const DOM_HEALTH_INTERVAL_MS = 4000;
  const MAX_BATCH_SIZE = 12;
  const POPUP_FEATURE_KEY = 'popupBlockingEnabled';

  const OUTBOUND_RISK_PATTERNS = [
    'exoclick',
    'trafficjunky',
    'juicyads',
    'popads',
    'magsrv',
    'clickadu',
    'adsterra',
    'doubleclick',
    'casino',
    'bet',
    'trackingclick'
  ];

  let monitorEnabled = true;
  let currentBlockingLevel = 2;
  let aiPolicy = {
    version: 2,
    policyVersion: 2,
    policyGateVersion: 1,
    source: 'ai_profile',
    generatedAt: 0,
    appliedAt: 0,
    dispatchIssuedAt: 0,
    riskTier: 'low',
    riskScore: 0,
    popupStrictMode: false,
    guardExternalNavigation: false,
    overlayScanMs: 3000,
    sensitivityBoost: 0,
    forceSandbox: false,
    policyGate: {
      version: 1,
      tier: 'T1',
      mode: 'advisory-only',
      reason: 'runtime_default',
      allowAiAdvisory: true,
      allowReversibleActions: false,
      allowDurableMutation: false,
      escalateToCodexReview: false,
      thresholds: {},
      actionBudget: {},
      allowedActions: []
    },
    fallbackActive: false,
    fallbackReason: '',
    fallbackUntil: 0
  };
  let lastPolicyReceipt = {
    dispatchIssuedAt: 0,
    generatedAt: 0,
    policyVersion: 0
  };

  let telemetryQueue = [];
  let flushTimer = null;
  let domPulseTimer = null;
  let mutationObserver = null;
  let mutationSamples = { added: 0, suspicious: 0 };

  function publishPopupBlockingSetting(enabled, source = 'storage') {
    try {
      window.postMessage({
        type: '__SHIELD_FEATURE_SETTINGS__',
        settings: {
          popupBlockingEnabled: enabled === true
        },
        source
      }, '*');
    } catch (_) {}
  }

  function loadPopupBlockingSetting() {
    chrome.storage.local.get([POPUP_FEATURE_KEY], (result) => {
      publishPopupBlockingSetting(result[POPUP_FEATURE_KEY] !== false, 'storage_init');
    });
  }

  function hasGateAction(policy, action) {
    return Boolean(
      policy?.policyGate?.allowReversibleActions &&
        Array.isArray(policy?.policyGate?.allowedActions) &&
        policy.policyGate.allowedActions.includes(action)
    );
  }

  function sanitizePolicyForRuntime(policy, nowTs) {
    const normalized = {
      ...aiPolicy,
      ...policy,
      policyGate: {
        ...aiPolicy.policyGate,
        ...(policy?.policyGate || {})
      }
    };

    const allowPopupStrict = hasGateAction(normalized, 'tighten_popup_guard');
    const allowNavGuard = hasGateAction(normalized, 'guard_external_navigation');
    const allowOverlayTuning = hasGateAction(normalized, 'tune_overlay_scan');
    const allowDomainExpansion = hasGateAction(normalized, 'apply_extra_blocked_domains');

    if (!allowPopupStrict) {
      normalized.popupStrictMode = false;
    }
    if (!allowNavGuard) {
      normalized.guardExternalNavigation = false;
    }
    if (!allowOverlayTuning) {
      normalized.overlayScanMs = 3000;
      normalized.sensitivityBoost = 0;
    }
    if (!allowDomainExpansion) {
      normalized.extraBlockedDomains = [];
    }

    normalized.appliedAt = nowTs;
    return normalized;
  }

  function buildEvidenceLabel(evidence) {
    const topSignals = Array.isArray(evidence?.topSignals) ? evidence.topSignals : [];
    const recentSignals = Array.isArray(evidence?.recentSignals) ? evidence.recentSignals : [];
    const sourceSignals = topSignals.length > 0 ? topSignals : recentSignals;
    return sourceSignals
      .slice(0, 3)
      .map((signal) => {
        const count = Number(signal?.count || 0);
        if (count > 0) {
          return `${signal.type}:${count}`;
        }
        return `${signal.type}:${Number(signal?.delta || 0).toFixed(2)}`;
      })
      .join(",");
  }

  function queueTelemetry(type, options = {}) {
    if (!monitorEnabled) return;

    telemetryQueue.push({
      type,
      source: options.source || SOURCE,
      severity: Number(options.severity || 1),
      confidence: Number(options.confidence || 0.8),
      detail: options.detail || {},
      ts: options.ts || Date.now()
    });

    if (telemetryQueue.length >= MAX_BATCH_SIZE) {
      flushTelemetry();
      return;
    }

    if (!flushTimer) {
      flushTimer = setTimeout(flushTelemetry, FLUSH_INTERVAL_MS);
    }
  }

  function flushTelemetry() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    if (!monitorEnabled || telemetryQueue.length === 0) {
      telemetryQueue = [];
      return;
    }

    const batch = telemetryQueue.splice(0, telemetryQueue.length);

    try {
      chrome.runtime.sendMessage(
        {
          action: 'aiTelemetry',
          events: batch,
          context: {
            source: SOURCE,
            hostname: window.location.hostname,
            url: window.location.href
          }
        },
        (response) => {
          if (chrome.runtime.lastError) return;
          if (response?.policy) {
            applyAiPolicy(response.policy);
          }
        }
      );
    } catch (_) {
      // ignore in fail-safe mode
    }
  }

  function isSuspiciousOutbound(urlText) {
    try {
      const url = new URL(urlText, window.location.href);
      const currentHost = window.location.hostname.toLowerCase();
      const targetHost = url.hostname.toLowerCase();
      if (!targetHost || targetHost === currentHost || targetHost.endsWith('.' + currentHost)) {
        return false;
      }
      const target = (url.href + ' ' + targetHost).toLowerCase();
      return OUTBOUND_RISK_PATTERNS.some((pattern) => target.includes(pattern));
    } catch (_) {
      return false;
    }
  }

  function onClickCapture(event) {
    if (!monitorEnabled || !aiPolicy.guardExternalNavigation) return;

    const target = event.target;
    if (!target || !target.closest) return;

    const link = target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href') || link.href || '';
    if (!href || !isSuspiciousOutbound(href)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    queueTelemetry('blocked_malicious_navigation', {
      severity: 1.3,
      confidence: 0.95,
      source: SOURCE,
      detail: { href }
    });
  }

  function observeDom() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }

    mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (!mutation.addedNodes || mutation.addedNodes.length === 0) continue;
        mutationSamples.added += mutation.addedNodes.length;

        for (const node of mutation.addedNodes) {
          if (!node || node.nodeType !== 1) continue;
          const className = String(node.className || '').toLowerCase();
          const id = String(node.id || '').toLowerCase();
          const html = String(node.outerHTML || '').slice(0, 240).toLowerCase();
          const signature = `${className} ${id} ${html}`;

          if (
            signature.includes('overlay') ||
            signature.includes('popup') ||
            signature.includes('ad-') ||
            signature.includes('clickjack') ||
            signature.includes('interstitial')
          ) {
            mutationSamples.suspicious += 1;
          }
        }
      }
    });

    if (document.body) {
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          mutationObserver?.observe(document.body, { childList: true, subtree: true });
        },
        { once: true }
      );
    }
  }

  function startDomPulse() {
    if (domPulseTimer) clearInterval(domPulseTimer);
    domPulseTimer = setInterval(() => {
      if (!monitorEnabled) return;
      const suspiciousRate =
        mutationSamples.added > 0 ? mutationSamples.suspicious / mutationSamples.added : 0;

      if (mutationSamples.suspicious >= 8 || suspiciousRate >= 0.25) {
        queueTelemetry('suspicious_dom_churn', {
          severity: Math.min(1.6, 0.8 + suspiciousRate * 2),
          confidence: 0.72,
          detail: {
            suspiciousAdded: mutationSamples.suspicious,
            totalAdded: mutationSamples.added,
            suspiciousRate
          }
        });
      }

      mutationSamples = { added: 0, suspicious: 0 };
    }, DOM_HEALTH_INTERVAL_MS);
  }

  function resolvePolicyVersion(policy) {
    const version = Number(policy?.policyVersion || policy?.version || aiPolicy.policyVersion || aiPolicy.version || 1);
    return Number.isFinite(version) && version > 0 ? version : 1;
  }

  function detectPolicyConflict(policyVersion, generatedAt, dispatchIssuedAt) {
    if (dispatchIssuedAt > 0 && lastPolicyReceipt.dispatchIssuedAt > 0 && dispatchIssuedAt < lastPolicyReceipt.dispatchIssuedAt) {
      return true;
    }
    if (generatedAt > 0 && lastPolicyReceipt.generatedAt > 0 && generatedAt < lastPolicyReceipt.generatedAt) {
      return true;
    }
    if (policyVersion > 0 && lastPolicyReceipt.policyVersion > 0 && policyVersion < lastPolicyReceipt.policyVersion) {
      return true;
    }
    return false;
  }

  function reportPolicyApplied(payload) {
    try {
      chrome.runtime.sendMessage({
        action: 'aiPolicyApplied',
        payload: {
          hostname: window.location.hostname,
          url: window.location.href,
          policyVersion: payload.policyVersion,
          source: payload.source,
          appliedAt: payload.appliedAt,
          dispatchIssuedAt: payload.dispatchIssuedAt,
          generatedAt: payload.generatedAt,
          applyLatencyMs: payload.applyLatencyMs,
          conflict: payload.conflict
        }
      }).catch(() => {});
    } catch (_) {
      // no-op
    }
  }

  function publishPolicyToPage(policy) {
    try {
      window.dispatchEvent(new CustomEvent('__shield_ai_policy_update__', { detail: policy }));
      window.postMessage({ type: '__SHIELD_AI_POLICY__', policy }, '*');
    } catch (_) {
      // no-op
    }
  }

  function normalizeBlockingLevel(level) {
    const numeric = Number(level);
    if (!Number.isFinite(numeric)) return 2;
    return Math.max(0, Math.min(3, Math.round(numeric)));
  }

  function publishBlockingLevelToPage(level, source = SOURCE) {
    currentBlockingLevel = normalizeBlockingLevel(level);
    try {
      window.postMessage(
        {
          type: '__SHIELD_BLOCKING_LEVEL__',
          level: currentBlockingLevel,
          source
        },
        '*'
      );
    } catch (_) {
      // no-op
    }
  }

  function applyAiPolicy(policy) {
    if (!policy || typeof policy !== 'object') return;
    const nowTs = Date.now();
    const policyVersion = resolvePolicyVersion(policy);
    const generatedAt = Number(policy.generatedAt || 0);
    const dispatchIssuedAt = Number(policy.dispatchIssuedAt || 0);
    const conflict = detectPolicyConflict(policyVersion, generatedAt, dispatchIssuedAt);
    const applyLatencyMs = dispatchIssuedAt > 0 ? Math.max(0, nowTs - dispatchIssuedAt) : null;

    aiPolicy = sanitizePolicyForRuntime(
      {
        ...policy,
        version: policyVersion,
        policyVersion,
        policyGateVersion: Number(policy.policyGateVersion || aiPolicy.policyGateVersion || 1),
        source: String(policy.source || aiPolicy.source || SOURCE)
      },
      nowTs
    );

    try {
      document.documentElement.dataset.shieldAiRisk = String(aiPolicy.riskTier || 'low');
      document.documentElement.dataset.shieldAiScore = String(aiPolicy.riskScore || 0);
      document.documentElement.dataset.shieldAiGateTier = String(aiPolicy.policyGate?.tier || 'T1');
      document.documentElement.dataset.shieldAiGateMode = String(aiPolicy.policyGate?.mode || 'advisory-only');
      document.documentElement.dataset.shieldAiGateReason = String(aiPolicy.policyGate?.reason || 'runtime_default');
      document.documentElement.dataset.shieldAiEvidence = buildEvidenceLabel(aiPolicy.evidence);
    } catch (_) {
      // no-op
    }

    publishPolicyToPage(aiPolicy);

    lastPolicyReceipt = {
      dispatchIssuedAt: Math.max(lastPolicyReceipt.dispatchIssuedAt, dispatchIssuedAt || 0),
      generatedAt: Math.max(lastPolicyReceipt.generatedAt, generatedAt || 0),
      policyVersion: Math.max(lastPolicyReceipt.policyVersion, policyVersion || 0)
    };

    reportPolicyApplied({
      policyVersion,
      source: aiPolicy.source,
      appliedAt: aiPolicy.appliedAt,
      dispatchIssuedAt,
      generatedAt,
      applyLatencyMs,
      conflict
    });
  }

  function onMainWorldEvent(event) {
    if (!monitorEnabled) return;
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.type !== '__SHIELD_AI_EVENT__' || !data.payload) return;

    const payload = data.payload;
    queueTelemetry(payload.type || 'unknown_event', {
      severity: payload.severity,
      confidence: payload.confidence,
      source: payload.source || 'main-world',
      detail: payload.detail || payload
    });
  }

  function requestCurrentPolicy() {
    try {
      chrome.runtime.sendMessage(
        {
          action: 'getAiPolicy',
          hostname: window.location.hostname,
          url: window.location.href
        },
        (response) => {
          if (chrome.runtime.lastError) return;
          if (response?.policy) {
            applyAiPolicy(response.policy);
          }
        }
      );
    } catch (_) {
      // no-op
    }
  }

  function requestCurrentBlockingLevel() {
    try {
      chrome.runtime.sendMessage({ action: 'getBlockingLevel' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.success) {
          publishBlockingLevelToPage(response.blockingLevel, 'runtime_bootstrap');
        }
      });
    } catch (_) {
      // no-op
    }
  }

  function stopRuntime() {
    monitorEnabled = false;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (domPulseTimer) {
      clearInterval(domPulseTimer);
      domPulseTimer = null;
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    window.removeEventListener('message', onMainWorldEvent);
    document.removeEventListener('click', onClickCapture, true);
    telemetryQueue = [];
    publishPolicyToPage({
      version: aiPolicy.version || 2,
      policyVersion: aiPolicy.policyVersion || aiPolicy.version || 2,
      policyGateVersion: aiPolicy.policyGateVersion || 1,
      source: 'runtime_stop',
      generatedAt: Date.now(),
      appliedAt: Date.now(),
      riskTier: 'low',
      riskScore: 0,
      popupStrictMode: false,
      guardExternalNavigation: false,
      overlayScanMs: 3000,
      sensitivityBoost: 0,
      forceSandbox: false,
      policyGate: {
        version: 1,
        tier: 'T1',
        mode: 'advisory-only',
        reason: 'runtime_stop',
        allowAiAdvisory: true,
        allowReversibleActions: false,
        allowDurableMutation: false,
        escalateToCodexReview: false,
        thresholds: {},
        actionBudget: {},
        allowedActions: []
      },
      fallbackActive: false,
      fallbackReason: '',
      fallbackUntil: 0
    });
    publishBlockingLevelToPage(0, 'runtime_stop');
  }

  function initRuntime() {
    monitorEnabled = true;
    window.addEventListener('message', onMainWorldEvent);
    document.addEventListener('click', onClickCapture, true);
    observeDom();
    startDomPulse();
    requestCurrentPolicy();
    requestCurrentBlockingLevel();
    loadPopupBlockingSetting();

    queueTelemetry('runtime_bootstrap', {
      severity: 0.2,
      confidence: 1,
      detail: { href: window.location.href }
    });
    flushTelemetry();
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'applyBlockingLevel') {
      publishBlockingLevelToPage(request.level, request.source || 'background');
      sendResponse({ success: true, blockingLevel: currentBlockingLevel });
      return true;
    }

    if (request.action === 'applyAiPolicy') {
      applyAiPolicy(request.policy || {});
      sendResponse({ success: true });
      return true;
    }

    if (
      request.action === 'disableAiMonitor' ||
      request.action === 'disableBlocking' ||
      request.action === 'clearAIPolicy'
    ) {
      stopRuntime();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'enableAiMonitor') {
      if (!monitorEnabled) {
        initRuntime();
      }
      sendResponse({ success: true, enabled: true });
      return true;
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local' || !changes[POPUP_FEATURE_KEY]) return;
    publishPopupBlockingSetting(changes[POPUP_FEATURE_KEY].newValue !== false, 'storage_change');
  });

  initRuntime();
})();
