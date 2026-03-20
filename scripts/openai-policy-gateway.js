/* eslint-disable no-console */

const fs = require('fs');
const http = require('http');
const path = require('path');

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);

const DEFAULT_HOST = process.env.GATEWAY_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.GATEWAY_PORT || 8787);
const DEFAULT_SERVICE = process.env.GATEWAY_SERVICE_NAME || 'falcon-policy-gateway';
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const DEFAULT_FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || 'gpt-5-mini';
const DEFAULT_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 20000);
const DEFAULT_TTL_MS = Number(process.env.GATEWAY_POLICY_TTL_MS || 480000);
const DEFAULT_AUTH_TOKEN = String(process.env.GATEWAY_TOKEN || '').trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const OPENAI_BASE_URL = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

const POLICY_SYSTEM_PROMPT = [
  'You are a policy compiler for Falcon-Player-Enhance.',
  'Return exactly one JSON object and no markdown.',
  'Output a single policy object with keys:',
  'schemaVersion, policyVersion, decisionId, source, generatedAt, ttlMs, scope, risk, actions.',
  'Use schemaVersion "1.0.0" and source "ai_model".',
  'risk.tier must be one of low, medium, high, critical.',
  'risk.reasonCodes must be a non-empty array of short snake_case strings.',
  'actions.popupStrictMode and actions.guardExternalNavigation must be booleans.',
  'actions.overlayScanMs must be an integer from 600 to 5000.',
  'actions.sensitivityBoost must be an integer from 0 to 4.',
  'actions.forceSandbox must be a boolean.',
  'actions.extraBlockedDomains must be an array of plain domain fragments.',
  'Only recommend stricter actions when request features strongly justify them.',
  'Never include executable code, prose, or explanations outside the JSON object.'
].join(' ');

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric < min) return min;
  if (numeric > max) return max;
  return numeric;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeStringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => item.slice(0, maxLength))
    .slice(0, maxItems);
}

function inferRiskTier(score) {
  if (score >= 35) return 'critical';
  if (score >= 18) return 'high';
  if (score >= 8) return 'medium';
  return 'low';
}

function buildReasonCodes(requestBody, rawCodes) {
  const explicitCodes = normalizeStringArray(rawCodes, 8, 64);
  if (explicitCodes.length > 0) return explicitCodes;

  const codes = [];
  const eventCounts = requestBody?.features?.eventCounts || {};
  if (Number(eventCounts.blocked_popup || 0) >= 3) codes.push('popup_spike');
  if (Number(eventCounts.blocked_malicious_navigation || 0) >= 1) codes.push('external_navigation_pattern');
  if (Number(eventCounts.overlay_removed || 0) >= 2) codes.push('overlay_resistance');
  if (Number(eventCounts.suspicious_dom_churn || 0) >= 2) codes.push('dom_churn');
  if (codes.length === 0) codes.push(String(requestBody?.trigger?.type || 'policy_review').replace(/[^a-z0-9]+/gi, '_').toLowerCase());
  return codes.slice(0, 8);
}

function extractJsonObject(text) {
  const source = String(text || '').trim();
  if (!source) return null;

  try {
    return JSON.parse(source);
  } catch (_) {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(source.slice(start, end + 1));
    } catch (_) {
      return null;
    }
  }
}

function getResponseOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload?.output)) return '';

  return payload.output
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .filter((item) => item?.type === 'output_text')
    .map((item) => String(item?.text || ''))
    .join('\n')
    .trim();
}

