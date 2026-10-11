'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const background = fs.readFileSync(path.resolve(__dirname, '../../extension/background.js'), 'utf8').replace(/\r\n/g, '\n');
function section(start, end) {
  const a = background.indexOf(start);
  const b = background.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'missing source boundary ' + start);
  return background.slice(a, b);
}
const slices = [
  section('const AI_EVENT_WEIGHTS = {', '\n\nconst STATS_DEFAULTS'),
  section('function normalizeAiEvent(input) {', 'function sanitizeTelemetryToken('),
  section('function getDecayedRiskScore(', 'function resolveRiskTier('),
  section('function resolveRiskTier(', 'function isTrustedExtensionPageSender('),
  section('function hasRecentConfirmedThreatSignal(', 'function buildLmStudioMessages('),
  section('function buildPolicyGate(', 'function applyHostFallbackToPolicy('),
  section('function getOrCreateProfile(', 'function getPolicyForUrl('),
  section('function processAiTelemetry(', 'function sendPolicyToTab(')
].join('\n');
const sandbox = {
  clock: 1_700_000_000_000,
  AI_DECAY_PER_MINUTE: 0.96,
  AI_MAX_TELEMETRY: 1500,
  AI_POLICY_VERSION: 2,
  AI_POLICY_GATE_VERSION: 1,
  AI_POLICY_GATE_DEFAULT_THRESHOLDS: {
    advisoryMinConfidence: 0.55,
    reversibleMinConfidence: 0.82,
    reversibleMinRiskScore: 18,
    devEscalationMinRiskScore: 30
  },
  AI_POLICY_GATE_ACTION_BUDGET: { maxReversibleActionsPerWindow: 3, cooldownMs: 30000 },
  AI_HIGH_RISK_EXTRA_DOMAINS: [],
  aiState: { enabled: true, profiles: {}, telemetryLog: [], policyCache: {}, hostFallbacks: {} },
  getHostname(value) {
    if (!value) return '';
    const s = String(value);
    if (s.includes('://')) {
      try { return new URL(s).hostname.toLowerCase(); } catch (_) { return ''; }
    }
    return s.toLowerCase();
  },
  getNow() { return sandbox.clock; },
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  sanitizeTelemetryToken: (value) => String(value || '').slice(0, 64),
  sanitizeAiEventDetail: () => ({}),
  sanitizeAiTelemetryContext: (v) => ({ hostname: v.hostname, url: v.url || '' }),
  isTrackableMemoUrl: (v) => /^https?:\/\//i.test(v || ''),
  isTrustedExtensionPageSender: (sender) => String(sender?.url || '').startsWith('chrome-extension://'),
  createEmptyProfile(hostname) {
    return { hostname, riskScore: 0, lastUpdatedAt: sandbox.clock, events: {}, recentSignals: [] };
  },
  getHostFallbackState: () => ({ active: false, activeUntil: 0, cooldownUntil: 0 }),
  activateHostFallback(host) {
    sandbox.fallbacks.push(host);
    return { activated: true };
  },
  fallbacks: [],
  scheduleAiPersist: () => {},
  traceFalconAi: () => {},
  policySignature: (p) => JSON.stringify({ tier: p?.riskTier, score: p?.riskScore }),
  buildResolvedPolicy(host, profile, previous, options) {
    return sandbox.api.buildPolicyFromProfile(host, profile, 'ai_profile', options.nowTs);
  }
};
vm.runInNewContext(slices + '\nglobalThis.api = {' +
  'normalizeAiEvent, getDecayedRiskScore, applyRiskDecay, updateRiskProfile, resolveRiskTier,' +
  'hasRecentConfirmedThreatSignal, buildPolicyEvidence, buildPolicyFromProfile, getPolicyForHostname, processAiTelemetry' +
  '};', sandbox, { filename: 'background-risk-contract.js' });

const a = sandbox.api;
function round(v) { return Number(v.toFixed(4)); }
const poisoned = a.normalizeAiEvent({
  type: 'blocked_popup', severity: 'NaN', confidence: Infinity, ts: sandbox.clock + 80_000_000
});
assert.equal(poisoned.ts, sandbox.clock, 'event timestamp must use background clock');
assert.equal(poisoned.severity, 1);
assert.equal(poisoned.confidence, 0.7);
assert.equal(a.normalizeAiEvent({ type: 'x', severity: 0, confidence: 0 }).confidence, 0);

