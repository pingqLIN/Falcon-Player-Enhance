const { chromium } = require('playwright');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, 'docs', 'screenshots');
const BASE = 'file:///' + PROJECT_ROOT.replace(/\\/g, '/');

async function run() {
  const browser = await chromium.launch();
  
  // ========== 1. Player UI Preview (Dark) ==========
  console.log('1. Player Preview (Dark)...');
  let page = await browser.newPage({ viewport: { width: 900, height: 720 } });
  await page.goto(`${BASE}/docs/player-ui-preview.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-player-dark-full.png'), fullPage: false });
  console.log('   => 01-player-dark-full.png');
  
  // Scroll to control rail
  await page.evaluate(() => {
    const rail = document.querySelector('.control-rail') || document.querySelector('.rail-section');
    if (rail) rail.scrollIntoView({ behavior: 'instant' });
  });
  await page.waitForTimeout(500);
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
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-dashboard-overview.png'), fullPage: false });
  console.log('   => 05-dashboard-overview.png');
  
  // Click through tabs
  for (const tab of ['sites', 'ai', 'advanced']) {
    const el = await page.$(`[data-tab="${tab}"]`);
    if (el) {
      await el.click();
      await page.waitForTimeout(600);
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
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12-player-fullpage.png'), fullPage: true });
  console.log('   => 12-player-fullpage.png');
  await page.close();
  
  page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`${BASE}/docs/dashboard-preview.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '13-dashboard-fullpage.png'), fullPage: true });
  console.log('   => 13-dashboard-fullpage.png');
  await page.close();

  await browser.close();
  console.log('\nDone! All screenshots saved to docs/screenshots/');
}

run().catch(e => { console.error(e); process.exit(1); });
