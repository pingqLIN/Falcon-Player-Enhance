// ============================================================================
// Shield Pro - Subscription Manager
// ============================================================================
// 管理過濾清單訂閱與更新
// ============================================================================

const SubscriptionManager = {
  // 預設可用訂閱清單
  DEFAULT_SUBSCRIPTIONS: [
    {
      id: 'easylist-china',
      name: 'EasyList China',
      description: '中國區網站廣告過濾',
      url: 'https://easylist-downloads.adblockplus.org/easylistchina.txt',
      enabled: false
    },
    {
      id: 'fanboy-annoyance',
      name: 'Fanboy Annoyance',
      description: '社群媒體與煩人元素過濾',
      url: 'https://easylist.to/easylist/fanboy-annoyance.txt',
      enabled: false
    },
    {
      id: 'anti-adblock-killer',
      name: 'Anti-Adblock Killer',
      description: '繞過 Anti-Adblock 偵測',
      url: 'https://raw.githubusercontent.com/nicefeel/nicefeel.github.io/master/nicefeel-filter.txt',
      enabled: false
    },
    {
      id: 'peter-lowe',
      name: "Peter Lowe's List",
      description: '廣告與追蹤伺服器清單',
      url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&mimetype=plaintext',
      enabled: false
    }
  ],

  // 取得所有訂閱
  async getSubscriptions() {
    const result = await chrome.storage.local.get(['subscriptions']);
    if (!result.subscriptions) {
      // 首次使用，初始化預設清單
      await chrome.storage.local.set({ subscriptions: this.DEFAULT_SUBSCRIPTIONS });
      return this.DEFAULT_SUBSCRIPTIONS;
    }
    return result.subscriptions;
  },

  // 新增自訂訂閱
  async addCustomSubscription(name, url) {
    const subscriptions = await this.getSubscriptions();
    const id = 'custom-' + Date.now();
    
    const newSub = {
      id,
      name,
      description: '自訂過濾清單',
      url,
      enabled: true,
      custom: true,
      lastUpdated: null
    };
    
    subscriptions.push(newSub);
    await chrome.storage.local.set({ subscriptions });
    
    // 立即下載並套用
    await this.updateSubscription(id);
    
    console.log(`📋 Added custom subscription: ${name}`);
    return newSub;
  },

  // 移除訂閱
  async removeSubscription(id) {
    const subscriptions = await this.getSubscriptions();
    const filtered = subscriptions.filter(s => s.id !== id);
    await chrome.storage.local.set({ subscriptions: filtered });
    
    // 清除快取的規則
    await chrome.storage.local.remove([`rules_${id}`]);
    
    console.log(`🗑️ Removed subscription: ${id}`);
  },

  // 切換訂閱啟用狀態
  async toggleSubscription(id, enabled) {
    const subscriptions = await this.getSubscriptions();
    const sub = subscriptions.find(s => s.id === id);
    
    if (sub) {
      sub.enabled = enabled;
      await chrome.storage.local.set({ subscriptions });
      
      if (enabled && !sub.lastUpdated) {
        await this.updateSubscription(id);
      }
    }
  },

  // 更新單一訂閱
  async updateSubscription(id) {
    const subscriptions = await this.getSubscriptions();
    const sub = subscriptions.find(s => s.id === id);
    
    if (!sub) return false;
    
    try {
      console.log(`📥 Updating subscription: ${sub.name}...`);
      
      const response = await fetch(sub.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const text = await response.text();
      const rules = this.parseAdblockRules(text);
      
      // 儲存解析後的規則
      await chrome.storage.local.set({
        [`rules_${id}`]: rules,
        [`lastUpdated_${id}`]: Date.now()
      });
      
      // 更新訂閱資訊
      sub.lastUpdated = Date.now();
      sub.rulesCount = rules.length;
      await chrome.storage.local.set({ subscriptions });
      
      console.log(`✓ Subscription updated: ${sub.name} (${rules.length} rules)`);
      return true;
      
    } catch (error) {
      console.error(`✗ Failed to update subscription ${sub.name}:`, error);
      return false;
    }
  },

  // 更新所有啟用的訂閱
  async updateAllSubscriptions() {
    const subscriptions = await this.getSubscriptions();
    const enabled = subscriptions.filter(s => s.enabled);
    
    console.log(`📥 Updating ${enabled.length} subscriptions...`);
    
    for (const sub of enabled) {
      await this.updateSubscription(sub.id);
    }
  },

  // 解析 AdBlock Plus 格式規則（簡化版）
  parseAdblockRules(text) {
    const lines = text.split('\n');
    const rules = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 跳過註解和元資料
      if (!trimmed || 
          trimmed.startsWith('!') || 
          trimmed.startsWith('[') ||
          trimmed.startsWith('#')) {
        continue;
      }
      
      // 基本 URL 封鎖規則
      if (trimmed.startsWith('||')) {
        const domain = trimmed.slice(2).split('^')[0].split('$')[0];
        if (domain && domain.length > 3) {
          rules.push({
            type: 'block',
            pattern: domain
          });
        }
      }
      // 元素隱藏規則
      else if (trimmed.includes('##')) {
        const [domains, selector] = trimmed.split('##');
        if (selector) {
          rules.push({
            type: 'cosmetic',
            domains: domains ? domains.split(',') : ['*'],
            selector: selector
          });
        }
      }
    }
    
    return rules;
  },

  // 取得已快取的規則
  async getCachedRules(id) {
    const result = await chrome.storage.local.get([`rules_${id}`]);
    return result[`rules_${id}`] || [];
  },

  // 取得所有啟用的元素隱藏規則
  async getEnabledCosmeticRules() {
    const subscriptions = await this.getSubscriptions();
    const enabled = subscriptions.filter(s => s.enabled);
    
    let allRules = [];
    for (const sub of enabled) {
      const rules = await this.getCachedRules(sub.id);
      const cosmetic = rules.filter(r => r.type === 'cosmetic');
      allRules = allRules.concat(cosmetic);
    }
    
    return allRules;
  }
};

// 匯出供其他模組使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SubscriptionManager;
}
