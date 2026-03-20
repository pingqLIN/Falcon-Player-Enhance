const { chromium } = require('playwright');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, 'docs', 'screenshots');
const BASE = 'file:///' + PROJECT_ROOT.replace(/\\/g, '/');

// ── Chinese → English translation map for Player preview ──
function injectPlayerEnglish() {
  const map = {
    '統一 UI/UX 設計預覽 (Popup + 無干擾播放器)': 'Unified UI/UX Design Preview (Popup + Distraction-Free Player)',
    '統一 UI/UX 設計預覽': 'Unified UI/UX Design Preview',
    '點選播放器': 'Click Player',
    '偵測與清除': 'Detect & Clean',
    '安全播放': 'Safe Play',
    '● 已鎖定播放器': '● Player Locked',
    '已鎖定播放器': 'Player Locked',
    '偵測到的播放器': 'Detected Players',
    'Three-Gray token system · 300px 固定寬 · 支援深色模式':
      'Three-Gray token system · 300px fixed width · Dark mode support',
    '無干擾播放器（全視窗）': 'Distraction-Free Player (Full Window)',
    '無干擾播放器': 'Distraction-Free Player',
    '影片已載入 · 點選播放': 'Video loaded · Click to play',
    '播放控制': 'Playback Controls',
    '後退': 'Rewind',
    '靜音': 'Mute',
    '播放': 'Play',
    '循環': 'Loop',
    '快進': 'Forward',
    '全螢幕': 'Fullscreen',
    '拖曳定位': 'Drag to seek',
    '畫面調整': 'Visual Adjustments',
    '亮度 · 對比 · 色調 · 色溫': 'Brightness · Contrast · Hue · Temperature',
    '光影 Luminance': 'Luminance',
    '色彩 Color': 'Color',
    '色調 Tint': 'Hue / Tint',
    '洋紅 M': 'Magenta',
    '綠 G': 'Green',
    '色溫 Temp': 'Temperature',
    '中性': 'Neutral',
    '冷 Cool': 'Cool',
    '暖 Warm': 'Warm',
    '防護設定': 'Protection Settings',
    'Link Shield · 嵌入保護': 'Link Shield · Embed Protection',
    '封鎖嵌入連結': 'Block Embed Links',
    '舞台重置': 'Reset Stage',
    '在 iframe 模式下，防護層覆蓋嵌入頁面，防止意外廣告點擊與外部跳轉。':
      'In iframe mode, the shield covers the embedded page to prevent accidental ad clicks and external redirects.',
    '音量': 'Volume',
    '設計說明 — 一致性決策': 'Design Notes — Consistency Decisions',
    '共用 Token（兩個 UI 都遵守）': 'Shared Tokens (Both UIs)',
    'Radius scale 統一': 'Unified radius scale',
    'Font stack 統一': 'Unified font stack',
    'Motion 統一': 'Unified motion easing',
    'Accent 橋接': 'Accent bridging',
    'Popup 主要改動': 'Popup Key Changes',
    'Status bar 新增': 'New status bar',
    'Player chip 重設計': 'Player chip redesign',
    'Stats 第 4 欄': 'Stats 4th column',
    'AI monitor panel 精簡': 'Streamlined AI monitor',
    'Player v6 主要改動': 'Player v6 Key Changes',
    '3 折疊分區取代 5 固定 section': '3 collapsible sections replace 5 fixed',
    'Transport 改為 6 按鈕橫排': 'Transport: 6-button row layout',
    '畫面調整新增色調 Tint + 色溫 Temp': 'Added Hue/Tint + Color Temperature',
    '移除 AI panel': 'Removed AI panel',
    'Token 對照表': 'Token Reference',
    '用途': 'Usage',
    '背景': 'Background',
    '卡片': 'Card',
    '主文字': 'Primary text',
    '主動色': 'Active accent',
    '反色': 'Inverse',
    '成功/安全': 'Success/Safe',
    '危險': 'Danger',
    'Radius 基準': 'Radius base',
    '統一 UI 設計預覽 v6.0 — Popup + 無干擾播放器':
      'Unified UI Design Preview v6.0 — Popup + Distraction-Free Player',
    'Cinema dark · oklch 主色橋接為 amber (#F0BC56) · v6: 3 折疊分區 · 無 AI panel · 色調/色溫':
      'Cinema dark · oklch accent bridged to amber (#F0BC56) · v6: 3 collapsible sections · No AI panel · Hue/Temperature',
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const trimmed = node.textContent.trim();
    for (const [zh, en] of Object.entries(map)) {
      if (node.textContent.includes(zh)) {
        node.textContent = node.textContent.replace(zh, en);
      }
    }
  }
  // Also patch title
  document.title = document.title.replace(/統一 UI\/UX 設計預覽.*/, 'Unified UI/UX Design Preview v6.0');
  // Patch preview banner (has emoji prefix, aria-hidden)
  const banner = document.querySelector('.preview-banner');
  if (banner) banner.textContent = '🎨 Unified UI Design Preview v6.0 — Popup + Distraction-Free Player';
}

