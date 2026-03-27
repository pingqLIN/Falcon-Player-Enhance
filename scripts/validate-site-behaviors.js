#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const file = path.join(root, 'extension', 'rules', 'site-behaviors.json');
const filterFile = path.join(root, 'extension', 'rules', 'filter-rules.json');
const popupModes = new Set(['standard', 'remote-control', 'iframe-direct']);
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`${label} is invalid JSON (${error.message})`);
    return null;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateStringList(value, label, options = {}) {
  const lowercase = options.lowercase === true;

  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
    return [];
  }

  const list = value.map((entry) => String(entry || '').trim());
  list.forEach((entry, index) => {
    if (!entry) fail(`${label}[${index}] must be a non-empty string`);
    if (lowercase && entry !== entry.toLowerCase()) fail(`${label}[${index}] must be lowercase`);
  });

  const seen = new Set();
  list.forEach((entry) => {
    if (!entry) return;
    if (seen.has(entry)) fail(`${label} contains duplicate value: ${entry}`);
    seen.add(entry);
  });

  return list.filter(Boolean);
}

function collectAllowDomains(rules) {
  if (!Array.isArray(rules)) return new Set();

  return new Set(
    rules
      .filter((rule) => rule?.action?.type === 'allow')
      .map((rule) => String(rule?.condition?.urlFilter || '').trim())
      .map((filter) => filter.match(/^\|\|([^^]+)\^$/))
      .filter(Boolean)
      .map((match) => match[1].toLowerCase())
  );
}

const data = readJson(file, 'extension/rules/site-behaviors.json');
const filterRules = readJson(filterFile, 'extension/rules/filter-rules.json');
const allowDomains = collectAllowDomains(filterRules);

if (data) {
  if (!Number.isInteger(data.version) || data.version < 1) {
    fail('site-behaviors.json version must be an integer >= 1');
  }

  if (!Array.isArray(data.profiles) || data.profiles.length === 0) {
    fail('site-behaviors.json profiles must be a non-empty array');
  }

  const ids = new Set();

  (data.profiles || []).forEach((profile, index) => {
    const prefix = `profiles[${index}]`;

    if (!profile || typeof profile !== 'object') {
      fail(`${prefix} must be an object`);
      return;
    }

    if (!isNonEmptyString(profile.id)) {
      fail(`${prefix}.id must be a non-empty string`);
    } else if (ids.has(profile.id)) {
      fail(`${prefix}.id must be unique (${profile.id})`);
    } else {
      ids.add(profile.id);
    }

    const match = profile.match;
    if (!match || typeof match !== 'object') {
      fail(`${prefix}.match must be an object`);
    }

    const hostSuffixes = validateStringList(match?.hostSuffixes, `${prefix}.match.hostSuffixes`, { lowercase: true });
    const iframeSrcIncludes = validateStringList(match?.iframeSrcIncludes, `${prefix}.match.iframeSrcIncludes`, { lowercase: true });
    if (hostSuffixes.length === 0 && iframeSrcIncludes.length === 0) {
      fail(`${prefix}.match must define at least one hostSuffix or iframeSrcIncludes entry`);
    }

    const capabilities = profile.capabilities;
    if (!capabilities || typeof capabilities !== 'object') {
      fail(`${prefix}.capabilities must be an object`);
    } else {
      if (typeof capabilities.compatibilityMode !== 'boolean') fail(`${prefix}.capabilities.compatibilityMode must be boolean`);
      if (typeof capabilities.forcePopupDirect !== 'boolean') fail(`${prefix}.capabilities.forcePopupDirect must be boolean`);
      if (!popupModes.has(capabilities.popupMode)) fail(`${prefix}.capabilities.popupMode must be one of: standard, remote-control, iframe-direct`);
      if (typeof capabilities.antiAntiBlockProfile !== 'string') fail(`${prefix}.capabilities.antiAntiBlockProfile must be a string`);
      validateStringList(capabilities.safeMediaHosts, `${prefix}.capabilities.safeMediaHosts`, { lowercase: true });
    }

    const selectors = profile.selectors;
    if (!selectors || typeof selectors !== 'object') {
      fail(`${prefix}.selectors must be an object`);
    } else {
      validateStringList(selectors.cosmeticHide, `${prefix}.selectors.cosmeticHide`);
      validateStringList(selectors.overlayIgnore, `${prefix}.selectors.overlayIgnore`);
      validateStringList(selectors.playerHints, `${prefix}.selectors.playerHints`);
    }

    const navigation = profile.navigation;
    if (!navigation || typeof navigation !== 'object') {
      fail(`${prefix}.navigation must be an object`);
    } else {
      validateStringList(navigation.redirectTrapHosts, `${prefix}.navigation.redirectTrapHosts`, { lowercase: true });
      if (typeof navigation.redirectRecoveryEnabled !== 'boolean') {
        fail(`${prefix}.navigation.redirectRecoveryEnabled must be boolean`);
      }
    }

    const antiAntiBlock = profile.antiAntiBlock;
    if (!antiAntiBlock || typeof antiAntiBlock !== 'object') {
      fail(`${prefix}.antiAntiBlock must be an object`);
    } else {
      validateStringList(antiAntiBlock.fakeGlobals, `${prefix}.antiAntiBlock.fakeGlobals`);
      if (typeof antiAntiBlock.suppressErrors !== 'boolean') {
        fail(`${prefix}.antiAntiBlock.suppressErrors must be boolean`);
      }
      validateStringList(antiAntiBlock.errorSelectors, `${prefix}.antiAntiBlock.errorSelectors`);
    }

    const dnrAllowRules = validateStringList(profile.dnrAllowRules, `${prefix}.dnrAllowRules`, { lowercase: true });
    dnrAllowRules.forEach((domain) => {
      if (!allowDomains.has(domain)) {
        fail(`${prefix}.dnrAllowRules references a domain not found in filter-rules.json allow rules: ${domain}`);
      }
    });

    if (!isNonEmptyString(profile.notes)) {
      fail(`${prefix}.notes must be a non-empty string`);
    }
  });
}

if (errors.length > 0) {
  console.error('Site behavior validation failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

const profileCount = Array.isArray(data?.profiles) ? data.profiles.length : 0;
console.log(`Validated ${profileCount} site behavior profile(s).`);
