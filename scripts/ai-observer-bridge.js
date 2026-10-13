#!/usr/bin/env node
// Local-only Falcon AI observation bridge. No cloud connections, no remote binding.
// Start: node scripts/ai-observer-bridge.js
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.FALCON_OBSERVER_PORT || 38271);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new Error('Invalid port');
const MAX_BODY = 10 * 1024;
const MAX_LOG = 4 * 1024 * 1024;
const ROOT = path.resolve(process.env.FALCON_OBSERVER_OUTPUT_DIR ||
  path.resolve(__dirname, '../.falcon-observability'));
const OUTPUT = path.join(ROOT, 'latest.ndjson');
const TOKEN = process.env.FALCON_OBSERVER_TOKEN || crypto.randomBytes(32).toString('hex');
if (!/^[a-f0-9]{48,128}$/i.test(TOKEN)) throw new Error('Invalid observer token format.');
fs.mkdirSync(ROOT, { recursive: true });

let accepted = 0;
let rejected = 0;
function allowOrigin(req, res) {
  const origin = String(req.headers.origin || '');
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Falcon-Observer-Token');
  return true;
}
function respond(res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(message));
}
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return respond(res, 200, { status: 'running', loopback: true, accepted, rejected });
  }
  if (req.url !== '/ingest' || !['POST', 'OPTIONS'].includes(req.method)) {
    return respond(res, 404, { error: 'not_found' });
  }
  if (!allowOrigin(req, res)) {
    rejected++;
    return respond(res, 403, { error: 'origin_forbidden' });
  }
  if (req.method === 'OPTIONS') return respond(res, 204, {});
  const provided = String(req.headers['x-falcon-observer-token'] || '');
  const authorized = provided.length === TOKEN.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(TOKEN));
  if (!authorized) {
    rejected++;
    return respond(res, 403, { error: 'invalid_token' });
  }
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) {
    rejected++;
    return respond(res, 413, { error: 'too_large' });
  }
  let size = 0;
  const parts = [];
  req.on('data', (part) => {
    size += part.length;
    if (size > MAX_BODY) req.destroy();
    else parts.push(part);
  });
  req.on('end', () => {
    let entry;
    try {
      entry = JSON.parse(Buffer.concat(parts).toString('utf8'));
      if (!entry || entry.version !== 1 ||
          typeof entry.hostname !== 'string' ||
          typeof entry.kind !== 'string' ||
          !Number.isFinite(entry.at) ||
          !Number.isSafeInteger(entry.seq)) throw new Error('invalid_entry');
      if (entry.modelOutput && String(entry.modelOutput).length > 1600) throw new Error('text_too_long');
    } catch (_) {
      rejected++;
      return respond(res, 400, { error: 'invalid_trace' });
    }
    try {
      if (fs.existsSync(OUTPUT) && fs.statSync(OUTPUT).size > MAX_LOG) {
        fs.renameSync(OUTPUT, path.join(ROOT, 'previous.ndjson'));
      }
      // The extension already redacts and bounds fields; never write headers/tokens.
      fs.appendFileSync(OUTPUT, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
      accepted++;
      return respond(res, 200, { accepted: true });
    } catch (_) {
      return respond(res, 500, { error: 'write_failed' });
    }
  });
});
server.listen(PORT, '127.0.0.1', () => {
  console.log('Falcon AI observer is listening on http://127.0.0.1:' + PORT);
  console.log('Observer token (paste into Falcon Dashboard; do not share): ' + TOKEN);
  console.log('External AI read-only trace file: ' + OUTPUT);
  console.log('No cloud forwarding. Stop with Ctrl+C.');
});
