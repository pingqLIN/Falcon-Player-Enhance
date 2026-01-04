/**
 * Shield Pro - Smart Mock Resource
 * 
 * 這不是一個空的檔案。它主要用來宣告常見的 "Anti-Adblock" 偵測變數。
 * 當播放器檢查 window.ads 或 window.fuckAdBlock 是否存在時，
 * 這個腳本會讓它們回傳 "存在"，從而騙過偵測機制。
 */

// 1. 模擬 FuckAdBlock / BlockAdBlock
(function(window) {
    const mockAdBlocker = function(options) {
        this._options = options || {};
        var self = this;
        this.onDetected = function(cb) { /* Do nothing, never detected */ };
        this.onNotDetected = function(cb) { 
            // 立即執行回調，告訴網站"沒有偵測到 Adblock"
            if(typeof cb === 'function') setTimeout(cb, 1); 
        };
        this.check = function(loop) {
            if (this._options.checkOnLoad === true) {
                if(typeof this._options.onNotDetected === 'function') setTimeout(this._options.onNotDetected, 1);
            }
            return true; // Pretend check passed
        };
    };

    window.FuckAdBlock = mockAdBlocker;
    window.BlockAdBlock = mockAdBlocker;
    
    // 預先實例化
    window.fuckAdBlock = new mockAdBlocker();
    window.blockAdBlock = new mockAdBlocker();
})(window);

// 2. 模擬通用廣告變數 (Generic Ad Variables)
window.ads = true;
window.ad_blocker_detected = false;
window.is_adblock_active = false;
window.canRunAds = true;
window.hasAdBlocker = false;
window.google_ad_status = 1;

console.log('Shield Pro: Anti-Adblock variables mocked.');
