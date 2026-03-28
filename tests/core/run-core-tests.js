const assert = require('node:assert/strict');

const { loadFunction } = require('./source-test-utils');

function run(name, fn) {
  fn();
  console.log(`PASS ${name}`);
}

const normalizePopupHost = loadFunction('extension/background.js', 'normalizePopupHost');
const isPopupDomainOrSubdomain = loadFunction('extension/background.js', 'isPopupDomainOrSubdomain');
const sanitizePopupPlayerPayload = loadFunction('extension/background.js', 'sanitizePopupPlayerPayload');
const findSiteBehaviorProfileByHost = loadFunction(
  'extension/background.js',
  'findSiteBehaviorProfileByHost',
  {
    siteBehaviorProfiles: [
      {
        id: 'boyfriendtv-compatibility',
        match: {
          hostSuffixes: ['boyfriendtv.com']
        },
        capabilities: {
          forcePopupDirect: true,
          popupMode: 'remote-control'
        }
      }
    ],
    normalizePopupHost,
    isPopupDomainOrSubdomain
  }
);
const getPopupBehaviorForPayload = loadFunction(
  'extension/background.js',
  'getPopupBehaviorForPayload',
  {
    findSiteBehaviorProfileByHost,
    normalizePopupHost
  }
);
const shouldOpenPopupDirectly = loadFunction('extension/background.js', 'shouldOpenPopupDirectly', {
  getPopupBehaviorForPayload
});
const shouldUseRemoteControlMode = loadFunction('extension/background.js', 'shouldUseRemoteControlMode', {
  sanitizePopupPlayerPayload
});
const getHostname = loadFunction('extension/background.js', 'getHostname');
const isManagedPageUrl = loadFunction('extension/background.js', 'isManagedPageUrl');

const BLOCKING_LEVEL = {
  OFF: 0,
  BASIC: 1,
  STANDARD: 2,
  HARDENED: 3
};

