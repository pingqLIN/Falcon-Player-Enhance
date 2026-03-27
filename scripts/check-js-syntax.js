#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const dirs = ['extension', 'scripts', 'tests', 'docs'];
const skip = new Set(['.git', '.github', 'node_modules', 'build', 'dist']);

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skip.has(entry.name)) continue;
      walk(full, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }

  return files;
}

const files = dirs.flatMap((name) => walk(path.join(root, name)));
let failed = 0;

console.log(`Checking syntax for ${files.length} JS files...`);

for (const file of files) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    new vm.Script(content, { filename: file });
  } catch (error) {
    failed += 1;
    const message = error && error.message ? error.message : String(error);
    console.error(`FAIL ${path.relative(root, file)}\n${message}\n`);
  }
}

if (failed > 0) {
  console.error(`Syntax check failed for ${failed} file(s).`);
  process.exit(1);
}

console.log('Syntax check passed.');