function buildDecisionId(prefix = 'dec') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePolicy(rawPayload, requestBody, decisionId) {
  const candidate = rawPayload && typeof rawPayload === 'object' && rawPayload.policy
    ? rawPayload.policy
    : rawPayload || {};
  const currentScore = clampNumber(
    candidate?.risk?.score ?? requestBody?.features?.riskScore ?? 0,
    0,
    200,
    0
  );
  const popupCount = Number(requestBody?.features?.eventCounts?.blocked_popup || 0);
  const navigationCount = Number(requestBody?.features?.eventCounts?.blocked_malicious_navigation || 0);
  const strictDefault = currentScore >= 18 || popupCount >= 4;
  const navigationDefault = currentScore >= 18 || navigationCount >= 1;
  const overlayDefault = strictDefault ? 1000 : currentScore >= 8 ? 1600 : 2500;
  const boostDefault = currentScore >= 35 ? 3 : currentScore >= 18 ? 2 : currentScore >= 8 ? 1 : 0;
  const allowedFrames = normalizeStringArray(requestBody?.constraints?.allowedFrames, 4, 32);
  const frameDefault = allowedFrames.includes('all') && requestBody?.hostContext?.topFrame !== true ? 'all' : 'top';
  const hostname = String(
    candidate?.scope?.host ||
    requestBody?.hostContext?.hostname ||
    'unknown-host'
  ).trim() || 'unknown-host';
  const selectorClusters = normalizeStringArray(candidate?.scope?.selectorClusters, 12, 200);
  const extraBlockedDomains = normalizeStringArray(candidate?.actions?.extraBlockedDomains, 20, 128);
  const reasonCodes = buildReasonCodes(requestBody, candidate?.risk?.reasonCodes);

  return {
    schemaVersion: '1.0.0',
    policyVersion: Math.max(1, Math.round(Number(candidate?.policyVersion || requestBody?.features?.currentPolicyVersion || 1))),
    decisionId: String(candidate?.decisionId || decisionId || buildDecisionId()),
    source: 'ai_model',
    generatedAt: Math.max(0, Math.round(Number(candidate?.generatedAt || Date.now()))),
    ttlMs: Math.round(clampNumber(candidate?.ttlMs ?? DEFAULT_TTL_MS, 1000, 1800000, DEFAULT_TTL_MS)),
    scope: {
      host: hostname,
      frame: ['top', 'all', 'same_origin', 'cross_origin'].includes(String(candidate?.scope?.frame || ''))
        ? String(candidate.scope.frame)
        : frameDefault,
      ...(selectorClusters.length > 0 ? { selectorClusters } : {})
    },
    risk: {
      tier: ['low', 'medium', 'high', 'critical'].includes(String(candidate?.risk?.tier || ''))
        ? String(candidate.risk.tier)
        : inferRiskTier(currentScore),
      score: currentScore,
      reasonCodes
    },
    actions: {
      popupStrictMode: normalizeBoolean(candidate?.actions?.popupStrictMode, strictDefault),
      guardExternalNavigation: normalizeBoolean(candidate?.actions?.guardExternalNavigation, navigationDefault),
      overlayScanMs: Math.round(clampNumber(candidate?.actions?.overlayScanMs ?? overlayDefault, 600, 5000, overlayDefault)),
      sensitivityBoost: Math.round(clampNumber(candidate?.actions?.sensitivityBoost ?? boostDefault, 0, 4, boostDefault)),
      forceSandbox: normalizeBoolean(candidate?.actions?.forceSandbox, false),
      extraBlockedDomains
    },
    ...(candidate?.telemetryHints && typeof candidate.telemetryHints === 'object'
      ? {
          telemetryHints: {
            ...(Number.isFinite(Number(candidate.telemetryHints.sampleRate))
              ? { sampleRate: clampNumber(candidate.telemetryHints.sampleRate, 0, 1, 0.5) }
              : {}),
            ...(candidate.telemetryHints.trackPolicyApplyLatency === true
              ? { trackPolicyApplyLatency: true }
              : {}),
            ...(candidate.telemetryHints.trackFalsePositiveSignals === true
              ? { trackFalsePositiveSignals: true }
              : {})
          }
        }
      : {})
  };
}

function validatePolicy(policy) {
  const errors = [];

  if (!policy || typeof policy !== 'object') {
    return [{ code: 'SCHEMA_VALIDATION_FAILED', path: '', message: 'policy must be an object' }];
  }

  if (policy.schemaVersion !== '1.0.0') {
    errors.push({ code: 'SCHEMA_VALIDATION_FAILED', path: 'schemaVersion', message: 'must equal 1.0.0' });
  }
  if (!policy.scope || !String(policy.scope.host || '').trim()) {
    errors.push({ code: 'SCHEMA_VALIDATION_FAILED', path: 'scope.host', message: 'host is required' });
  }
  if (!Array.isArray(policy.risk?.reasonCodes) || policy.risk.reasonCodes.length === 0) {
    errors.push({ code: 'SCHEMA_VALIDATION_FAILED', path: 'risk.reasonCodes', message: 'must contain at least one reason code' });
  }
  if (!Number.isFinite(Number(policy.actions?.overlayScanMs)) || Number(policy.actions.overlayScanMs) < 600) {
    errors.push({ code: 'SCHEMA_VALIDATION_FAILED', path: 'actions.overlayScanMs', message: 'must be >= 600' });
  }
  if (!Array.isArray(policy.actions?.extraBlockedDomains)) {
    errors.push({ code: 'SCHEMA_VALIDATION_FAILED', path: 'actions.extraBlockedDomains', message: 'must be an array' });
  }

  return errors;
}

function buildModelCandidates(preferredModel) {
  const models = [
    String(preferredModel || '').trim(),
    DEFAULT_MODEL,
    DEFAULT_FALLBACK_MODEL
  ].filter(Boolean);
  return Array.from(new Set(models));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const size = chunks.reduce((total, item) => total + item.length, 0);
    if (size > 1024 * 1024) {
      throw new Error('request_too_large');
    }
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload, null, 2));
}

function enforceBearerToken(request) {
  if (!DEFAULT_AUTH_TOKEN) return null;
  const header = String(request.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token === DEFAULT_AUTH_TOKEN) return null;
  return {
    statusCode: 401,
    payload: {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Bearer token is missing or invalid.'
      }
    }
  };
}

