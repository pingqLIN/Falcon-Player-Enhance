// ============================================================================
// Shield Pro - Filter Strength Manager
// ============================================================================
// 管理不同強度等級的內容封鎖設定
// ============================================================================

const FilterStrength = {
  LEVELS: {
    minimal: {
      id: 'minimal',
      name: '最小',
      description: '僅攔截最具侵入性的廣告與追蹤器',
      rulesets: ['ads_and_trackers'],
      features: {
        blockPopups: true,
        blockTrackers: false,
        blockScripts: false,
        cosmeticFiltering: false,
        strictBlocking: false
      }
    },
    basic: {
      id: 'basic',
      name: '基本',
      description: '攔截廣告和基本追蹤器',
      rulesets: ['ads_and_trackers', 'easylist'],
      features: {
        blockPopups: true,
        blockTrackers: true,
        blockScripts: false,
        cosmeticFiltering: false,
        strictBlocking: false
      }
    },
    standard: {
      id: 'standard',
      name: '標準',
      description: '推薦設定：攔截廣告、追蹤器與隱私威脅',
      rulesets: ['ads_and_trackers', 'easylist', 'easyprivacy'],
      features: {
        blockPopups: true,
        blockTrackers: true,
        blockScripts: false,
        cosmeticFiltering: true,
        strictBlocking: false
      }
    },
    strict: {
      id: 'strict',
      name: '嚴格',
      description: '進階攔截：包含第三方腳本與 Cookie',
      rulesets: ['ads_and_trackers', 'easylist', 'easyprivacy'],
      features: {
        blockPopups: true,
        blockTrackers: true,
        blockScripts: true,
        cosmeticFiltering: true,
        strictBlocking: true
      }
    },
    aggressive: {
      id: 'aggressive',
      name: '激進',
      description: '最大程度封鎖，可能影響部分網站功能',
      rulesets: ['ads_and_trackers', 'easylist', 'easyprivacy'],
      features: {
        blockPopups: true,
        blockTrackers: true,
        blockScripts: true,
        cosmeticFiltering: true,
        strictBlocking: true,
        blockAllThirdParty: true
      }
    }
  },

  // 取得當前強度等級
  async getCurrentLevel() {
    const result = await chrome.storage.local.get(['filterStrength']);
    return result.filterStrength || 'standard';
  },

  // 設定強度等級
  async setLevel(levelId) {
    if (!this.LEVELS[levelId]) {
      throw new Error(`Invalid filter strength level: ${levelId}`);
    }
    
    const level = this.LEVELS[levelId];
    
    // 更新儲存
    await chrome.storage.local.set({ 
      filterStrength: levelId,
      filterFeatures: level.features
    });
    
    // 更新規則集
    await this.updateRulesets(level.rulesets);
    
    console.log(`🛡️ Filter strength set to: ${level.name}`);
    return level;
  },

  // 更新 declarativeNetRequest 規則集
  async updateRulesets(enabledRulesets) {
    const allRulesets = ['ads_and_trackers', 'easylist', 'easyprivacy'];
    const disableRulesets = allRulesets.filter(r => !enabledRulesets.includes(r));
    
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enabledRulesets,
      disableRulesetIds: disableRulesets
    });
  },

  // 取得等級資訊
  getLevelInfo(levelId) {
    return this.LEVELS[levelId] || this.LEVELS.standard;
  },

  // 取得所有等級清單
  getAllLevels() {
    return Object.values(this.LEVELS);
  }
};

// 匯出供其他模組使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FilterStrength;
}
