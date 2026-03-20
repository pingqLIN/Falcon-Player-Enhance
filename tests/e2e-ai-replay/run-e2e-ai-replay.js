/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const {
  TIER_RANK,
  containsOrderedSubsequence,
  normalizeHostname,
  replayHost
} = require('../ai-eval/lib/policy-engine');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dataset') args.dataset = argv[i + 1];
    if (token === '--scenarios') args.scenarios = argv[i + 1];
    if (token === '--out') args.out = argv[i + 1];
  }
  return args;
}

function validateReplay(expectation, replay) {
  const errors = [];
  const rules = expectation || {};

  if (rules.maxTier && TIER_RANK[replay.peakTier] > TIER_RANK[rules.maxTier]) {
    errors.push(`expected maxTier <= ${rules.maxTier}, got ${replay.peakTier}`);
  }
  if (rules.minTier && TIER_RANK[replay.peakTier] < TIER_RANK[rules.minTier]) {
    errors.push(`expected minTier >= ${rules.minTier}, got ${replay.peakTier}`);
  }
  if (rules.finalTier && replay.finalTier !== rules.finalTier) {
    errors.push(`expected finalTier ${rules.finalTier}, got ${replay.finalTier}`);
  }
  if (rules.effectiveFinalTier && replay.effectiveFinalTier !== rules.effectiveFinalTier) {
    errors.push(`expected effectiveFinalTier ${rules.effectiveFinalTier}, got ${replay.effectiveFinalTier}`);
  }
  if (typeof rules.requireFallback === 'boolean') {
    const actualFallback = replay.fallbackTriggers > 0;
    if (actualFallback !== rules.requireFallback) {
      errors.push(`expected requireFallback=${rules.requireFallback}, got ${actualFallback}`);
    }
  }
  if (Array.isArray(rules.transitions) && !containsOrderedSubsequence(replay.effectiveTransitions, rules.transitions)) {
    errors.push(`expected transitions include ordered sequence ${rules.transitions.join('>')}, got ${replay.effectiveTransitions.join('>')}`);
  }
  if (Number.isFinite(Number(rules.reachWithinEvents))) {
    if (replay.reachedHighEventIndex < 0) {
      errors.push(`expected high tier within ${rules.reachWithinEvents} events, but never reached`);
    } else if (replay.reachedHighEventIndex > Number(rules.reachWithinEvents)) {
      errors.push(`expected high tier within ${rules.reachWithinEvents} events, got ${replay.reachedHighEventIndex}`);
    }
  }

  return errors;
}

function buildCasesFromScenariosDoc(doc) {
  const scenarios = Array.isArray(doc?.scenarios) ? doc.scenarios : [];
  return scenarios.map((scenario, index) => ({
    name: String(scenario.name || `scenario_${index + 1}`),
    hostname: normalizeHostname(
      scenario.hostname || scenario.host || scenario.domain || scenario.name || `host-${index + 1}`
    ),
    events: Array.isArray(scenario.events) ? scenario.events : [],
    expectation: scenario.expectation || {}
  }));
}

function buildCasesFromDatasetDoc(doc) {
  if (Array.isArray(doc?.scenarios)) {
    return buildCasesFromScenariosDoc(doc);
  }

  const telemetry = Array.isArray(doc?.telemetry) ? doc.telemetry : [];
  const grouped = new Map();

  telemetry.forEach((entry) => {
    const hostname = normalizeHostname(entry?.hostname || entry?.context?.hostname || entry?.context?.url);
    if (!grouped.has(hostname)) {
      grouped.set(hostname, []);
    }
    grouped.get(hostname).push(entry);
  });

  return Array.from(grouped.entries()).map(([hostname, events], index) => ({
    name: `dataset_${index + 1}_${hostname}`,
    hostname,
    events,
    expectation: {}
  }));
}

function buildCases(doc) {
  if (Array.isArray(doc?.telemetry) || Array.isArray(doc?.profiles)) {
    return buildCasesFromDatasetDoc(doc);
  }
  return buildCasesFromScenariosDoc(doc);
}

function runCase(testCase) {
  const replay = replayHost(testCase.hostname, testCase.events);
  const errors = validateReplay(testCase.expectation, replay);
  return {
    name: testCase.name,
    hostname: testCase.hostname,
    replay,
    errors
  };
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.dataset || args.scenarios || path.join(__dirname, 'scenarios.json'));
  const doc = loadJson(inputPath);
  const cases = buildCases(doc);

  if (cases.length === 0) {
    console.error('No replay cases found');
    process.exit(1);
  }

  const results = cases.map(runCase);
  const failed = results.filter((item) => item.errors.length > 0);

  results.forEach((result) => {
    console.log(`\n[${result.errors.length === 0 ? 'PASS' : 'FAIL'}] ${result.name}`);
    console.log(
      `  host=${result.hostname} peakTier=${result.replay.peakTier} final=${result.replay.finalTier} effectiveFinal=${result.replay.effectiveFinalTier}`
    );
    console.log(
      `  scoreRange=${result.replay.minScore}..${result.replay.maxScore} transitions=${result.replay.effectiveTransitions.join('>') || 'n/a'}`
    );
    result.errors.forEach((error) => console.log(`  - ${error}`));
  });

  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
    console.log(`\nSaved replay output to ${path.resolve(args.out)}`);
  }

  if (failed.length > 0) {
    console.error(`\nReplay failed: ${failed.length} case(s) did not satisfy expectations`);
    process.exit(1);
  }

  console.log('\nReplay passed: all cases satisfied expectations');
}

run();
