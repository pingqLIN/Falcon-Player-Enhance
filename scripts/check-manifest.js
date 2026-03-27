#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifestFile = path.join(root, 'extension', 'manifest.json');
const errors = [];
const allowedPermissions = new Set([
  'activeTab',
  'contextMenus',
  'declarativeNetRequest',
  'declarativeNetRequestWithHostAccess',
  'scripting',
  'sidePanel',
  'storage',
  'tabs',
  'unlimitedStorage',
  'windows'
]);
const requiredPermissions = ['declarativeNetRequest', 'scripting', 'storage'];
const versionPattern = /^\d+(\.\d+){0,3}$/;

function fail(message) {
  errors.push(message);
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, 'extension', relativePath));
}

function loadJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`${label} is invalid JSON (${error.message})`);
    return null;
  }
}

function validateLocaleMessages(messages, label) {
  Object.entries(messages || {}).forEach(([key, entry]) => {
    if (!entry || typeof entry !== 'object') {
      fail(`${label}.${key} must be an object`);
      return;
    }

    const message = String(entry.message || '');
    const placeholderEntries = Object.entries(entry.placeholders || {});
    const placeholderMap = new Map(placeholderEntries.map(([placeholderKey, placeholder]) => [placeholderKey.toLowerCase(), placeholder]));
    const referencedPlaceholders = [...message.matchAll(/\$([A-Za-z0-9_@]+)\$/g)].map((match) => match[1]);
    referencedPlaceholders.forEach((placeholderName) => {
      if (!placeholderMap.has(placeholderName.toLowerCase())) {
        fail(`${label}.${key} references undefined placeholder $${placeholderName}$`);
      }
    });

    placeholderEntries.forEach(([placeholderKey, placeholder]) => {
      if (!placeholder || typeof placeholder !== 'object') {
        fail(`${label}.${key}.placeholders.${placeholderKey} must be an object`);
        return;
      }
      if (typeof placeholder.content !== 'string' || !/^\$\d+$/.test(placeholder.content)) {
        fail(`${label}.${key}.placeholders.${placeholderKey}.content must reference a substitution like $1`);
      }
    });
  });
}

let manifest;

try {
  manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
} catch (error) {
  fail(`manifest.json is invalid JSON (${error.message})`);
}

