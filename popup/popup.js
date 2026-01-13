// Shield Pro - Popup Quick Control Panel

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const masterToggle = document.getElementById('master-toggle');
    const adsBlocked = document.getElementById('ads-blocked');
    const trackersBlocked = document.getElementById('trackers-blocked');
    const strengthSlider = document.getElementById('strength-slider');
    const strengthLabel = document.getElementById('strength-label');
    const btnPauseSite = document.getElementById('btn-pause-site');
    const pauseStatus = document.getElementById('pause-status');
    const btnPickElement = document.getElementById('btn-pick-element');
    const btnRestoreElements = document.getElementById('btn-restore-elements');
    const restoreStatus = document.getElementById('restore-status');
    const blockedElementsSection = document.getElementById('blocked-elements-section');
    const blockedList = document.getElementById('blocked-list');
    const btnCloseBlocked = document.getElementById('btn-close-blocked');
    const btnRestoreAll = document.getElementById('btn-restore-all');
    const btnSandboxMode = document.getElementById('btn-sandbox-mode');
    const sandboxStatus = document.getElementById('sandbox-status');
    const autoReloadToggle = document.getElementById('auto-reload-toggle');
    const openDashboard = document.getElementById('open-dashboard');
    const popupContainer = document.querySelector('.popup-container');
    const sandboxBanner = document.getElementById('sandbox-banner');
    const sandboxDesc = document.getElementById('sandbox-desc');
    const btnExitSandbox = document.getElementById('btn-exit-sandbox');
    const vtBanner = document.getElementById('vt-banner');
    const vtIcon = document.getElementById('vt-icon');
    const vtTitle = document.getElementById('vt-title');
    const vtDesc = document.getElementById('vt-desc');

    // Strength Level Config
    const strengthLevels = ['minimal', 'basic', 'standard', 'strict', 'aggressive'];
    const strengthLabels = {
        minimal: '最小',
        basic: '基本',
        standard: '標準',
        strict: '嚴格',
        aggressive: '激進'
    };

    let currentDomain = '';
    let currentTabId = null;
    let autoReloadEnabled = false;

    // ========== Initialize ==========
    async function init() {
        await loadSettings();
        await getCurrentTab();
        await loadPageStats();
        await checkPauseStatus();
        await checkSandboxStatus();
        await checkVirusTotalStatus();
        await updateRestoreStatus();
    }

    // ========== Load Settings ==========
    async function loadSettings() {
        const result = await chrome.storage.local.get(['extensionEnabled', 'filterStrength', 'autoReloadEnabled']);
        
        const enabled = result.extensionEnabled !== false;
        masterToggle.checked = enabled;
        updateDisabledState(!enabled);

        const strength = result.filterStrength || 'standard';
        const index = strengthLevels.indexOf(strength);
        strengthSlider.value = index >= 0 ? index : 2;
        strengthLabel.textContent = strengthLabels[strength] || '標準';

        autoReloadEnabled = result.autoReloadEnabled === true;
        autoReloadToggle.checked = autoReloadEnabled;
    }

    // ========== Get Current Tab ==========
    async function getCurrentTab() {
        try {
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
    }

    // ========== Load Page Stats ==========
    async function loadPageStats() {
        if (!currentTabId) return;

        try {
            chrome.tabs.sendMessage(currentTabId, { action: 'getPageStats' }, (response) => {
                if (chrome.runtime.lastError) {
                    adsBlocked.textContent = '0';
                    trackersBlocked.textContent = '0';
                    return;
                }
                if (response) {
                    adsBlocked.textContent = formatNumber(response.adsBlocked || 0);
                    trackersBlocked.textContent = formatNumber(response.trackersBlocked || 0);
                }
            });
        } catch (error) {
            console.error('Failed to load page stats:', error);
        }
    }

    // ========== Check Pause Status ==========
    async function checkPauseStatus() {
        if (!currentDomain) return;
        
        const result = await chrome.storage.local.get(['whitelist']);
        const whitelist = result.whitelist || [];
        const isPaused = whitelist.includes(currentDomain);
        
        btnPauseSite.classList.toggle('active', isPaused);
        pauseStatus.textContent = isPaused ? '已暫停' : '';
    }

    // ========== Check Sandbox Status ==========
    async function checkSandboxStatus() {
        if (!currentDomain) return;

        const result = await chrome.storage.local.get(['sandboxEnabled', 'dangerousSites']);
        const sandboxEnabled = result.sandboxEnabled !== false;
        const dangerousSites = result.dangerousSites || [];
        
        const isDangerous = dangerousSites.includes(currentDomain);
        const isInSandbox = isDangerous && sandboxEnabled;

        sandboxBanner.classList.toggle('active', isInSandbox);
        if (isInSandbox) {
            sandboxBanner.style.display = 'flex';
        } else {
            sandboxBanner.style.display = 'none';
        }

        btnSandboxMode.classList.toggle('active', isInSandbox);
        sandboxStatus.textContent = isInSandbox ? '啟動中' : '';
    }

    // ========== Check VirusTotal Status ==========
    async function checkVirusTotalStatus() {
        if (!currentDomain) return;

        const result = await chrome.storage.local.get(['virusTotalApiKey', 'vtScanResults']);
        const hasApiKey = !!result.virusTotalApiKey;
        const scanResults = result.vtScanResults || {};
        const currentResult = scanResults[currentDomain];

        if (!hasApiKey) {
            vtBanner.className = 'vt-banner';
            return;
        }

        if (currentResult) {
            if (currentResult.status === 'scanning') {
                vtBanner.className = 'vt-banner scanning';
                vtIcon.textContent = '🔍';
                vtTitle.textContent = 'VirusTotal 掃描中...';
                vtDesc.textContent = '正在檢測網站安全性';
            } else if (currentResult.status === 'safe') {
                vtBanner.className = 'vt-banner safe';
                vtIcon.textContent = '✅';
                vtTitle.textContent = '網站安全';
                vtDesc.textContent = `VirusTotal: ${currentResult.positives || 0} / ${currentResult.total || 0} 偵測`;
            } else if (currentResult.status === 'warning') {
                vtBanner.className = 'vt-banner warning';
                vtIcon.textContent = '⚠️';
                vtTitle.textContent = '發現可疑項目';
                vtDesc.textContent = `VirusTotal: ${currentResult.positives || 0} / ${currentResult.total || 0} 偵測`;
            } else if (currentResult.status === 'danger') {
                vtBanner.className = 'vt-banner danger';
                vtIcon.textContent = '🚨';
                vtTitle.textContent = '危險網站';
                vtDesc.textContent = `VirusTotal: ${currentResult.positives || 0} / ${currentResult.total || 0} 偵測`;
            }
        } else {
            vtBanner.className = 'vt-banner';
        }
    }

    // ========== Update Restore Status ==========
    async function updateRestoreStatus() {
        if (!currentDomain) return;

        const result = await chrome.storage.local.get(['hiddenElements']);
        const hiddenElements = result.hiddenElements || [];
        const domainElements = hiddenElements.filter(rule => 
            rule.hostname === currentDomain || currentDomain.includes(rule.hostname)
        );

        if (domainElements.length > 0) {
            restoreStatus.textContent = `(${domainElements.length})`;
            restoreStatus.style.display = 'inline';
        } else {
            restoreStatus.textContent = '';
            restoreStatus.style.display = 'none';
        }
    }

    // ========== Load Blocked Elements List ==========
    async function loadBlockedElementsList() {
        if (!currentDomain) return;

        const result = await chrome.storage.local.get(['hiddenElements']);
        const hiddenElements = result.hiddenElements || [];
        const domainElements = hiddenElements.filter(rule => 
            rule.hostname === currentDomain || currentDomain.includes(rule.hostname)
        );

        blockedList.innerHTML = '';

        if (domainElements.length === 0) {
            blockedList.innerHTML = '<div class="blocked-empty">此網站沒有被封鎖的元件</div>';
            btnRestoreAll.disabled = true;
            btnRestoreAll.style.opacity = '0.5';
            return;
        }

        btnRestoreAll.disabled = false;
        btnRestoreAll.style.opacity = '1';

        domainElements.forEach((rule, index) => {
            const item = document.createElement('div');
            item.className = 'blocked-item';
            item.innerHTML = `
                <div class="blocked-selector">${rule.selector}</div>
                <button class="btn-restore" data-index="${index}">恢復</button>
            `;
            blockedList.appendChild(item);
        });

        // 綁定恢復按鈕事件
        blockedList.querySelectorAll('.btn-restore').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const selector = e.target.previousElementSibling.textContent;
                await restoreElement(selector);
                await loadBlockedElementsList();
                await updateRestoreStatus();
            });
        });
    }

    // ========== Event Handlers ==========
    masterToggle.addEventListener('change', async () => {
        const enabled = masterToggle.checked;
        await chrome.storage.local.set({ extensionEnabled: enabled });
        updateDisabledState(!enabled);
        chrome.runtime.sendMessage({ action: 'setExtensionEnabled', enabled });
        if (autoReloadEnabled) reloadCurrentTab();
    });

    strengthSlider.addEventListener('input', () => {
        const level = strengthLevels[strengthSlider.value];
        strengthLabel.textContent = strengthLabels[level];
    });

    strengthSlider.addEventListener('change', async () => {
        const level = strengthLevels[strengthSlider.value];
        await chrome.storage.local.set({ filterStrength: level });
        chrome.runtime.sendMessage({ action: 'setFilterStrength', level });
        if (autoReloadEnabled) reloadCurrentTab();
    });

    btnPauseSite.addEventListener('click', async () => {
        if (!currentDomain) return;

        const result = await chrome.storage.local.get(['whitelist']);
        let whitelist = result.whitelist || [];
        
        if (whitelist.includes(currentDomain)) {
            whitelist = whitelist.filter(d => d !== currentDomain);
            btnPauseSite.classList.remove('active');
            pauseStatus.textContent = '';
        } else {
            whitelist.push(currentDomain);
            btnPauseSite.classList.add('active');
            pauseStatus.textContent = '已暫停';
        }
        
        await chrome.storage.local.set({ whitelist });
        reloadCurrentTab();
    });

    btnPickElement.addEventListener('click', async () => {
        if (!currentTabId) return;
        try {
            chrome.tabs.sendMessage(currentTabId, { action: 'activateElementPicker' });
            window.close();
        } catch (error) {
            console.error('Failed to activate element picker:', error);
        }
    });

    btnRestoreElements.addEventListener('click', async () => {
        if (blockedElementsSection.style.display === 'none') {
            await loadBlockedElementsList();
            blockedElementsSection.style.display = 'block';
        } else {
            blockedElementsSection.style.display = 'none';
        }
    });

    btnCloseBlocked.addEventListener('click', () => {
        blockedElementsSection.style.display = 'none';
    });

    btnRestoreAll.addEventListener('click', async () => {
        if (!currentDomain) return;
        
        const result = await chrome.storage.local.get(['hiddenElements']);
        let hiddenElements = result.hiddenElements || [];
        
        // 移除當前域名的所有規則
        hiddenElements = hiddenElements.filter(rule => 
            rule.hostname !== currentDomain && !currentDomain.includes(rule.hostname)
        );
        
        await chrome.storage.local.set({ hiddenElements });
        
        // 重新載入列表
        await loadBlockedElementsList();
        await updateRestoreStatus();
        
        // 重新載入頁面以顯示恢復的元件
        reloadCurrentTab();
    });

    async function restoreElement(selector) {
        const result = await chrome.storage.local.get(['hiddenElements']);
        let hiddenElements = result.hiddenElements || [];
        
        // 移除特定選擇器的規則
        hiddenElements = hiddenElements.filter(rule => rule.selector !== selector);
        
        await chrome.storage.local.set({ hiddenElements });
        
        // 通知 content script 刷新規則
        if (currentTabId) {
            chrome.tabs.sendMessage(currentTabId, { action: 'refreshCosmeticRules' }).catch(() => {});
            // 重新載入頁面以顯示恢復的元件
            reloadCurrentTab();
        }
    }

    btnSandboxMode.addEventListener('click', async () => {
        if (!currentDomain) return;

        const result = await chrome.storage.local.get(['dangerousSites', 'sandboxEnabled']);
        let dangerousSites = result.dangerousSites || [];
        const sandboxEnabled = result.sandboxEnabled !== false;

        if (dangerousSites.includes(currentDomain)) {
            dangerousSites = dangerousSites.filter(d => d !== currentDomain);
            btnSandboxMode.classList.remove('active');
            sandboxStatus.textContent = '';
            sandboxBanner.style.display = 'none';
        } else {
            dangerousSites.push(currentDomain);
            btnSandboxMode.classList.add('active');
            sandboxStatus.textContent = '啟動中';
            if (sandboxEnabled) sandboxBanner.style.display = 'flex';
        }

        await chrome.storage.local.set({ dangerousSites });
        if (autoReloadEnabled) reloadCurrentTab();
    });

    btnExitSandbox.addEventListener('click', async () => {
        if (!currentDomain) return;

        const result = await chrome.storage.local.get(['dangerousSites']);
        let dangerousSites = result.dangerousSites || [];
        dangerousSites = dangerousSites.filter(d => d !== currentDomain);
        
        await chrome.storage.local.set({ dangerousSites });
        
        sandboxBanner.style.display = 'none';
        btnSandboxMode.classList.remove('active');
        sandboxStatus.textContent = '';
        
        reloadCurrentTab();
    });

    autoReloadToggle.addEventListener('change', async () => {
        autoReloadEnabled = autoReloadToggle.checked;
        await chrome.storage.local.set({ autoReloadEnabled });
    });

    openDashboard.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('dashboard/dashboard.html'));
        }
    });

    // ========== Helper Functions ==========
    function updateDisabledState(disabled) {
        popupContainer.classList.toggle('disabled', disabled);
    }

    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    }

    function reloadCurrentTab() {
        if (currentTabId) chrome.tabs.reload(currentTabId);
    }

    // ========== Listen for Messages ==========
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'pageStatsUpdated' && message.tabId === currentTabId) {
            adsBlocked.textContent = formatNumber(message.adsBlocked || 0);
            trackersBlocked.textContent = formatNumber(message.trackersBlocked || 0);
        }
        if (message.action === 'vtScanUpdated' && message.domain === currentDomain) {
            checkVirusTotalStatus();
        }
    });

    init();
});
