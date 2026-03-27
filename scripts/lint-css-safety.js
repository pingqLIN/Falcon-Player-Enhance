#!/usr/bin/env node
// ============================================================================
// Falcon-Player-Enhance - CSS Safety Lint
// ============================================================================
// 掃描所有 CSS 檔案，檢查是否有危險的全域 attribute selectors
// 用法: node scripts/lint-css-safety.js
// ============================================================================

const fs = require('fs');
const path = require('path');

const CSS_DIR = path.join(__dirname, '..', 'extension');
const DANGEROUS_PATTERNS = [
  /\[class\*="/g,
  /\[id\*="/g,
  /\[class\^="/g,
  /\[id\^="/g,
  /\[class\$="/g,
  /\[id\$="/g,
];

// 允許的例外（已確認安全或僅注入播放器站點）
const ALLOWED_EXCEPTIONS = [
  'cvpbox',           // javboys 專用
  'colorbox',         // javboys 專用
  'preact',           // 已知廣告 SDK
  'player-overlay-ad', // 播放器覆蓋廣告
  'video-ad-overlay',  // 播放器覆蓋廣告
  'preroll',          // 播放器前貼
  'midroll',          // 播放器中貼
  'exoclick',         // 廣告網路
  'trafficjunky',     // 廣告網路
  'juicyads',         // 廣告網路
  'overlay-ad',       // 播放器覆蓋廣告
  'ad-overlay',       // 播放器覆蓋廣告
  'click-overlay',    // 點擊劫持
  'clickjack',        // 點擊劫持
  'popup-overlay',    // 彈窗覆蓋
  'interstitial',     // 插頁廣告
  'lightbox-overlay', // 燈箱覆蓋
  'sponsor',          // 贊助
  'shield',           // 自身元素
  'video-wrapper',    // 播放器容器
  'shield-player-type', // 自身標記
  'shield-id',        // 自身標記
  'shadow-host',      // 已知安全的 Shadow DOM 標記
];

let totalWarnings = 0;
let totalFiles = 0;

function walkCssFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  entries.forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkCssFiles(full, files);
      return;
    }

    if (entry.isFile() && entry.name.endsWith('.css')) {
      files.push(full);
    }
  });

  return files;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const fileName = path.relative(process.cwd(), filePath);
  let fileWarnings = 0;
  let inBlockComment = false;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;

    for (const pattern of DANGEROUS_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        // 檢查是否為允許的例外
        const restOfLine = line.substring(match.index);
        const isAllowed = ALLOWED_EXCEPTIONS.some(exc => restOfLine.includes(exc));
        
        if (!isAllowed) {
          console.log(`⚠️  ${fileName}:${idx + 1} — 危險的 attribute selector: ${line.trim()}`);
          fileWarnings++;
        }
      }
    }
  });

  totalFiles++;
  totalWarnings += fileWarnings;
  return fileWarnings;
}

// 掃描所有 CSS 檔案
const cssFiles = walkCssFiles(CSS_DIR).sort();

console.log('🔍 Falcon-Player-Enhance CSS Safety Lint');
console.log('=============================');
console.log(`掃描 ${cssFiles.length} 個 CSS 檔案...\n`);

cssFiles.forEach(scanFile);

console.log(`\n=============================`);
console.log(`✅ 掃描完成: ${totalFiles} 個檔案, ${totalWarnings} 個警告`);

if (totalWarnings > 0) {
  console.log('\n💡 提示: 上述 attribute selectors 可能影響非目標站點的 UI。');
  console.log('   由於腳本已限定只在播放器站點注入，這些選擇器目前是安全的。');
  console.log('   但建議逐步替換為更精確的選擇器以防未來回歸。');
  process.exit(1);
}

process.exit(0);
