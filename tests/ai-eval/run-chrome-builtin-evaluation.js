/* eslint-disable no-console */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

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

function buildResponseSchema() {
  return {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      confidence: { type: 'number' },
      riskScoreDelta: { type: 'number' },
      popupStrictMode: { type: 'boolean' },
      guardExternalNavigation: { type: 'boolean' },
      overlayScanMs: { type: 'number' },
      sensitivityBoost: { type: 'number' },
      extraBlockedDomains: { type: 'array', items: { type: 'string' } },
      candidateSelectors: { type: 'array', items: { type: 'string' } },
      candidateDomains: { type: 'array', items: { type: 'string' } },
      recommendedActions: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'tighten_popup_guard',
            'tune_overlay_scan',
            'guard_external_navigation',
            'apply_extra_blocked_domains'
          ]
        }
      }
    },
    required: [
      'summary',
      'confidence',
      'riskScoreDelta',
      'popupStrictMode',
      'guardExternalNavigation',
      'overlayScanMs',
      'sensitivityBoost',
      'extraBlockedDomains',
      'candidateSelectors',
      'candidateDomains',
      'recommendedActions'
    ],
    additionalProperties: false
  };
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

async function waitForExtensionId(context, timeoutMs = 15000) {
  const existingWorker = context.serviceWorkers()[0];
  if (existingWorker) {
    return new URL(existingWorker.url()).host;
  }

  try {
    const worker = await context.waitForEvent('serviceworker', { timeout: timeoutMs });
    return new URL(worker.url()).host;
  } catch (_) {
    return '';
  }
}

async function launchExtensionContext(rootDir, headless) {
  const extensionDir = path.resolve(rootDir, 'extension');
  const userDataDir = path.resolve(rootDir, '.tmp', 'chrome-builtin-eval-profile');
  fs.mkdirSync(userDataDir, { recursive: true });

  const launchAttempts = [
    [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`
    ],
    [`--load-extension=${extensionDir}`]
  ];

  for (const args of launchAttempts) {
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless,
      ignoreDefaultArgs: ['--disable-extensions'],
      args,
      viewport: { width: 1440, height: 960 }
    });

    const extensionId = await waitForExtensionId(context);
    if (extensionId) {
      return {
        context,
        extensionId
      };
    }

    await context.close().catch(() => {});
  }

  throw new Error('chrome_extension_not_loaded');
}

async function startLocalhostServer(port = 41731) {
  const html = '<!doctype html><html><body>chrome-built-in-ai-probe</body></html>';
  const server = http.createServer((_, response) => {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(html);
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    server,
    url: `http://127.0.0.1:${port}/`
  };
}

async function launchBuiltInContext(rootDir, headless) {
  const userDataDir = path.resolve(rootDir, '.tmp', 'chrome-built-in-localhost-profile');
  fs.mkdirSync(userDataDir, { recursive: true });

  return chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless,
    args: ['--enable-features=OptimizationGuideOnDeviceModel,AIPromptAPI,AIPromptAPIMultimodalInput'],
    viewport: { width: 1440, height: 960 }
  });
}

