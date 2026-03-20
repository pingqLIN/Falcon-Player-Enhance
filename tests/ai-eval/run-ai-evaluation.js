/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { TIER_RANK, simulateScenario } = require('./lib/policy-engine');

function validateScenario(scenario, result) {
  const expectation = scenario.expectation || {};
  const errors = [];

  if (expectation.maxTier && TIER_RANK[result.highestTier] > TIER_RANK[expectation.maxTier]) {
    errors.push(`expected maxTier <= ${expectation.maxTier}, got ${result.highestTier}`);
  }

  if (expectation.minTier && TIER_RANK[result.highestTier] < TIER_RANK[expectation.minTier]) {
    errors.push(`expected minTier >= ${expectation.minTier}, got ${result.highestTier}`);
  }

  if (expectation.reachWithinEvents && result.reachedHighEventIndex > 0) {
    if (result.reachedHighEventIndex > expectation.reachWithinEvents) {
      errors.push(
        `expected high risk within ${expectation.reachWithinEvents} events, got ${result.reachedHighEventIndex}`
      );
    }
  } else if (expectation.reachWithinEvents && result.reachedHighEventIndex < 0) {
    errors.push(`expected high risk within ${expectation.reachWithinEvents} events, but never reached`);
  }

  return errors;
}

function run() {
  const scenariosPath = path.resolve(__dirname, 'scenarios.json');
  const content = fs.readFileSync(scenariosPath, 'utf-8');
  const parsed = JSON.parse(content);
  const scenarios = parsed.scenarios || [];

  if (scenarios.length === 0) {
    console.error('No scenarios found');
    process.exit(1);
  }

  let failed = 0;
  console.log(`Running ${scenarios.length} AI evaluation scenarios`);

  scenarios.forEach((scenario) => {
    const result = simulateScenario(scenario);
    const errors = validateScenario(scenario, result);
    const status = errors.length === 0 ? 'PASS' : 'FAIL';
    if (errors.length > 0) failed += 1;

    console.log(`\n[${status}] ${scenario.name}`);
    console.log(`  highestTier=${result.highestTier} finalScore=${result.score}`);
    if (result.reachedHighEventIndex > 0) {
      console.log(`  reachedHighAtEvent=${result.reachedHighEventIndex}`);
    }
    errors.forEach((err) => console.log(`  - ${err}`));
  });

  if (failed > 0) {
    console.error(`\nEvaluation failed: ${failed} scenario(s) did not meet expectations`);
    process.exit(1);
  }

  console.log('\nEvaluation passed: all scenarios satisfied expectations');
}

run();
