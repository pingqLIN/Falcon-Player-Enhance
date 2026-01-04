// Shield Pro - Popup UI Logic (Simplified)

document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        adsBlocked: document.getElementById('ads-blocked'),
        trackersBlocked: document.getElementById('trackers-blocked'),
        playerCountText: document.getElementById('player-count-text'),
        openDashboardBtn: document.getElementById('open-dashboard')
    };

    // Load stats from storage
    const loadStats = () => {
        chrome.storage.local.get(['stats'], (result) => {
            const stats = result.stats || { adsBlocked: 0, trackersBlocked: 0 };
            elements.adsBlocked.textContent = (stats.adsBlocked || 0).toLocaleString();
            elements.trackersBlocked.textContent = (stats.trackersBlocked || 0).toLocaleString();
        });
    };

    // Query player count from active tab
    const queryPlayerCount = async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || tab.url.startsWith('chrome://')) return;

            chrome.tabs.sendMessage(tab.id, { action: 'getPlayerCount' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response && typeof response.count === 'number') {
                    elements.playerCountText.textContent = `偵測到 ${response.count} 個播放器`;
                }
            });
        } catch (error) {
            console.error('Failed to query player count:', error);
        }
    };

    // Open Dashboard (Dashboard as Options Page)
    elements.openDashboardBtn.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('dashboard/dashboard.html'));
        }
    });

    // Listen for storage changes to update stats in real-time
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.stats) {
            loadStats();
        }
    });

    // Initialize
    loadStats();
    queryPlayerCount();
});
