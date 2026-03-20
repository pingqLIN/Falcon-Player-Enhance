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
  const response = await fetch(`${endpoint}/health`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    console.error(`Gateway offline: endpoint=${endpoint}`);
    console.error(`gateway_health_http_${response.status}`);
    process.exit(1);
  }

  const payload = await response.json();
  console.log(`Gateway online: endpoint=${endpoint}`);
  console.log(`status=${payload.status} service=${payload.service} version=${payload.version}`);
  console.log(`models=${Array.isArray(payload.modelCandidates) ? payload.modelCandidates.join(', ') : 'n/a'}`);
}

run().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
