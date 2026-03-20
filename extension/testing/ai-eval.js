async function runtimeMessage(payload) {
  return chrome.runtime.sendMessage(payload);
}

window.falconAiEval = {
  ready: true,
  runtimeId: chrome.runtime.id,
  getProviderSettings() {
    return runtimeMessage({ action: 'getAiProviderSettings' });
  },
  saveProviderSettings(settings) {
    return runtimeMessage({
      action: 'setAiProviderSettings',
      settings
    });
  },
  runHealthCheck(settings) {
    return runtimeMessage({
      action: 'runAiProviderHealthCheck',
      settings
    });
  },
  classifyElement(features) {
    return runtimeMessage({
      action: 'aiClassifyElement',
      hostname: features?.hostname || '',
      features: features || {}
    });
  }
};
