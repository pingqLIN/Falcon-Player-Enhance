const fs = require('fs');
const vm = require('vm');

const backgroundSource = fs.readFileSync('Q:/Projects/Falcon-Player-Enhance/extension/background.js', 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractFunction(source, name) {
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = pattern.exec(source);
  if (!match) {
    throw new Error(`Missing function: ${name}`);
  }

  const start = match.index;
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let index = bodyStart;
  let depth = 0;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Unterminated function: ${name}`);
}

function buildBackgroundHarness() {
  const calls = [];
  const overlayCalls = [];
  const context = {
    DIRECT_POPUP_IFRAME_HOSTS: ['boyfriendtv.com'],
    chrome: {
      runtime: {
        getURL(path) {
          return `chrome-extension://falcon/${path}`;
        }
      },
      windows: {
        async create(options) {
          calls.push(options);
          return { id: 321 };
        }
      }
    },
    registerDirectPopupOverlayWindow: async () => {},
    URL,
    URLSearchParams,
    console
  };

  const snippet = [
    extractFunction(backgroundSource, 'sanitizePopupPlayerPayload'),
    extractFunction(backgroundSource, 'withSenderPopupPlayerContext'),
    extractFunction(backgroundSource, 'normalizePopupHost'),
    extractFunction(backgroundSource, 'isPopupDomainOrSubdomain'),
    extractFunction(backgroundSource, 'shouldOpenPopupDirectly'),
    extractFunction(backgroundSource, 'buildPopupPlayerUrl'),
    extractFunction(backgroundSource, 'shouldUseRemoteControlMode'),
    extractFunction(backgroundSource, 'createPopupPlayerWindow')
  ].join('\n\n');

  vm.createContext(context);
  vm.runInContext(snippet, context);
  context.registerDirectPopupOverlayWindow = async (createdWindow, payload) => {
    if (context.shouldOpenPopupDirectly(payload)) {
      overlayCalls.push({ createdWindow, payload });
    }
  };

  return { context, calls, overlayCalls };
}

async function testDirectPopupTakesPriorityOverRemoteMode() {
  const { context, calls, overlayCalls } = buildBackgroundHarness();
  const payload = {
    iframeSrc: 'https://boyfriendtv.com/embed/abc123',
    sourceTabId: 42,
    sourceTabUrl: 'https://example.com/watch',
    remoteControlPreferred: true
  };

  await context.createPopupPlayerWindow(payload);

  assert(calls.length === 1, 'Expected one popup window creation for direct popup path');
  assert(
    calls[0].url === payload.iframeSrc,
    `Expected direct popup URL ${payload.iframeSrc}, got ${String(calls[0].url)}`
  );
  assert(overlayCalls.length === 1, 'Expected direct popup overlay registration for direct popup path');
}

async function testRemoteModeStillWorksForRemoteOnlyPayload() {
  const { context, calls, overlayCalls } = buildBackgroundHarness();
  const payload = {
    sourceTabId: 42,
    sourceTabUrl: 'https://example.com/watch',
    remoteControlPreferred: true,
    playerId: 'player-1'
  };

  await context.createPopupPlayerWindow(payload);

  assert(calls.length === 1, 'Expected one popup window creation for remote mode');
  assert(
    String(calls[0].url).startsWith('chrome-extension://falcon/popup-player/popup-player.html?'),
    `Expected extension popup URL for remote mode, got ${String(calls[0].url)}`
  );
  assert(String(calls[0].url).includes('remote=1'), 'Expected remote mode popup URL to include remote=1');
  assert(overlayCalls.length === 0, 'Did not expect direct popup overlay registration for remote mode');
}

function testSenderContextDoesNotForceDirectHostsIntoRemoteMode() {
  const { context } = buildBackgroundHarness();
  const payload = context.withSenderPopupPlayerContext(
    {
      iframeSrc: 'https://boyfriendtv.com/embed/forced-remote',
      remoteControlPreferred: false
    },
    {
      tab: {
        id: 99,
        url: 'https://example.com/watch'
      }
    }
  );

  assert(payload.sourceTabId === 99, 'Expected sender tab id to be propagated');
  assert(payload.sourceTabUrl === 'https://example.com/watch', 'Expected sender URL to be propagated');
  assert(payload.remoteControlPreferred === false, 'Direct popup hosts should not be force-upgraded to remote mode');
}

async function main() {
  testSenderContextDoesNotForceDirectHostsIntoRemoteMode();
  await testDirectPopupTakesPriorityOverRemoteMode();
  await testRemoteModeStillWorksForRemoteOnlyPayload();
  console.log('popup reliability smoke: ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