const profile = sandbox.createEmptyProfile('source.example');
a.updateRiskProfile(profile, a.normalizeAiEvent({ type: 'runtime_bootstrap', severity: 1, confidence: 1 }));
assert.equal(profile.riskScore, 0, 'opening a page is not risk');
a.updateRiskProfile(profile, a.normalizeAiEvent({ type: 'managed_redirect_listener_candidate', severity: 3, confidence: 1 }));
assert.equal(profile.riskScore, 0, 'observed listener candidate is not a confirmed threat');
a.updateRiskProfile(profile, a.normalizeAiEvent({ type: 'future_unknown_event', severity: 3, confidence: 1 }));
assert.equal(profile.riskScore, 0, 'unknown events must remain diagnostic only');
a.updateRiskProfile(profile, a.normalizeAiEvent({ type: 'blocked_popup', severity: 1, confidence: 1 }));
assert.equal(profile.riskScore, 6);
const topSignals = JSON.parse(JSON.stringify(a.buildPolicyEvidence(profile).topSignals));
assert.deepEqual(topSignals, [{ type: 'blocked_popup', count: 1 }], 'risk evidence must omit zero-scored diagnostics');

const churn = sandbox.createEmptyProfile('churn.example');
a.updateRiskProfile(churn, a.normalizeAiEvent({ type: 'suspicious_dom_churn', severity: 1, confidence: 1 }));
const initial = churn.riskScore;
sandbox.clock += 4_000;
a.updateRiskProfile(churn, a.normalizeAiEvent({ type: 'suspicious_dom_churn', severity: 1, confidence: 1 }));
assert(a.getDecayedRiskScore(churn) <= initial, 'repeated low-specificity churn should not add risk inside cooldown');
assert.equal(churn.events.suspicious_dom_churn, 2, 'all diagnostic observations still counted');
assert.equal(churn.scoredEvents.suspicious_dom_churn, 1, 'score only once per cooldown window');
sandbox.clock += 21_000;
a.updateRiskProfile(churn, a.normalizeAiEvent({ type: 'suspicious_dom_churn', severity: 1, confidence: 1 }));
assert.equal(churn.scoredEvents.suspicious_dom_churn, 2);

const old = sandbox.createEmptyProfile('stale.example');
old.riskScore = 21;
old.lastUpdatedAt = sandbox.clock;
sandbox.aiState.profiles['stale.example'] = old;
const high = a.getPolicyForHostname('stale.example');
assert.equal(high.riskTier, 'high');
assert.equal(high.policyGate.mode, 'advisory-only', 'heuristic-only high risk cannot activate actions');
assert.equal(high.policyGate.reason, 'uncorroborated_heuristic_risk');
const heuristicCritical = sandbox.createEmptyProfile('heuristic-critical.example');
heuristicCritical.riskScore = 40;
assert.equal(a.buildPolicyFromProfile('heuristic-critical.example', heuristicCritical, 'ai_profile', sandbox.clock).forceSandbox, false, 'uncorroborated critical risk may not force sandbox');
const confirmed = sandbox.createEmptyProfile('confirmed.example');
confirmed.riskScore = 40;
confirmed.recentSignals.push({ type: 'blocked_popup', delta: 6, ts: sandbox.clock });
const confirmedPolicy = a.buildPolicyFromProfile('confirmed.example', confirmed, 'ai_profile', sandbox.clock);
assert.equal(confirmedPolicy.policyGate.tier, 'T2');
sandbox.clock += 6 * 60_000;
const oldConfirmedPolicy = a.buildPolicyFromProfile('confirmed.example', confirmed, 'ai_profile', sandbox.clock);
assert.equal(oldConfirmedPolicy.policyGate.tier, 'T1', 'old corroboration must expire');
sandbox.clock += 40 * 60_000;
const low = a.getPolicyForHostname('stale.example');
assert.equal(low.riskTier, 'low', 'cached high risk must expire as risk decays');
assert(low.riskScore < 8);
assert.equal(round(old.riskScore), 21, 'reading policy must not mutate the stored baseline');
assert.equal(a.resolveRiskTier(a.getDecayedRiskScore(old)), 'low');

const forged = a.processAiTelemetry({
  context: { hostname: 'victim.example', url: 'https://victim.example/', source: 'ai-runtime' },
  event: { type: 'blocked_malicious_navigation', severity: 1, confidence: 1, ts: sandbox.clock + 9e12 }
}, { url: 'https://real.example/iframe', tab: { url: 'https://top.example/' } });
assert.equal(forged.hostname, 'real.example', 'source document hostname must be authoritative');
assert.equal(sandbox.aiState.profiles['victim.example'], undefined, 'cannot poison unrelated host');
assert.equal(sandbox.aiState.profiles['real.example'].riskScore, 7);
assert.equal(sandbox.aiState.telemetryLog.at(-1).hostname, 'real.example');