// ── Chinese → English translation map for Dashboard preview ──
function injectDashboardEnglish() {
  const map = {
    '重構預覽': 'Preview',
    '深色模式': 'Dark Mode',
    '淺色模式': 'Light Mode',
    '擴充功能狀態總覽與常用設定': 'Extension status overview and common settings',
    '目前分頁：youtube.com': 'Current tab: youtube.com',
    '統計數據': 'Statistics',
    '保護功能': 'Protection',
    '自動移除影片上的廣告遮罩': 'Automatically remove ad overlays on videos',
    '阻擋新視窗彈出': 'Block new window popups',
    '移除假播放器陷阱': 'Remove fake player traps',
    '同步播放進度': 'Sync playback progress',
    'Popup 顯示': 'Popup Display',
    '讓 popup 播放器自動調整大小': 'Auto-fit popup player window size',
    '在 popup 中顯示 AI 決策監控面板': 'Show AI decision monitor in popup',
    '快捷鍵參考': 'Keyboard Shortcuts',
    '開啟 popup': 'Open popup',
    '切換全螢幕': 'Toggle fullscreen',
    '靜音切換': 'Toggle mute',
    '後退 10s': 'Rewind 10s',
    '前進 10s': 'Forward 10s',
    '音量 +10%': 'Volume +10%',
    '音量 -10%': 'Volume -10%',
    '播放/暫停': 'Play / Pause',
    'AI 評估': 'AI Assessment',
    '白名單、黑名單與增強站點管理': 'Whitelist, blacklist, and enhanced site management',
    '白名單': 'Whitelist',
    '不套用任何規則': 'No rules applied',
    '黑名單': 'Blacklist',
    '嚴格保護': 'Strict protection',
    '增強站點': 'Enhanced Sites',
    '唯讀': 'read-only',
    'Enhanced match patterns（技術預覽）': 'Enhanced match patterns (Technical preview)',
    '目前生效的比對規則（由 background.js 解析）': 'Currently active matching rules (parsed by background.js)',
    'AI 設定': 'AI Settings',
    'AI provider 設定與評估模式控制': 'AI provider configuration and assessment mode controls',
    '狀態': 'Status',
    '啟用 AI 功能': 'Enable AI features',
    '評估模式': 'Assessment Mode',
    '不啟用 AI 評估，所有決策由規則引擎處理': 'No AI assessment; all decisions handled by rule engine',
    'AI 提供建議，最終動作仍由規則引擎決定，低風險':
      'AI provides advice; final actions decided by rule engine (low risk)',
    'AI 可主動套用安全政策，適合需要動態判斷的複雜站點':
      'AI can proactively apply security policies for complex sites',
    '進階設定（Timeout / Cooldown / Candidate rules）':
      'Advanced Settings (Timeout / Cooldown / Candidate rules)',
    '讓 AI 產生 CSS 選擇器建議規則': 'Let AI generate CSS selector candidate rules',
    '動作': 'Actions',
    '政策閘、封鎖元素、沙箱保護與資料管理':
      'Policy gate, blocked elements, sandbox protection & data management',
    '沙箱保護': 'Sandbox Protection',
    '限制站點權限，包括彈出視窗與下載行為':
      'Restrict site permissions including popups and downloads',
    '封鎖元素': 'Blocked Elements',
    '資料管理': 'Data Management',
    '清除所有計數器（overlays, popups, players, AI assessments）':
      'Clear all counters (overlays, popups, players, AI assessments)',
    'Dashboard 重構預覽 v5.0 — 非正式版本': 'Dashboard Preview v5.0 — Unofficial Build',
    '進階': 'Advanced',
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    for (const [zh, en] of Object.entries(map)) {
      if (node.textContent.includes(zh)) {
        node.textContent = node.textContent.replace(zh, en);
      }
    }
  }
  // Patch aria-labels
  document.querySelectorAll('[aria-label]').forEach(el => {
    const map2 = {
      '主選單': 'Main menu',
      '切換主題': 'Toggle theme',
      '加入白名單域名': 'Add whitelist domain',
      '加入黑名單域名': 'Add blacklist domain',
      '加入自訂增強站點': 'Add custom enhanced site',
      '啟用 AI 功能': 'Enable AI features',
      '沙箱保護': 'Sandbox protection',
      '模型名稱': 'Model name',
      '本機端點': 'Local endpoint',
      '逾時毫秒數': 'Timeout (ms)',
      '冷卻毫秒數': 'Cooldown (ms)',
    };
    for (const [zh, en] of Object.entries(map2)) {
      if (el.getAttribute('aria-label').includes(zh)) {
        el.setAttribute('aria-label', el.getAttribute('aria-label').replace(zh, en));
      }
    }
  });
  // Patch placeholders
  document.querySelectorAll('input[placeholder]').forEach(el => {
    if (el.placeholder.includes('貼上新的 API key')) el.placeholder = 'Paste new API key';
  });
  // Patch remove-button aria-labels
  document.querySelectorAll('button[aria-label*="移除"]').forEach(el => {
    el.setAttribute('aria-label', el.getAttribute('aria-label').replace('移除', 'Remove'));
  });
  document.title = 'Falcon-Player-Enhance — Dashboard Preview v5.0';
  // Patch preview banner (has emoji prefix, aria-hidden)
  const banner = document.querySelector('.preview-banner');
  if (banner) banner.textContent = '🎨 Dashboard Preview v5.0 — Unofficial Build';
  // Patch JS-generated theme label
  const themeLabel = document.getElementById('themeLabel');
  if (themeLabel && themeLabel.textContent.includes('深色')) themeLabel.textContent = 'Dark Mode';
  if (themeLabel && themeLabel.textContent.includes('淺色')) themeLabel.textContent = 'Light Mode';
}

