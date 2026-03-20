/* eslint-disable no-console */

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

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const endpoint = String(args.endpoint || 'http://127.0.0.1:8787/v1').replace(/\/$/, '');
  const token = String(args.token || process.env.GATEWAY_TOKEN || '').trim();
  const model = String(args.model || process.env.OPENAI_MODEL || 'gpt-5.4-mini').trim();
  const response = await fetch(`${endpoint}/policy/recommend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      requestId: `req_${Date.now()}`,
      timestamp: Date.now(),
      hostContext: {
        hostname: 'smoke.gateway.test',
        url: 'https://smoke.gateway.test/watch',
        topFrame: true,
        tabRiskTier: 'high'
      },
      trigger: {
        type: 'blocked_popup',
        reason: 'smoke_test'
      },
      features: {
        windowSec: 30,
        eventCounts: {
          blocked_popup: 6,
          blocked_malicious_navigation: 2,
          overlay_removed: 3,
          suspicious_dom_churn: 1,
          user_override: 0
        },
        riskScore: 24.7,
        currentPolicyVersion: 2,
        currentActions: {
          popupStrictMode: false,
          guardExternalNavigation: false,
          overlayScanMs: 3000,
          sensitivityBoost: 0,
          extraBlockedDomains: []
        }
      },
      constraints: {
        maxTtlMs: 600000,
        allowForceSandbox: true,
        allowedFrames: ['top', 'all']
      },
      providerHints: {
        preferredModel: model
      }
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    console.error(`gateway_policy_http_${response.status}`);
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  const payload = await response.json();
  console.log(`decisionId=${payload.decisionId}`);
  console.log(`model=${payload.model?.name}`);
  console.log(`tier=${payload.policy?.risk?.tier} score=${payload.policy?.risk?.score}`);
  console.log(`actions=${JSON.stringify(payload.policy?.actions || {})}`);
}

run().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