const normalizeBlockingLevel = loadFunction('extension/content/inject-blocker.js', 'normalizeBlockingLevel', {
  BLOCKING_LEVEL
});
const escapeRegex = loadFunction('extension/content/inject-blocker.js', 'escapeRegex');
const hasBlockedUrlToken = loadFunction(
  'extension/content/inject-blocker.js',
  'hasBlockedUrlToken',
  {
    escapeRegex
  }
);
const isBlockedUrl = loadFunction('extension/content/inject-blocker.js', 'isBlockedUrl', {
  MALICIOUS_DOMAINS: ['exoclick', 'trafficjunky', 'juicyads'],
  aiDynamicBlockedDomains: new Set(['bad-redirect.example']),
  hasBlockedUrlToken,
  window: {
    location: {
      origin: 'https://vidboys.com'
    }
  }
});
const isInternalElement = loadFunction('extension/content/inject-blocker.js', 'isInternalElement');
const resolveNavigationUrl = loadFunction('extension/content/inject-blocker.js', 'resolveNavigationUrl', {
  window: {
    location: {
      origin: 'https://vidboys.com'
    }
  }
});
const isSafeUrl = loadFunction('extension/content/inject-blocker.js', 'isSafeUrl', {
  isBlockedUrl,
  window: {
    location: {
      origin: 'https://vidboys.com'
    }
  }
});
const isEligibleSameOriginNavigationAnchor = loadFunction(
  'extension/content/inject-blocker.js',
  'isEligibleSameOriginNavigationAnchor',
  {
    resolveNavigationUrl,
    isSafeUrl,
    window: {
      location: {
        origin: 'https://vidboys.com'
      }
    }
  }
);
const isContentNavigationContainer = loadFunction(
  'extension/content/inject-blocker.js',
  'isContentNavigationContainer',
  {
    resolveNavigationUrl,
    isSafeUrl,
    window: {
      location: {
        origin: 'https://vidboys.com',
        pathname: '/'
      }
    }
  }
);
const findContentCardNavigationAnchor = loadFunction(
  'extension/content/inject-blocker.js',
  'findContentCardNavigationAnchor',
  {
    isEligibleSameOriginNavigationAnchor,
    resolveNavigationUrl,
    containsProtectedMedia: () => false,
    isInternalElement,
    isPlayerSite: () => true,
    isCompatibilityModeSite: () => false,
    document: {
      body: { tagName: 'BODY' }
    }
  }
);
const antiAdblockResolveNavigationUrl = loadFunction('extension/content/anti-antiblock.js', 'resolveNavigationUrl', {
  window: {
    location: {
      origin: 'https://vidboys.com'
    }
  }
});
const antiAdblockIsSafeSameOriginNavigationHref = loadFunction(
  'extension/content/anti-antiblock.js',
  'isSafeSameOriginNavigationHref',
  {
    resolveNavigationUrl: antiAdblockResolveNavigationUrl,
    window: {
      location: {
        origin: 'https://vidboys.com',
        pathname: '/'
      }
    }
  }
);
const antiAdblockIsContentNavigationContainer = loadFunction(
  'extension/content/anti-antiblock.js',
  'isContentNavigationContainer',
  {
    resolveNavigationUrl: antiAdblockResolveNavigationUrl,
    isSafeSameOriginNavigationHref: antiAdblockIsSafeSameOriginNavigationHref,
    window: {
      location: {
        origin: 'https://vidboys.com',
        pathname: '/'
      }
    }
  }
);
const hasMeaningfulIframeSource = loadFunction(
  'extension/content/player-detector.js',
  'hasMeaningfulIframeSource'
);
const shouldDetectIframePlayerCandidate = loadFunction(
  'extension/content/player-detector.js',
  'shouldDetectIframePlayerCandidate',
  {
    hasMeaningfulIframeSource,
    window: {
      getComputedStyle(element) {
        return element.computedStyle || {
          display: 'block',
          visibility: 'visible',
          opacity: '1'
        };
      }
    }
  }
);
const shouldProcessPlayerOverlayCleanup = loadFunction(
  'extension/content/player-enhancer.js',
  'shouldProcessPlayerOverlayCleanup',
  {
    isEffectivelyVisible(element) {
      return element.visible !== false;
    },
    getVideoSource(element) {
      return element.videoSrc || '';
    },
    getIframeSource(element) {
      return element.iframeSrc || '';
    },
    getResolvedIframeSource(element) {
      return element.resolvedIframeSrc || '';
    },
    getDirectPlayableDescendants(element) {
      return element.descendants || [];
    }
  }
);
const normalizeEnhancerHostname = loadFunction('extension/content/player-enhancer.js', 'normalizeHostname');
const isManifestMediaUrl = loadFunction('extension/content/player-enhancer.js', 'isManifestMediaUrl');
const hasSignedMediaQuery = loadFunction('extension/content/player-enhancer.js', 'hasSignedMediaQuery');
const hasOpaqueMediaPath = loadFunction('extension/content/player-enhancer.js', 'hasOpaqueMediaPath');
const normalizeOverlayHostname = loadFunction('extension/content/overlay-remover.js', 'normalizeHostname');
const overlayIsDomainOrSubdomain = loadFunction('extension/content/overlay-remover.js', 'isDomainOrSubdomain');
const overlayIsSafeMediaHost = loadFunction(
  'extension/content/overlay-remover.js',
  'isSafeMediaHost',
  {
    safeMediaHosts: ['javboys.com', 'myvidplay.com'],
    normalizeHostname: normalizeOverlayHostname,
    isDomainOrSubdomain: overlayIsDomainOrSubdomain,
    window: {
      location: {
        hostname: 'player.javboys.com'
      }
    }
  }
);
const shouldPreferIframePopup = loadFunction(
  'extension/content/player-enhancer.js',
  'shouldPreferIframePopup',
  {
    isManifestMediaUrl,
    normalizeHostname: normalizeEnhancerHostname,
    hasSignedMediaQuery,
    hasOpaqueMediaPath,
    window: {
      location: {
        hostname: 'vidboys.com',
        href: 'https://vidboys.com/watch/demo'
      }
    }
  }
);
const normalizeSiteBehaviorText = loadFunction(
  'extension/content/site-profile.js',
  'normalizeSiteBehaviorText'
);
const normalizeSiteBehaviorHost = loadFunction(
  'extension/content/site-profile.js',
  'normalizeSiteBehaviorHost',
  {
    normalizeSiteBehaviorText
  }
);
const isSiteBehaviorHostMatch = loadFunction(
  'extension/content/site-profile.js',
  'isSiteBehaviorHostMatch',
  {
    normalizeSiteBehaviorHost
  }
);
const isSiteBehaviorIframeMatch = loadFunction(
  'extension/content/site-profile.js',
  'isSiteBehaviorIframeMatch',
  {
    normalizeSiteBehaviorText
  }
);
const matchSiteBehaviorProfile = loadFunction(
  'extension/content/site-profile.js',
  'matchSiteBehaviorProfile',
  {
    isSiteBehaviorHostMatch,
    isSiteBehaviorIframeMatch
  }
);
const getNavigation = loadFunction(
  'extension/content/site-profile.js',
  'getNavigation',
  {
    cache: {
      primaryProfile: {
        navigation: {
          redirectTrapHosts: ['trap.example'],
          redirectRecoveryEnabled: true
        }
      }
    }
  }
);
const getAntiAntiBlock = loadFunction(
  'extension/content/site-profile.js',
  'getAntiAntiBlock',
  {
    cache: {
      primaryProfile: {
        antiAntiBlock: {
          fakeGlobals: ['CVP'],
          suppressErrors: true
        }
      }
    }
  }
);
const isLegacyJavboysHost = loadFunction(
  'extension/content/anti-antiblock.js',
  'isLegacyJavboysHost',
  {
    normalizeHostname(hostname) {
      return String(hostname || '').toLowerCase().replace(/^www\./, '');
    }
  }
);
const shouldUseJavboysAntiAntiBlockStrategy = loadFunction(
  'extension/content/anti-antiblock.js',
  'shouldUseJavboysAntiAntiBlockStrategy',
  {
    getActiveAntiAntiBlockProfile() {
      return 'javboys-cvp';
    },
    isLegacyJavboysHost,
    window: {
      location: {
        hostname: 'safe.example.com'
      }
    }
  }
);
const resolveAntiAntiBlockStrategyName = loadFunction(
  'extension/content/anti-antiblock.js',
  'resolveAntiAntiBlockStrategyName',
  {
    shouldUseJavboysAntiAntiBlockStrategy() {
      return true;
    }
  }
);
const getJavboysFrameErrorSelectors = loadFunction(
  'extension/content/anti-antiblock.js',
  'getJavboysFrameErrorSelectors'
);

