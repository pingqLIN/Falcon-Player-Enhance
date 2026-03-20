/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const next = argv[i + 1];
    args[token.slice(2)] = next && !next.startsWith('--') ? next : true;
  }
  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractJsonObject(text) {
  const source = String(text || '').trim();
  if (!source) return null;

  try {
    return JSON.parse(source);
  } catch (_) {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(source.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
  }

  return null;
}

function getOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload?.output)) return '';

  return payload.output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((item) => item?.type === 'output_text')
    .map((item) => String(item?.text || ''))
    .join('\n')
    .trim();
}

function normalizeRecommendedActionTokens(values, output = {}) {
  const tokens = new Set();
  const items = Array.isArray(values) ? values : [];
  const exactTokens = new Set([
    'tighten_popup_guard',
    'tune_overlay_scan',
    'guard_external_navigation',
    'apply_extra_blocked_domains'
  ]);

  items.forEach((value) => {
    const source = String(value || '').trim().toLowerCase();
    if (!source) return;

    if (exactTokens.has(source)) {
      tokens.add(source);
      return;
    }

    if (
      source.includes('tighten popup guard') ||
      source.includes('popup guard mode') ||
      source.includes('popup strict mode')
    ) {
      tokens.add('tighten_popup_guard');
    }
    if (
      source.includes('tune overlay scan') ||
      source.includes('increase overlay scan') ||
      source.includes('overlay scan duration') ||
      source.includes('overlay scan window')
    ) {
      tokens.add('tune_overlay_scan');
    }
    if (
      source.includes('guard external navigation') ||
      source.includes('external navigation guard') ||
      source.includes('navigation guard mode')
    ) {
      tokens.add('guard_external_navigation');
    }
    if (
      source.includes('apply extra blocked domains') ||
      source.includes('expand blocked domains') ||
      source.includes('extra blocked domains')
    ) {
      tokens.add('apply_extra_blocked_domains');
    }
  });

  if (output.popupStrictMode === true) {
    tokens.add('tighten_popup_guard');
  }
  if (output.guardExternalNavigation === true) {
    tokens.add('guard_external_navigation');
  }
  if (Number.isFinite(Number(output.overlayScanMs)) && Number(output.overlayScanMs) > 0) {
    tokens.add('tune_overlay_scan');
  }
  if (Array.isArray(output.extraBlockedDomains) && output.extraBlockedDomains.length > 0) {
    tokens.add('apply_extra_blocked_domains');
  }

  return Array.from(tokens).slice(0, 4);
}