const acceptedOverride = a.processAiTelemetry({
  context: { hostname: 'active.example', url: 'https://active.example/' },
  event: { type: 'user_override', severity: 1, confidence: 1 }
}, { id: 'extension-id', url: 'chrome-extension://extension-id/popup.html' });
assert.equal(acceptedOverride.hostname, 'active.example', 'popup may select the active tab hostname');
assert.deepEqual(sandbox.fallbacks, ['active.example']);
const forgedOverride = a.processAiTelemetry({
  context: { hostname: 'victim.example' },
  event: { type: 'false_positive_signal', severity: 1, confidence: 1 }
}, { url: 'https://real.example/frame', tab: { url: 'https://top.example/' } });
assert.equal(forgedOverride.acceptedEvents, 0, 'only extension UI may trigger negative override telemetry');
assert.deepEqual(sandbox.fallbacks, ['active.example'], 'forged override may not activate fallback');
assert(background.includes("if (!isTrustedExtensionPageSender(sender)) {\n      sendResponse({ success: false, error: 'forbidden_sender' });\n      return true;\n    }\n    const hostname ="), 'manual fallback action must be protected');

const burst = a.processAiTelemetry({
  context: { hostname: 'untrusted.example' },
  events: Array.from({ length: 1000 }, (_, i) => ({
    type: 'runtime_bootstrap', source: 'ai-runtime', ts: i
  }))
}, { url: 'https://limited.example/', tab: { url: 'https://limited.example/' } });
assert.equal(burst.acceptedEvents, 50, 'bound ingestion of untrusted batches');
assert.equal(sandbox.aiState.profiles['limited.example'].riskScore, 0);
assert.equal(sandbox.aiState.profiles['limited.example'].events.runtime_bootstrap, 50);

assert(background.includes('resolveRiskTier(getDecayedRiskScore(profile, nowTs))'), 'snapshot must use current risk tier');
assert(background.includes('profiles.sort((a, b) => getDecayedRiskScore(b, nowTs) - getDecayedRiskScore(a, nowTs))'),
  'snapshot ordering must use decayed score');

// A stale policy receipt must not replace newer runtime state.
const runtimeSrc = fs.readFileSync(path.resolve(__dirname, '../../extension/content/ai-runtime.js'), 'utf8').replace(/\r\n/g, '\n');
const beginResolvers = runtimeSrc.indexOf('  function resolvePolicyVersion(');
const endResolvers = runtimeSrc.indexOf('  function reportPolicyApplied(', beginResolvers);
const beginApply = runtimeSrc.indexOf('  function applyAiPolicy(');
const endApply = runtimeSrc.indexOf('  function onMainWorldEvent(', beginApply);
assert(beginResolvers >= 0 && endResolvers > beginResolvers && beginApply >= 0 && endApply > beginApply);
const appliedReceipts = [];
const published = [];
const runtimeSandbox = {
  Date: { now: () => 6000 },
  SOURCE: 'ai-runtime',
  aiPolicy: { policyVersion: 2, policyGateVersion: 1, riskTier: 'high', riskScore: 22, source: 'newer' },
  lastPolicyReceipt: { generatedAt: 4000, dispatchIssuedAt: 5000, policyVersion: 2 },
  document: { documentElement: { dataset: {} } },
  reportPolicyApplied: (payload) => appliedReceipts.push(payload),
  publishPolicyToPage: (policy) => published.push(policy),
  sanitizePolicyForRuntime: (policy) => policy,
  buildEvidenceLabel: () => ''
};
vm.runInNewContext(runtimeSrc.slice(beginResolvers, endResolvers) + '\n' +
  runtimeSrc.slice(beginApply, endApply) +
  '\nglobalThis.__apply = applyAiPolicy;globalThis.__state = () => aiPolicy;', runtimeSandbox);
runtimeSandbox.__apply({ policyVersion: 2, generatedAt: 2000, dispatchIssuedAt: 2500, riskTier: 'low', riskScore: 0 });
assert.equal(runtimeSandbox.__state().riskTier, 'high', 'stale policy may not overwrite active risk');
assert.equal(published.length, 0, 'stale policy must not be published to the page');
assert.equal(appliedReceipts[0].conflict, true);
assert.equal(appliedReceipts[0].source, 'stale_policy_rejected');
runtimeSandbox.__apply({ policyVersion: 2, generatedAt: 5500, dispatchIssuedAt: 5500, riskTier: 'low', riskScore: 0 });
assert.equal(runtimeSandbox.__state().riskTier, 'low', 'fresh policy should apply');
assert.equal(published.length, 1);
assert(background.includes('rejected: true,'), 'background must distinguish conflict receipt from applied receipt');

console.log('risk/telemetry integrity regression passed');
