/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { chatJson, parseArgs } = require('./lib/lm-studio-client');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function buildMessages(scenario) {
  return [
    {
      role: 'system',
      content:
        'You are the local ad-obstruction policy assistant for Falcon-Player-Enhance. Return JSON only with reversible mitigations and candidate rules.'
    },
    {
      role: 'user',
      content: JSON.stringify({
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
      })
    }
  ];
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

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const scenariosPath = path.resolve(args.scenarios || path.join(__dirname, 'scenarios.lmstudio.json'));
  const doc = loadJson(scenariosPath);
  const scenarios = Array.isArray(doc.scenarios) ? doc.scenarios : [];
  const useMock = args.mock === true || args.mock === 'true';
  const report = [];

  if (scenarios.length === 0) {
    console.error('No LM Studio scenarios found');
    process.exit(1);
  }

  let failed = 0;
  console.log(`Running ${scenarios.length} LM Studio evaluation scenario(s)${useMock ? ' in mock mode' : ''}`);

  for (const scenario of scenarios) {
    let output = null;
    let model = 'mock';

    try {
      if (useMock) {
        output = scenario.mockResponse || null;
      } else {
        const result = await chatJson({
          endpoint: args.endpoint,
          apiKey: args.apiKey,
          model: args.model,
          timeoutMs: args.timeout,
          messages: buildMessages(scenario)
        });
        output = result.json;
        model = result.model;
      }
    } catch (error) {
      output = { summary: '', confidence: 0, recommendedActions: [], candidateSelectors: [] };
      report.push({
        name: scenario.name,
        hostname: scenario.hostname,
        status: 'FAIL',
        model,
        output,
        errors: [`request_error:${String(error.message || error)}`]
      });
      console.log(`\n[FAIL] ${scenario.name}`);
      console.log(`  - request_error:${String(error.message || error)}`);
      failed += 1;
      continue;
    }

    const errors = validateScenarioOutput(scenario, output);
    const status = errors.length === 0 ? 'PASS' : 'FAIL';
    if (errors.length > 0) failed += 1;

    console.log(`\n[${status}] ${scenario.name}`);
    console.log(`  model=${model} confidence=${Number(output.confidence || 0).toFixed(2)} delta=${Number(output.riskScoreDelta || 0).toFixed(2)}`);
    console.log(`  summary=${String(output.summary || '').slice(0, 140)}`);
    console.log(`  selectors=${Array.isArray(output.candidateSelectors) ? output.candidateSelectors.length : 0} actions=${Array.isArray(output.recommendedActions) ? output.recommendedActions.join(',') : 'none'}`);
    errors.forEach((error) => console.log(`  - ${error}`));
    report.push({
      name: scenario.name,
      hostname: scenario.hostname,
      status,
      model,
      output,
      errors
    });
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
          mode: useMock ? 'mock' : 'live',
          report
        },
        null,
        2
      )
    );
    console.log(`\nSaved LM Studio evaluation report to ${outputPath}`);
  }

  if (failed > 0) {
    console.error(`\nLM Studio evaluation failed: ${failed} scenario(s)`);
    process.exit(1);
  }

  console.log('\nLM Studio evaluation passed');
}

run();