function makeElement({ className = '', dataset = {}, parentElement = null } = {}) {
  return {
    nodeType: 1,
    className,
    dataset,
    parentElement
  };
}

run('background normalizePopupHost strips www and lowercases', () => {
  assert.equal(normalizePopupHost('WWW.BoyFriendTV.com'), 'boyfriendtv.com');
  assert.equal(normalizePopupHost('cdn.example.com'), 'cdn.example.com');
});

run('background popup routing only allows approved iframe hosts', () => {
  assert.equal(
    shouldOpenPopupDirectly({ iframeSrc: 'https://www.boyfriendtv.com/embed/player' }),
    true
  );
  assert.equal(
    shouldOpenPopupDirectly({ iframeSrc: 'https://video.example.com/embed/player' }),
    false
  );
  assert.equal(
    shouldOpenPopupDirectly({ iframeSrc: 'not a url' }),
    false
  );
});

run('background remote control mode only activates when a source tab exists and direct playback is unavailable', () => {
  assert.equal(
    shouldUseRemoteControlMode({
      sourceTabId: 12,
      remoteControlPreferred: true,
      videoSrc: 'https://cdn.example/video.mp4'
    }),
    true
  );
  assert.equal(
    shouldUseRemoteControlMode({
      sourceTabId: 12,
      videoSrc: 'https://cdn.example/video.mp4'
    }),
    false
  );
  assert.equal(
    shouldUseRemoteControlMode({ sourceTabId: 12 }),
    true
  );
  assert.equal(
    shouldUseRemoteControlMode({ sourceTabId: 0 }),
    false
  );
});

