// ============================================================================
// Shield Pro - Whitelist/Blacklist Manager
// ============================================================================
// 管理網站白名單與黑名單
// ============================================================================

const ListManager = {
  // 取得白名單
  async getWhitelist() {
    const result = await chrome.storage.local.get(['whitelist']);
    return result.whitelist || [];
  },

  // 取得黑名單
  async getBlacklist() {
    const result = await chrome.storage.local.get(['blacklist']);
    return result.blacklist || [];
  },

  // 加入白名單
  async addToWhitelist(domain) {
    const normalized = this.normalizeDomain(domain);
    if (!normalized) return false;
    
    const whitelist = await this.getWhitelist();
    if (!whitelist.includes(normalized)) {
      whitelist.push(normalized);
      await chrome.storage.local.set({ whitelist });
      console.log(`🟢 Added to whitelist: ${normalized}`);
    }
    return true;
  },

  // 從白名單移除
  async removeFromWhitelist(domain) {
    const normalized = this.normalizeDomain(domain);
    const whitelist = await this.getWhitelist();
    const filtered = whitelist.filter(d => d !== normalized);
    await chrome.storage.local.set({ whitelist: filtered });
    console.log(`🗑️ Removed from whitelist: ${normalized}`);
    return true;
  },

  // 加入黑名單
  async addToBlacklist(domain) {
    const normalized = this.normalizeDomain(domain);
    if (!normalized) return false;
    
    const blacklist = await this.getBlacklist();
    if (!blacklist.includes(normalized)) {
      blacklist.push(normalized);
      await chrome.storage.local.set({ blacklist });
      console.log(`🔴 Added to blacklist: ${normalized}`);
    }
    return true;
  },

  // 從黑名單移除
  async removeFromBlacklist(domain) {
    const normalized = this.normalizeDomain(domain);
    const blacklist = await this.getBlacklist();
    const filtered = blacklist.filter(d => d !== normalized);
    await chrome.storage.local.set({ blacklist: filtered });
    console.log(`🗑️ Removed from blacklist: ${normalized}`);
    return true;
  },

  // 檢查網域是否在白名單中
  async isWhitelisted(url) {
    try {
      const hostname = new URL(url).hostname;
      const whitelist = await this.getWhitelist();
      return whitelist.some(domain => this.matchDomain(hostname, domain));
    } catch (e) {
      return false;
    }
  },

  // 檢查網域是否在黑名單中
  async isBlacklisted(url) {
    try {
      const hostname = new URL(url).hostname;
      const blacklist = await this.getBlacklist();
      return blacklist.some(domain => this.matchDomain(hostname, domain));
    } catch (e) {
      return false;
    }
  },

  // 正規化域名
  normalizeDomain(domain) {
    if (!domain) return null;
    
    // 移除協定和路徑
    let normalized = domain.toLowerCase().trim();
    normalized = normalized.replace(/^https?:\/\//, '');
    normalized = normalized.replace(/\/.*$/, '');
    normalized = normalized.replace(/^www\./, '');
    
    // 簡單驗證
    if (normalized.length < 3 || !normalized.includes('.')) {
      return null;
    }
    
    return normalized;
  },

  // 域名匹配（支援子域名）
  matchDomain(hostname, pattern) {
    hostname = hostname.toLowerCase();
    pattern = pattern.toLowerCase();
    
    // 精確匹配
    if (hostname === pattern) return true;
    
    // 子域名匹配
    if (hostname.endsWith('.' + pattern)) return true;
    
    // 萬用字元匹配
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.slice(2);
      return hostname === baseDomain || hostname.endsWith('.' + baseDomain);
    }
    
    return false;
  },

  // 批次匯入
  async importList(type, domains) {
    const list = type === 'whitelist' ? await this.getWhitelist() : await this.getBlacklist();
    const newDomains = domains
      .map(d => this.normalizeDomain(d))
      .filter(d => d && !list.includes(d));
    
    const merged = [...list, ...newDomains];
    await chrome.storage.local.set({ [type]: merged });
    
    console.log(`📥 Imported ${newDomains.length} domains to ${type}`);
    return newDomains.length;
  },

  // 匯出清單
  async exportList(type) {
    return type === 'whitelist' ? await this.getWhitelist() : await this.getBlacklist();
  },

  // 清空清單
  async clearList(type) {
    await chrome.storage.local.set({ [type]: [] });
    console.log(`🗑️ Cleared ${type}`);
  }
};

// 匯出供其他模組使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ListManager;
}
