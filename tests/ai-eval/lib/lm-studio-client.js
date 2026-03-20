/* eslint-disable no-console */

const DEFAULT_ENDPOINT = 'http://127.0.0.1:1234/v1/chat/completions';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const next = argv[i + 1];
      args[token.slice(2)] = next && !next.startsWith('--') ? next : true;
    }
  }
  return args;
}

function resolveBaseUrl(endpoint = DEFAULT_ENDPOINT) {
  const url = new URL(endpoint);
  let path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/chat/completions')) path = path.slice(0, -'/chat/completions'.length);
  if (!path.endsWith('/v1')) path += '/v1';
  url.pathname = path;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function listModels({ endpoint = DEFAULT_ENDPOINT, apiKey = 'lm-studio' } = {}) {
  const response = await fetch(`${resolveBaseUrl(endpoint)}/models`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`lmstudio_models_http_${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
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

async function chatJson({
  endpoint = DEFAULT_ENDPOINT,
  apiKey = 'lm-studio',
  model = '',
  timeoutMs = 8000,
  messages = []
} = {}) {
  let resolvedModel = String(model || '').trim();
  if (!resolvedModel) {
    const models = await listModels({ endpoint, apiKey });
    resolvedModel = String(models[0]?.id || '').trim();
  }
  if (!resolvedModel) {
    throw new Error('lmstudio_no_model_available');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: resolvedModel,
      temperature: 0.1,
      max_tokens: 700,
      messages
    }),
    signal: AbortSignal.timeout(Number(timeoutMs || 8000))
  });

  if (!response.ok) {
    throw new Error(`lmstudio_chat_http_${response.status}`);
  }

  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content || payload?.output_text || payload?.response || '';
  const json = extractJsonObject(text);
  if (!json) {
    throw new Error('lmstudio_invalid_json');
  }

  return {
    model: resolvedModel,
    json,
    rawText: text,
    payload
  };
}

module.exports = {
  DEFAULT_ENDPOINT,
  parseArgs,
  resolveBaseUrl,
  listModels,
  extractJsonObject,
  chatJson
};
