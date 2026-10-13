// Opt-in observability UI. All controls run in the extension's own dashboard.
(function () {
  'use strict';
  const panel = document.getElementById('ai-observability-panel');
  if (!panel) return;
  const hostSelect = document.getElementById('ai-observer-host');
  const tokenInput = document.getElementById('ai-observer-bridge-token');
  const outputToggle = document.getElementById('ai-observer-model-output');
  const status = document.getElementById('ai-observer-status');
  const eventBox = document.getElementById('ai-observer-events');
  const start = document.getElementById('ai-observer-start');
  const stop = document.getElementById('ai-observer-stop');
  const clear = document.getElementById('ai-observer-clear');
  const exportButton = document.getElementById('ai-observer-export');
  const refreshTabs = document.getElementById('ai-observer-refresh-tabs');
  let lastSnapshot = null;

  function setStatus(message, error = false) {
    if (!status) return;
    status.textContent = message;
    status.style.color = error ? 'var(--danger, #b42318)' : '';
  }

  async function send(action, extras = {}) {
    const response = await chrome.runtime.sendMessage({ action, ...extras });
    if (!response?.success) throw new Error(String(response?.error || 'Observer request failed'));
    return response.snapshot;
  }

  function render(snapshot) {
    if (!snapshot) return;
    lastSnapshot = snapshot;
    const scope = snapshot.scope || {};
    const rows = Array.isArray(snapshot.events) ? snapshot.events : [];
    if (scope.enabled) {
      const remaining = Math.max(0, Math.ceil((Number(scope.expiresAt || 0) - Date.now()) / 1000));
      setStatus('Recording ' + scope.hostname + ' · ' + remaining + 's remaining · ' +
        rows.length + ' events · local bridge ' + (scope.bridgeEnabled ? 'configured' : 'off') +
        (scope.includeModelOutput ? ' · bounded model output ON' : ' · output excerpts OFF'));
    } else {
      setStatus('Capture off. ' + rows.length + ' retained event(s), available for export until expiry.');
    }
    start.disabled = Boolean(scope.enabled);
    stop.disabled = !scope.enabled;
    clear.disabled = rows.length === 0;
    exportButton.disabled = rows.length === 0;
    eventBox.textContent = rows.length
      ? rows.slice(-35).map((item) => {
        const stamp = new Date(item.at).toLocaleTimeString();
        return stamp + ' #' + item.seq + ' ' + item.kind + ' ' + JSON.stringify(item.details) +
          (item.modelOutput ? '\n  MODEL OUTPUT: ' + item.modelOutput : '');
      }).join('\n')
      : 'No diagnostic events.';
  }

  async function loadTabs() {
    const prior = hostSelect.value;
    const tabs = await chrome.tabs.query({});
    const hosts = new Set();
    for (const tab of tabs) {
      try {
        const parsed = new URL(tab.url || '');
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') hosts.add(parsed.hostname.toLowerCase());
      } catch (_) { /* extension internal tab */ }
    }
    const values = [...hosts].sort();
    hostSelect.replaceChildren();
    hostSelect.add(new Option('Select an open browser site...', ''));
    values.forEach((hostname) => hostSelect.add(new Option(hostname, hostname)));
    const next = values.includes(prior) ? prior
      : (lastSnapshot?.scope?.hostname && values.includes(lastSnapshot.scope.hostname)
        ? lastSnapshot.scope.hostname : '');
    hostSelect.value = next;
  }

  async function refresh() {
    try { render(await send('getAiObservability')); }
    catch (error) { setStatus('Observer unavailable: ' + String(error?.message || error), true); }
  }

  start?.addEventListener('click', async () => {
    const hostname = hostSelect.value;
    if (!hostname) return setStatus('Select a site before starting capture.', true);
    const wantsText = outputToggle.checked;
    const token = tokenInput.value.trim();
    if (wantsText && !window.confirm(
      'Capture bounded model output text from ' + hostname + '? It may include page content. Only enable for a test site.')) return;
    if (token && !window.confirm(
      'Send diagnostic entries for ' + hostname + ' to the localhost bridge? Ensure the bridge is running and keep its token private.')) return;
    try {
      render(await send('startAiObservability', {
        hostname, includeModelOutput: wantsText, bridgeToken: token
      }));
      tokenInput.value = '';
    } catch (error) { setStatus('Unable to start: ' + String(error?.message || error), true); }
  });

  stop?.addEventListener('click', async () => {
    try { render(await send('stopAiObservability')); }
    catch (error) { setStatus(String(error?.message || error), true); }
  });

  clear?.addEventListener('click', async () => {
    if (!window.confirm('Clear the session trace? This cannot be undone.')) return;
    try { render(await send('clearAiObservability')); }
    catch (error) { setStatus(String(error?.message || error), true); }
  });

  exportButton?.addEventListener('click', () => {
    if (!lastSnapshot?.events?.length) return;
    const exported = { ...lastSnapshot, exportedAt: Date.now(), warning:
      'Private local diagnostics. Inspect before sharing with an external AI.' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], {
      type: 'application/json'
    }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'falcon-ai-observability-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  refreshTabs?.addEventListener('click', () => loadTabs().catch(() => {}));
  setInterval(() => {
    if (panel.open && !document.hidden) refresh();
  }, 3000);
  loadTabs().catch(() => {});
  refresh();
})();