run('background URL helpers normalize hostnames and managed protocols', () => {
  assert.equal(getHostname('https://Example.com/watch?v=1'), 'example.com');
  assert.equal(getHostname('example.com'), 'example.com');
  assert.equal(getHostname('https://bad host/path'), '');
  assert.equal(isManagedPageUrl('https://example.com'), true);
  assert.equal(isManagedPageUrl('file:///tmp/index.html'), true);
  assert.equal(isManagedPageUrl('wss://example.com/socket'), true);
  assert.equal(isManagedPageUrl('chrome-extension://abc/popup.html'), false);
  assert.equal(isManagedPageUrl('javascript:alert(1)'), false);
});

run('inject-blocker normalizes protection levels into supported range', () => {
  assert.equal(normalizeBlockingLevel(undefined), BLOCKING_LEVEL.STANDARD);
  assert.equal(normalizeBlockingLevel(-10), BLOCKING_LEVEL.OFF);
  assert.equal(normalizeBlockingLevel(2.6), BLOCKING_LEVEL.HARDENED);
  assert.equal(normalizeBlockingLevel(99), BLOCKING_LEVEL.HARDENED);
});

run('inject-blocker blocks malicious and AI-provided redirect domains', () => {
  assert.equal(isBlockedUrl('chrome-extension://abc/page.html'), false);
  assert.equal(isBlockedUrl('https://ads.exoclick.com/track'), true);
  assert.equal(isBlockedUrl('https://safe.example/watch'), false);
  assert.equal(isBlockedUrl('https://bad-redirect.example/landing'), true);
  assert.equal(isBlockedUrl('https://media.example/casinoroyale-trailer'), false);
});

run('inject-blocker token matching uses boundary-aware checks', () => {
  assert.equal(hasBlockedUrlToken('https://ads.exoclick.com/track', 'exoclick'), true);
  assert.equal(hasBlockedUrlToken('https://safe.example/casinoroyale', 'casino'), false);
  assert.equal(hasBlockedUrlToken('https://safe.example/path/casino/offer', 'casino'), true);
});

run('inject-blocker detects internal shield elements on self and ancestors', () => {
  const internalSelf = makeElement({ className: 'shield-panel toolbar' });
  const internalParent = makeElement({
    className: 'plain',
    dataset: {},
    parentElement: makeElement({ dataset: { shieldInternal: 'true' } })
  });
  const plain = makeElement({ className: 'content-card' });

  assert.equal(isInternalElement(internalSelf), true);
  assert.equal(isInternalElement(internalParent), true);
  assert.equal(isInternalElement(plain), false);
});

run('inject-blocker only accepts safe same-origin content anchors', () => {
  const sameOrigin = {
    href: 'https://vidboys.com/post/example',
    className: 'entry-title-link',
    getAttribute(name) {
      if (name === 'href') return '/post/example';
      if (name === 'rel') return '';
      return '';
    }
  };
  const tagLink = {
    href: 'https://vidboys.com/tag/foo',
    className: 'post-tag',
    getAttribute(name) {
      if (name === 'href') return '/tag/foo';
      if (name === 'rel') return 'tag';
      return '';
    }
  };
  const external = {
    href: 'https://nn125.com/landing',
    className: 'entry-title-link',
    getAttribute(name) {
      if (name === 'href') return 'https://nn125.com/landing';
      if (name === 'rel') return '';
      return '';
    }
  };

  assert.equal(isEligibleSameOriginNavigationAnchor(sameOrigin), true);
  assert.equal(isEligibleSameOriginNavigationAnchor(tagLink), false);
  assert.equal(isEligibleSameOriginNavigationAnchor(external), false);
});

