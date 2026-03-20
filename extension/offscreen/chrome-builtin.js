const BRIDGE_CHANNEL_NAME = 'falcon-chrome-builtin-ai';
const DEFAULT_MODALITIES = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }]
};
const bridge = new BroadcastChannel(BRIDGE_CHANNEL_NAME);

function getLanguageModelApi() {
  if (typeof LanguageModel !== 'undefined') {
    return LanguageModel;
  }

  throw new Error('chrome_builtin_api_unavailable');
}

function normalizePromptResult(value) {
  if (typeof value !== 'string') {
    throw new Error('chrome_builtin_invalid_result');
  }

  const source = value.trim();
  if (!source) {
    throw new Error('chrome_builtin_empty_result');
  }

  return {
    rawText: source,
    json: JSON.parse(source)
  };
}

async function getAvailability(payload = {}) {
  const api = getLanguageModelApi();
  return api.availability({
    ...DEFAULT_MODALITIES,
    ...(payload.availabilityOptions && typeof payload.availabilityOptions === 'object'
      ? payload.availabilityOptions
      : {})
  });
}

async function createSession(payload = {}) {
  const api = getLanguageModelApi();
  const options = {
    ...DEFAULT_MODALITIES
  };

  if (Array.isArray(payload.initialPrompts) && payload.initialPrompts.length > 0) {
    options.initialPrompts = payload.initialPrompts;
  }

  if (
    Number.isFinite(Number(payload.temperature)) &&
    Number.isFinite(Number(payload.topK))
  ) {
    options.temperature = Number(payload.temperature);
    options.topK = Number(payload.topK);
  }

  return api.create(options);
}

async function runHealthCheck(payload = {}) {
  const availability = await getAvailability(payload);
  const api = getLanguageModelApi();
  const params = typeof api.params === 'function'
    ? await api.params().catch(() => null)
    : null;

  try {
    const session = await createSession({
      initialPrompts: payload.systemPrompt
        ? [{ role: 'system', content: payload.systemPrompt }]
        : []
    });

    try {
      const result = await session.prompt(
        String(payload.prompt || 'Return a JSON object { "ok": true }.'),
        {
          responseConstraint: payload.promptSchema,
          omitResponseConstraintInput: true
        }
      );

      const parsed = normalizePromptResult(result);
      return {
        success: true,
        availability,
        resolvedModel: String(payload.model || 'gemini-nano'),
        modelCount: 1,
        params,
        rawText: parsed.rawText,
        json: parsed.json
      };
    } finally {
      session.destroy();
    }
  } catch (error) {
    return {
      success: false,
      availability,
      resolvedModel: String(payload.model || 'gemini-nano'),
      modelCount: 0,
      params,
      error: String(error?.message || error)
    };
  }
}

async function runPromptJson(payload = {}) {
  const availability = await getAvailability(payload);
  const session = await createSession({
    initialPrompts: payload.systemPrompt
      ? [{ role: 'system', content: String(payload.systemPrompt) }]
      : []
  });

  try {
    const result = await session.prompt(String(payload.prompt || ''), {
      responseConstraint: payload.schema,
      omitResponseConstraintInput: payload.omitResponseConstraintInput !== false
    });
    const parsed = normalizePromptResult(result);
    return {
      success: true,
      availability,
      resolvedModel: String(payload.model || 'gemini-nano'),
      rawText: parsed.rawText,
      json: parsed.json
    };
  } finally {
    session.destroy();
  }
}

const handlers = {
  healthCheck: runHealthCheck,
  promptJson: runPromptJson
};

bridge.addEventListener('message', (event) => {
  const payload = event?.data && typeof event.data === 'object' ? event.data : {};
  if (payload.direction !== 'request') {
    return;
  }

  const requestId = String(payload.requestId || '');
  const action = String(payload.action || '');
  const handler = handlers[action];
  if (!requestId || !handler) {
    return;
  }

  Promise.resolve(handler(payload.payload || {}))
    .then((result) => {
      bridge.postMessage({
        direction: 'response',
        requestId,
        success: true,
        result
      });
    })
    .catch((error) => {
      bridge.postMessage({
        direction: 'response',
        requestId,
        success: false,
        error: String(error?.message || error)
      });
    });
});
