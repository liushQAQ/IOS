const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.route(/\.(woff2?|ttf|otf)(\?.*)?$/i, r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {} }, { js: APP_JS });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(3000);
  const dbg = await p.evaluate(() => {
    const out = {};
    const drawer = document.querySelector('[data-mobile-nav="drawer"], [class*="drawer"], aside');
    out.drawerVisible = drawer ? getComputedStyle(drawer).display : 'none-found';
    out.sessionRowsAll = Array.from(document.querySelectorAll('[class*="session"], [class*="Session"]')).slice(0, 5).map(e => (e.className || '').toString().slice(0, 60));
    // 抽屉内所有可点行
    const dr = document.querySelector('[class*="drawer"]');
    out.drawerRows = dr ? Array.from(dr.querySelectorAll('div[style*="cursor"], [role="button"], li')).slice(0, 12).map(e => (e.textContent || '').trim().slice(0, 25)) : null;
    return out;
  });
  console.log('DBG:', JSON.stringify(dbg, null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
