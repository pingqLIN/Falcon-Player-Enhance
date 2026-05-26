(function attachNanoGuardLoad(globalScope) {
  "use strict";

  const encoder = new TextEncoder();
  const state = {
    session: null,
    route: null,
    availability: null,
    attempts: [],
    mockCallCount: 0,
  };

  function nowMs() {
    return globalScope.performance ? globalScope.performance.now() : Date.now();
  }

  function byteLength(value) {
    return encoder.encode(String(value || "")).length;
  }

  function truncateUtf8(value, maxBytes) {
    const source = String(value || "");
    if (byteLength(source) <= maxBytes) return source;

    let low = 0;
    let high = source.length;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (byteLength(source.slice(0, mid)) <= maxBytes) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return source.slice(0, low);
  }

  function sleep(ms) {
    return new Promise((resolve) => globalScope.setTimeout(resolve, ms));
  }

  function probePromptApi() {
    const api =
      globalScope.LanguageModel ||
      globalScope.ai?.languageModel ||
      (globalScope.ai?.createTextSession ? globalScope.ai : null);

    return {
      hasWindowAi: Boolean(globalScope.ai),
      hasLanguageModelCreate: Boolean(globalScope.ai?.languageModel?.create),
      hasCreateTextSession: Boolean(globalScope.ai?.createTextSession),
      hasWindowLanguageModelCreate: Boolean(globalScope.LanguageModel?.create),
      promptApiAvailable: Boolean(
        globalScope.LanguageModel?.create ||
        globalScope.ai?.languageModel?.create ||
        globalScope.ai?.createTextSession
      ),
      route: state.route,
      availability: state.availability,
      attempts: state.attempts.slice(),
      apiKeys: api ? Object.keys(api).sort() : [],
      userAgent: globalScope.navigator?.userAgent || null,
    };
  }

  async function createSessionWithRoute(route, factory, options) {
    try {
      if (typeof factory.availability === "function") {
        state.availability = await factory.availability(options);
      }
      const session = await factory.create(options);
      state.session = session;
      state.route = route;
      state.attempts.push({ route, ok: true, availability: state.availability || null });
      return session;
    } catch (error) {
      const message = String(error?.message || error);
      state.attempts.push({ route, ok: false, error: message });
      throw error;
    }
  }

  async function ensureSession(config) {
    if (state.session) return state.session;

    const options = {
      temperature: Number(config.temperature ?? 0),
      topK: Math.max(1, Math.round(Number(config.topK ?? 3))),
    };

    if (globalScope.LanguageModel?.create) {
      return createSessionWithRoute("window.LanguageModel.create", globalScope.LanguageModel, options);
    }

    if (globalScope.ai?.languageModel?.create) {
      return createSessionWithRoute("window.ai.languageModel.create", globalScope.ai.languageModel, options);
    }

    if (globalScope.ai?.createTextSession) {
      try {
        const session = await globalScope.ai.createTextSession(options);
        state.session = session;
        state.route = "window.ai.createTextSession";
        state.attempts.push({ route: state.route, ok: true });
        return session;
      } catch (error) {
        state.attempts.push({
          route: "window.ai.createTextSession",
          ok: false,
          error: String(error?.message || error),
        });
        throw error;
      }
    }

    throw new Error("prompt_api_unavailable");
  }

  function createRiskNode(kind, index, density) {
    const node = document.createElement(kind === "iframe" ? "iframe" : "a");
    node.dataset.riskKind = kind;
    node.dataset.fakeHref = `https://blocked.invalid/${kind}/${density}/${index}`;
    node.dataset.signal = [
      "popup",
      "redirect",
      "overlay",
      "tracking",
      "player-cover",
      "download-bait",
    ].slice(0, Math.min(6, density + 2)).join(" ");
    node.textContent = `${kind} bait ${index} ` + "click continue ".repeat(Math.min(12, density * 2));
    node.setAttribute("tabindex", "-1");
    node.setAttribute("aria-hidden", "true");

    if (kind === "iframe") {
      node.srcdoc = "<!doctype html><title>inert frame</title><p>local inert frame</p>";
      node.width = "1";
      node.height = "1";
    } else {
      node.href = "javascript:void(0)";
    }
    return node;
  }

  function buildFixture(config) {
    const density = Math.max(1, Number(config.density || 1));
    const fixture = document.getElementById("fixture");
    fixture.replaceChildren();

    const player = document.createElement("div");
    player.className = "player";
    player.dataset.player = "main";
    player.dataset.riskKind = "player";
    fixture.appendChild(player);

    const overlayCount = density * 4;
    for (let index = 0; index < overlayCount; index += 1) {
      const overlay = createRiskNode("overlay", index, density);
      overlay.className = "overlay-bait";
      overlay.style.transform = `translate(${index % 4}px, ${index % 3}px)`;
      player.appendChild(overlay);
    }

    const iframeCount = density * 3;
    for (let index = 0; index < iframeCount; index += 1) {
      fixture.appendChild(createRiskNode("iframe", index, density));
    }

    const noiseGrid = document.createElement("div");
    noiseGrid.className = "noise-grid";
    fixture.appendChild(noiseGrid);
    const noiseCount = density * 60;
    for (let index = 0; index < noiseCount; index += 1) {
      const node = document.createElement(index % 7 === 0 ? "button" : "div");
      node.className = "noise-node";
      node.dataset.riskKind = index % 5 === 0 ? "popup-bait" : "noise";
      node.dataset.fakeHref = `https://noise.invalid/${density}/${index}`;
      node.textContent = `node=${index} density=${density} ` + "ad tracker gate ".repeat(density);
      noiseGrid.appendChild(node);
    }

    const mutationCount = density * 8;
    for (let index = 0; index < mutationCount; index += 1) {
      const node = document.createElement("span");
      node.dataset.riskKind = "mutation";
      node.dataset.fakeHref = `https://mutation.invalid/${density}/${index}`;
      node.textContent = `mutation-burst-${index}`;
      fixture.appendChild(node);
    }

    return {
      density,
      overlayCount,
      iframeCount,
      noiseCount,
      mutationCount,
      totalNodes: fixture.querySelectorAll("*").length,
    };
  }

  function extractFeatures(config) {
    const maxCandidates = Math.max(1, Number(config.maxCandidates || 50));
    const maxPromptBytes = Math.max(512, Number(config.maxPromptBytes || 12000));
    const candidates = Array.from(document.querySelectorAll("[data-risk-kind]"));
    const selected = candidates.slice(0, maxCandidates).map((node, index) => {
      const rect = node.getBoundingClientRect();
      return {
        index,
        tag: node.tagName.toLowerCase(),
        riskKind: node.dataset.riskKind || "",
        fakeHref: node.dataset.fakeHref || "",
        text: truncateUtf8(node.textContent || "", 240),
        rect: {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
        },
      };
    });

    const payload = {
      task: "classify synthetic hostile player-page risk",
      constraints: "Return compact JSON only. Do not request external resources.",
      page: {
        url: globalScope.location.href,
        density: Number(config.density || 1),
        totalRiskNodes: candidates.length,
        selectedCandidateCount: selected.length,
      },
      candidates: selected,
    };

    const rawPrompt = [
      "You are a Falcon-Player-Enhance local browser-safety classifier.",
      "Classify whether this synthetic page pressure should be handled by deterministic guards before model escalation.",
      "Allowed labels: deterministic_guard, model_advisory_ok, overload_risk.",
      JSON.stringify(payload),
    ].join("\n");

    const prompt = truncateUtf8(rawPrompt, maxPromptBytes);
    return {
      elementsScanned: candidates.length,
      selectedCandidateCount: selected.length,
      truncatedCandidateCount: Math.max(0, candidates.length - selected.length),
      rawPromptBytes: byteLength(rawPrompt),
      promptBytes: byteLength(prompt),
      truncatedPromptBytes: Math.max(0, byteLength(rawPrompt) - byteLength(prompt)),
      prompt,
    };
  }

  function parseModelText(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return JSON.parse(text.slice(start, end + 1));
      }
    }
    return null;
  }

  async function callModel(prompt, config) {
    if (config.mockModel) {
      state.mockCallCount += 1;
      if (Number(config.mockErrorAfter || 0) > 0 && state.mockCallCount > Number(config.mockErrorAfter)) {
        throw new Error("mock_prompt_error");
      }
      await sleep(Math.max(0, Number(config.mockLatencyMs || 30)));
      return JSON.stringify({
        label: byteLength(prompt) > Number(config.maxPromptBytes || 12000) ? "overload_risk" : "deterministic_guard",
        confidence: 0.9,
        rationale: "mock classifier response",
      });
    }

    const session = await ensureSession(config);
    const maxCaseMs = Math.max(1000, Number(config.maxCaseSeconds || 20) * 1000);
    const timedPrompt = Promise.race([
      session.prompt(prompt),
      sleep(maxCaseMs).then(() => {
        throw new Error("model_call_timeout");
      }),
    ]);
    return timedPrompt;
  }

  async function runCase(config) {
    const totalStartedAt = nowMs();
    const buildStartedAt = nowMs();
    const fixture = buildFixture(config);
    const buildMs = Math.round(nowMs() - buildStartedAt);

    const extractStartedAt = nowMs();
    const features = extractFeatures(config);
    const extractMs = Math.round(nowMs() - extractStartedAt);

    const modelStartedAt = nowMs();
    try {
      const rawText = await callModel(features.prompt, config);
      const modelLatencyMs = Math.round(nowMs() - modelStartedAt);
      const parsed = parseModelText(rawText);
      const result = {
        ok: true,
        density: fixture.density,
        fixture,
        features: {
          elementsScanned: features.elementsScanned,
          selectedCandidateCount: features.selectedCandidateCount,
          truncatedCandidateCount: features.truncatedCandidateCount,
          rawPromptBytes: features.rawPromptBytes,
          promptBytes: features.promptBytes,
          truncatedPromptBytes: features.truncatedPromptBytes,
        },
        timings: {
          buildMs,
          extractMs,
          modelLatencyMs,
          totalLatencyMs: Math.round(nowMs() - totalStartedAt),
        },
        parsed,
        route: config.mockModel ? "mock" : state.route,
      };
      document.getElementById("last-result").textContent = JSON.stringify(result, null, 2);
      return result;
    } catch (error) {
      return {
        ok: false,
        density: fixture.density,
        fixture,
        features: {
          elementsScanned: features.elementsScanned,
          selectedCandidateCount: features.selectedCandidateCount,
          truncatedCandidateCount: features.truncatedCandidateCount,
          rawPromptBytes: features.rawPromptBytes,
          promptBytes: features.promptBytes,
          truncatedPromptBytes: features.truncatedPromptBytes,
        },
        timings: {
          buildMs,
          extractMs,
          modelLatencyMs: Math.round(nowMs() - modelStartedAt),
          totalLatencyMs: Math.round(nowMs() - totalStartedAt),
        },
        error: String(error?.message || error),
        route: config.mockModel ? "mock" : state.route,
      };
    }
  }

  globalScope.nanoGuardLoad = {
    probePromptApi,
    runCase,
  };
})(window);