if (manifest) {
  if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
  if (typeof manifest.version !== 'string' || manifest.version.trim() === '') fail('version must be a non-empty string');
  if (typeof manifest.version === 'string' && !versionPattern.test(manifest.version)) {
    fail('version must match Chrome extension format: 1-4 dot-separated integers');
  }
  if (!manifest.background || typeof manifest.background !== 'object') fail('background must be defined');
  if (!manifest.background?.service_worker) fail('background.service_worker must be defined');
  if (manifest.background?.service_worker && !fileExists(manifest.background.service_worker)) {
    fail(`background.service_worker is missing: ${manifest.background.service_worker}`);
  }

  const locale = manifest.default_locale;
  if (typeof locale !== 'string' || locale.trim() === '') {
    fail('default_locale must be a non-empty string');
  } else {
    const localeFile = path.join(root, 'extension', '_locales', locale, 'messages.json');
    if (!fs.existsSync(localeFile)) {
      fail(`default_locale messages file is missing: _locales/${locale}/messages.json`);
    } else {
      const localeMessages = loadJson(localeFile, `_locales/${locale}/messages.json`);
      if (localeMessages) validateLocaleMessages(localeMessages, `_locales/${locale}/messages.json`);
    }
  }

  const iconPaths = [
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {})
  ];

  iconPaths.forEach((iconPath) => {
    if (typeof iconPath === 'string' && !fileExists(iconPath)) fail(`missing icon file: ${iconPath}`);
  });

  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  permissions.forEach((permission) => {
    if (!allowedPermissions.has(permission)) fail(`permission is not in approved allowlist: ${permission}`);
  });
  requiredPermissions.forEach((permission) => {
    if (!permissions.includes(permission)) fail(`required permission is missing: ${permission}`);
  });

  const dnrRules = manifest.declarative_net_request?.rule_resources;
  if (!Array.isArray(dnrRules) || dnrRules.length === 0) {
    fail('declarative_net_request.rule_resources must be a non-empty array');
  } else {
    dnrRules.forEach((resource, index) => {
      const label = `declarative_net_request.rule_resources[${index}]`;
      if (!resource || typeof resource !== 'object') {
        fail(`${label} must be an object`);
        return;
      }
      if (typeof resource.id !== 'string' || resource.id.trim() === '') fail(`${label}.id must be a non-empty string`);
      if (typeof resource.enabled !== 'boolean') fail(`${label}.enabled must be boolean`);
      if (typeof resource.path !== 'string' || resource.path.trim() === '') {
        fail(`${label}.path must be a non-empty string`);
        return;
      }

      const ruleFile = path.join(root, 'extension', resource.path);
      if (!fs.existsSync(ruleFile)) {
        fail(`${label}.path is missing: ${resource.path}`);
        return;
      }

      const rules = loadJson(ruleFile, resource.path);
      if (!Array.isArray(rules) || rules.length === 0) {
        fail(`${resource.path} must contain a non-empty array of rules`);
        return;
      }

      rules.forEach((rule, ruleIndex) => {
        const ruleLabel = `${resource.path}[${ruleIndex}]`;
        if (!rule || typeof rule !== 'object') {
          fail(`${ruleLabel} must be an object`);
          return;
        }
        if (!Number.isInteger(rule.id)) fail(`${ruleLabel}.id must be an integer`);
        if (typeof rule.priority !== 'number') fail(`${ruleLabel}.priority must be numeric`);
        if (!rule.action || typeof rule.action !== 'object') fail(`${ruleLabel}.action must be an object`);
        if (typeof rule.action?.type !== 'string' || rule.action.type.trim() === '') {
          fail(`${ruleLabel}.action.type must be a non-empty string`);
        }
        if (!rule.condition || typeof rule.condition !== 'object') fail(`${ruleLabel}.condition must be an object`);
      });
    });
  }

  const webResources = manifest.web_accessible_resources;
  if (webResources !== undefined) {
    if (!Array.isArray(webResources)) {
      fail('web_accessible_resources must be an array');
    } else {
      webResources.forEach((entry, index) => {
        const label = `web_accessible_resources[${index}]`;
        if (!entry || typeof entry !== 'object') {
          fail(`${label} must be an object`);
          return;
        }
        if (!Array.isArray(entry.resources) || entry.resources.length === 0) {
          fail(`${label}.resources must be a non-empty array`);
        } else {
          entry.resources.forEach((resourcePath) => {
            if (typeof resourcePath !== 'string' || resourcePath.trim() === '') {
              fail(`${label}.resources contains an invalid path`);
              return;
            }
            if (!fileExists(resourcePath)) fail(`${label}.resources is missing: ${resourcePath}`);
          });
        }
        if (!Array.isArray(entry.matches) || entry.matches.length === 0) {
          fail(`${label}.matches must be a non-empty array`);
        }
      });
    }
  }

  const placeholderFields = [
    { label: 'name', value: manifest.name },
    { label: 'description', value: manifest.description },
    { label: 'action.default_title', value: manifest.action?.default_title }
  ];
  placeholderFields.forEach(({ label, value }) => {
    if (typeof value !== 'string' || value.trim() === '') {
      fail(`${label} must be a non-empty string`);
      return;
    }

    const match = value.match(/^__MSG_(.+)__$/);
    if (!match) return;

    const localeFile = path.join(root, 'extension', '_locales', locale, 'messages.json');
    try {
      const messages = JSON.parse(fs.readFileSync(localeFile, 'utf8'));
      if (!messages[match[1]] || typeof messages[match[1]].message !== 'string') {
        fail(`missing locale message key "${match[1]}" in _locales/${locale}/messages.json`);
      }
    } catch (error) {
      fail(`could not validate locale placeholder "${match[1]}" (${error.message})`);
    }
  });
}

if (errors.length > 0) {
  console.error('Manifest validation failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('Manifest validation passed.');
