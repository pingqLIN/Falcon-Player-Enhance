const assert = require('node:assert/strict');
const {
  LEVELS,
  MODES,
  buildProtectionStatus
} = require('../../extension/shared/protection-status.js');

function assertStatus(name, input, expected) {
  const actual = buildProtectionStatus(input);
  assert.equal(actual.mode, expected.mode, `${name}: mode`);
  assert.equal(actual.protectionLevel, expected.protectionLevel, `${name}: protectionLevel`);

  for (const guard of expected.includesGuards || []) {
    assert.ok(actual.activeGuards.includes(guard), `${name}: missing guard ${guard}`);
  }

  for (const guard of expected.excludesGuards || []) {
    assert.ok(!actual.activeGuards.includes(guard), `${name}: unexpected guard ${guard}`);
  }

  if (typeof expected.guardCount === 'number') {
    assert.equal(actual.activeGuards.length, expected.guardCount, `${name}: guardCount`);
  }

  return actual;
}

const disabled = assertStatus('disabled overrides AI and strict', {
  extensionEnabled: false,
  blockingLevel: 3,
  aiMonitorEnabled: true,
  aiAdvisoryActive: true
}, {
  mode: MODES.DISABLED,
  protectionLevel: LEVELS.OFF,
  guardCount: 0
});
assert.equal(disabled.userOverride.whitelisted, false);

assertStatus('whitelist-only disables active guards', {
  extensionEnabled: true,
  blockingLevel: 3,
  hostWhitelisted: true,
  whitelistEnhanceOnly: true,
  aiMonitorEnabled: true,
  aiAdvisoryActive: true
}, {
  mode: MODES.WHITELIST_ONLY,
  protectionLevel: LEVELS.OFF,
  guardCount: 0
});

assertStatus('strict remains hardened companion without AI advisory', {
  extensionEnabled: true,
  blockingLevel: 3,
  popupGuardEnabled: true,
  sameTabRedirectGuardEnabled: true,
  aiMonitorEnabled: true,
  aiAdvisoryActive: false
}, {
  mode: MODES.COMPANION,
  protectionLevel: LEVELS.HARDENED,
  includesGuards: ['popup_guard', 'external_navigation_guard', 'strict_mode'],
  excludesGuards: ['ai_advisory']
});

assertStatus('AI advisory is reversible expanded mode', {
  extensionEnabled: true,
  blockingLevel: 2,
  aiMonitorEnabled: true,
  aiAdvisoryActive: true,
  aiPolicyAllowsReversibleActions: true,
  lastEvent: {
    type: 'blocked_popup',
    at: '2026-04-25T00:00:00+08:00',
    source: 'inject-blocker',
    detail: { confidence: 0.9 }
  }
}, {
  mode: MODES.AI_EXPANDED,
  protectionLevel: LEVELS.STANDARD,
  includesGuards: ['ai_advisory', 'popup_guard'],
  excludesGuards: ['strict_mode']
});

assertStatus('AI advisory is ignored when policy disallows reversible actions', {
  extensionEnabled: true,
  blockingLevel: 2,
  aiMonitorEnabled: true,
  aiAdvisoryActive: true,
  aiPolicyAllowsReversibleActions: false
}, {
  mode: MODES.COMPANION,
  protectionLevel: LEVELS.STANDARD,
  excludesGuards: ['ai_advisory']
});

assertStatus('standalone mode is explicit when AI advisory is inactive', {
  extensionEnabled: true,
  blockingLevel: 2,
  standaloneMode: true,
  aiMonitorEnabled: true,
  aiAdvisoryActive: false
}, {
  mode: MODES.STANDALONE,
  protectionLevel: LEVELS.STANDARD,
  excludesGuards: ['ai_advisory']
});

assertStatus('AI expanded takes precedence over standalone only when advisory is active', {
  extensionEnabled: true,
  blockingLevel: 2,
  standaloneMode: true,
  aiMonitorEnabled: true,
  aiAdvisoryActive: true,
  aiPolicyAllowsReversibleActions: true
}, {
  mode: MODES.AI_EXPANDED,
  protectionLevel: LEVELS.STANDARD,
  includesGuards: ['ai_advisory']
});

console.log(JSON.stringify({ ok: true, cases: 7 }, null, 2));
