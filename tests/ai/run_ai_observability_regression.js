'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const core = require('../../extension/shared/ai-observability.js');

async function run() {
  let clock = 1_750_000_000_000;
  const memory = {};
  const sent = [];
  const storage = {
    async get(keys) {
      return Object.fromEntries(keys.map((key) => [key, memory[key]]));
    },
    async set(payload) { Object.assign(memory, payload); }
  };
  const observer = core.createObserver({
    storage, clock: () => clock,
    transport: async (entry, token) => sent.push({ entry, token })
  });
  await observer.restore();
  assert.equal(observer.snapshot().scope.enabled, false);
  const token = 'a'.repeat(64);
  await observer.start({
    hostname: 'https://test.example/path?secret=1',
    bridgeToken: token
  });
  assert.equal(observer.publicConfig().hostname, 'test.example');
  assert.equal(observer.publicConfig().expiresAt, clock + 15 * 60_000);
  assert(!JSON.stringify(observer.snapshot()).includes(token), 'bridge secret must not be exported');
  assert.equal(observer.record('other.example', 'page_navigation', { tabId: 5 }), null);
  observer.record('test.example', 'chrome_builtin_result', {
    success: true, task: 'element_classification',
    temperature: 0, topK: 3, responseChars: 200,
    secret: 'should never be exposed'
  }, 'never log raw model output by default');
  await Promise.resolve(); await Promise.resolve();
  let snap = observer.snapshot();
  assert.equal(snap.events.length, 1);
  assert.equal(snap.events[0].modelOutput, undefined);
  assert.equal(snap.events[0].details.temperature, 0);
  assert.equal(snap.events[0].details.secret, undefined);
  assert.equal(sent.length, 1, 'local bridge receives only opted-in events');
  assert.equal(sent[0].token, token);

  await observer.stop();
  snap = observer.snapshot();
  assert.equal(snap.scope.enabled, false);
  assert.equal(snap.scope.bridgeEnabled, false);
  assert.equal(snap.events.length, 1, 'stop retains exportable trace until expiry');
  assert.equal(observer.record('test.example', 'page_navigation', { tabId: 1 }), null);
  await observer.start({ hostname: 'test.example', includeModelOutput: true });
  assert.equal(observer.snapshot().events.length, 0, 'new capture starts fresh');
  observer.record('test.example', 'chrome_builtin_result', { responseChars: 10 },
    'alice@example.com https://website.example/path?token=x sk-1234567890123');
  assert(!observer.snapshot().events[0].modelOutput.includes('alice@example.com'));
  assert(!observer.snapshot().events[0].modelOutput.includes('token=x'));
  assert(!observer.snapshot().events[0].modelOutput.includes('sk-1234567890123'));
  await observer.clear();
  assert.equal(observer.snapshot().events.length, 0);
  clock += 16 * 60_000;
  assert.equal(observer.snapshot().scope.enabled, false);
  assert.equal(observer.snapshot().events.length, 0);
  const restored = core.createObserver({ storage, clock: () => clock });
  await restored.restore();
  assert.equal(restored.snapshot().events.length, 0);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-observer-test-'));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const bridge = spawn(process.execPath,
    [path.resolve(__dirname, '../../scripts/ai-observer-bridge.js')], {
      env: {
        ...process.env,
        FALCON_OBSERVER_PORT: String(port),
        FALCON_OBSERVER_OUTPUT_DIR: root,
        FALCON_OBSERVER_TOKEN: token
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
  try {
    let ready = false;
    let output = '';
    const readyDeadline = Date.now() + 5000;
    bridge.stdout.on('data', (buf) => { output += String(buf); });
    while (!ready && Date.now() < readyDeadline) {
      if (output.includes('is listening')) ready = true;
      else await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(ready, 'localhost bridge must start without network or cloud');
    const endpoint = 'http://127.0.0.1:' + port;
    const origin = 'chrome-extension://' + 'a'.repeat(32);
    const body = JSON.stringify({
      version: 1, seq: 1, at: clock, hostname: 'test.example',
      kind: 'chrome_builtin_result', details: { category: 'ad' }
    });
    const forbidden = await fetch(endpoint + '/ingest', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'X-Falcon-Observer-Token': token },
      body
    });
    assert.equal(forbidden.status, 403);
    const unauthorized = await fetch(endpoint + '/ingest', {
      method: 'POST',
      headers: { Origin: origin, 'X-Falcon-Observer-Token': 'b'.repeat(64) },
      body
    });
    assert.equal(unauthorized.status, 403);
    const options = await fetch(endpoint + '/ingest', {
      method: 'OPTIONS', headers: {
        Origin: origin, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'x-falcon-observer-token,content-type'
      }
    });
    assert.equal(options.status, 204);
    const accepted = await fetch(endpoint + '/ingest', {
      method: 'POST',
      headers: {
        Origin: origin, 'Content-Type': 'application/json',
        'X-Falcon-Observer-Token': token
      },
      body
    });
    assert.equal(accepted.status, 200);
    const lines = fs.readFileSync(path.join(root, 'latest.ndjson'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).kind, 'chrome_builtin_result');
    assert(!fs.readFileSync(path.join(root, 'latest.ndjson'), 'utf8').includes(token),
      'observer token never written to trace');
  } finally {
    bridge.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../../extension/background.js'), 'utf8');
  assert(source.includes("importScripts('shared/ai-observability.js')"));
  assert(source.includes("'getAiObservability'"));
  assert(source.includes("traceFalconAi(hostname, 'page_telemetry_batch'"));
  assert(source.includes("traceFalconAi(hostname, 'chrome_builtin_result'"));
  assert(source.includes("traceFalconAi(hostname, 'chrome_builtin_error'"));
  console.log('AI observability isolation, trace and localhost bridge regression passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
