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
        'You generate structured blocking-rule candidates for Falcon-Player-Enhance. Return JSON only. Do not output executable JavaScript.'
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'generate_player_ad_rule_candidates',
        hostname: scenario.hostname,
        context: scenario.context || {},
        heuristicPolicy: scenario.heuristicPolicy || {},
        recentEvents: scenario.recentEvents || [],
        outputSchema: {
          summary: 'string',
          selectorRules: [{ selector: 'string', reason: 'string' }],
          domainRules: [{ pattern: 'string', reason: 'string' }],
          actionPlan: ['strings']
        }
      })
    }
  ];
}

function toRuleCandidateDocument(inputPath, results, provider) {
  return {
    generatedAt: new Date().toISOString(),
    provider,
    source: path.resolve(inputPath),
    candidates: results.map((item) => ({
      name: item.name,
      hostname: item.hostname,
      summary: item.output.summary || '',
      selectorRules: Array.isArray(item.output.selectorRules)
        ? item.output.selectorRules
        : (item.output.candidateSelectors || []).map((selector) => ({ selector, reason: 'lmstudio_candidate' })),
      domainRules: Array.isArray(item.output.domainRules)
        ? item.output.domainRules
        : (item.output.candidateDomains || []).map((pattern) => ({ pattern, reason: 'lmstudio_candidate' })),
      actionPlan: Array.isArray(item.output.actionPlan)
        ? item.output.actionPlan
        : Array.isArray(item.output.recommendedActions)
        ? item.output.recommendedActions
        : []
    }))
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const scenariosPath = path.resolve(args.scenarios || path.join(__dirname, 'scenarios.lmstudio.json'));
  const outputPath = path.resolve(
    args.out || path.join(__dirname, 'generated-rule-candidates.sample.json')
  );
  const doc = loadJson(scenariosPath);
  const scenarios = Array.isArray(doc.scenarios) ? doc.scenarios : [];
  const useMock = args.mock === true || args.mock === 'true';

  if (scenarios.length === 0) {
    console.error('No LM Studio scenarios found');
    process.exit(1);
  }

  const results = [];

  for (const scenario of scenarios) {
    let output = null;
    let model = 'mock';
    if (useMock) {
      output = scenario.mockResponse || {};
    } else {
      const response = await chatJson({
        endpoint: args.endpoint,
        apiKey: args.apiKey,
        model: args.model,
        timeoutMs: args.timeout,
        messages: buildMessages(scenario)
      });
      output = response.json;
      model = response.model;
    }

    results.push({
      name: scenario.name,
      hostname: scenario.hostname,
      model,
      output
    });
  }

  const provider = useMock ? 'lmstudio-mock' : 'lmstudio';
  const document = toRuleCandidateDocument(scenariosPath, results, provider);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));
  console.log(`Wrote ${document.candidates.length} candidate set(s) to ${outputPath}`);
}

run().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