async function prepareBridgePage(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/testing/ai-eval.html`, {
    waitUntil: 'load',
    timeout: 45000
  });
  await page.waitForFunction(() => Boolean(window.falconAiEval?.ready), null, {
    timeout: 15000
  });
  return page;
}

async function runIntegrationSmoke(page, model) {
  const initial = await page.evaluate(() => window.falconAiEval.getProviderSettings());
  const originalSettings = initial?.settings || {};
  const nextSettings = {
    provider: 'chrome_builtin',
    enabled: true,
    endpoint: 'chrome://built-in-ai/prompt-api',
    model,
    apiKey: '',
    mode: 'advisory',
    timeoutMs: 25000,
    cooldownMs: 25000,
    enableDynamicRuleCandidates: true
  };

  try {
    const saved = await page.evaluate((settings) => window.falconAiEval.saveProviderSettings(settings), nextSettings);
    const health = await page.evaluate((settings) => window.falconAiEval.runHealthCheck(settings), nextSettings);
    const classification = await page.evaluate(() =>
      window.falconAiEval.classifyElement({
        hostname: 'probe.test',
        pageUrl: 'https://probe.test/watch/demo',
        selector: 'a.watch-now-overlay',
        text: 'Watch now',
        href: 'https://redirector.example/offer',
        src: '',
        className: 'watch-now-overlay cta-layer',
        id: 'watch-cta',
        computedStyle: { position: 'fixed', zIndex: '9999' },
        rect: { width: 640, height: 360 }
      })
    );

    return {
      saved,
      health,
      classification
    };
  } finally {
    await page.evaluate((settings) => window.falconAiEval.saveProviderSettings({
      ...(settings || {}),
      apiKey: ''
    }), originalSettings).catch(() => {});
  }
}

async function tryExtensionIntegration(rootDir, headless, model) {
  let context = null;
  let page = null;

  try {
    const launched = await launchExtensionContext(rootDir, headless);
    context = launched.context;
    page = await prepareBridgePage(context, launched.extensionId);
    const integration = await runIntegrationSmoke(page, model);
    return {
      success: integration?.health?.success === true,
      extensionId: launched.extensionId,
      ...integration
    };
  } catch (error) {
    return {
      success: false,
      error: String(error?.message || error)
    };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

async function runScenarioInPage(page, scenario, model, timeoutMs) {
  const startedAt = Date.now();
  const result = await page.evaluate(async ({ scenarioPayload, instructions, schema, modelName }) => {
    if (typeof LanguageModel === 'undefined') {
      throw new Error('chrome_builtin_api_unavailable');
    }

    const availability = await LanguageModel.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }]
    });

    const session = await LanguageModel.create({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      initialPrompts: [{ role: 'system', content: instructions }]
    });

    try {
      const text = await session.prompt(JSON.stringify(scenarioPayload), {
        responseConstraint: schema,
        omitResponseConstraintInput: true
      });
      return {
        availability,
        resolvedModel: modelName,
        rawText: String(text || ''),
        json: JSON.parse(String(text || ''))
      };
    } finally {
      session.destroy();
    }
  }, {
    scenarioPayload: JSON.parse(buildInput(scenario)),
    instructions: buildInstructions(),
    schema: buildResponseSchema(),
    modelName: model
  });

  return {
    latencyMs: Date.now() - startedAt,
    availability: result.availability,
    resolvedModel: result.resolvedModel,
    rawText: result.rawText,
    json: normalizeOutput(result.json)
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(__dirname, '..', '..');
  const scenariosPath = path.resolve(args.scenarios || path.join(__dirname, 'scenarios.lmstudio.json'));
  const doc = loadJson(scenariosPath);
  const scenarios = Array.isArray(doc.scenarios) ? doc.scenarios : [];
  const model = String(args.model || 'gemini-nano').trim();
  const timeoutMs = Number(args.timeout || 45000);
  const outputPath = args.out ? path.resolve(args.out) : '';
  const headless = args.headless === true || args.headless === 'true';
  const report = [];

  if (scenarios.length === 0) {
    console.error('No Chrome built-in AI scenarios found');
    process.exit(1);
  }

  let context = null;
  let page = null;
  let server = null;

  try {
    const integration = await tryExtensionIntegration(rootDir, headless, model);
    console.log(`Extension integration: ${integration.success ? 'PASS' : 'WARN'}`);
    if (integration.success) {
      console.log(`Health check: ${integration.health?.success === true ? 'PASS' : 'FAIL'}`);
      console.log(`Classification provider: ${integration.classification?.classification?.provider || integration.classification?.classification?.reason || 'unknown'}`);
    } else {
      console.log(`Integration note: ${integration.error}`);
    }

    const localhost = await startLocalhostServer();
    server = localhost.server;
    context = await launchBuiltInContext(rootDir, headless);
    page = await context.newPage();
    await page.goto(localhost.url, {
      waitUntil: 'load',
      timeout: 30000
    });

    let failed = 0;

    console.log(`Running ${scenarios.length} Chrome built-in AI evaluation scenario(s) with ${model}`);
    for (const scenario of scenarios) {
      try {
        const result = await Promise.race([
          runScenarioInPage(page, scenario, model, timeoutMs),
          new Promise((_, reject) => setTimeout(() => reject(new Error('chrome_builtin_timeout')), timeoutMs))
        ]);
        const output = result.json;
        const errors = validateScenarioOutput(scenario, output);
        const status = errors.length === 0 ? 'PASS' : 'FAIL';
        if (errors.length > 0) failed += 1;

        console.log(`\n[${status}] ${scenario.name}`);
        console.log(`  model=${result.resolvedModel} latency=${result.latencyMs}ms confidence=${Number(output.confidence || 0).toFixed(2)} availability=${result.availability}`);
        console.log(`  summary=${String(output.summary || '').slice(0, 160)}`);
        console.log(`  selectors=${Array.isArray(output.candidateSelectors) ? output.candidateSelectors.length : 0} actions=${Array.isArray(output.recommendedActions) ? output.recommendedActions.join(',') : 'none'}`);
        errors.forEach((error) => console.log(`  - ${error}`));

        report.push({
          name: scenario.name,
          status,
          model: result.resolvedModel,
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

    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(
        outputPath,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            source: scenariosPath,
            endpoint: 'chrome://built-in-ai/prompt-api',
            model,
            integration,
            report
          },
          null,
          2
        )
      );
      console.log(`Saved report to ${outputPath}`);
    }

    if (failed > 0) {
      console.error(`\nChrome built-in AI evaluation failed: ${failed} check(s) did not meet expectations`);
      process.exit(1);
    }

    console.log('\nChrome built-in AI evaluation passed');
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

run().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
