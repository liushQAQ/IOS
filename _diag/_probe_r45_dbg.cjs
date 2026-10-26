/* R45 守卫调试：注入 headerCorner -8px，采样守卫内部判据，看两拍门为何不过 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'light' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    try { (0, eval)(js); } catch (e) {}
    try { window.__dshSetStatusBar(59); } catch (e) {}
  }, { js: APP_JS });
  await p.waitForTimeout(2000);
  // 注入 headerCorner -8px（复刻 DSH 滞留位移形态）
  const r = await p.evaluate(async () => {
    const out = { samples: [] };
    const db = document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    if (!db) { out.noDb = true; return out; }
    const hc = db.closest('[class*="headerCorner"]');
    if (hc) hc.style.setProperty('transform', 'translateX(-8px)', 'important');
    for (let i = 0; i < 12; i++) {
      await new Promise(r2 => setTimeout(r2, 250));
      const rr = db.getBoundingClientRect();
      out.samples.push({
        t: (i + 1) * 250,
        right: Math.round(rr.right),
        tf: db.style.transform || '(none)',
        attr: db.getAttribute('data-dsh-btn-guard'),
        guardX: db.__dshGuardX === undefined ? 'undef' : db.__dshGuardX,
        sameNode: db === document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]')
      });
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