function normalizeOutput(output) {
  if (!output || typeof output !== 'object') return output;

  const normalized = { ...output };
  normalized.candidateSelectors = Array.isArray(output.candidateSelectors)
    ? Array.from(new Set(output.candidateSelectors.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 16)
    : [];
  normalized.candidateDomains = Array.isArray(output.candidateDomains)
    ? Array.from(new Set(output.candidateDomains.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 12)
    : [];
  normalized.extraBlockedDomains = Array.isArray(output.extraBlockedDomains)
    ? Array.from(new Set(output.extraBlockedDomains.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 12)
    : [];
  normalized.recommendedActions = normalizeRecommendedActionTokens(output.recommendedActions, normalized);
  return normalized;
}

function buildInstructions() {
  return [
    'You are the ad-obstruction policy assistant for Falcon-Player-Enhance.',
    'Return JSON only with reversible mitigations and candidate rules.',
    'Do not include markdown fences.',
    'Your JSON must contain summary, confidence, riskScoreDelta, popupStrictMode, guardExternalNavigation, overlayScanMs, sensitivityBoost, extraBlockedDomains, candidateSelectors, candidateDomains, recommendedActions.',
    'recommendedActions must use tokens only from this enum: tighten_popup_guard, tune_overlay_scan, guard_external_navigation, apply_extra_blocked_domains.',
    'Never use natural-language sentences inside recommendedActions.'
  ].join(' ');
}

function buildInput(scenario) {
  return JSON.stringify({
    task: 'evaluate_player_ad_obstruction',
    hostname: scenario.hostname,
    context: scenario.context || {},
    heuristicPolicy: scenario.heuristicPolicy || {},
    recentEvents: scenario.recentEvents || [],
    outputSchema: {
      summary: 'string',
      confidence: 'number 0.1-1.0',
      riskScoreDelta: 'number -6..12',
      popupStrictMode: 'boolean',
      guardExternalNavigation: 'boolean',
      overlayScanMs: 'integer 600-5000',
      sensitivityBoost: 'integer 0-3',
      extraBlockedDomains: ['strings'],
      candidateSelectors: ['css selectors'],
      candidateDomains: ['strings'],
      recommendedActions: [
        'tighten_popup_guard',
        'tune_overlay_scan',
        'guard_external_navigation',
        'apply_extra_blocked_domains'
      ]
    },
    constraints: [
      'recommendedActions must be enum tokens only',
      'candidateSelectors should usually contain 1-8 narrow selectors'
    ]
  });
}

function validateScenarioOutput(scenario, output) {
  const errors = [];
  const expectation = scenario.expectation || {};

  if (!output || typeof output !== 'object') {
    return ['missing_output_object'];
  }

  if (!String(output.summary || '').trim()) {
    errors.push('missing_summary');
  }
  if (Number(output.confidence || 0) < Number(expectation.minConfidence || 0)) {
    errors.push(`confidence_below_threshold:${output.confidence}`);
  }

  const requiredActions = Array.isArray(expectation.requiredActions) ? expectation.requiredActions : [];
  requiredActions.forEach((action) => {
    if (!Array.isArray(output.recommendedActions) || !output.recommendedActions.includes(action)) {
      errors.push(`missing_required_action:${action}`);
    }
  });

  if (!Array.isArray(output.candidateSelectors) || output.candidateSelectors.length === 0) {
    errors.push('missing_candidate_selectors');
  }

  return errors;
}

async function requestScenario({ endpoint, apiKey, model, timeoutMs, scenario }) {
  const startedAt = Date.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: 'low' },
      instructions: buildInstructions(),
      input: buildInput(scenario),
      max_output_tokens: 900
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `openai_responses_http_${response.status}`);
  }

  const rawText = getOutputText(payload);
  const json = extractJsonObject(rawText);
  if (!json) {
    throw new Error('openai_invalid_json');
  }

  return {
    latencyMs: Date.now() - startedAt,
    payload,
    rawText,
    json
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const scenariosPath = path.resolve(args.scenarios || path.join(__dirname, 'scenarios.lmstudio.json'));
  const doc = loadJson(scenariosPath);
  const scenarios = Array.isArray(doc.scenarios) ? doc.scenarios : [];
  const endpoint = String(args.endpoint || 'https://api.openai.com/v1/responses');
  const apiKey = String(args.apiKey || process.env.OPENAI_API_KEY || '').trim();
  const model = String(args.model || 'gpt-5.4-mini').trim();
  const timeoutMs = Number(args.timeout || 30000);
  const report = [];

  if (!apiKey) {
    console.error('Missing OPENAI_API_KEY');
    process.exit(1);
  }
  if (scenarios.length === 0) {
    console.error('No OpenAI scenarios found');
    process.exit(1);
  }

  let failed = 0;
  console.log(`Running ${scenarios.length} OpenAI evaluation scenario(s) with ${model}`);

  for (const scenario of scenarios) {
    try {
      const result = await requestScenario({
        endpoint,
        apiKey,
        model,
        timeoutMs,
        scenario
      });
      const output = normalizeOutput(result.json);
      const errors = validateScenarioOutput(scenario, output);
      const status = errors.length === 0 ? 'PASS' : 'FAIL';
      if (errors.length > 0) failed += 1;

      console.log(`\n[${status}] ${scenario.name}`);
      console.log(`  model=${model} latency=${result.latencyMs}ms confidence=${Number(output.confidence || 0).toFixed(2)} delta=${Number(output.riskScoreDelta || 0).toFixed(2)}`);
      console.log(`  summary=${String(output.summary || '').slice(0, 160)}`);
      console.log(`  selectors=${Array.isArray(output.candidateSelectors) ? output.candidateSelectors.length : 0} actions=${Array.isArray(output.recommendedActions) ? output.recommendedActions.join(',') : 'none'}`);
      errors.forEach((error) => console.log(`  - ${error}`));

      report.push({
        name: scenario.name,
        status,
        model,
        latencyMs: result.latencyMs,
        output,
        errors
      });
    } catch (error) {
      failed += 1;
      console.log(`\n[FAIL] ${scenario.name}`);
      console.log(`  - request_error:${String(error?.message || error)}`);
      report.push({
        name: scenario.name,
        status: 'FAIL',
        model,
        latencyMs: null,
        output: null,
        errors: [`request_error:${String(error?.message || error)}`]
      });
    }
  }

  if (args.out) {
    const outputPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: scenariosPath,
          endpoint,
          model,
          report
        },
        null,
        2
      )
    );
    console.log(`\nSaved OpenAI evaluation report to ${outputPath}`);
  }

  if (failed > 0) {
    console.error(`\nOpenAI evaluation failed: ${failed} scenario(s)`);
    process.exit(1);
  }

  console.log('\nOpenAI evaluation passed');
}

run();
