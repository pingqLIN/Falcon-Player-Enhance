// ============================================================================
// Falcon-Player-Enhance - URL Security Checker
// ============================================================================
// URL 安全檢測，整合 VirusTotal API
// ============================================================================

const URLSecurityChecker = {
  // 本地危險網站快取
  cachedResults: new Map(),
  
  // 已知危險網站資料庫（離線備份）
  KNOWN_DANGEROUS_PATTERNS: [
    // 惡意軟體分發
    'malware', 'virus', 'trojan', 'ransomware',
    // 釣魚網站
    'phishing', 'fake-login', 'account-verify',
    // 常見詐騙網域關鍵字
    'free-iphone', 'winner', 'lottery', 'prize-claim',
    // 可疑 TLD
    '.tk', '.ml', '.ga', '.cf', '.gq'
  ],

  // 初始化（檢查 API Key）
  async init() {
    const result = await chrome.storage.local.get(['virusTotalApiKey']);
    this.apiKey = result.virusTotalApiKey || null;
    console.log('🔒 URL Security Checker initialized', this.apiKey ? '(with API key)' : '(no API key)');
  },

  // 設定 VirusTotal API Key
  async setApiKey(apiKey) {
    await chrome.storage.local.set({ virusTotalApiKey: apiKey });
    this.apiKey = apiKey;
    console.log('🔑 VirusTotal API key updated');
  },

  // 取得 API Key
  async getApiKey() {
    if (!this.apiKey) {
      const result = await chrome.storage.local.get(['virusTotalApiKey']);
      this.apiKey = result.virusTotalApiKey || null;
    }
    return this.apiKey;
  },

  // 快速本地檢測
  quickLocalCheck(url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      
      // 檢查已知危險模式
      for (const pattern of this.KNOWN_DANGEROUS_PATTERNS) {
        if (hostname.includes(pattern)) {
          return {
            safe: false,
            reason: 'matches_dangerous_pattern',
            pattern: pattern
          };
        }
      }
      
      // 檢查可疑 TLD
      const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.work', '.click'];
      for (const tld of suspiciousTLDs) {
        if (hostname.endsWith(tld)) {
          return {
            safe: null,  // 未知，需進一步檢查
            reason: 'suspicious_tld',
            tld: tld
          };
        }
      }
      
      return { safe: true, reason: 'passed_local_check' };
    } catch (e) {
      return { safe: null, reason: 'invalid_url' };
    }
  },

  // VirusTotal API 檢測
  async checkWithVirusTotal(url) {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return { 
        error: true, 
        reason: 'no_api_key',
        message: '未設定 VirusTotal API Key'
      };
    }

    // 檢查快取
    const cached = this.cachedResults.get(url);
    if (cached && (Date.now() - cached.timestamp < 3600000)) { // 1小時快取
      return cached.result;
    }

    try {
      // URL 需要 base64 編碼
      const urlId = btoa(url).replace(/=/g, '');
      
      const response = await fetch(`https://www.virustotal.com/api/v3/urls/${urlId}`, {
        headers: {
          'x-apikey': apiKey
        }
      });

      if (response.status === 404) {
        // URL 尚未被掃描，提交掃描請求
        return await this.submitUrlForScan(url);
      }

      if (!response.ok) {
        throw new Error(`VirusTotal API error: ${response.status}`);
      }

      const data = await response.json();
      const stats = data.data.attributes.last_analysis_stats;
      
      const result = {
        safe: stats.malicious === 0 && stats.suspicious === 0,
        malicious: stats.malicious,
        suspicious: stats.suspicious,
        harmless: stats.harmless,
        undetected: stats.undetected,
        score: this.calculateSafetyScore(stats),
        lastAnalysis: data.data.attributes.last_analysis_date
      };

      // 快取結果
      this.cachedResults.set(url, {
        result: result,
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      console.error('VirusTotal check failed:', error);
      return {
        error: true,
        reason: 'api_error',
        message: error.message
      };
    }
  },

  // 提交 URL 進行掃描
  async submitUrlForScan(url) {
    const apiKey = await this.getApiKey();
    
    try {
      const response = await fetch('https://www.virustotal.com/api/v3/urls', {
        method: 'POST',
        headers: {
          'x-apikey': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `url=${encodeURIComponent(url)}`
      });

      if (!response.ok) {
        throw new Error(`Submit failed: ${response.status}`);
      }

      return {
        pending: true,
        reason: 'submitted_for_scan',
        message: 'URL 已提交掃描，請稍後再查詢結果'
      };

    } catch (error) {
      return {
        error: true,
        reason: 'submit_failed',
        message: error.message
      };
    }
  },

  // 計算安全分數 (0-100)
  calculateSafetyScore(stats) {
    const total = stats.malicious + stats.suspicious + stats.harmless + stats.undetected;
    if (total === 0) return 50;
    
    // 惡意權重高
    const dangerScore = (stats.malicious * 3 + stats.suspicious * 1.5) / total;
    return Math.max(0, Math.min(100, Math.round((1 - dangerScore) * 100)));
  },

  // 完整安全檢測（本地 + API）
  async fullSecurityCheck(url) {
    // 先做快速本地檢測
    const localResult = this.quickLocalCheck(url);
    
    if (localResult.safe === false) {
      return {
        ...localResult,
        source: 'local',
        recommendation: 'block'
      };
    }

    // 如果有 API Key，進行 VirusTotal 檢測
    const apiKey = await this.getApiKey();
    if (apiKey) {
      const vtResult = await this.checkWithVirusTotal(url);
      
      if (!vtResult.error && !vtResult.pending) {
        return {
          ...vtResult,
          source: 'virustotal',
          recommendation: vtResult.safe ? 'allow' : (vtResult.malicious > 0 ? 'block' : 'warn')
        };
      }
    }

    // 本地檢測通過且無 API
    return {
      ...localResult,
      source: 'local_only',
      recommendation: localResult.safe === null ? 'warn' : 'allow'
    };
  },

  // 判斷是否應在沙盒中開啟
  async shouldOpenInSandbox(url) {
    const result = await this.fullSecurityCheck(url);
    return result.recommendation === 'block' || result.recommendation === 'warn';
  }
};

// 匯出供其他模組使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = URLSecurityChecker;
}
