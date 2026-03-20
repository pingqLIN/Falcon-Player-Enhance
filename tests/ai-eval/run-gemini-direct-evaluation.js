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
  const parts = Array.isArray(payload?.candidates?.[0]?.content?.parts)
    ? payload.candidates[0].content.parts
    : [];
  return parts
    .map((item) => String(item?.text || ''))
    .join('\n')
    .trim();
}

function buildSystemInstruction() {
  return {
    parts: [
      {
        text: [
          'You are the ad-obstruction policy assistant for Falcon-Player-Enhance.',
          'Return JSON only with reversible mitigations and candidate rules.',
          'Do not include markdown fences.',
          'Your JSON must contain summary, confidence, riskScoreDelta, popupStrictMode, guardExternalNavigation, overlayScanMs, sensitivityBoost, extraBlockedDomains, candidateSelectors, candidateDomains, recommendedActions.'
        ].join(' ')
      }
    ]
  };
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
      recommendedActions: ['strings']
    }
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

function resolveGenerateContentUrl(endpoint, model) {
  const value = String(endpoint || '').trim() || `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const url = new URL(value);
  let pathName = url.pathname.replace(/\/+$/, '');

  if (!pathName.endsWith(':generateContent')) {
    if (/\/models\/[^/]+$/i.test(pathName)) {
      pathName += ':generateContent';
    } else {
      pathName = `/v1beta/models/${model}:generateContent`;
    }
  }

  url.pathname = pathName;
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function requestScenario({ endpoint, apiKey, model, timeoutMs, scenario }) {
  const startedAt = Date.now();
  const url = new URL(resolveGenerateContentUrl(endpoint, model));
  url.searchParams.set('key', apiKey);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      system_instruction: buildSystemInstruction(),
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: buildInput(scenario)
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `gemini_generate_content_http_${response.status}`);
  }

  const rawText = getOutputText(payload);
  const json = extractJsonObject(rawText);
  if (!json) {
    throw new Error('gemini_invalid_json');
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
  const endpoint = String(args.endpoint || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  const apiKey = String(args.apiKey || process.env.GEMINI_API_KEY || '').trim();
  const model = String(args.model || 'gemini-2.5-flash').trim();
  const timeoutMs = Number(args.timeout || 30000);
  const report = [];

  if (!apiKey) {
    console.error('Missing GEMINI_API_KEY');
    process.exit(1);
  }
  if (scenarios.length === 0) {
    console.error('No Gemini scenarios found');
    process.exit(1);
  }

  let failed = 0;
  console.log(`Running ${scenarios.length} Gemini evaluation scenario(s) with ${model}`);

  for (const scenario of scenarios) {
    try {
      const result = await requestScenario({
        endpoint,
        apiKey,
        model,
        timeoutMs,
        scenario
      });
      const output = result.json;
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
    console.log(`\nSaved Gemini evaluation report to ${outputPath}`);
  }

  if (failed > 0) {
    console.error(`\nGemini evaluation failed: ${failed} scenario(s)`);
    process.exit(1);
  }

  console.log('\nGemini evaluation passed');
}

run();
