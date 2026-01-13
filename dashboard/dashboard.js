// Shield Pro Dashboard - Settings & Management

document.addEventListener('DOMContentLoaded', () => {
    // ========== Tab Navigation ==========
    const tabItems = document.querySelectorAll('.tab-item');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabItems.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;

            tabItems.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            tabPanels.forEach(panel => panel.classList.remove('active'));
            
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                requestAnimationFrame(() => targetPanel.classList.add('active'));
            }
        });
    });

    // ========== Filter List Toggles ==========
    document.getElementById('toggle-easylist').addEventListener('change', (e) => {
        chrome.runtime.sendMessage({
            action: 'toggleRuleset',
            rulesetId: 'easylist',
            enabled: e.target.checked
        });
    });

    document.getElementById('toggle-easyprivacy').addEventListener('change', (e) => {
        chrome.runtime.sendMessage({
            action: 'toggleRuleset',
            rulesetId: 'easyprivacy',
            enabled: e.target.checked
        });
    });

    // ========== Stats Display ==========
    function loadStats() {
        chrome.storage.local.get(['stats'], (result) => {
            const stats = result.stats || {};
            document.getElementById('stats-ads').textContent = formatNumber(stats.adsBlocked || 0);
            document.getElementById('stats-trackers').textContent = formatNumber(stats.trackersBlocked || 0);
            document.getElementById('stats-popups').textContent = formatNumber(stats.popupsBlocked || 0);
        });
    }

    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    }

    loadStats();

    // ========== Subscriptions Management ==========
    const subscriptionList = document.getElementById('subscription-list');
    const defaultSubscriptions = [
        // 內建規則集（預載）
        { id: 'easylist', name: 'EasyList', desc: '通用廣告過濾清單（內建）', enabled: true, builtin: true },
        { id: 'easyprivacy', name: 'EasyPrivacy', desc: '追蹤器防護清單（內建）', enabled: true, builtin: true },
        // 可選訂閱
        { id: 'easylist-china', name: 'EasyList China', desc: '中國區網站廣告過濾', enabled: false },
        { id: 'fanboy-annoyance', name: 'Fanboy Annoyance', desc: '社群媒體與煩人元素過濾', enabled: false },
        { id: 'peter-lowe', name: "Peter Lowe's List", desc: '廣告與追蹤伺服器清單', enabled: false }
    ];

    async function loadSubscriptions() {
        const result = await chrome.storage.local.get(['subscriptions']);
        let subscriptions = result.subscriptions;
        
        if (!subscriptions) {
            subscriptions = defaultSubscriptions;
            await chrome.storage.local.set({ subscriptions });
        }

        subscriptionList.innerHTML = '';
        
        if (subscriptions.length === 0) {
            subscriptionList.innerHTML = '<div class="empty-state">尚無訂閱清單</div>';
            return;
        }

        subscriptions.forEach(sub => {
            const item = document.createElement('div');
            item.className = 'subscription-item';
            
            let dateInfoHtml = '';
            if (sub.lastSynced || sub.lastUpdated) {
                const syncDate = new Date(sub.lastSynced || sub.lastUpdated);
                dateInfoHtml += `<div class="sub-date-info">
                    <span class="date-label">本地同步：</span>
                    <span class="date-value">${formatDateTime(syncDate)}</span>
                </div>`;
            }
            
            if (sub.remoteLastUpdated) {
                const remoteDate = new Date(sub.remoteLastUpdated);
                dateInfoHtml += `<div class="sub-date-info">
                    <span class="date-label">遠端更新：</span>
                    <span class="date-value">${formatDateTime(remoteDate)}</span>
                </div>`;
            }

            item.innerHTML = `
                <div class="sub-info">
                    <div class="sub-name">
                        ${escapeHtml(sub.name)}
                        ${sub.builtin ? '<span class="sub-badge builtin">內建</span>' : ''}
                        ${sub.custom ? '<span class="sub-badge custom">自訂</span>' : ''}
                    </div>
                    <div class="sub-desc">${escapeHtml(sub.desc || sub.description || '')}</div>
                    ${sub.rulesCount ? `<div class="sub-meta">${sub.rulesCount} 條規則</div>` : ''}
                    ${dateInfoHtml}
                </div>
                <div class="sub-actions">
                    ${sub.custom ? `<button class="sub-remove" data-id="${sub.id}" title="刪除">✕</button>` : ''}
                    <label class="toggle">
                        <input type="checkbox" data-id="${sub.id}" ${sub.enabled ? 'checked' : ''}>
                        <span class="toggle-track"></span>
                    </label>
                </div>
            `;
            subscriptionList.appendChild(item);
        });

        // Bind toggle events
        subscriptionList.querySelectorAll('input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', async (e) => {
                e.stopPropagation();
                const subId = input.dataset.id;
                const enabled = input.checked;

                const result = await chrome.storage.local.get(['subscriptions']);
                const subscriptions = result.subscriptions || [];
                const sub = subscriptions.find(s => s.id === subId);

                if (sub) {
                    sub.enabled = enabled;
                    await chrome.storage.local.set({ subscriptions });
                }
            });
        });

        // Bind remove events
        subscriptionList.querySelectorAll('.sub-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const subId = btn.dataset.id;
                
                if (confirm('確定要刪除這個訂閱嗎？')) {
                    const result = await chrome.storage.local.get(['subscriptions']);
                    let subscriptions = result.subscriptions || [];
                    subscriptions = subscriptions.filter(s => s.id !== subId);
                    await chrome.storage.local.set({ subscriptions });
                    loadSubscriptions();
                }
            });
        });
    }

    loadSubscriptions();

    // Add subscription
    document.getElementById('btn-add-sub').addEventListener('click', async () => {
        const nameInput = document.getElementById('sub-name');
        const urlInput = document.getElementById('sub-url');
        const name = nameInput.value.trim();
        const url = urlInput.value.trim();

        if (!name || !url) {
            alert('請填寫清單名稱和 URL');
            return;
        }

        const result = await chrome.storage.local.get(['subscriptions']);
        let subscriptions = result.subscriptions || defaultSubscriptions;

        subscriptions.push({
            id: 'custom-' + Date.now(),
            name: name,
            desc: '自訂過濾清單',
            url: url,
            enabled: true,
            custom: true,
            lastSynced: null,
            remoteLastUpdated: null
        });

        await chrome.storage.local.set({ subscriptions });
        nameInput.value = '';
        urlInput.value = '';
        loadSubscriptions();
        
        // Trigger update for the newly added subscription
        chrome.runtime.sendMessage({ action: 'updateAllSubscriptions' });
    });

    // Update all subscriptions
    document.getElementById('btn-update-all').addEventListener('click', async () => {
        chrome.runtime.sendMessage({ action: 'updateAllSubscriptions' });
        
        // Reload the display after a delay to show updated dates
        setTimeout(() => {
            loadSubscriptions();
        }, 2000);
        
        alert('已開始更新所有訂閱，請稍候...');
    });

    // ========== Whitelist / Blacklist ==========
    async function loadLists() {
        const result = await chrome.storage.local.get(['whitelist', 'blacklist']);
        renderDomainList('whitelist-display', result.whitelist || []);
        renderDomainList('blacklist-display', result.blacklist || []);
    }

    function renderDomainList(containerId, domains) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        if (domains.length === 0) {
            container.innerHTML = '<div class="empty-state">尚無項目</div>';
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

    document.getElementById('btn-add-whitelist').addEventListener('click', () => {
        const input = document.getElementById('whitelist-input');
        addDomain('whitelist', input.value);
        input.value = '';
    });

    document.getElementById('whitelist-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const input = document.getElementById('whitelist-input');
            addDomain('whitelist', input.value);
            input.value = '';
        }
    });

    document.getElementById('btn-add-blacklist').addEventListener('click', () => {
        const input = document.getElementById('blacklist-input');
        addDomain('blacklist', input.value);
        input.value = '';
    });

    document.getElementById('blacklist-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const input = document.getElementById('blacklist-input');
            addDomain('blacklist', input.value);
            input.value = '';
        }
    });

    loadLists();

    // ========== Security Settings ==========
    const toggleSandbox = document.getElementById('toggle-sandbox');
    const vtApiKeyInput = document.getElementById('vt-api-key');
    const vtApiStatus = document.getElementById('vt-api-status');

    async function loadSecuritySettings() {
        const result = await chrome.storage.local.get(['sandboxEnabled', 'virusTotalApiKey']);
        toggleSandbox.checked = result.sandboxEnabled !== false;
        
        if (result.virusTotalApiKey) {
            vtApiKeyInput.value = '••••••••••••••••';
            updateApiStatus('configured', '已設定');
        } else {
            updateApiStatus('', '未設定');
        }
    }

    function updateApiStatus(status, text) {
        vtApiStatus.className = 'api-status ' + status;
        vtApiStatus.querySelector('.status-icon').textContent = status === 'configured' ? '●' : '○';
        vtApiStatus.querySelector('.status-text').textContent = text;
    }

    loadSecuritySettings();

    toggleSandbox.addEventListener('change', () => {
        chrome.storage.local.set({ sandboxEnabled: toggleSandbox.checked });
    });

    document.getElementById('btn-save-api-key').addEventListener('click', () => {
        const apiKey = vtApiKeyInput.value.trim();
        if (apiKey && !apiKey.startsWith('••')) {
            chrome.storage.local.set({ virusTotalApiKey: apiKey });
            vtApiKeyInput.value = '••••••••••••••••';
            updateApiStatus('configured', '已設定');
            alert('API Key 已儲存');
        }
    });

    document.getElementById('btn-test-api-key').addEventListener('click', async () => {
        const result = await chrome.storage.local.get(['virusTotalApiKey']);
        if (!result.virusTotalApiKey) {
            alert('請先設定 API Key');
            return;
        }

        updateApiStatus('', '測試中...');

        try {
            const response = await fetch('https://www.virustotal.com/vtapi/v2/url/report?apikey=' + result.virusTotalApiKey + '&resource=https://www.google.com');
            const data = await response.json();
            
            if (data.response_code !== undefined) {
                updateApiStatus('configured', '連線正常');
                alert('✅ API Key 驗證成功！');
            } else {
                updateApiStatus('error', '驗證失敗');
                alert('❌ API Key 無效或已過期');
            }
        } catch (error) {
            updateApiStatus('error', '連線失敗');
            alert('❌ 連線失敗：' + error.message);
        }
    });

    // Reset Stats
    document.getElementById('btn-reset-stats').addEventListener('click', () => {
        if (confirm('確定要重置所有統計資料嗎？')) {
            chrome.storage.local.set({
                stats: {
                    adsBlocked: 0,
                    trackersBlocked: 0,
                    malwareBlocked: 0,
                    popupsBlocked: 0,
                    totalBlocked: 0
                }
            });
            loadStats();
        }
    });

    // ========== Helper Functions ==========
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatDateTime(date) {
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return '剛剛';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
        
        return date.toLocaleDateString('zh-TW', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // ========== Hidden Elements Management ==========
    const hiddenElementsList = document.getElementById('hidden-elements-list');

    async function loadHiddenElements() {
        const result = await chrome.storage.local.get(['hiddenElements']);
        const elements = result.hiddenElements || [];

        if (elements.length === 0) {
            hiddenElementsList.innerHTML = '<div class="empty-state">尚無封鎖元素</div>';
            return;
        }

        // Group by hostname
        const grouped = {};
        elements.forEach((el, index) => {
            const host = el.hostname || '未知網域';
            if (!grouped[host]) {
                grouped[host] = [];
            }
            grouped[host].push({ ...el, originalIndex: index });
        });

        // Render
        hiddenElementsList.innerHTML = '';
        
        Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])).forEach(([hostname, items]) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'element-group';

            const headerDiv = document.createElement('div');
            headerDiv.className = 'element-group-header';
            headerDiv.innerHTML = `
                <span class="element-group-title">${escapeHtml(hostname)}</span>
                <span class="element-group-count">${items.length} 項</span>
            `;
            groupDiv.appendChild(headerDiv);

            items.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'element-item';
                
                const timeStr = item.timestamp ? formatDateTime(new Date(item.timestamp)) : '';
                
                itemDiv.innerHTML = `
                    <div class="element-info">
                        <span class="element-selector" title="${escapeHtml(item.selector)}">${escapeHtml(item.selector)}</span>
                        ${timeStr ? `<span class="element-meta">新增於 ${timeStr}</span>` : ''}
                    </div>
                    <button class="element-remove" data-index="${item.originalIndex}" title="刪除此規則">✕</button>
                `;
                groupDiv.appendChild(itemDiv);
            });

            hiddenElementsList.appendChild(groupDiv);
        });

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
        if (confirm('確定要清除所有封鎖元素規則嗎？\n這將恢復所有被封鎖的元素。')) {
            await chrome.storage.local.set({ hiddenElements: [] });
            loadHiddenElements();
        }
    }

    // Load on init
    loadHiddenElements();

    // Clear all button
    document.getElementById('btn-clear-all-elements').addEventListener('click', clearAllHiddenElements);

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.stats) loadStats();
            if (changes.whitelist || changes.blacklist) loadLists();
            if (changes.subscriptions) loadSubscriptions();
            if (changes.hiddenElements) loadHiddenElements();
        }
    });
});
