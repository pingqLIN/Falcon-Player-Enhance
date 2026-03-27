const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunctionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`Function not found: ${name}`);
  }

  const paramsStart = source.indexOf('(', start);
  if (paramsStart === -1) {
    throw new Error(`Function params not found: ${name}`);
  }

  let paramsDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') paramsDepth += 1;
    if (char === ')') paramsDepth -= 1;
    if (paramsDepth === 0 && char === '{') {
      bodyStart = index;
      break;
    }
  }
  if (bodyStart === -1) {
    throw new Error(`Function body not found: ${name}`);
  }

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(start, index + 1);
    }
  }

  throw new Error(`Function closing brace not found: ${name}`);
}

function loadFunction(relativePath, name, extras = {}) {
  const filePath = path.join(__dirname, '..', '..', relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const functionSource = extractFunctionSource(source, name);
  const context = vm.createContext({
    URL,
    console,
    ...extras
  });
  const script = new vm.Script(`${functionSource}; ${name};`);
  return script.runInContext(context);
}

module.exports = {
  loadFunction
};
