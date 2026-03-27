#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'tests', 'live-browser');
const files = fs
  .readdirSync(dir)
  .filter((name) => /^targets.*\.json$/i.test(name))
  .sort();

const errors = [];
const absolutePathPattern = /(?:^[A-Za-z]:\\)|(?:^\/Users\/)|(?:^\/home\/)/;

function fail(file, message) {
  errors.push(`${path.relative(root, file)}: ${message}`);
}

for (const name of files) {
  const file = path.join(dir, name);
  const example = name === 'targets.example.json';
  const smoke = name.includes('.smoke.');
  let data;

  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(file, `invalid JSON (${error.message})`);
    continue;
  }

  if (!data || typeof data !== 'object') {
    fail(file, 'root value must be an object');
    continue;
  }

  if (!example && (typeof data.generatedFrom !== 'string' || data.generatedFrom.trim() === '')) {
    fail(file, 'generatedFrom must be a non-empty string');
  }

  if (!example && typeof data.generatedFrom === 'string' && absolutePathPattern.test(data.generatedFrom)) {
    fail(file, 'generatedFrom must not use an absolute local path');
  }

  if (!Array.isArray(data.targets) || data.targets.length === 0) {
    fail(file, 'targets must be a non-empty array');
    continue;
  }

  data.targets.forEach((target, index) => {
    const rel = path.relative(root, file);

    if (!target || typeof target !== 'object') {
      errors.push(`${rel}: targets[${index}] must be an object`);
      return;
    }

    if (typeof target.name !== 'string' || target.name.trim() === '') {
      errors.push(`${rel}: targets[${index}].name must be a non-empty string`);
    }

    if (typeof target.url !== 'string' || target.url.trim() === '') {
      errors.push(`${rel}: targets[${index}].url must be a non-empty string`);
    } else {
      try {
        const parsed = new URL(target.url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push(`${rel}: targets[${index}].url must use http or https`);
        }
      } catch {
        errors.push(`${rel}: targets[${index}].url must be a valid URL`);
      }
    }

    if (!Array.isArray(target.tags)) {
      errors.push(`${rel}: targets[${index}].tags must be an array`);
    }

    if (!example && !smoke && (!target.source || typeof target.source !== 'object')) {
      errors.push(`${rel}: targets[${index}].source must be an object`);
    }

    if (smoke && target.source && typeof target.source !== 'object') {
      errors.push(`${rel}: targets[${index}].source must be an object when provided`);
    }

    if (typeof target.requiresManualReview !== 'boolean') {
      errors.push(`${rel}: targets[${index}].requiresManualReview must be boolean`);
    }
  });
}

if (errors.length > 0) {
  console.error('Live-browser target validation failed:');
  errors.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

console.log(`Validated ${files.length} live-browser target file(s).`);
