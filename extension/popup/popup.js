document.addEventListener('DOMContentLoaded', () => {
    const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions) || key;

    const masterToggle = document.getElementById('master-toggle');
    const targetLockBadge = document.getElementById('target-lock-badge');
    const overlaysRemoved = document.getElementById('overlays-removed');
    const popupsBlocked = document.getElementById('popups-blocked');
    const fakeVideosRemoved = document.getElementById('fake-videos-removed');
    const playersProtected = document.getElementById('players-protected');
    const btnPickElement = document.getElementById('btn-pick-element');
    const openDashboard = document.getElementById('open-dashboard');
    const popupContainer = document.querySelector('.app-container');
    const btnPinPopup = document.getElementById('btn-pin-popup');
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const flowIndicator = document.getElementById('flow-indicator');
    const flowStatus = document.getElementById('flow-status');
    const flowNodes = document.querySelectorAll('.flow-node');
    const flowWires = document.querySelectorAll('.flow-wire');
    const blockingLevelSelect = document.getElementById('blocking-level-select');
    const blockingLevelHint = document.getElementById('blocking-level-hint');
    const playbackControls = document.getElementById('playback-controls');
    const btnRescan = document.getElementById('btn-rescan');
    const playerChipList = document.getElementById('player-chip-list');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const btnSeekBack = document.getElementById('btn-seek-back');
    const btnSeekForward = document.getElementById('btn-seek-forward');
    const btnMute = document.getElementById('btn-mute');
    const btnLoop = document.getElementById('btn-loop');
    const btnAbA = document.getElementById('btn-ab-a');
    const btnAbB = document.getElementById('btn-ab-b');
    const shortcutsReference = document.getElementById('shortcuts-reference');
    const whitelistEnhanceOnlyToggle = document.getElementById('whitelist-enhance-only-toggle');
    const aiMonitorToggle = document.getElementById('ai-monitor-toggle');
    const aiMonitorPanel = document.getElementById('ai-monitor-panel');
    const aiRiskTier = document.getElementById('ai-risk-tier');
    const aiRiskScore = document.getElementById('ai-risk-score');
    const aiHighRiskCount = document.getElementById('ai-high-risk-count');
    const aiTelemetrySize = document.getElementById('ai-telemetry-size');
    const aiPolicyVersion = document.getElementById('ai-policy-version');
    const aiPolicyAppliedAt = document.getElementById('ai-policy-applied-at');
    const aiProviderStatus = document.getElementById('ai-provider-status');
    const aiProviderModel = document.getElementById('ai-provider-model');
    const aiGateTier = document.getElementById('ai-gate-tier');
    const aiGateMode = document.getElementById('ai-gate-mode');
    const aiGateReason = document.getElementById('ai-gate-reason');
    const aiGateActions = document.getElementById('ai-gate-actions');
    const aiGateEvidenceList = document.getElementById('ai-gate-evidence-list');
    const btnExportAi = document.getElementById('btn-export-ai');
    const btnResetAi = document.getElementById('btn-reset-ai');
    const btnDowngradeHost = document.getElementById('btn-downgrade-host');
    const statsEmptyState = document.getElementById('stats-empty-state');

    let currentDomain = '';
    let currentTabId = null;
    let blockedPlayers = [];
    let currentFlowStep = 0; // 0=detect, 1=play, 2=monitor
    let pickerActive = false;
    let aiPanelShowTimer = null;
    let aiPanelHideTimer = null;
    let shortcutsShowTimer = null;
    let shortcutsHideTimer = null;
    let aiMonitorEnabled = true;
    let selectedPlayerId = null;
    let playerMetaById = new Map();
    let currentPlayers = [];
    let blockingLevel = 0;
    let lastActiveBlockingLevel = 2;
    let autoScanTimerId = null;
    let isLockMode = false;
    const urlParams = new URLSearchParams(window.location.search);
    const isSidecarContext = urlParams.get('pinned') === '1';
    let isPinnedWindowMode = urlParams.get('pinned') === '1';
    const pinnedTabId = Number(urlParams.get('tabId') || 0);
    const POPUP_AI_MONITOR_VISIBILITY_KEY = 'popupAiMonitorVisible';
    const POPUP_SCAN_INTERVAL_MS = 1000;
    const PINNED_SCAN_INTERVAL_MS = 4000;

    async function init() {
        updatePinPopupButtonState();
        await initTheme();
        await loadSettings();
        await getCurrentTab();
        await syncPinnedControlState();

        // 如果側面板已開啟且目前是普通 popup 視窗模式，直接關閉避免重複顯示
        if (!isSidecarContext && isPinnedWindowMode) {
            window.close();
            return;
        }

        await syncPickerState();
        await loadBlockedPlayers();
        updateFlowStatus(0, t('popupFlowStatusClickLock'));
        showPlaybackControls(false);
        await loadPlayerInfo();
        startAutoScan({ immediate: false });
        await loadStats();
        await loadAiMonitorState();
        setupShortcutsReference();
        setupAiPanelAutoPeek();
    }

    function getScanIntervalMs() {
        return isPinnedWindowMode ? PINNED_SCAN_INTERVAL_MS : POPUP_SCAN_INTERVAL_MS;
    }

    function stopAutoScan() {
        if (!autoScanTimerId) return;
        clearInterval(autoScanTimerId);
        autoScanTimerId = null;
    }

    function startAutoScan(options = {}) {
        const { immediate = true } = options;
        stopAutoScan();
        if (isLockMode || !currentTabId) return;
        if (immediate) {
            loadPlayerInfo();
        }
        autoScanTimerId = setInterval(() => {
            if (isLockMode) {
                stopAutoScan();
                return;
            }
            loadPlayerInfo();
        }, getScanIntervalMs());
    }

    function setLockMode(locked) {
        isLockMode = Boolean(locked);
        if (isLockMode) {
            stopAutoScan();
        }
    }

    function restartAutoScanForModeChange() {
        if (isLockMode) return;
        startAutoScan({ immediate: false });
    }

    // ========== Theme ==========
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
        themeIcon.textContent = theme === 'dark' ? '●' : '☀';
    }

    themeToggle.addEventListener('click', async () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        await chrome.storage.local.set({ theme: next });
    });

    // ========== Flow Indicator ==========
    const STEP_NAMES = ['click', 'detect', 'play'];

    function updateFlowStatus(step, statusText) {
        currentFlowStep = step;

        flowNodes.forEach(node => {
            const nodeStep = node.getAttribute('data-step');
            const idx = STEP_NAMES.indexOf(nodeStep);
            node.classList.remove('active', 'completed');
            if (idx < step) node.classList.add('completed');
            if (idx === step) node.classList.add('active');
        });

        flowWires.forEach(wire => {
            const seg = wire.getAttribute('data-segment');
            const targetIdx = parseInt(seg.split('-')[1], 10);
            wire.classList.remove('active', 'completed');
            if (targetIdx <= step) wire.classList.add(targetIdx < step ? 'completed' : 'active');
        });

        if (statusText) flowStatus.textContent = statusText;
    }

    function setFlowGuideCollapsed(collapsed) {
        if (!flowIndicator) return;
        flowIndicator.classList.toggle('flow-collapsed', Boolean(collapsed));
    }

    // ========== Playback Controls ==========
    function sendPlayerControl(command, playerId, callback) {
        if (!currentTabId) return;
        if (!selectedPlayerId) {
            updateFlowStatus(0, t('popupFlowStatusClickLock'));
            return;
        }
        const msg = { action: 'playerControl', command };
        const candidatePlayerId = playerId || selectedPlayerId;
        const resolvedPlayerId = isControllablePlayer(candidatePlayerId) ? candidatePlayerId : null;
        if (resolvedPlayerId) msg.playerId = resolvedPlayerId;
        chrome.tabs.sendMessage(currentTabId, msg, (response) => {
            if (callback && response) callback(response);
        });
    }

    function isControllablePlayer(playerId) {
        if (!playerId) return false;
        const meta = playerMetaById.get(playerId);
        if (!meta) return false;
        // iframe 播放器跨 frame 無法可靠直接控制，改走目前 active video fallback
        return meta.tagName !== 'IFRAME';
    }

    btnPlayPause.addEventListener('click', () => {
        sendPlayerControl('togglePlay', undefined, (response) => {
            if (response && typeof response.paused === 'boolean') {
                btnPlayPause.textContent = response.paused ? '▶' : '⏸';
            }
        });
    });
    btnSeekBack.addEventListener('click', () => sendPlayerControl('seekBack'));
    btnSeekForward.addEventListener('click', () => sendPlayerControl('seekForward'));
    btnMute.addEventListener('click', () => sendPlayerControl('toggleMute'));

    // AB loop 狀態
    let abPendingPoint = null; // null | 'A' | 'B'

    function setAbPending(point) {
        abPendingPoint = point;
        if (btnAbA) btnAbA.classList.toggle('pending', point === 'A');
        if (btnAbB) btnAbB.classList.toggle('pending', point === 'B');
        if (btnAbA) btnAbA.classList.toggle('active', false);
        if (btnAbB) btnAbB.classList.toggle('active', false);
    }

    function setAbDone(pointA, pointB) {
        abPendingPoint = null;
        if (btnAbA) { btnAbA.classList.remove('pending'); btnAbA.classList.toggle('active', pointA !== null); }
        if (btnAbB) { btnAbB.classList.remove('pending'); btnAbB.classList.toggle('active', pointB !== null); }
    }

    function clearAbUi() {
        abPendingPoint = null;
        if (btnAbA) { btnAbA.classList.remove('pending', 'active'); }
        if (btnAbB) { btnAbB.classList.remove('pending', 'active'); }
    }

    if (btnLoop) {
        btnLoop.addEventListener('click', () => {
            sendPlayerControl('toggleLoop', undefined, (response) => {
                if (response && typeof response.loop === 'boolean') {
                    btnLoop.classList.toggle('active', response.loop);
                }
            });
        });
    }

    if (btnAbA) {
        btnAbA.addEventListener('click', () => {
            if (abPendingPoint === 'A') {
                // 再按一次 A → 取消
                sendPlayerControl('clearAbLoop');
                clearAbUi();
                return;
            }
            // 如果正在等 B → 取消 B，改等 A
            setAbPending('A');
            sendPlayerControl('setPointA', undefined, (response) => {
                if (!response?.handled) { clearAbUi(); return; }
                setAbDone(response.abPointA, response.abPointB);
                if (response.abPointA !== null) setAbPending('A'); // 等 B
            });
        });
    }

    if (btnAbB) {
        btnAbB.addEventListener('click', () => {
            if (abPendingPoint === 'B') {
                // 再按一次 B → 取消
                sendPlayerControl('clearAbLoop');
                clearAbUi();
                return;
            }
            if (abPendingPoint === null && !btnAbA?.classList.contains('active')) {
                // A 點未設定，先設 A 再等 B
                setAbPending('A');
                sendPlayerControl('setPointA', undefined, (r) => {
                    if (!r?.handled) { clearAbUi(); return; }
                    setAbPending('B');
                });
                return;
            }
            setAbPending('B');
            sendPlayerControl('setPointB', undefined, (response) => {
                if (!response?.handled) { clearAbUi(); return; }
                if (response.abLoop) {
                    setAbDone(response.abPointA, response.abPointB);
                } else {
                    clearAbUi();
                }
            });
        });

        btnAbB.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            sendPlayerControl('clearAbLoop');
            clearAbUi();
        });
    }

    function showPlaybackControls(show) {
        playbackControls.classList.toggle('locked-off', !show);
    }

    function normalizeBlockingLevel(level) {
        const numeric = Number(level);
        if (!Number.isFinite(numeric)) return 2;
        const rounded = Math.round(numeric);
        return Math.max(0, Math.min(3, rounded));
    }

    function resolvePreferredEnabledLevel() {
        const selected = normalizeBlockingLevel(blockingLevelSelect?.value);
        if (selected > 0) return selected;
        return Math.max(1, normalizeBlockingLevel(lastActiveBlockingLevel || 2));
    }

    function updateBlockingLevelHint(level) {
        if (!blockingLevelHint) return;
        const normalized = normalizeBlockingLevel(level);
        if (normalized === 0) {
            blockingLevelHint.textContent = t('popupBlockingHintL0');
            return;
        }
        if (normalized === 1) {
            blockingLevelHint.textContent = t('popupBlockingHintL1');
            return;
        }
        if (normalized === 2) {
            blockingLevelHint.textContent = t('popupBlockingHintL2');
            return;
        }
        blockingLevelHint.textContent = t('popupBlockingHintL3');
    }

    // ========== Load Settings ==========
    async function loadSettings() {
        const result = await chrome.storage.local.get([
            'extensionEnabled',
            'aiMonitorEnabled',
            'blockingLevel',
            'lastActiveBlockingLevel',
            'whitelistEnhanceOnly',
            POPUP_AI_MONITOR_VISIBILITY_KEY
        ]);
        const levelResponse = await runtimeMessage({ action: 'getBlockingLevel' });
        const sourceLevel = levelResponse?.success ? levelResponse.blockingLevel : result.blockingLevel;
        const sourceActiveLevel = levelResponse?.success
            ? levelResponse.lastActiveBlockingLevel
            : result.lastActiveBlockingLevel;

        blockingLevel = normalizeBlockingLevel(sourceLevel);
        lastActiveBlockingLevel = Math.max(1, normalizeBlockingLevel(sourceActiveLevel || 2));
        if (blockingLevel > 0) {
            lastActiveBlockingLevel = blockingLevel;
        }

        const enabled = blockingLevel > 0;
        aiMonitorEnabled = result.aiMonitorEnabled !== false;
        masterToggle.checked = enabled;
        if (blockingLevelSelect) {
            blockingLevelSelect.value = String(blockingLevel);
        }
        updateBlockingLevelHint(blockingLevel);
        if (aiMonitorToggle) {
            aiMonitorToggle.checked = aiMonitorEnabled;
        }
        const whitelistEnhanceOnly = result.whitelistEnhanceOnly !== false;
        if (whitelistEnhanceOnlyToggle) {
            whitelistEnhanceOnlyToggle.checked = whitelistEnhanceOnly;
            updateWhitelistEnhanceOnlyLabel(whitelistEnhanceOnly);
        }
        updateAiMonitorVisibility(result[POPUP_AI_MONITOR_VISIBILITY_KEY] === true);
        setAiPanelExpanded(isPinnedWindowMode);
        setShortcutsExpanded(isPinnedWindowMode);
        updateDisabledState(!enabled);
    }

    function updatePinPopupButtonState() {
        if (!btnPinPopup) return;
        btnPinPopup.classList.toggle('active', isPinnedWindowMode);
        btnPinPopup.textContent = isPinnedWindowMode ? '📍' : '📌';
        btnPinPopup.title = isPinnedWindowMode
            ? t('popupPinTitlePinned')
            : t('popupPinTitleUnpinned');
        btnPinPopup.setAttribute('aria-label', btnPinPopup.title);
        applyPinnedUiState();
    }

    function applyPinnedUiState() {
        document.body.classList.toggle('pinned-mode', isPinnedWindowMode);
        popupContainer?.classList.toggle('pinned-mode', isPinnedWindowMode);
        clearTimeout(aiPanelShowTimer);
        clearTimeout(aiPanelHideTimer);
        clearTimeout(shortcutsShowTimer);
        clearTimeout(shortcutsHideTimer);
        setAiPanelExpanded(isPinnedWindowMode);
        setShortcutsExpanded(isPinnedWindowMode);
    }

    function setAiPanelExpanded(expanded) {
        if (!aiMonitorPanel) return;
        aiMonitorPanel.classList.toggle('expanded', !!expanded);
    }

    function updateAiMonitorVisibility(visible) {
        if (!aiMonitorPanel) return;
        aiMonitorPanel.hidden = !visible;
        aiMonitorPanel.classList.toggle('ai-monitor-hidden', !visible);
        if (!visible) {
            setAiPanelExpanded(false);
        } else if (isPinnedWindowMode) {
            setAiPanelExpanded(true);
        }
    }

    function setShortcutsExpanded(expanded) {
        if (!shortcutsReference) return;
        shortcutsReference.classList.toggle('expanded', !!expanded);
        shortcutsReference.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    function updateWhitelistEnhanceOnlyLabel(enabled) {
        if (!whitelistEnhanceOnlyToggle) return;
        whitelistEnhanceOnlyToggle.setAttribute(
            'aria-label',
            enabled
                ? t('popupWhitelistEnhanceOnlyAriaEnabled')
                : t('popupWhitelistEnhanceOnlyAriaDisabled')
        );
    }

    function setupAiPanelAutoPeek() {
        if (!aiMonitorPanel) return;

        const scheduleExpand = () => {
            if (isPinnedWindowMode) {
                setAiPanelExpanded(true);
                return;
            }
            clearTimeout(aiPanelHideTimer);
            clearTimeout(aiPanelShowTimer);
            aiPanelShowTimer = setTimeout(() => {
                setAiPanelExpanded(true);
            }, 500);
        };

        const scheduleCollapse = () => {
            if (isPinnedWindowMode) {
                setAiPanelExpanded(true);
                return;
            }
            clearTimeout(aiPanelShowTimer);
            clearTimeout(aiPanelHideTimer);
            aiPanelHideTimer = setTimeout(() => {
                setAiPanelExpanded(false);
            }, 2000);
        };

        aiMonitorPanel.addEventListener('mouseenter', scheduleExpand);
        aiMonitorPanel.addEventListener('mouseleave', scheduleCollapse);
        aiMonitorPanel.addEventListener('focusin', scheduleExpand);
        aiMonitorPanel.addEventListener('focusout', scheduleCollapse);
        setAiPanelExpanded(isPinnedWindowMode);
    }

    async function togglePinnedPopupWindow() {
        const targetTabId = currentTabId || (Number.isFinite(pinnedTabId) && pinnedTabId > 0 ? pinnedTabId : 0);
        if (isPinnedWindowMode) {
            const response = await runtimeMessage({
                action: 'closePinnedControlPopup',
                tabId: targetTabId,
                reopenActionPopup: isSidecarContext
            });
            if (response?.success) {
                isPinnedWindowMode = false;
                updatePinPopupButtonState();
                restartAutoScanForModeChange();
            }
            return;
        }

        if (!targetTabId) return;

        const panelPath = `popup/popup.html?pinned=1&tabId=${encodeURIComponent(String(targetTabId))}`;
        let response = null;

        try {
            if (chrome.sidePanel?.setOptions && chrome.sidePanel?.open) {
                await chrome.sidePanel.setOptions({
                    tabId: targetTabId,
                    enabled: true,
                    path: panelPath
                });
                await chrome.sidePanel.open({ tabId: targetTabId });
                response = { success: true, tabId: targetTabId };
            }
        } catch (_) {
            response = null;
        }

        if (!response?.success) {
            response = await runtimeMessage({
                action: 'openPinnedControlPopup',
                tabId: targetTabId
            });
        }

        if (!response?.success) return;
        isPinnedWindowMode = true;
        updatePinPopupButtonState();
        restartAutoScanForModeChange();
        if (!isSidecarContext) {
            window.close();
        }
    }

    async function syncPinnedControlState() {
        if (!currentTabId) {
            updatePinPopupButtonState();
            return;
        }
        const response = await runtimeMessage({
            action: 'getPinnedControlPopupState',
            tabId: currentTabId
        });
        if (response?.success) {
            isPinnedWindowMode = response.enabled === true &&
                String(response.path || '').includes('pinned=1');
        }
        updatePinPopupButtonState();
        restartAutoScanForModeChange();
    }

    async function getCurrentTab() {
        try {
            if (isPinnedWindowMode && Number.isFinite(pinnedTabId) && pinnedTabId > 0) {
                const tab = await chrome.tabs.get(pinnedTabId);
                if (tab?.id) {
                    currentTabId = tab.id;
                    if (tab.url) {
                        const url = new URL(tab.url);
                        currentDomain = url.hostname.replace(/^www\./, '');
                    }
                }
            }

            if (currentTabId) {
                if (btnDowngradeHost) {
                    btnDowngradeHost.disabled = masterToggle.checked === false || !currentDomain;
                }
                return;
            }

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                currentTabId = tab.id;
                if (tab.url) {
                    const url = new URL(tab.url);
                    currentDomain = url.hostname.replace(/^www\./, '');
                }
            }
        } catch (error) {
            console.error('Failed to get current tab:', error);
        }

        if (btnDowngradeHost) {
            btnDowngradeHost.disabled = masterToggle.checked === false || !currentDomain;
        }
    }

    async function loadBlockedPlayers() {
        if (!currentDomain) return;
        const result = await chrome.storage.local.get(['blockedPlayers']);
        const allBlocked = result.blockedPlayers || {};
        blockedPlayers = allBlocked[currentDomain] || [];
    }

    async function saveBlockedPlayers() {
        if (!currentDomain) return;
        const result = await chrome.storage.local.get(['blockedPlayers']);
        const allBlocked = result.blockedPlayers || {};
        allBlocked[currentDomain] = blockedPlayers;
        await chrome.storage.local.set({ blockedPlayers: allBlocked });
    }

    function generatePlayerId(player, index) {
        return player.id || `${player.platform || 'unknown'}_${player.type || 'html5'}_${index}`;
    }

    function isPlayerBlocked(playerId) {
        return blockedPlayers.includes(playerId);
    }

    async function blockPlayer(playerId, index) {
        if (!blockedPlayers.includes(playerId)) {
            blockedPlayers.push(playerId);
            await saveBlockedPlayers();
            if (currentTabId) {
                chrome.tabs.sendMessage(currentTabId, { action: 'blockPlayer', playerId, index });
            }
        }
    }

    async function restorePlayer(playerId, index) {
        blockedPlayers = blockedPlayers.filter(id => id !== playerId);
        await saveBlockedPlayers();
        if (currentTabId) {
            chrome.tabs.sendMessage(currentTabId, { action: 'restorePlayer', playerId, index });
        }
    }

    function filterEligiblePlayers(players) {
        if (!Array.isArray(players)) return [];
        return players.filter((player) => {
            if (!player) return false;
            if (player.eligible !== true) return false;
            if (player.isSuspectedAd === true) return false;
            return true;
        });
    }

    async function loadPlayerInfo() {
        if (!currentTabId) return;

        try {
            return await new Promise((resolve) => {
                chrome.tabs.sendMessage(currentTabId, { action: 'getPlayerCount' }, (response) => {
                    if (chrome.runtime.lastError) {
                        currentPlayers = [];
                        renderPlayerChips([]);
                        updateFlowStatus(1, t('popupFlowStatusDetectRetry'));
                        setFlowGuideCollapsed(false);
                        showPlaybackControls(false);
                        resolve();
                        return;
                    }

                    if (!response) {
                        resolve();
                        return;
                    }

                    currentPlayers = filterEligiblePlayers(response.players || []);
                    const count = currentPlayers.length;
                    renderPlayerChips(currentPlayers);
                    const locked = updateTargetStatus();

                    if (count > 0) {
                        const selectedMeta = selectedPlayerId ? playerMetaById.get(selectedPlayerId) : null;
                        if (locked && selectedMeta) {
                            updateFlowStatus(2, t('popupFlowStatusLocked', [formatPlayerName(selectedMeta)]));
                            setFlowGuideCollapsed(true);
                            if (typeof selectedMeta.paused === 'boolean') {
                                btnPlayPause.textContent = selectedMeta.paused ? '▶' : '⏸';
                            }
                        } else {
                            updateFlowStatus(0, t('popupFlowStatusPlayersDetected', [String(count)]));
                            setFlowGuideCollapsed(false);
                            showPlaybackControls(false);
                        }
                    } else {
                        updateFlowStatus(1, t('popupFlowStatusNoPlayer'));
                        setFlowGuideCollapsed(false);
                        showPlaybackControls(false);
                    }

                    resolve();
                });
            });
        } catch (error) {
            console.error('Failed to load player info:', error);
        }
    }

    function formatPlayerName(player) {
        if (!player) return 'unknown';
        const platform = player.platform || 'player';
        const quality = player.quality?.resolution ? ` ${player.quality.resolution}` : '';
        const primary = player.isPrimaryCandidate ? ' main' : '';
        const kind = player.type === 'iframe' ? ' iframe' : '';
        return `${platform}${quality}${primary}${kind}`.trim();
    }

    function getPlayerQualityHeight(player) {
        const directHeight = Number(player?.quality?.height || 0);
        if (directHeight > 0) return directHeight;
        const resolutionMatch = String(player?.quality?.resolution || '').match(/(\d{3,4})p/i);
        return resolutionMatch ? Number(resolutionMatch[1]) : 0;
    }

    function rankPlayerForSelection(playerId) {
        const meta = playerMetaById.get(playerId);
        if (!meta) return Number.NEGATIVE_INFINITY;

        let score = Number(meta.score || 0);
        score += getPlayerQualityHeight(meta) * 10;

        if (meta.isPrimaryCandidate) score += 50000;
        if (meta.hasDirectSource) score += 15000;
        if (meta.paused === false) score += 12000;
        if (meta.tagName === 'VIDEO') score += 8000;
        if (isControllablePlayer(playerId)) score += 6000;
        if (meta.type === 'iframe') score -= 1500;
        if (meta.isSuspectedAd) score -= 100000;

        return score;
    }

    function renderPlayerChips(players) {
        const safePlayers = filterEligiblePlayers(players || []);
        playerMetaById = new Map();
        if (!playerChipList) return;
        playerChipList.textContent = '';

        if (!safePlayers || safePlayers.length === 0) {
            selectedPlayerId = null;
            const empty = document.createElement('div');
            empty.className = 'player-empty-state';
            empty.innerHTML = `
                <div class="player-empty-title">${escapeHtml(t('popupPlayerEmptyTitle'))}</div>
                <div class="player-empty-hint">${escapeHtml(t('popupPlayerEmptyHint'))}</div>
            `;
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'rescan-btn player-empty-action';
            action.textContent = 'DETECT';
            action.setAttribute('title', t('popupRescanTitle'));
            action.setAttribute('aria-label', t('popupRescanTitle'));
            action.addEventListener('click', () => {
                triggerForceDetect();
            });
            empty.appendChild(action);
            playerChipList.appendChild(empty);
            return;
        }

        safePlayers.forEach((player, index) => {
            playerMetaById.set(generatePlayerId(player, index), player);
        });

        if (selectedPlayerId && !playerMetaById.has(selectedPlayerId)) {
            selectedPlayerId = null;
        }

        const rankedEntries = [...playerMetaById.entries()]
            .sort((left, right) => rankPlayerForSelection(right[0]) - rankPlayerForSelection(left[0]));

        if (!selectedPlayerId && rankedEntries.length > 0) {
            const activelyPlayingEntry = rankedEntries.find(([, meta]) =>
                meta?.tagName === 'VIDEO' &&
                meta?.paused === false &&
                meta?.isSuspectedAd !== true
            );
            selectedPlayerId = (activelyPlayingEntry || rankedEntries[0])[0];
        }

        rankedEntries.forEach(([playerId, player]) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'player-chip';
            chip.textContent = formatPlayerName(player);
            if (selectedPlayerId === playerId) {
                chip.classList.add('selected');
            }
            if (!isControllablePlayer(playerId)) {
                chip.classList.add('uncontrollable');
            }
            chip.addEventListener('click', () => {
                selectedPlayerId = playerId;
                setLockMode(false);
                renderPlayerChips(currentPlayers);
                const locked = updateTargetStatus();
                if (locked) {
                    const selectedMeta = playerMetaById.get(selectedPlayerId);
                    updateFlowStatus(2, t('popupFlowStatusLocked', [formatPlayerName(selectedMeta)]));
                    setFlowGuideCollapsed(true);
                }
            });
            playerChipList.appendChild(chip);
        });
    }

    function updateTargetStatus() {
        const selectedMeta = selectedPlayerId ? playerMetaById.get(selectedPlayerId) : null;
        const locked = Boolean(
            selectedMeta &&
            (
                isControllablePlayer(selectedPlayerId) ||
                selectedMeta.paused === false ||
                selectedMeta.hasDirectSource === true
            )
        );

        targetLockBadge.textContent = locked ? t('popupTargetLocked') : t('popupTargetUnlocked');
        targetLockBadge.classList.toggle('locked', locked);

        setLockMode(locked);
        setFlowGuideCollapsed(locked);

        if (!selectedMeta) {
            showPlaybackControls(false);
            return false;
        }

        if (!isControllablePlayer(selectedPlayerId)) {
            showPlaybackControls(false);
            return locked;
        }

        showPlaybackControls(masterToggle.checked !== false);
        return locked;
    }

    function getPlatformIcon(platform) {
        const icons = {
            'youtube': '📺', 'vimeo': '🎬', 'twitch': '🎮',
            'bilibili': '📺',
            'javboys': '🎥', 'missav': '🎥', 'pornhub': '🎥', 'xvideos': '🎥',
            'videojs': '📹', 'jwplayer': '📹', 'plyr': '📹',
            'native': '🎬', 'generic': '🎬'
        };
        return icons[platform] || '🎬';
    }

    async function loadStats() {
        const result = await chrome.storage.local.get(['stats']);
        const stats = result.stats || {};

        overlaysRemoved.textContent = formatNumber(stats.overlaysRemoved || 0);
        popupsBlocked.textContent = formatNumber(stats.popupsBlocked || 0);
        fakeVideosRemoved.textContent = formatNumber(stats.fakeVideosRemoved || 0);
        playersProtected.textContent = formatNumber(stats.playersProtected || 0);

        const totalBlocked = (stats.overlaysRemoved || 0) + (stats.popupsBlocked || 0) + (stats.fakeVideosRemoved || 0);
        if (totalBlocked > 0 && currentFlowStep >= 1) {
            updateFlowStatus(2, t('popupFlowStatusThreatsBlocked', [formatNumber(totalBlocked)]));
        }
        updateStatsEmptyState(stats);
    }

    function updateStatsEmptyState(stats) {
        if (!statsEmptyState) return;

        const totalEvents = Number(stats.overlaysRemoved || 0)
            + Number(stats.popupsBlocked || 0)
            + Number(stats.fakeVideosRemoved || 0)
            + Number(stats.playersProtected || 0);

        if (totalEvents > 0) {
            statsEmptyState.hidden = true;
            return;
        }

        statsEmptyState.hidden = false;
        if (masterToggle.checked === false) {
            statsEmptyState.textContent = t('popupStatsEmptyDisabled');
            return;
        }
        if (currentPlayers.length > 0) {
            statsEmptyState.textContent = t('popupStatsEmptyActive');
            return;
        }
        statsEmptyState.textContent = t('popupStatsEmptyFirstUse');
    }

    function setAiTierLabel(tier) {
        if (!aiRiskTier) return;

        const normalized = String(tier || 'low').toLowerCase();
        aiRiskTier.textContent = normalized.toUpperCase();
        aiRiskTier.classList.remove('low', 'medium', 'high', 'critical');
        aiRiskTier.classList.add(normalized);
    }

    function updateAiSummary(snapshot) {
        if (!snapshot) return;
        aiMonitorEnabled = snapshot.enabled !== false;

        if (aiMonitorToggle) {
            aiMonitorToggle.checked = aiMonitorEnabled;
        }
        if (aiHighRiskCount) {
            aiHighRiskCount.textContent = formatNumber(snapshot.highRiskHosts?.length || 0);
        }
        if (aiTelemetrySize) {
            aiTelemetrySize.textContent = formatNumber(snapshot.telemetrySize || 0);
        }
        if (aiProviderStatus) {
            const ok = snapshot.provider?.state?.lastHealthOk === true;
            aiProviderStatus.textContent = ok ? t('popupAiProviderStatusOnline') : t('popupAiProviderStatusOffline');
        }
        if (aiProviderModel) {
            aiProviderModel.textContent = snapshot.provider?.state?.lastResolvedModel || '-';
        }
    }

    function formatPolicyGateReason(reason) {
        const value = String(reason || '').trim();
        if (!value) return 'runtime_default';
        return value.replace(/_/g, ' ');
    }

    function formatPolicyGateAction(action) {
        return String(action || '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function renderPolicyGateActions(actions) {
        if (!aiGateActions) return;
        aiGateActions.innerHTML = '';

        const list = Array.isArray(actions) ? actions : [];
        if (list.length === 0) {
            const chip = document.createElement('span');
            chip.className = 'ai-gate-action-chip';
            chip.textContent = t('popupAiNoReversibleActions');
            aiGateActions.appendChild(chip);
            return;
        }

        list.forEach((action) => {
            const chip = document.createElement('span');
            chip.className = 'ai-gate-action-chip';
            chip.textContent = formatPolicyGateAction(action);
            aiGateActions.appendChild(chip);
        });
    }

    function formatEvidenceSignal(signal) {
        if (!signal) return '';
        const count = Number(signal.count || 0);
        if (count > 0) {
            return `${formatPolicyGateAction(signal.type)} ×${count}`;
        }
        const delta = Number(signal.delta || 0);
        const sign = delta > 0 ? '+' : '';
        return `${formatPolicyGateAction(signal.type)} ${sign}${delta.toFixed(2)}`;
    }

    function renderPolicyEvidence(evidence) {
        if (!aiGateEvidenceList) return;
        aiGateEvidenceList.innerHTML = '';

        const topSignals = Array.isArray(evidence?.topSignals) ? evidence.topSignals : [];
        const recentSignals = Array.isArray(evidence?.recentSignals) ? evidence.recentSignals : [];
        const combined = topSignals.length > 0 ? topSignals : recentSignals;

        if (combined.length === 0) {
            const chip = document.createElement('span');
            chip.className = 'ai-gate-action-chip';
            chip.textContent = t('popupAiEvidenceClean');
            aiGateEvidenceList.appendChild(chip);
            return;
        }

        combined.forEach((signal) => {
            const chip = document.createElement('span');
            chip.className = 'ai-gate-action-chip';
            chip.textContent = formatEvidenceSignal(signal);
            aiGateEvidenceList.appendChild(chip);
        });

        if (evidence?.fallbackReason) {
            const chip = document.createElement('span');
            chip.className = 'ai-gate-action-chip';
            chip.textContent = t('popupAiEvidenceFallback', [formatPolicyGateReason(evidence.fallbackReason)]);
            aiGateEvidenceList.appendChild(chip);
        }
    }

    function formatAiAppliedAt(ts) {
        const value = Number(ts || 0);
        if (!Number.isFinite(value) || value <= 0) return '-';
        try {
            return new Date(value).toLocaleString('zh-TW', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        } catch (_) {
            return '-';
        }
    }

    function updateAiPolicy(policy) {
        if (!policy) return;
        setAiTierLabel(policy.riskTier || 'low');
        if (aiRiskScore) {
            aiRiskScore.textContent = Number(policy.riskScore || 0).toFixed(2);
        }
        if (aiPolicyVersion) {
            const version = Number(policy.policyVersion || policy.version || 0);
            aiPolicyVersion.textContent = version > 0 ? String(version) : '-';
        }
        if (aiPolicyAppliedAt) {
            aiPolicyAppliedAt.textContent = formatAiAppliedAt(policy.appliedAt);
        }
        if (aiGateTier) {
            const tier = String(policy.policyGate?.tier || 'T1').toUpperCase();
            aiGateTier.textContent = tier;
            aiGateTier.classList.remove('t1', 't2', 't3');
            aiGateTier.classList.add(tier.toLowerCase());
        }
        if (aiGateMode) {
            aiGateMode.textContent = String(policy.policyGate?.mode || 'advisory-only');
        }
        if (aiGateReason) {
            aiGateReason.textContent = formatPolicyGateReason(policy.policyGate?.reason);
        }
        renderPolicyGateActions(policy.policyGate?.allowedActions);
        renderPolicyEvidence(policy.evidence);
    }

    function runtimeMessage(message) {
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

    async function setBlockingLevel(level, options = {}) {
        const normalized = normalizeBlockingLevel(level);
        const response = await runtimeMessage({ action: 'setBlockingLevel', level: normalized });
        if (!response?.success) {
            return false;
        }

        blockingLevel = normalizeBlockingLevel(response.blockingLevel);
        if (blockingLevel > 0) {
            lastActiveBlockingLevel = blockingLevel;
        } else {
            lastActiveBlockingLevel = Math.max(1, normalizeBlockingLevel(response.lastActiveBlockingLevel || lastActiveBlockingLevel || 2));
        }

        masterToggle.checked = blockingLevel > 0;
        if (blockingLevelSelect) {
            blockingLevelSelect.value = String(blockingLevel);
        }
        updateBlockingLevelHint(blockingLevel);
        updateDisabledState(blockingLevel === 0);

        if (blockingLevel === 0) {
            updatePickerButtonState(false);
        }

        if (options.reloadTab) {
            reloadCurrentTab();
        }

        return true;
    }

    async function loadAiMonitorState() {
        const [insightsRes, policyRes] = await Promise.all([
            runtimeMessage({ action: 'getAiInsights' }),
            runtimeMessage({
                action: 'getAiPolicy',
                hostname: currentDomain,
                url: currentTabId ? undefined : ''
            })
        ]);

        if (insightsRes?.success && insightsRes.snapshot) {
            updateAiSummary(insightsRes.snapshot);
        } else if (aiMonitorToggle) {
            aiMonitorToggle.checked = aiMonitorEnabled;
        }

        if (policyRes?.success && policyRes.policy) {
            updateAiPolicy(policyRes.policy);
        } else {
            setAiTierLabel('low');
            if (aiRiskScore) aiRiskScore.textContent = '0.00';
            if (aiPolicyVersion) aiPolicyVersion.textContent = '-';
            if (aiPolicyAppliedAt) aiPolicyAppliedAt.textContent = '-';
            if (aiProviderStatus) aiProviderStatus.textContent = t('popupAiProviderStatusOffline');
            if (aiProviderModel) aiProviderModel.textContent = '-';
            if (aiGateTier) {
                aiGateTier.textContent = 'T1';
                aiGateTier.classList.remove('t1', 't2', 't3');
                aiGateTier.classList.add('t1');
            }
            if (aiGateMode) aiGateMode.textContent = 'advisory-only';
            if (aiGateReason) aiGateReason.textContent = 'runtime default';
            renderPolicyGateActions([]);
            renderPolicyEvidence(null);
        }
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

    async function toggleAiMonitor() {
        if (!aiMonitorToggle || masterToggle.checked === false) return;

        const nextEnabled = aiMonitorToggle.checked;
        const response = await runtimeMessage({ action: 'setAiMonitorEnabled', enabled: nextEnabled });
        if (!response?.success) {
            aiMonitorToggle.checked = !nextEnabled;
            return;
        }
        aiMonitorEnabled = response.enabled !== false;
        aiMonitorToggle.checked = aiMonitorEnabled;
        await loadAiMonitorState();
    }

    async function exportAiDataset() {
        const response = await runtimeMessage({ action: 'exportAiDataset' });
        if (!response?.success || !response.dataset) return;

        const stamp = new Date(response.dataset.exportedAt || Date.now()).toISOString().replace(/[:.]/g, '-');
        downloadJsonFile(`falcon-ai-dataset-${stamp}.json`, response.dataset);
    }

    async function resetAiLearning() {
        if (!confirm(t('popupConfirmResetAi'))) {
            return;
        }
        const response = await runtimeMessage({ action: 'resetAiLearning' });
        if (!response?.success) return;
        await loadAiMonitorState();
    }

    async function downgradeCurrentHostPolicy() {
        if (!currentDomain || masterToggle.checked === false) return;

        await runtimeMessage({
            action: 'aiTelemetry',
            event: {
                type: 'user_override',
                source: 'popup-ui',
                severity: 1,
                confidence: 1,
                ts: Date.now()
            },
            context: {
                hostname: currentDomain,
                url: currentDomain ? `https://${currentDomain}` : ''
            }
        });

        const response = await runtimeMessage({
            action: 'activateHostFallback',
            hostname: currentDomain,
            reason: 'user_override',
            source: 'popup_manual_override',
            durationMs: 8 * 60 * 1000,
            cooldownMs: 2 * 60 * 1000,
            force: true,
            tabId: currentTabId,
            url: currentDomain ? `https://${currentDomain}` : ''
        });

        if (!response?.success) return;
        if (response.policy) {
            updateAiPolicy(response.policy);
        }
        await loadAiMonitorState();
    }

    function updatePickerButtonState(active) {
        pickerActive = !!active;
        btnPickElement.textContent = pickerActive ? '⏹' : '🚫';
        btnPickElement.title = pickerActive ? t('popupPickElementTitleActive') : t('popupPickElementTitleInactive');
        btnPickElement.setAttribute('aria-label', btnPickElement.title);
        const pinnedIcon = document.querySelector('#pinned-pick-element .pinned-toolbar-icon');
        if (pinnedIcon) pinnedIcon.textContent = pickerActive ? '⏹' : '🚫';
    }

    async function syncPickerState() {
        if (!currentTabId) {
            updatePickerButtonState(false);
            return;
        }

        return new Promise((resolve) => {
            chrome.tabs.sendMessage(currentTabId, { action: 'getPickerState' }, (response) => {
                if (chrome.runtime.lastError) {
                    updatePickerButtonState(false);
                    resolve();
                    return;
                }
                updatePickerButtonState(Boolean(response?.active));
                resolve();
            });
        });
    }

    async function toggleElementPicker() {
        if (!currentTabId || masterToggle.checked === false) return;

        if (pickerActive) {
            // 停用：直接發送到 content script
            chrome.tabs.sendMessage(currentTabId, { action: 'deactivateElementPicker' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to deactivate element picker:', chrome.runtime.lastError.message);
                    return;
                }
                updatePickerButtonState(false);
            });
        } else {
            // 啟用：透過 background 按需注入後自動啟用
            chrome.runtime.sendMessage({ action: 'injectElementPicker', tabId: currentTabId }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to inject element picker:', chrome.runtime.lastError.message);
                    return;
                }
                if (response?.success) {
                    updatePickerButtonState(true);
                    // 啟動後關閉 popup，讓使用者可以直接在頁面選取元素
                    window.close();
                }
            });
        }
    }

    function setupShortcutsReference() {
        if (!shortcutsReference) return;

        const scheduleExpand = () => {
            if (isPinnedWindowMode) {
                setShortcutsExpanded(true);
                return;
            }
            clearTimeout(shortcutsHideTimer);
            clearTimeout(shortcutsShowTimer);
            shortcutsShowTimer = setTimeout(() => {
                setShortcutsExpanded(true);
            }, 120);
        };

        const scheduleCollapse = () => {
            if (isPinnedWindowMode) {
                setShortcutsExpanded(true);
                return;
            }
            clearTimeout(shortcutsShowTimer);
            clearTimeout(shortcutsHideTimer);
            shortcutsHideTimer = setTimeout(() => {
                setShortcutsExpanded(false);
            }, 260);
        };

        shortcutsReference.addEventListener('mouseenter', scheduleExpand);
        shortcutsReference.addEventListener('mouseleave', scheduleCollapse);
        shortcutsReference.addEventListener('focusin', scheduleExpand);
        shortcutsReference.addEventListener('focusout', scheduleCollapse);
        shortcutsReference.addEventListener('click', (event) => {
            if (isPinnedWindowMode) return;
            if (event.target.closest('button')) return;
            setShortcutsExpanded(!shortcutsReference.classList.contains('expanded'));
        });
        shortcutsReference.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setShortcutsExpanded(!shortcutsReference.classList.contains('expanded'));
            }
            if (event.key === 'Escape') {
                setShortcutsExpanded(false);
                shortcutsReference.blur();
            }
        });
        document.addEventListener('click', (event) => {
            if (isPinnedWindowMode) return;
            if (shortcutsReference.contains(event.target)) return;
            setShortcutsExpanded(false);
        });
        setShortcutsExpanded(isPinnedWindowMode);
    }

    // ========== Event Handlers ==========
    masterToggle.addEventListener('change', async () => {
        const enabled = masterToggle.checked;
        const targetLevel = enabled
            ? resolvePreferredEnabledLevel()
            : 0;
        const success = await setBlockingLevel(targetLevel, { reloadTab: true });
        if (!success) {
            masterToggle.checked = !enabled;
        }
    });

    btnPickElement.addEventListener('click', async () => {
        await toggleElementPicker();
    });

    async function triggerForceDetect() {
        if (!currentTabId) return;
        selectedPlayerId = null;
        setLockMode(false);
        updateFlowStatus(1, t('popupFlowStatusDetecting'));
        setFlowGuideCollapsed(false);
        try {
            chrome.tabs.sendMessage(currentTabId, { action: 'forceDetect' }, (response) => {
                if (response) {
                    loadPlayerInfo();
                    startAutoScan({ immediate: false });
                }
            });
        } catch (error) {
            // silent
        }
    }

    openDashboard.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('dashboard/dashboard.html'));
        }
        // 側面板模式下開啟設定後自動關閉側面板
        if (isSidecarContext) {
            const targetTabId = currentTabId || (Number.isFinite(pinnedTabId) && pinnedTabId > 0 ? pinnedTabId : 0);
            if (targetTabId && chrome.sidePanel?.setOptions) {
                chrome.sidePanel.setOptions({ tabId: targetTabId, enabled: false }).catch(() => {});
            }
            window.close();
        }
    });

    // ========== Promote current site to enhanced protection ==========
    const btnAddCurrentSite = document.getElementById('btn-add-current-site');

    async function checkQuickAddVisibility() {
        if (!btnAddCurrentSite) return;
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url) return;
            const url = new URL(tab.url);
            const hostname = url.hostname.replace(/^www\./, '');

            const response = await chrome.runtime.sendMessage({ action: 'getCustomSites' });
            if (!response?.success) return;

            const allDomains = [...(response.builtinDomains || []), ...(response.customSites || [])];
            const isAlreadyProtected = allDomains.some(d =>
                hostname === d || hostname.endsWith('.' + d)
            );

            if (!isAlreadyProtected && url.protocol.startsWith('http')) {
                btnAddCurrentSite.hidden = false;
                btnAddCurrentSite._domain = hostname;
                const pinnedAdd = document.getElementById('pinned-add-site');
                if (pinnedAdd) pinnedAdd.hidden = false;
            }
        } catch { /* ignore */ }
    }

    if (btnAddCurrentSite) {
        btnAddCurrentSite.addEventListener('click', async () => {
            const domain = btnAddCurrentSite._domain;
            if (!domain) return;

            try {
                const response = await chrome.runtime.sendMessage({ action: 'addCustomSite', domain });
                if (response?.success) {
                    btnAddCurrentSite.textContent = '✓';
                    btnAddCurrentSite.disabled = true;
                    setTimeout(() => {
                        btnAddCurrentSite.hidden = true;
                        btnAddCurrentSite.textContent = '➕';
                        btnAddCurrentSite.disabled = false;
                    }, 2000);
                }
            } catch (err) {
                console.error('Quick-add site failed:', err);
            }
        });

        checkQuickAddVisibility();
    }

    if (btnPinPopup) {
        btnPinPopup.addEventListener('click', async () => {
            await togglePinnedPopupWindow();
        });
    }

    // Pinned-mode toolbar: delegate clicks to original handlers
    const pinnedPickElement = document.getElementById('pinned-pick-element');
    const pinnedOpenDashboard = document.getElementById('pinned-open-dashboard');
    const pinnedAddSite = document.getElementById('pinned-add-site');

    if (pinnedPickElement) {
        pinnedPickElement.addEventListener('click', () => btnPickElement?.click());
    }
    if (pinnedOpenDashboard) {
        pinnedOpenDashboard.addEventListener('click', () => openDashboard?.click());
    }
    if (pinnedAddSite) {
        pinnedAddSite.addEventListener('click', () => btnAddCurrentSite?.click());
    }

    if (btnRescan) {
        btnRescan.addEventListener('click', async () => {
            await triggerForceDetect();
        });
    }

    if (aiMonitorToggle) {
        aiMonitorToggle.addEventListener('change', async () => {
            await toggleAiMonitor();
        });
    }

    if (whitelistEnhanceOnlyToggle) {
        whitelistEnhanceOnlyToggle.addEventListener('change', async () => {
            const enabled = whitelistEnhanceOnlyToggle.checked;
            updateWhitelistEnhanceOnlyLabel(enabled);
            await chrome.storage.local.set({ whitelistEnhanceOnly: enabled });
            // 通知當前頁面的 content script 設定已變更
            if (currentTabId) {
                chrome.tabs.sendMessage(currentTabId, {
                    action: 'setWhitelistEnhanceOnly',
                    enabled
                }).catch(() => {});
            }
        });
    }

    if (btnExportAi) {
        btnExportAi.addEventListener('click', async () => {
            await exportAiDataset();
        });
    }

    if (btnResetAi) {
        btnResetAi.addEventListener('click', async () => {
            await resetAiLearning();
        });
    }

    if (btnDowngradeHost) {
        btnDowngradeHost.addEventListener('click', async () => {
            await downgradeCurrentHostPolicy();
        });
    }

    if (blockingLevelSelect) {
        blockingLevelSelect.addEventListener('change', async () => {
            const targetLevel = normalizeBlockingLevel(blockingLevelSelect.value);
            const success = await setBlockingLevel(targetLevel, { reloadTab: targetLevel === 0 });
            if (!success) {
                blockingLevelSelect.value = String(blockingLevel);
                updateBlockingLevelHint(blockingLevel);
            }
        });
    }

    function updateDisabledState(disabled) {
        popupContainer.classList.toggle('disabled', disabled);
        btnPickElement.disabled = disabled;
        const pinnedPick = document.getElementById('pinned-pick-element');
        if (pinnedPick) pinnedPick.disabled = disabled;
        if (btnRescan) btnRescan.disabled = disabled;
        if (aiMonitorToggle) aiMonitorToggle.disabled = disabled;
        if (btnExportAi) btnExportAi.disabled = disabled;
        if (btnResetAi) btnResetAi.disabled = disabled;
        if (btnDowngradeHost) btnDowngradeHost.disabled = disabled || !currentDomain;
        if (isPinnedWindowMode) {
            setAiPanelExpanded(true);
        } else if (disabled || aiMonitorPanel?.hidden) {
            setAiPanelExpanded(false);
        }
        if (isPinnedWindowMode) {
            setShortcutsExpanded(true);
        } else if (disabled) {
            setShortcutsExpanded(false);
        }
        if (disabled) {
            stopAutoScan();
            showPlaybackControls(false);
        } else {
            updateTargetStatus();
            if (!isLockMode) {
                startAutoScan({ immediate: false });
            }
        }
    }

    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    }

    function reloadCurrentTab() {
        if (currentTabId) chrome.tabs.reload(currentTabId);
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'playerCountUpdated' && message.tabId === currentTabId) {
            updateFlowStatus(1, t('popupFlowStatusDetecting'));
            setFlowGuideCollapsed(false);
            loadPlayerInfo();
        }
        if (message.action === 'statsUpdated') {
            loadStats();
        }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (changes.stats) {
            loadStats();
        }
        if (changes.aiProfiles || changes.aiTelemetryLog || changes.aiPolicyCache || changes.aiHostFallbacks) {
            loadAiMonitorState();
        }
        if (changes.blockingLevel) {
            blockingLevel = normalizeBlockingLevel(changes.blockingLevel.newValue);
            if (blockingLevel > 0) {
                lastActiveBlockingLevel = blockingLevel;
            }
            masterToggle.checked = blockingLevel > 0;
            if (blockingLevelSelect) {
                blockingLevelSelect.value = String(blockingLevel);
            }
            updateBlockingLevelHint(blockingLevel);
            updateDisabledState(blockingLevel === 0);
        }
        if (changes[POPUP_AI_MONITOR_VISIBILITY_KEY]) {
            updateAiMonitorVisibility(changes[POPUP_AI_MONITOR_VISIBILITY_KEY].newValue === true);
        }
    });

    init();
});