async function run() {
  const browser = await chromium.launch();

  // ========== 1. Player UI Preview (Dark) ==========
  console.log('1. Player Preview (Dark)...');
  let page = await browser.newPage({ viewport: { width: 900, height: 720 } });
  await page.goto(`${BASE}/docs/player-ui-preview.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.evaluate(injectPlayerEnglish);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-player-dark-full.png'), fullPage: false });
  console.log('   => 01-player-dark-full.png');

  // Scroll to control rail
  await page.evaluate(() => {
    const rail = document.querySelector('.control-rail') || document.querySelector('.rail-section');
    if (rail) rail.scrollIntoView({ behavior: 'instant' });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-player-dark-controls.png'), fullPage: false });
  console.log('   => 02-player-dark-controls.png');

  // ========== 2. Player UI Preview (Light) ==========
  console.log('2. Player Preview (Light)...');
  const themeBtn = await page.$('#btn-theme, .btn-theme');
  if (themeBtn) {
    await themeBtn.click();
    await page.waitForTimeout(500);
  } else {
    await page.evaluate(() => { document.body.dataset.theme = 'light'; });
    await page.waitForTimeout(500);
  }
  await page.evaluate(injectPlayerEnglish); // Re-inject after theme switch
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-player-light-full.png'), fullPage: false });
  console.log('   => 03-player-light-full.png');

  // Light controls
  await page.evaluate(() => {
    const rail = document.querySelector('.control-rail') || document.querySelector('.rail-section');
    if (rail) rail.scrollIntoView({ behavior: 'instant' });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-player-light-controls.png'), fullPage: false });
  console.log('   => 04-player-light-controls.png');
  await page.close();

  // ========== 3. Dashboard Preview ==========
  console.log('3. Dashboard Preview...');
  page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`${BASE}/docs/dashboard-preview.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.evaluate(injectDashboardEnglish);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-dashboard-overview.png'), fullPage: false });
  console.log('   => 05-dashboard-overview.png');

  // Click through tabs
  for (const tab of ['sites', 'ai', 'advanced']) {
    const el = await page.$(`[data-tab="${tab}"]`);
    if (el) {
      await el.click();
      await page.waitForTimeout(400);
      await page.evaluate(injectDashboardEnglish); // Re-inject after tab switch
      await page.waitForTimeout(200);
      const idx = { sites: '06', ai: '07', advanced: '08' }[tab];
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${idx}-dashboard-${tab}.png`), fullPage: false });
      console.log(`   => ${idx}-dashboard-${tab}.png`);
    }
  }
  await page.close();

  // ========== 4. Popup HTML ==========
  console.log('4. Popup...');
  page = await browser.newPage({ viewport: { width: 420, height: 700 } });
  await page.goto(`${BASE}/extension/popup/popup.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09-popup-main.png'), fullPage: true });
  console.log('   => 09-popup-main.png');
  await page.close();

  // ========== 5. Popup Player HTML ==========
  console.log('5. Popup Player...');
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(`${BASE}/extension/popup-player/popup-player.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10-popup-player-actual.png'), fullPage: true });
  console.log('   => 10-popup-player-actual.png');
  await page.close();

  // ========== 6. Dashboard HTML ==========
  console.log('6. Dashboard (actual)...');
  page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`${BASE}/extension/dashboard/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11-dashboard-actual.png'), fullPage: true });
  console.log('   => 11-dashboard-actual.png');
  await page.close();

  // ========== 7. Full page preview screenshots ==========
  console.log('7. Full page previews...');
  page = await browser.newPage({ viewport: { width: 900, height: 720 } });
  await page.goto(`${BASE}/docs/player-ui-preview.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.evaluate(injectPlayerEnglish);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12-player-fullpage.png'), fullPage: true });
  console.log('   => 12-player-fullpage.png');
  await page.close();

  page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`${BASE}/docs/dashboard-preview.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.evaluate(injectDashboardEnglish);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '13-dashboard-fullpage.png'), fullPage: true });
  console.log('   => 13-dashboard-fullpage.png');
  await page.close();

  await browser.close();
  console.log('\nDone! All screenshots saved to docs/screenshots/');
}

run().catch(e => { console.error(e); process.exit(1); });