run('inject-blocker preserves sidebar and widget navigation containers', () => {
  const makeAnchor = (href) => ({
    href,
    getAttribute(name) {
      if (name === 'href') {
        return href.replace('https://vidboys.com', '');
      }
      return '';
    }
  });
  const sidebar = {
    nodeType: 1,
    tagName: 'DIV',
    className: 'sidebar widget-area',
    id: 'secondary-sidebar',
    querySelectorAll(selector) {
      assert.equal(selector, 'a[href]');
      return [
        makeAnchor('https://vidboys.com/post/one'),
        makeAnchor('https://vidboys.com/post/two'),
        makeAnchor('https://vidboys.com/post/three')
      ];
    }
  };

  assert.equal(isContentNavigationContainer(sidebar), true);
});

run('anti-antiblock preserves sidebar and widget navigation containers', () => {
  const makeAnchor = (href) => ({
    href,
    getAttribute(name) {
      if (name === 'href') {
        return href.replace('https://vidboys.com', '');
      }
      return '';
    }
  });
  const sidebar = {
    nodeType: 1,
    tagName: 'ASIDE',
    className: 'sidebar widget-area',
    id: 'secondary-sidebar',
    querySelectorAll(selector) {
      assert.equal(selector, 'a[href]');
      return [
        makeAnchor('https://vidboys.com/post/one'),
        makeAnchor('https://vidboys.com/post/two'),
        makeAnchor('https://vidboys.com/post/three')
      ];
    }
  };

  assert.equal(antiAdblockIsContentNavigationContainer(sidebar), true);
});

run('inject-blocker resolves content-card clicks to the primary same-origin post link', () => {
  const primary = {
    href: 'https://vidboys.com/post/example',
    className: 'entry-title-link',
    textContent: 'Example post title',
    querySelector(selector) {
      if (selector === 'img, picture, h1, h2, h3, h4') return null;
      return null;
    },
    getAttribute(name) {
      if (name === 'href') return '/post/example';
      if (name === 'rel') return '';
      return '';
    }
  };
  const duplicate = {
    href: 'https://vidboys.com/post/example',
    className: 'thumbnail-link',
    textContent: '',
    querySelector(selector) {
      if (selector === 'img, picture, h1, h2, h3, h4') return { tagName: 'IMG' };
      return null;
    },
    getAttribute(name) {
      if (name === 'href') return '/post/example';
      if (name === 'rel') return '';
      return '';
    }
  };
  const tag = {
    href: 'https://vidboys.com/tag/foo',
    className: 'post-tag',
    textContent: 'foo',
    querySelector() {
      return null;
    },
    getAttribute(name) {
      if (name === 'href') return '/tag/foo';
      if (name === 'rel') return 'tag';
      return '';
    }
  };
  const card = {
    tagName: 'DIV',
    className: 'post-card',
    parentElement: { tagName: 'BODY' },
    hasAttribute() {
      return false;
    },
    querySelectorAll(selector) {
      assert.equal(selector, 'a[href]');
      return [primary, duplicate, tag];
    }
  };
  const target = {
    className: 'post-card-body',
    parentElement: card,
    closest() {
      return null;
    }
  };

  assert.equal(findContentCardNavigationAnchor(target), primary);
});

