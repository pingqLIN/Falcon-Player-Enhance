document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initToggles();
    loadStats();
    
    // Refresh stats periodically
    setInterval(loadStats, 2000);
});

function initTabs() {
    const tabs = document.querySelectorAll('.nav-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Add active to current
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });
}

function initToggles() {
    // Rule Set mappings
    const ruleSets = {
        'toggle-easylist': 'easylist',
        'toggle-easyprivacy': 'easyprivacy'
    };

    // Initialize toggle states
    chrome.declarativeNetRequest.getEnabledRulesets(enabledRulesets => {
        for (const [id, rulesetId] of Object.entries(ruleSets)) {
            const toggle = document.getElementById(id);
            if (toggle) {
                toggle.checked = enabledRulesets.includes(rulesetId);
                
                // Add listener
                toggle.addEventListener('change', (e) => {
                    updateRuleset(rulesetId, e.target.checked);
                });
            }
        }
    });
}

function updateRuleset(rulesetId, enable) {
    const options = enable 
        ? { enableRulesetIds: [rulesetId] }
        : { disableRulesetIds: [rulesetId] };

    chrome.declarativeNetRequest.updateEnabledRulesets(options)
        .then(() => {
            console.log(`${rulesetId} is now ${enable ? 'enabled' : 'disabled'}`);
        })
        .catch(err => {
            console.error('Failed to update ruleset:', err);
            // Revert toggle if failed
            // document.getElementById(toggleId).checked = !enable;
        });
}

function loadStats() {
    chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
        if (response) {
            updateStat('stats-ads', response.adsBlocked || 0);
            updateStat('stats-trackers', response.trackersBlocked || 0);
            updateStat('stats-malware', response.malwareBlocked || 0);
        }
    });
}

function updateStat(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) {
        // Simple animation or just text update
        el.textContent = value.toLocaleString();
    }
}
