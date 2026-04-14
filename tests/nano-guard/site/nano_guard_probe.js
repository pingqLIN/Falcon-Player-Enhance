(function attachNanoGuardProbe(globalScope) {
  "use strict";

  const probeState = {
    session: null,
    route: null,
    apiProbe: null,
  };
  const SESSION_OPTIONS = {
    outputLanguage: "en",
  };

  function out(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  function nowMs() {
    return globalScope.performance ? globalScope.performance.now() : Date.now();
  }

  async function probeApi() {
    const keys = Object.getOwnPropertyNames(globalScope)
      .filter((key) => /ai|model|prompt/i.test(key))
      .sort();

    const result = {
      url: globalScope.location ? globalScope.location.href : null,
      userAgent: globalScope.navigator ? globalScope.navigator.userAgent : null,
      hasWindowAi: !!globalScope.ai,
      windowAiKeys: globalScope.ai ? Object.keys(globalScope.ai) : [],
      hasLanguageModelCreate: !!globalScope.ai?.languageModel?.create,
      hasCreateTextSession: !!globalScope.ai?.createTextSession,
      hasWindowLanguageModelCreate: !!globalScope.LanguageModel?.create,
      globalCandidates: keys,
    };
    probeState.apiProbe = result;
    out("probeOut", result);
    return result;
  }

  async function ensureSession() {
    if (probeState.session) {
      return {
        ok: true,
        route: probeState.route,
        reused: true,
        session: probeState.session,
      };
    }

    const attempts = [];
    const maxAttemptsPerRoute = 8;
    const retryDelayMs = 2000;

    async function createWithRetry(routeLabel, factory) {
      for (let attempt = 1; attempt <= maxAttemptsPerRoute; attempt += 1) {
        try {
          const session = await factory();
          return {
            ok: true,
            route: routeLabel,
            reused: false,
            session,
          };
        } catch (error) {
          const message = String(error?.message || error);
          attempts.push({
            route: routeLabel,
            attempt,
            error: message,
          });
          if (!/service is not running/i.test(message) || attempt === maxAttemptsPerRoute) {
            break;
          }
          await new Promise((resolve) => globalScope.setTimeout(resolve, retryDelayMs));
        }
      }
      return null;
    }

    if (globalScope.ai?.languageModel?.create) {
      const created = await createWithRetry(
        "window.ai.languageModel.create()",
        () => globalScope.ai.languageModel.create(SESSION_OPTIONS)
      );
      if (created) {
        probeState.session = created.session;
        probeState.route = created.route;
        return created;
      }
    }

    if (globalScope.ai?.createTextSession) {
      const created = await createWithRetry(
        "window.ai.createTextSession()",
        () => globalScope.ai.createTextSession(SESSION_OPTIONS)
      );
      if (created) {
        probeState.session = created.session;
        probeState.route = created.route;
        return created;
      }
    }

    if (globalScope.LanguageModel?.create) {
      const created = await createWithRetry(
        "window.LanguageModel.create()",
        () => globalScope.LanguageModel.create(SESSION_OPTIONS)
      );
      if (created) {
        probeState.session = created.session;
        probeState.route = created.route;
        return created;
      }
    }

    return {
      ok: false,
      route: null,
      attempts,
      error: "No usable Prompt API route was found."
    };
  }

  function scenarioInstruction(scenario) {
    const payload = JSON.stringify(scenario.payload);
    if (scenario.type === "page_type") {
      return [
        "You are a Falcon-Player-Enhance browser-safety classifier.",
        "Decide whether the page is a valid playback page or an invalid target for player-protection testing.",
        "Return compact JSON only with keys: label, confidence, rationale.",
        "Allowed labels: valid_playback_page, invalid_target, uncertain.",
        `Scenario payload: ${payload}`
      ].join("\n");
    }

    if (scenario.type === "overlay") {
      return [
        "You are classifying whether a player-overlapping element is a deceptive overlay.",
        "Return compact JSON only with keys: label, confidence, rationale.",
        "Allowed labels: malicious_overlay, benign_ui, uncertain.",
        `Scenario payload: ${payload}`
      ].join("\n");
    }

    return [
      "You are reviewing a failed browser-protection test case.",
      "Return compact JSON only with keys: label, confidence, rationale.",
      "Allowed labels: target_curation, judge_heuristic_gap, extension_failure, wait_and_retry, uncertain.",
      `Scenario payload: ${payload}`
    ].join("\n");
  }

  function extractJson(rawText) {
    try {
      return JSON.parse(rawText);
    } catch (_) {
      const start = rawText.indexOf("{");
      const end = rawText.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return JSON.parse(rawText.slice(start, end + 1));
      }
      throw new Error("No JSON object found in model output.");
    }
  }

  async function runScenario(scenario) {
    const sessionResult = await ensureSession();
    if (!sessionResult.ok) {
      return {
        scenarioId: scenario.id,
        ok: false,
        route: null,
        latencyMs: null,
        rawText: null,
        parsed: null,
        error: sessionResult.error,
        attempts: sessionResult.attempts || []
      };
    }

    const promptText = scenarioInstruction(scenario);
    const startedAt = nowMs();
    try {
      const rawText = await sessionResult.session.prompt(promptText);
      const latencyMs = Math.round(nowMs() - startedAt);
      const parsed = extractJson(rawText);
      return {
        scenarioId: scenario.id,
        ok: true,
        route: sessionResult.route,
        latencyMs,
        rawText,
        parsed,
        matchedExpected: parsed?.label === scenario.expectedLabel
      };
    } catch (error) {
      return {
        scenarioId: scenario.id,
        ok: false,
        route: sessionResult.route,
        latencyMs: Math.round(nowMs() - startedAt),
        rawText: null,
        parsed: null,
        error: String(error?.message || error)
      };
    }
  }

  async function runScenarioSet(scenarios, repeats) {
    const scenarioList = Array.isArray(scenarios) ? scenarios : [];
    const repeatCount = Math.max(1, Number(repeats || 1));
    const results = [];

    for (let round = 0; round < repeatCount; round += 1) {
      for (const scenario of scenarioList) {
        const result = await runScenario(scenario);
        result.round = round + 1;
        result.expectedLabel = scenario.expectedLabel || null;
        results.push(result);
      }
    }

    return {
      apiProbe: probeState.apiProbe || (await probeApi()),
      route: probeState.route,
      repeats: repeatCount,
      results
    };
  }

  async function samplePrompt() {
    const result = await runScenario({
      id: "sample",
      type: "page_type",
      expectedLabel: "valid_playback_page",
      payload: {
        url: "https://example.com/watch/123",
        title: "Example watch page",
        playerDetected: true,
        videoCount: 1,
        iframeCount: 0,
        overlayCount: 0,
        pageHint: "single watch page with primary video"
      }
    });
    out("sampleOut", result);
    return result;
  }

  document.getElementById("btnProbe")?.addEventListener("click", () => {
    probeApi().catch((error) => out("probeOut", { error: String(error?.message || error) }));
  });
  document.getElementById("btnSample")?.addEventListener("click", () => {
    samplePrompt().catch((error) => out("sampleOut", { error: String(error?.message || error) }));
  });

  globalScope.nanoGuardProbe = {
    probeApi,
    ensureSession,
    runScenario,
    runScenarioSet,
    samplePrompt
  };

  probeApi().catch(() => {});
})(window);