async function requestOpenAIPolicy(requestBody) {
  if (!OPENAI_API_KEY) {
    throw new Error('openai_api_key_missing');
  }

  const models = buildModelCandidates(requestBody?.providerHints?.preferredModel);
  let lastError = new Error('openai_request_failed');

  for (const model of models) {
    const startedAt = Date.now();
    const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: 'low' },
        instructions: POLICY_SYSTEM_PROMPT,
        input: JSON.stringify(requestBody),
        max_output_tokens: 900
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload?.error?.message || `openai_responses_http_${response.status}`);
      lastError = new Error(message);
      if (/model/i.test(message) || response.status === 404) {
        continue;
      }
      throw lastError;
    }

    const rawText = getResponseOutputText(payload);
    const parsed = extractJsonObject(rawText);
    if (!parsed) {
      lastError = new Error('openai_invalid_json');
      continue;
    }

    const decisionId = buildDecisionId('dec');
    const policy = normalizePolicy(parsed, requestBody, decisionId);
    const errors = validatePolicy(policy);
    if (errors.length > 0) {
      lastError = new Error(errors[0].message);
      continue;
    }

    return {
      model,
      latencyMs: Date.now() - startedAt,
      responseId: String(payload?.id || ''),
      rawText,
      policy
    };
  }

  throw lastError;
}

function buildHealthPayload() {
  return {
    status: OPENAI_API_KEY ? 'ok' : 'degraded',
    service: DEFAULT_SERVICE,
    version: packageJson.version,
    time: Date.now(),
    modelCandidates: buildModelCandidates(DEFAULT_MODEL)
  };
}

async function handlePolicyRecommend(request, response) {
  const requestBody = await readJsonBody(request);
  const hostname = String(requestBody?.hostContext?.hostname || '').trim();
  if (!hostname) {
    writeJson(response, 400, {
      error: {
        code: 'BAD_REQUEST',
        message: 'hostContext.hostname is required.'
      }
    });
    return;
  }

  try {
    const compiled = await requestOpenAIPolicy(requestBody);
    writeJson(response, 200, {
      requestId: String(requestBody.requestId || buildDecisionId('req')),
      decisionId: compiled.policy.decisionId,
      model: {
        provider: 'openai',
        name: compiled.model,
        latencyMs: compiled.latencyMs
      },
      policy: compiled.policy,
      audit: {
        compiled: true,
        compilerVersion: packageJson.version,
        policyHash: `${compiled.policy.decisionId}:${compiled.responseId || 'response'}`,
        fallbackUsed: false
      }
    });
  } catch (error) {
    writeJson(response, 500, {
      requestId: String(requestBody.requestId || buildDecisionId('req')),
      error: {
        code: 'INTERNAL_ERROR',
        message: String(error?.message || error)
      }
    });
  }
}

async function handlePolicyValidate(request, response) {
  const requestBody = await readJsonBody(request);
  const normalizedPolicy = normalizePolicy(
    requestBody?.policy || {},
    {
      hostContext: {
        hostname: requestBody?.policy?.scope?.host || 'unknown-host',
        topFrame: true
      },
      features: {
        riskScore: requestBody?.policy?.risk?.score || 0,
        currentPolicyVersion: requestBody?.policy?.policyVersion || 1,
        eventCounts: {}
      },
      constraints: {
        allowedFrames: ['top']
      }
    },
    String(requestBody?.policy?.decisionId || buildDecisionId('dec'))
  );
  const errors = validatePolicy(normalizedPolicy);

  if (errors.length > 0) {
    writeJson(response, 422, {
      requestId: String(requestBody.requestId || buildDecisionId('req')),
      valid: false,
      errors
    });
    return;
  }

  writeJson(response, 200, {
    requestId: String(requestBody.requestId || buildDecisionId('req')),
    valid: true,
    normalizedPolicy,
    warnings: []
  });
}

const server = http.createServer(async (request, response) => {
  const authFailure = enforceBearerToken(request);
  if (authFailure) {
    writeJson(response, authFailure.statusCode, authFailure.payload);
    return;
  }

  const url = new URL(request.url || '/', `http://${request.headers.host || `${DEFAULT_HOST}:${DEFAULT_PORT}`}`);

  if (request.method === 'GET' && url.pathname === '/v1/health') {
    writeJson(response, 200, buildHealthPayload());
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/policy/recommend') {
    await handlePolicyRecommend(request, response);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/policy/validate') {
    await handlePolicyValidate(request, response);
    return;
  }

  writeJson(response, 404, {
    error: {
      code: 'NOT_FOUND',
      message: `${request.method || 'GET'} ${url.pathname} is not available.`
    }
  });
});

server.listen(DEFAULT_PORT, DEFAULT_HOST, () => {
  console.log(
    `[gateway] ${DEFAULT_SERVICE} listening on http://${DEFAULT_HOST}:${DEFAULT_PORT}/v1 using ${buildModelCandidates(DEFAULT_MODEL).join(' -> ')}`
  );
});