run('player-detector skips hidden blank iframe candidates', () => {
  const iframe = {
    className: '',
    id: '',
    width: 1600,
    height: 1600,
    computedStyle: {
      display: 'block',
      visibility: 'hidden',
      opacity: '1'
    },
    closest() {
      return null;
    },
    getBoundingClientRect() {
      return { width: 1600, height: 1600 };
    },
    getAttribute(name) {
      if (name === 'width') return '1600';
      if (name === 'height') return '1600';
      return '';
    }
  };

  assert.equal(shouldDetectIframePlayerCandidate(iframe, ''), false);
});

run('player-enhancer only cleans visible players with media sources', () => {
  assert.equal(
    shouldProcessPlayerOverlayCleanup({
      tagName: 'IFRAME',
      visible: false,
      iframeSrc: 'https://player.example/embed'
    }),
    false
  );
  assert.equal(
    shouldProcessPlayerOverlayCleanup({
      tagName: 'IFRAME',
      visible: true,
      iframeSrc: ''
    }),
    false
  );
  assert.equal(
    shouldProcessPlayerOverlayCleanup({
      tagName: 'IFRAME',
      visible: true,
      iframeSrc: 'https://player.example/embed'
    }),
    true
  );
});

run('player-enhancer prefers iframe popup when the direct stream looks protected', () => {
  assert.equal(
    shouldPreferIframePopup('https://cdn.example/master.m3u8', 'https://embed.example/player'),
    true
  );
  assert.equal(
    shouldPreferIframePopup('https://cdn.example/video.mp4?token=abc123', 'https://embed.example/player'),
    true
  );
  assert.equal(
    shouldPreferIframePopup('https://vidboys.com/media/video.mp4', 'https://vidboys.com/embed/player'),
    false
  );
});

run('overlay-remover safe media host check accepts configured subdomains', () => {
  assert.equal(overlayIsSafeMediaHost(), true);
});

run('site-profile matches compatibility profile by hostname suffix', () => {
  const profile = matchSiteBehaviorProfile(
    [
      {
        id: 'compat',
        match: {
          hostSuffixes: ['boyfriendtv.com'],
          iframeSrcIncludes: []
        }
      }
    ],
    'www.boyfriendtv.com',
    {}
  );

  assert.equal(profile?.id, 'compat');
});

run('site-profile matches player family profile by iframe source hint', () => {
  const profile = matchSiteBehaviorProfile(
    [
      {
        id: 'javboys-family',
        match: {
          hostSuffixes: [],
          iframeSrcIncludes: ['myvidplay', 'luluvdoo']
        }
      }
    ],
    'cdn.example.com',
    {
      iframeSrc: 'https://myvidplay.com/embed/stream?id=1'
    }
  );

  assert.equal(profile?.id, 'javboys-family');
});

run('site-profile navigation helper returns matched navigation values', () => {
  assert.deepEqual(getNavigation('redirectTrapHosts', []), ['trap.example']);
  assert.equal(getNavigation('redirectRecoveryEnabled', false), true);
  assert.equal(getNavigation('missingFlag', 'fallback'), 'fallback');
});

run('site-profile anti-antiblock helper returns matched strategy values', () => {
  assert.deepEqual(getAntiAntiBlock('fakeGlobals', []), ['CVP']);
  assert.equal(getAntiAntiBlock('suppressErrors', false), true);
  assert.equal(getAntiAntiBlock('missingValue', 'fallback'), 'fallback');
});

run('anti-antiblock strategy dispatch prefers configured profile', () => {
  assert.equal(shouldUseJavboysAntiAntiBlockStrategy(), true);
});

run('anti-antiblock resolves the configured strategy name', () => {
  assert.equal(resolveAntiAntiBlockStrategyName(), 'javboys-cvp');
});

run('anti-antiblock merges profile-provided error selectors with defaults', () => {
  const selectors = getJavboysFrameErrorSelectors({
    errorSelectors: ['.custom-error', '.player-error']
  });

  assert.equal(selectors.includes('.player-error'), true);
  assert.equal(selectors.includes('.custom-error'), true);
});

console.log('Core smoke tests passed.');
