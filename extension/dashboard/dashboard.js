// Falcon-Player-Enhance Dashboard - Settings & Management
// v4.4 - Player Protection Focus

document.addEventListener('DOMContentLoaded', () => {
    const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions) || key;
    const locale = chrome.i18n.getUILanguage?.() || navigator.language || 'en-US';
    const POPUP_AUTO_FIT_KEY = 'popupPlayerAutoFitWindow';
    const POPUP_AI_MONITOR_VISIBILITY_KEY = 'popupAiMonitorVisible';
    const AI_PROVIDER_ENDPOINTS = {
        chrome_builtin: 'chrome://built-in-ai/prompt-api',
        openai: 'https://api.openai.com/v1/responses',
        gemini: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        lmstudio: 'http://127.0.0.1:1234/v1/chat/completions',
        gateway: 'http://127.0.0.1:8787/v1'
    };
    const AI_PROVIDER_TIMEOUTS = {
        chrome_builtin: 25000,
        openai: 20000,
        gemini: 20000,
        lmstudio: 4000,
        gateway: 8000
    };

    // ========== Theme ==========
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const themeLabel = document.getElementById('theme-label');
    const policyOverviewVersion = document.getElementById('policy-overview-version');
    const policyGateVersion = document.getElementById('policy-gate-version');
    const policyHighRiskCount = document.getElementById('policy-high-risk-count');
    const policyFallbackCount = document.getElementById('policy-fallback-count');
    const policyHostList = document.getElementById('policy-host-list');
    const aiProvider = document.getElementById('ai-provider');
    const aiProviderToken = document.getElementById('ai-provider-token');
    const lmstudioEnabled = document.getElementById('lmstudio-enabled');
    const lmstudioEndpoint = document.getElementById('lmstudio-endpoint');
    const lmstudioModel = document.getElementById('lmstudio-model');
    const lmstudioMode = document.getElementById('lmstudio-mode');
    const lmstudioTimeout = document.getElementById('lmstudio-timeout');
    const lmstudioCooldown = document.getElementById('lmstudio-cooldown');
    const lmstudioDynamicRules = document.getElementById('lmstudio-dynamic-rules');
    const lmstudioStatus = document.getElementById('lmstudio-status');
    const btnSaveLmstudio = document.getElementById('btn-save-lmstudio');
    const btnCheckLmstudio = document.getElementById('btn-check-lmstudio');
    const lmstudioCandidateSummary = document.getElementById('lmstudio-candidate-summary');
    const lmstudioCandidateList = document.getElementById('lmstudio-candidate-list');
    const btnExportLmstudioCandidates = document.getElementById('btn-export-lmstudio-candidates');
    const aiStatusDot = document.getElementById('ai-status-dot');
    const aiStatusTitle = document.getElementById('ai-status-title');
    const aiStatusSub = document.getElementById('ai-status-sub');
    const aiConfigurePanel = document.getElementById('ai-configure-panel');
    const aiKeyRow = document.getElementById('ai-key-row');
    const aiKeyDisplay = document.getElementById('ai-key-display');
    const aiKeyEditRow = document.getElementById('ai-key-edit-row');
    const aiModelRow = document.getElementById('ai-model-row');
    const aiEndpointRow = document.getElementById('ai-endpoint-row');
    const btnUpdateApiKey = document.getElementById('btn-update-api-key');
    const btnConfirmApiKey = document.getElementById('btn-confirm-api-key');
    const providerCards = Array.from(document.querySelectorAll('.provider-card'));
    const modeCards = Array.from(document.querySelectorAll('.mode-card'));
    const enhancedSitesMergedDisplay = document.getElementById('enhanced-sites-merged-display');
    let lastSelectedProvider = 'openai';
    let hasStoredCredential = false;

    async function initTheme() {
        const result = await chrome.storage.local.get(['theme']);
        if (result.theme) {
            applyTheme(result.theme);
        } else {
            applyTheme('light');
        }
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (themeIcon) themeIcon.textContent = theme === 'dark' ? '●' : '☀';
        if (themeLabel) themeLabel.textContent = theme === 'dark' ? t('dashboardThemeDark') : t('dashboardThemeLight');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', async () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            await chrome.storage.local.set({ theme: next });
        });
    }

    initTheme();

    // ========== Tab Navigation ==========
    const tabItems = document.querySelectorAll('.menu-item');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabItems.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;

            tabItems.forEach(t => { t.classList.remove('active'); });
            tab.classList.add('active');

            tabPanels.forEach(panel => { panel.classList.remove('active'); });

            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                requestAnimationFrame(() => targetPanel.classList.add('active'));
            }
        });
    });

    // ========== Stats Display ==========
    function loadStats() {
        chrome.storage.local.get(['stats'], (result) => {
            const stats = result.stats || {};
            const statsOverlays = document.getElementById('stats-overlays');
            const statsPopups = document.getElementById('stats-popups');
            const statsPlayers = document.getElementById('stats-players');
            const statsAiEvals = document.getElementById('stats-ai-evals');

            if (statsOverlays) statsOverlays.textContent = formatNumber(stats.overlaysRemoved || 0);
            if (statsPopups) statsPopups.textContent = formatNumber(stats.popupsBlocked || 0);
            if (statsPlayers) statsPlayers.textContent = formatNumber(stats.playersProtected || 0);
            if (statsAiEvals) statsAiEvals.textContent = formatNumber(stats.aiAssessments || 0);
        });
    }

    // ========== Overview Status Bar ==========
    async function loadStatusBar() {
        const result = await chrome.storage.local.get(['stats', 'aiProviderSettings', 'customSites']);
        const settings = result.aiProviderSettings || {};
        const stats = result.stats || {};
        const statusDot = document.getElementById('status-active-dot');
        const statusAiMode = document.getElementById('status-ai-mode');
        const statusEnhancedCount = document.getElementById('status-enhanced-count');

        if (statusDot) statusDot.classList.toggle('inactive', false);
        if (statusAiMode) {
            const mode = settings.mode || 'off';
            const provider = settings.provider || '';
            statusAiMode.textContent = mode === 'off'
                ? t('dashboardStatusAiModeOff')
                : t('dashboardStatusAiModeWithProvider', [mode, provider]);
        }
        if (statusEnhancedCount) {
            const customCount = Array.isArray(result.customSites) ? result.customSites.length : 0;
            statusEnhancedCount.textContent = customCount === 1
                ? t('dashboardStatusEnhancedCountOne', [String(customCount)])
                : t('dashboardStatusEnhancedCountOther', [String(customCount)]);
        }
    }

    loadStatusBar();

    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    }

    loadStats();

    async function runtimeMessage(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                    return;
                }
                resolve(response || null);
            });
        });
    }

    function formatPolicyGateAction(action) {
        return String(action || '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function toPascalCaseToken(token) {
        return String(token || '')
            .split(/[^a-zA-Z0-9]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');
    }

    function localizePolicyAction(action) {
        const fallback = formatPolicyGateAction(action);
        const key = `policyAction${toPascalCaseToken(action)}`;
        const translated = t(key);
        return translated === key ? fallback : translated;
    }

    function localizePolicySignal(type) {
        const fallback = formatPolicyGateAction(type);
        const key = `policySignal${toPascalCaseToken(type)}`;
        const translated = t(key);
        return translated === key ? fallback : translated;
    }

    function formatPolicyGateReason(reason) {
        const value = String(reason || 'runtime_default');
        const key = `policyReason${toPascalCaseToken(value)}`;
        const translated = t(key);
        if (translated !== key) return translated;
        return value.replace(/_/g, ' ');
    }

    function formatPolicyGateMode(mode) {
        const value = String(mode || 'advisory-only');
        const key = `policyMode${toPascalCaseToken(value)}`;
        const translated = t(key);
        if (translated !== key) return translated;
        return value;
    }

    function formatEvidenceSignal(signal) {
        if (!signal) return '';
        const count = Number(signal.count || 0);
        if (count > 0) {
            return `${localizePolicySignal(signal.type)} ×${count}`;
        }
        const delta = Number(signal.delta || 0);
        const sign = delta > 0 ? '+' : '';
        return `${localizePolicySignal(signal.type)} ${sign}${delta.toFixed(2)}`;
    }

    function renderPolicyHostList(hosts) {
        if (!policyHostList) return;
        policyHostList.innerHTML = '';

        const list = Array.isArray(hosts) ? hosts : [];
        if (list.length === 0) {
            policyHostList.innerHTML = `<div class="empty-state">${escapeHtml(t('dashboardPolicyNoHighRiskHosts'))}</div>`;
            return;
        }

        list.forEach((host) => {
            const item = document.createElement('div');
            item.className = 'policy-host-item';

            const gateTier = String(host.policyGateTier || 'T1').toUpperCase();
            const actions = Array.isArray(host.allowedActions) ? host.allowedActions : [];
            const evidenceSignals = Array.isArray(host.evidence?.topSignals) && host.evidence.topSignals.length > 0
                ? host.evidence.topSignals
                : Array.isArray(host.evidence?.recentSignals)
                ? host.evidence.recentSignals
                : [];
            const chips = actions.length > 0
                ? actions.map((action) => `<span class="policy-action-chip">${escapeHtml(localizePolicyAction(action))}</span>`).join('')
                : `<span class="policy-action-chip">${escapeHtml(t('dashboardPolicyNoReversibleActions'))}</span>`;
            const evidenceChips = evidenceSignals.length > 0
                ? evidenceSignals.map((signal) => `<span class="policy-action-chip">${escapeHtml(formatEvidenceSignal(signal))}</span>`).join('')
                : `<span class="policy-action-chip">${escapeHtml(t('dashboardPolicyNoRecentSignals'))}</span>`;

            item.innerHTML = `
                <div class="policy-host-main">
                    <span class="policy-host-name">${escapeHtml(host.hostname || 'unknown-host')}</span>
                    <span class="policy-chip ${escapeHtml(gateTier.toLowerCase())}">${escapeHtml(gateTier)}</span>
                </div>
                <div class="policy-host-meta">
                    <span class="policy-chip">${escapeHtml(String(host.riskTier || 'low').toUpperCase())} · ${Number(host.riskScore || 0).toFixed(2)}</span>
                    <span class="policy-chip">${escapeHtml(formatPolicyGateMode(host.policyGateMode || 'advisory-only'))}</span>
                    ${host.fallbackActive ? `<span class="policy-chip fallback">${escapeHtml(t('dashboardPolicyFallbackActive'))}</span>` : ''}
                </div>
                <div class="policy-host-meta">
                    <span>${escapeHtml(t('dashboardPolicyReasonLabel'))}: ${escapeHtml(formatPolicyGateReason(host.policyGateReason))}</span>
                </div>
                <div class="policy-actions-row">${chips}</div>
                <div class="policy-host-meta">
                    <span>${escapeHtml(t('dashboardPolicyEvidenceLabel'))}</span>
                </div>
                <div class="policy-actions-row">${evidenceChips}</div>
            `;

            policyHostList.appendChild(item);
        });
    }

    function downloadJsonFile(filename, payload) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }

    function getProviderLabel(provider) {
        if (provider === 'chrome_builtin') return t('dashboardAiProviderChromeBuiltinLabel');
        if (provider === 'openai') return t('dashboardAiProviderOpenaiLabel');
        if (provider === 'gemini') return t('dashboardAiProviderGeminiLabel');
        if (provider === 'gateway') return t('dashboardAiProviderGatewayLabel');
        return t('dashboardAiProviderLmstudioLabel');
    }

    function getProviderDefaultEndpoint(provider) {
        return AI_PROVIDER_ENDPOINTS[provider] || AI_PROVIDER_ENDPOINTS.lmstudio;
    }

    function getProviderDefaultTimeout(provider) {
        return AI_PROVIDER_TIMEOUTS[provider] || AI_PROVIDER_TIMEOUTS.openai;
    }

    function getProviderDefaultModel(provider) {
        if (provider === 'chrome_builtin') return 'gemini-nano';
        if (provider === 'openai') return 'gpt-5.4-mini';
        if (provider === 'gemini') return 'gemini-2.5-flash';
        return '';
    }

    function providerUsesCredential(provider) {
        return ['openai', 'gemini', 'gateway'].includes(provider);
    }

    function providerUsesEndpoint(provider) {
        return provider !== 'chrome_builtin';
    }

    function updateProviderFieldVisibility(provider) {
        const usesCredential = providerUsesCredential(provider);
        const usesEndpoint = providerUsesEndpoint(provider);

        if (aiKeyRow) {
            aiKeyRow.style.display = usesCredential ? '' : 'none';
        }
        if (aiKeyEditRow && !usesCredential) {
            aiKeyEditRow.style.display = 'none';
        }
        if (btnUpdateApiKey) {
            btnUpdateApiKey.style.display = usesCredential ? '' : 'none';
        }
        if (aiModelRow) {
            aiModelRow.style.display = '';
        }
        if (lmstudioModel) {
            lmstudioModel.disabled = provider === 'chrome_builtin';
        }
        if (aiEndpointRow) {
            aiEndpointRow.style.display = usesEndpoint ? '' : 'none';
        }
        if (lmstudioEndpoint) {
            lmstudioEndpoint.disabled = !usesEndpoint;
        }
    }

    function setSelectedProviderCard(provider) {
        providerCards.forEach((card) => {
            const isSelected = card.dataset.provider === provider;
            card.classList.toggle('selected', isSelected);
            card.setAttribute('aria-pressed', String(isSelected));
        });
    }

    function setSelectedModeCard(mode) {
        modeCards.forEach((card) => {
            const isSelected = card.dataset.mode === mode;
            card.classList.toggle('selected', isSelected);
            card.setAttribute('aria-checked', String(isSelected));
            card.tabIndex = isSelected ? 0 : -1;
        });
    }

    function renderApiKeyState(hasCredential, hasStagedCredential = false) {
        if (aiKeyDisplay) {
            aiKeyDisplay.value = hasStagedCredential
                ? t('dashboardAiCredentialStaged')
                : hasCredential
                ? t('dashboardAiCredentialStored')
                : t('dashboardAiCredentialEmpty');
        }
        if (aiKeyEditRow) {
            aiKeyEditRow.style.display = 'none';
        }
        if (btnUpdateApiKey) {
            btnUpdateApiKey.textContent = hasCredential ? t('dashboardAiUpdateKeyLabel') : t('dashboardAiAddKeyLabel');
        }
    }

    function renderAiStatusCard(settings, state) {
        if (!aiStatusTitle || !aiStatusSub || !aiStatusDot) return;

        const provider = String(settings?.provider || lastSelectedProvider || 'openai');
        const providerLabel = getProviderLabel(provider);
        const mode = String(settings?.mode || 'off');
        const enabled = settings?.enabled === true;
        const lastHealthOk = state?.lastHealthOk === true;
        const error = state?.lastError ? String(state.lastError) : '';
        const model = settings?.model || getProviderDefaultModel(provider) || 'runtime default';

        aiStatusDot.classList.remove('online', 'error');
        if (enabled && lastHealthOk) {
            aiStatusDot.classList.add('online');
        } else if (enabled && error) {
            aiStatusDot.classList.add('error');
        }

        if (!enabled) {
            aiStatusTitle.textContent = t('dashboardAiStatusDisabled');
            aiStatusSub.textContent = t('dashboardAiStatusSubProviderMode', [providerLabel, mode]);
            return;
        }

        aiStatusTitle.textContent = providerLabel;
        aiStatusSub.textContent = error
            ? t('dashboardAiStatusSubModelError', [model, error])
            : lastHealthOk
            ? t('dashboardAiStatusSubProviderModeHealthy', [model, mode])
            : t('dashboardAiStatusSubProviderMode', [model, mode]);
    }

    function syncProviderDefaults(nextProvider) {
        if (!lmstudioEndpoint || !lmstudioModel) {
            lastSelectedProvider = nextProvider;
            return;
        }

        const currentEndpoint = lmstudioEndpoint.value.trim();
        const previousEndpoint = getProviderDefaultEndpoint(lastSelectedProvider);
        if (!currentEndpoint || currentEndpoint === previousEndpoint) {
            lmstudioEndpoint.value = getProviderDefaultEndpoint(nextProvider);
        }

        const currentModel = lmstudioModel.value.trim();
        const knownDefaults = ['gemini-nano', 'gpt-5.4-mini', 'gemini-2.5-flash', ''];
        if (!currentModel || knownDefaults.includes(currentModel)) {
            lmstudioModel.value = getProviderDefaultModel(nextProvider);
        }

        lastSelectedProvider = nextProvider;
    }

    function selectProvider(nextProvider) {
        syncProviderDefaults(nextProvider);
        setSelectedProviderCard(nextProvider);
        updateProviderFieldVisibility(nextProvider);
        renderApiKeyState(hasStoredCredential, Boolean(aiProviderToken?.value.trim()));
        if (aiConfigurePanel) {
            aiConfigurePanel.style.display = 'block';
        }
        renderAiStatusCard({
            provider: nextProvider,
            enabled: lmstudioEnabled?.checked === true,
            mode: lmstudioMode?.value || 'off',
            model: lmstudioModel?.value || getProviderDefaultModel(nextProvider)
        });
    }

    function renderLmStudioCandidates(candidateList) {
        if (!lmstudioCandidateList) return;
        lmstudioCandidateList.innerHTML = '';

        if (!Array.isArray(candidateList) || candidateList.length === 0) {
            lmstudioCandidateList.innerHTML = `<div class="empty-state">${escapeHtml(t('dashboardAiNoCandidates'))}</div>`;
            return;
        }

        candidateList.forEach((candidate) => {
            const item = document.createElement('div');
            item.className = 'policy-host-item';
            const providerLabel = getProviderLabel(String(candidate.provider || 'lmstudio'));
            item.innerHTML = `
                <div class="policy-host-main">
                    <span class="policy-host-name">${escapeHtml(candidate.hostname || 'unknown-host')}</span>
                    <span class="policy-chip">${escapeHtml(candidate.model || providerLabel)}</span>
                </div>
                <div class="policy-host-meta">
                    <span class="policy-chip">${escapeHtml(providerLabel)}</span>
                    <span class="policy-chip">${escapeHtml(t('dashboardAiCandidateSelectors', [String(Number(candidate.selectorCount || 0))]))}</span>
                    <span class="policy-chip">${escapeHtml(t('dashboardAiCandidateDomains', [String(Number(candidate.domainCount || 0))]))}</span>
                </div>
                <div class="policy-host-meta">
                    <span>${escapeHtml(candidate.summary || t('dashboardAiCandidateNoSummary'))}</span>
                </div>
            `;
            lmstudioCandidateList.appendChild(item);
        });
    }

    async function loadPolicyGateOverview() {
        const response = await runtimeMessage({ action: 'getAiInsights' });
        const snapshot = response?.success ? response.snapshot : null;
        if (!snapshot) {
            if (policyHostList) {
                policyHostList.innerHTML = `<div class="empty-state">${escapeHtml(t('dashboardPolicyLoadFailed'))}</div>`;
            }
            return;
        }

        if (policyOverviewVersion) {
            policyOverviewVersion.textContent = String(snapshot.policyVersion || '-');
        }
        if (policyGateVersion) {
            policyGateVersion.textContent = String(snapshot.policyGateVersion || '-');
        }
        if (policyHighRiskCount) {
            policyHighRiskCount.textContent = formatNumber(snapshot.highRiskHosts?.length || 0);
        }
        if (policyFallbackCount) {
            policyFallbackCount.textContent = formatNumber(snapshot.activeFallbackHosts?.length || 0);
        }

        renderPolicyHostList(snapshot.highRiskHosts || []);
        const candidateList = Array.isArray(snapshot.provider?.generatedRuleCandidates)
            ? snapshot.provider.generatedRuleCandidates
            : [];
        if (lmstudioCandidateSummary) {
            if (candidateList.length === 0) {
                lmstudioCandidateSummary.textContent = t('dashboardAiCandidatesSummaryEmpty');
            } else {
                const top = candidateList[0];
                lmstudioCandidateSummary.textContent = t('dashboardAiCandidatesSummaryLatest', [
                    String(candidateList.length),
                    String(top.hostname || 'unknown-host'),
                    String(top.selectorCount || 0),
                    String(top.domainCount || 0)
                ]);
            }
        }
        renderLmStudioCandidates(candidateList);
    }

    loadPolicyGateOverview();

    function setLmStudioStatus(text, isError = false) {
        if (!lmstudioStatus) return;
        lmstudioStatus.textContent = text;
        lmstudioStatus.style.color = isError ? 'var(--danger, #b42318)' : '';
    }

    function hydrateProviderForm(settings, state) {
        const provider = String(settings?.provider || 'openai');
        const hasStoredApiKey = settings?.hasApiKey === true;
        hasStoredCredential = hasStoredApiKey;
        lastSelectedProvider = provider;
        if (aiProvider) aiProvider.value = provider;
        if (aiProviderToken) {
            aiProviderToken.value = '';
            aiProviderToken.placeholder = hasStoredApiKey
                ? t('dashboardAiStoredCredentialPlaceholder')
                : t('dashboardAiTokenPlaceholder');
        }
        renderApiKeyState(hasStoredApiKey, false);
        updateProviderFieldVisibility(provider);
        if (lmstudioEnabled) lmstudioEnabled.checked = settings?.enabled === true;
        if (lmstudioEndpoint) lmstudioEndpoint.value = settings?.endpoint || getProviderDefaultEndpoint(provider);
        if (lmstudioModel) {
            lmstudioModel.value = settings?.model || getProviderDefaultModel(provider);
        }
        if (lmstudioMode) lmstudioMode.value = settings?.mode || 'hybrid';
        if (lmstudioTimeout) lmstudioTimeout.value = String(settings?.timeoutMs || getProviderDefaultTimeout(provider));
        if (lmstudioCooldown) lmstudioCooldown.value = String(settings?.cooldownMs || 25000);
        if (lmstudioDynamicRules) lmstudioDynamicRules.checked = settings?.enableDynamicRuleCandidates !== false;
        setSelectedProviderCard(provider);
        setSelectedModeCard(lmstudioMode?.value || 'hybrid');
        if (aiConfigurePanel) {
            aiConfigurePanel.style.display = 'block';
        }
        renderAiStatusCard(settings, state);

        if (state) {
            const providerLabel = getProviderLabel(String(state.lastProvider || provider));
            const health = state.lastHealthOk ? 'healthy' : 'not checked';
            const latency = Number(state.lastLatencyMs || 0);
            const modelInfo = state.lastResolvedModel ? ` model=${state.lastResolvedModel}` : '';
            const error = state.lastError ? ` error=${state.lastError}` : '';
            const credentialInfo = hasStoredApiKey ? ' credential=session' : ' credential=empty';
            setLmStudioStatus(`${providerLabel} ${health}.${modelInfo}${latency > 0 ? ` latency=${latency}ms` : ''}${credentialInfo}${error}`);
        }
    }

    function collectProviderSettings() {
        const provider = lastSelectedProvider || aiProvider?.value || 'openai';
        return {
            provider,
            enabled: lmstudioEnabled?.checked === true,
            endpoint: lmstudioEndpoint?.value || getProviderDefaultEndpoint(provider),
            model: lmstudioModel?.value || (
                getProviderDefaultModel(provider)
            ),
            apiKey: providerUsesCredential(provider) ? (aiProviderToken?.value || '') : '',
            mode: lmstudioMode?.value || 'hybrid',
            timeoutMs: Number(lmstudioTimeout?.value || getProviderDefaultTimeout(provider)),
            cooldownMs: Number(lmstudioCooldown?.value || 25000),
            enableDynamicRuleCandidates: lmstudioDynamicRules?.checked !== false
        };
    }

    async function loadAiProviderSettings() {
        const response = await runtimeMessage({ action: 'getAiProviderSettings' });
        if (!response?.success) {
            setLmStudioStatus(t('dashboardAiSettingsLoadFailed'), true);
            return;
        }
        hydrateProviderForm(response.settings, response.state);
    }

    async function saveAiProviderSettings() {
        const settings = collectProviderSettings();
        const providerLabel = getProviderLabel(settings.provider);
        const response = await runtimeMessage({
            action: 'setAiProviderSettings',
            settings
        });
        if (!response?.success) {
            setLmStudioStatus(response?.error || t('dashboardAiSettingsSaveFailed', [providerLabel]), true);
            return;
        }
        hydrateProviderForm(response.settings, response.state);
        loadStatusBar();
        setLmStudioStatus(t('dashboardAiSettingsSaved', [providerLabel]));
    }

    async function runAiProviderHealthCheck() {
        const settings = collectProviderSettings();
        const providerLabel = getProviderLabel(settings.provider);
        setLmStudioStatus(t('dashboardAiHealthChecking', [providerLabel]));
        const response = await runtimeMessage({
            action: 'runAiProviderHealthCheck',
            settings
        });
        if (!response?.success) {
            setLmStudioStatus(response?.error || t('dashboardAiHealthFailed', [providerLabel]), true);
            return;
        }
        const modelCount = Number(response.modelCount || 0);
        setLmStudioStatus(t('dashboardAiHealthReady', [
            providerLabel,
            String(modelCount),
            response.resolvedModel || '-',
            response.service || '-'
        ]));
        await loadAiProviderSettings();
    }

    if (aiProvider) {
        aiProvider.addEventListener('change', () => {
            selectProvider(aiProvider.value);
        });
    }

    providerCards.forEach((card) => {
        const activate = () => selectProvider(card.dataset.provider || 'openai');
        card.addEventListener('click', activate);
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            activate();
        });
    });

    modeCards.forEach((card) => {
        const activate = () => {
            const mode = card.dataset.mode || 'off';
            if (lmstudioMode) {
                lmstudioMode.value = mode;
            }
            setSelectedModeCard(mode);
            renderAiStatusCard({
                provider: lastSelectedProvider,
                enabled: lmstudioEnabled?.checked === true,
                mode,
                model: lmstudioModel?.value || getProviderDefaultModel(lastSelectedProvider)
            });
        };
        card.addEventListener('click', activate);
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            activate();
        });
    });

    if (btnUpdateApiKey) {
        btnUpdateApiKey.addEventListener('click', () => {
            if (aiKeyEditRow) {
                aiKeyEditRow.style.display = 'flex';
            }
            if (aiProviderToken) {
                aiProviderToken.focus();
                aiProviderToken.select();
            }
        });
    }

    if (btnConfirmApiKey) {
        btnConfirmApiKey.addEventListener('click', () => {
            const hasStagedCredential = Boolean(aiProviderToken?.value.trim());
            renderApiKeyState(hasStoredCredential || hasStagedCredential, hasStagedCredential);
        });
    }

    if (lmstudioEnabled) {
        lmstudioEnabled.addEventListener('change', () => {
            renderAiStatusCard({
                provider: lastSelectedProvider,
                enabled: lmstudioEnabled.checked,
                mode: lmstudioMode?.value || 'off',
                model: lmstudioModel?.value || getProviderDefaultModel(lastSelectedProvider)
            });
        });
    }

    if (btnSaveLmstudio) {
        btnSaveLmstudio.addEventListener('click', saveAiProviderSettings);
    }
    if (btnCheckLmstudio) {
        btnCheckLmstudio.addEventListener('click', runAiProviderHealthCheck);
    }
    if (btnExportLmstudioCandidates) {
        btnExportLmstudioCandidates.addEventListener('click', async () => {
            const response = await runtimeMessage({ action: 'getAiRuleCandidates' });
            if (!response?.success) {
                setLmStudioStatus('Failed to load generated rule candidates.', true);
                return;
            }
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            downloadJsonFile(`falcon-ai-candidates-${stamp}.json`, response.candidates || {});
        });
    }

    loadAiProviderSettings();

    // ========== Popup Player Settings ==========
    const togglePopupAutoFit = document.getElementById('toggle-popup-auto-fit');
    const togglePopupAiMonitor = document.getElementById('toggle-popup-ai-monitor');

    async function loadPlayerSettings() {
        const result = await chrome.storage.local.get([POPUP_AUTO_FIT_KEY, POPUP_AI_MONITOR_VISIBILITY_KEY]);
        if (togglePopupAutoFit) {
            togglePopupAutoFit.checked = result[POPUP_AUTO_FIT_KEY] !== false;
        }
        if (togglePopupAiMonitor) {
            togglePopupAiMonitor.checked = result[POPUP_AI_MONITOR_VISIBILITY_KEY] === true;
        }
    }

    if (togglePopupAutoFit) {
        togglePopupAutoFit.addEventListener('change', async () => {
            await chrome.storage.local.set({ [POPUP_AUTO_FIT_KEY]: togglePopupAutoFit.checked });
        });
    }

    if (togglePopupAiMonitor) {
        togglePopupAiMonitor.addEventListener('change', async () => {
            await chrome.storage.local.set({ [POPUP_AI_MONITOR_VISIBILITY_KEY]: togglePopupAiMonitor.checked });
        });
    }

    loadPlayerSettings();

    // ========== Whitelist / Blacklist ==========
    async function loadLists() {
        const result = await chrome.storage.local.get(['whitelist', 'blacklist']);
        renderDomainList('whitelist-display', result.whitelist || []);
        renderDomainList('blacklist-display', result.blacklist || []);
    }

    function renderDomainList(containerId, domains) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (domains.length === 0) {
            container.innerHTML = `<div class="empty-state">${t('dashboardEmptyNoItems')}</div>`;
            return;
        }

        domains.forEach(domain => {
            const item = document.createElement('div');
            item.className = 'domain-item';
            item.innerHTML = `
                <span class="domain-name">${escapeHtml(domain)}</span>
                <button class="domain-remove" data-domain="${escapeHtml(domain)}">✕</button>
            `;
            container.appendChild(item);
        });

        container.querySelectorAll('.domain-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const domain = btn.dataset.domain;
                const listType = containerId === 'whitelist-display' ? 'whitelist' : 'blacklist';
                removeDomain(listType, domain);
            });
        });
    }

    async function addDomain(listType, domain) {
        if (!domain) return;

        let normalized = domain.toLowerCase().trim();
        normalized = normalized.replace(/^https?:\/\//, '');
        normalized = normalized.replace(/\/.*$/, '');
        normalized = normalized.replace(/^www\./, '');

        if (normalized.length < 3) return;

        const result = await chrome.storage.local.get([listType]);
        const list = result[listType] || [];

        if (!list.includes(normalized)) {
            list.push(normalized);
            await chrome.storage.local.set({ [listType]: list });
            loadLists();
        }
    }

    async function removeDomain(listType, domain) {
        const result = await chrome.storage.local.get([listType]);
        const list = result[listType] || [];
        const filtered = list.filter(d => d !== domain);
        await chrome.storage.local.set({ [listType]: filtered });
        loadLists();
    }

    // Whitelist controls
    const btnAddWhitelist = document.getElementById('btn-add-whitelist');
    const whitelistInput = document.getElementById('whitelist-input');

    if (btnAddWhitelist && whitelistInput) {
        btnAddWhitelist.addEventListener('click', () => {
            addDomain('whitelist', whitelistInput.value);
            whitelistInput.value = '';
        });

        whitelistInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addDomain('whitelist', whitelistInput.value);
                whitelistInput.value = '';
            }
        });
    }

    // Blacklist controls
    const btnAddBlacklist = document.getElementById('btn-add-blacklist');
    const blacklistInput = document.getElementById('blacklist-input');

    if (btnAddBlacklist && blacklistInput) {
        btnAddBlacklist.addEventListener('click', () => {
            addDomain('blacklist', blacklistInput.value);
            blacklistInput.value = '';
        });

        blacklistInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addDomain('blacklist', blacklistInput.value);
                blacklistInput.value = '';
            }
        });
    }

    loadLists();

    // ========== Security Settings ==========
    const toggleSandbox = document.getElementById('toggle-sandbox');

    async function loadSecuritySettings() {
        const result = await chrome.storage.local.get(['sandboxEnabled']);
        if (toggleSandbox) {
            toggleSandbox.checked = result.sandboxEnabled !== false;
        }
    }

    loadSecuritySettings();

    if (toggleSandbox) {
        toggleSandbox.addEventListener('change', () => {
            chrome.storage.local.set({ sandboxEnabled: toggleSandbox.checked });
        });
    }

    // Reset Stats
    const btnResetStats = document.getElementById('btn-reset-stats');
    if (btnResetStats) {
        btnResetStats.addEventListener('click', () => {
            if (confirm(t('dashboardConfirmResetStats'))) {
                chrome.storage.local.set({
                    stats: {
                        overlaysRemoved: 0,
                        popupsBlocked: 0,
                        fakeVideosRemoved: 0,
                        playersProtected: 0,
                        totalBlocked: 0
                    }
                });
                loadStats();
            }
        });
    }

    // ========== Helper Functions ==========
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatDateTime(date) {
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return t('dashboardJustNow');
        if (diff < 3600000) return t('dashboardMinutesAgo', [String(Math.floor(diff / 60000))]);
        if (diff < 86400000) return t('dashboardHoursAgo', [String(Math.floor(diff / 3600000))]);
        if (diff < 604800000) return t('dashboardDaysAgo', [String(Math.floor(diff / 86400000))]);

        return date.toLocaleDateString(locale, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // ========== Hidden Elements Management ==========
    const hiddenElementsList = document.getElementById('hidden-elements-list');

    async function loadHiddenElements() {
        if (!hiddenElementsList) return;

        const result = await chrome.storage.local.get(['hiddenElements']);
        const elements = result.hiddenElements || [];

        if (elements.length === 0) {
            hiddenElementsList.innerHTML = `<div class="empty-state">${t('dashboardEmptyNoBlockedElements')}</div>`;
            return;
        }

        // Group by hostname
        const grouped = {};
        elements.forEach((el, index) => {
            const host = el.hostname || t('dashboardUnknownHost');
            if (!grouped[host]) {
                grouped[host] = [];
            }
            grouped[host].push({ ...el, originalIndex: index });
        });

        // Render
        hiddenElementsList.innerHTML = '';

        const sortedEntries = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
        for (const [hostname, items] of sortedEntries) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'element-group';

            const headerDiv = document.createElement('div');
            headerDiv.className = 'element-group-header';
            headerDiv.innerHTML = `
                <span class="element-group-title">${escapeHtml(hostname)}</span>
                <span class="element-group-count">${t('dashboardItemsCount', [String(items.length)])}</span>
            `;
            groupDiv.appendChild(headerDiv);

            items.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'element-item';

                const timeStr = item.timestamp ? formatDateTime(new Date(item.timestamp)) : '';

                itemDiv.innerHTML = `
                    <div class="element-info">
                        <span class="element-selector" title="${escapeHtml(item.selector)}">${escapeHtml(item.selector)}</span>
                        ${timeStr ? `<span class="element-meta">${t('dashboardAddedAt', [timeStr])}</span>` : ''}
                    </div>
                    <button class="element-remove" data-index="${item.originalIndex}" title="${t('dashboardRemoveRuleTitle')}">✕</button>
                `;
                groupDiv.appendChild(itemDiv);
            });

            hiddenElementsList.appendChild(groupDiv);
        }

        // Bind remove events
        hiddenElementsList.querySelectorAll('.element-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                const index = parseInt(btn.dataset.index, 10);
                await removeHiddenElement(index);
            });
        });
    }

    async function removeHiddenElement(index) {
        const result = await chrome.storage.local.get(['hiddenElements']);
        const elements = result.hiddenElements || [];

        if (index >= 0 && index < elements.length) {
            elements.splice(index, 1);
            await chrome.storage.local.set({ hiddenElements: elements });
            loadHiddenElements();
        }
    }

    async function clearAllHiddenElements() {
        if (confirm(t('dashboardConfirmClearElements'))) {
            await chrome.storage.local.set({ hiddenElements: [] });
            loadHiddenElements();
        }
    }

    // Load on init
    loadHiddenElements();

    // Clear all button
    const btnClearAllElements = document.getElementById('btn-clear-all-elements');
    if (btnClearAllElements) {
        btnClearAllElements.addEventListener('click', clearAllHiddenElements);
    }

    // ========== Listen for storage changes ==========
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.stats) loadStats();
            if (changes.aiProfiles || changes.aiTelemetryLog || changes.aiPolicyCache || changes.aiHostFallbacks) {
                loadPolicyGateOverview();
            }
            if (changes.aiProviderSettings || changes.aiProviderState || changes.aiProviderAdvisories || changes.aiGeneratedRuleCandidates) {
                loadAiProviderSettings();
                loadPolicyGateOverview();
                loadStatusBar();
            }
            if (changes.whitelist || changes.blacklist) loadLists();
            if (changes.hiddenElements) loadHiddenElements();
            if (changes.customSites) {
                loadCustomSites();
                loadStatusBar();
            }
            if (changes[POPUP_AUTO_FIT_KEY] && togglePopupAutoFit) {
                togglePopupAutoFit.checked = changes[POPUP_AUTO_FIT_KEY].newValue !== false;
            }
            if (changes[POPUP_AI_MONITOR_VISIBILITY_KEY] && togglePopupAiMonitor) {
                togglePopupAiMonitor.checked = changes[POPUP_AI_MONITOR_VISIBILITY_KEY].newValue === true;
            }
            if (changes.theme) {
                const newTheme = changes.theme.newValue;
                if (newTheme) applyTheme(newTheme);
            }
        }
    });

    // ========== Custom Sites Management ==========
    const customSiteInput = document.getElementById('custom-site-input');
    const btnAddCustomSite = document.getElementById('btn-add-custom-site');
    const customSiteFeedback = document.getElementById('custom-site-feedback');

    async function loadCustomSites() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getCustomSites' });
            if (!response?.success) return;

            renderEnhancedSites(response.builtinDomains || [], response.customSites || []);
            renderMatchPatternPreview(response.builtinDomains || [], response.customSites || []);
        } catch (err) {
            console.error('Failed to load custom sites:', err);
        }
    }

    function renderEnhancedSites(builtinDomains, customSites) {
        if (!enhancedSitesMergedDisplay) return;
        enhancedSitesMergedDisplay.innerHTML = '';

        const merged = [...builtinDomains.map((domain) => ({ domain, builtin: true })), ...customSites.map((domain) => ({ domain, builtin: false }))];
        const sorted = merged
            .filter((item, index, list) => list.findIndex((entry) => entry.domain === item.domain) === index)
            .sort((a, b) => a.domain.localeCompare(b.domain));

        if (sorted.length === 0) {
            enhancedSitesMergedDisplay.innerHTML = `<div class="empty-state">${t('dashboardCustomSitesEmpty')}</div>`;
            return;
        }

        sorted.forEach(({ domain, builtin }) => {
            const item = document.createElement('div');
            item.className = 'domain-item';
            item.dataset.builtin = String(builtin);
            item.innerHTML = `
                <span class="domain-name">${escapeHtml(domain)}</span>
                ${builtin
                    ? `<span class="builtin-badge">${t('dashboardCustomSitesBuiltinBadge')}</span>`
                    : `<button class="domain-remove" data-domain="${escapeHtml(domain)}">✕</button>`}
            `;
            enhancedSitesMergedDisplay.appendChild(item);
        });

        enhancedSitesMergedDisplay.querySelectorAll('.domain-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                const domain = btn.dataset.domain;
                await removeCustomSite(domain);
            });
        });
    }

    function renderMatchPatternPreview(builtinDomains, customSites) {
        const container = document.getElementById('custom-sites-preview');
        if (!container) return;

        const allDomains = [...new Set([...builtinDomains, ...customSites])].sort();
        const patterns = allDomains.flatMap(d => [`*://*.${d}/*`, `*://${d}/*`]);
        container.textContent = patterns.join('\n');
    }

    async function addCustomSite(domain) {
        if (!domain) return;

        let normalized = domain.toLowerCase().trim();
        normalized = normalized.replace(/^https?:\/\//, '');
        normalized = normalized.replace(/\/.*$/, '');
        normalized = normalized.replace(/^www\./, '');

        if (normalized.length < 3 || !normalized.includes('.')) {
            showFeedback(t('dashboardCustomSitesInvalid'), 'error');
            return;
        }

        try {
            const response = await chrome.runtime.sendMessage({ action: 'addCustomSite', domain: normalized });
            if (response?.success) {
                showFeedback(t('dashboardCustomSitesAdded', [normalized]), 'success');
                loadCustomSites();
            } else {
                showFeedback(response?.error || 'Unknown error', 'error');
            }
        } catch (err) {
            showFeedback(String(err?.message || err), 'error');
        }
    }

    async function removeCustomSite(domain) {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'removeCustomSite', domain });
            if (response?.success) {
                showFeedback(t('dashboardCustomSitesRemoved', [domain]), 'success');
                loadCustomSites();
            }
        } catch (err) {
            showFeedback(String(err?.message || err), 'error');
        }
    }

    function showFeedback(msg, type) {
        if (!customSiteFeedback) return;
        customSiteFeedback.textContent = msg;
        customSiteFeedback.className = 'custom-site-feedback ' + (type || '');
        clearTimeout(customSiteFeedback._timer);
        customSiteFeedback._timer = setTimeout(() => {
            customSiteFeedback.textContent = '';
            customSiteFeedback.className = 'custom-site-feedback';
        }, 4000);
    }

    if (btnAddCustomSite && customSiteInput) {
        btnAddCustomSite.addEventListener('click', () => {
            addCustomSite(customSiteInput.value);
            customSiteInput.value = '';
        });
        customSiteInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addCustomSite(customSiteInput.value);
                customSiteInput.value = '';
            }
        });
    }

    loadCustomSites();
});
