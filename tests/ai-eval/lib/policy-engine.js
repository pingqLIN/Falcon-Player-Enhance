/* eslint-disable no-console */

const AI_EVENT_WEIGHTS = {
  runtime_bootstrap: 0.2,
  blocked_popup: 6,
  blocked_malicious_navigation: 7,
  overlay_removed: 4,
  clickjacking_detected: 8,
  suspicious_dom_churn: 3,
  false_positive_signal: -5,
  user_override: -2
};

const AI_DECAY_PER_MINUTE = 0.96;

const TIER_RANK = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveTier(score) {
  if (score >= 30) return 'critical';
  if (score >= 18) return 'high';
  if (score >= 8) return 'medium';
  return 'low';
}

function applyDecay(score, deltaSeconds) {
  const deltaMinutes = Math.max(0, deltaSeconds) / 60;
  const factor = Math.pow(AI_DECAY_PER_MINUTE, deltaMinutes);
  return clamp(score * factor, 0, 200);
}

function normalizeHostname(input) {
  if (!input) return 'unknown-host';
  return String(input).toLowerCase();
}

function normalizeEvents(events = []) {
  let lastSec = 0;
  return events
    .map((raw) => {
      const event = raw?.event && typeof raw.event === 'object' ? raw.event : raw;
      if (!event || typeof event !== 'object') return null;
      const type = String(event.type || '').trim();
      if (!type) return null;

      let timeSec = null;
      if (Number.isFinite(Number(event.ts)) && Number(event.ts) > 0) {
        timeSec = Number(event.ts) / 1000;
      } else if (Number.isFinite(Number(raw?.ingestedAt)) && Number(raw.ingestedAt) > 0) {
        timeSec = Number(raw.ingestedAt) / 1000;
      } else if (Number.isFinite(Number(event.dtSec))) {
        timeSec = Number(event.dtSec);
      } else {
        timeSec = lastSec + 1;
      }

      lastSec = timeSec;
      return {
        type,
        severity: clamp(Number(event.severity || 1), 0.1, 3),
        confidence: clamp(Number(event.confidence || 0.7), 0.1, 1),
        timeSec,
        source: String(event.source || raw?.context?.source || 'unknown')
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timeSec - b.timeSec);
}

function compressTransitions(tiers) {
  const compact = [];
  tiers.forEach((tier) => {
    if (compact.length === 0 || compact[compact.length - 1] !== tier) {
      compact.push(tier);
    }
  });
  return compact;
}

function containsOrderedSubsequence(source, expected) {
  if (!Array.isArray(expected) || expected.length === 0) return true;
  let cursor = 0;
  for (const item of source) {
    if (item === expected[cursor]) cursor += 1;
    if (cursor >= expected.length) return true;
  }
  return false;
}

function sampleRiskCurve(timeline) {
  if (timeline.length === 0) return [];
  if (timeline.length <= 6) {
    return timeline.map((point) => Number(point.score.toFixed(2)));
  }

  const sampled = [];
  const indexes = [
    0,
    Math.floor(timeline.length * 0.2),
    Math.floor(timeline.length * 0.4),
    Math.floor(timeline.length * 0.6),
    Math.floor(timeline.length * 0.8),
    timeline.length - 1
  ];
  indexes.forEach((idx) => {
    sampled.push(Number((timeline[idx]?.score || 0).toFixed(2)));
  });
  return sampled;
}

function simulateScenario(scenario) {
  let score = 0;
  let currentTimeSec = 0;
  const timeline = [];
  let highestTier = 'low';
  let reachedHighEventIndex = -1;

  scenario.events.forEach((event, index) => {
    const nextTime = Number(event.dtSec || 0);
    const delta = nextTime - currentTimeSec;
    currentTimeSec = nextTime;
    score = applyDecay(score, delta);

    const weight = AI_EVENT_WEIGHTS[event.type] || 1;
    const severity = clamp(Number(event.severity || 1), 0.1, 3);
    const confidence = clamp(Number(event.confidence || 0.7), 0.1, 1);
    score = clamp(score + weight * severity * confidence, 0, 200);

    const tier = resolveTier(score);
    if (TIER_RANK[tier] > TIER_RANK[highestTier]) highestTier = tier;
    if (TIER_RANK[tier] >= TIER_RANK.high && reachedHighEventIndex === -1) {
      reachedHighEventIndex = index + 1;
    }

    timeline.push({
      index: index + 1,
      type: event.type,
      score: Number(score.toFixed(3)),
      tier
    });
  });

  return {
    score: Number(score.toFixed(3)),
    highestTier,
    reachedHighEventIndex,
    timeline
  };
}

function replayHost(hostname, rawEvents, options = {}) {
  const AI_HOST_FALLBACK_DURATION_SEC = Number(options.fallbackDurationSec || 8 * 60);
  const AI_HOST_FALLBACK_COOLDOWN_SEC = Number(options.fallbackCooldownSec || 2 * 60);
  const events = normalizeEvents(rawEvents);
  let currentSec = events.length > 0 ? Math.max(0, events[0].timeSec) : 0;
  let score = 0;
  let peakTier = 'low';
  let reachedHighEventIndex = -1;
  const fallback = {
    activeUntil: 0,
    cooldownUntil: 0,
    triggers: 0
  };
  const timeline = [];

  events.forEach((event, index) => {
    const deltaSec = Math.max(0, event.timeSec - currentSec);
    currentSec = event.timeSec;
    score = applyDecay(score, deltaSec);

    const weight = AI_EVENT_WEIGHTS[event.type] || 1;
    score = clamp(score + weight * event.severity * event.confidence, 0, 200);

    if ((event.type === 'false_positive_signal' || event.type === 'user_override') && currentSec >= fallback.cooldownUntil) {
      fallback.activeUntil = currentSec + AI_HOST_FALLBACK_DURATION_SEC;
      fallback.cooldownUntil = currentSec + AI_HOST_FALLBACK_COOLDOWN_SEC;
      fallback.triggers += 1;
    }

    const baseTier = resolveTier(score);
    if (TIER_RANK[baseTier] > TIER_RANK[peakTier]) {
      peakTier = baseTier;
    }
    if (TIER_RANK[baseTier] >= TIER_RANK.high && reachedHighEventIndex === -1) {
      reachedHighEventIndex = index + 1;
    }

    const fallbackActive = currentSec < fallback.activeUntil;
    const effectiveTier = fallbackActive ? 'low' : baseTier;

    timeline.push({
      index: index + 1,
      eventType: event.type,
      source: event.source,
      tSec: Number(currentSec.toFixed(3)),
      score: Number(score.toFixed(3)),
      baseTier,
      effectiveTier,
      fallbackActive
    });
  });

  const effectiveTransitions = compressTransitions(timeline.map((point) => point.effectiveTier));
  const baseTransitions = compressTransitions(timeline.map((point) => point.baseTier));
  const final = timeline[timeline.length - 1];
  const finalScore = final ? final.score : 0;
  const finalTier = final ? final.baseTier : 'low';
  const effectiveFinalTier = final ? final.effectiveTier : 'low';
  const minScore = timeline.length > 0 ? Math.min(...timeline.map((item) => item.score)) : 0;
  const maxScore = timeline.length > 0 ? Math.max(...timeline.map((item) => item.score)) : 0;

  return {
    hostname: normalizeHostname(hostname),
    eventCount: timeline.length,
    finalScore: Number(finalScore.toFixed(3)),
    minScore: Number(minScore.toFixed(3)),
    maxScore: Number(maxScore.toFixed(3)),
    peakTier,
    finalTier,
    effectiveFinalTier,
    fallbackTriggers: fallback.triggers,
    reachedHighEventIndex,
    baseTransitions,
    effectiveTransitions,
    riskCurveSample: sampleRiskCurve(timeline),
    timeline
  };
}

module.exports = {
  AI_EVENT_WEIGHTS,
  AI_DECAY_PER_MINUTE,
  TIER_RANK,
  clamp,
  resolveTier,
  applyDecay,
  normalizeHostname,
  normalizeEvents,
  compressTransitions,
  containsOrderedSubsequence,
  sampleRiskCurve,
  simulateScenario,
  replayHost
};
