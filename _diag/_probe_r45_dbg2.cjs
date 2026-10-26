/* R45 守卫调试：复刻 R35b 断言序列（直接给按钮注入 translateX(50px)），每 150ms 采样守卫内部状态 */
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
    try { (0, eval)(js); } catch (e) { window.__injErr = String(e); }
    try { window.__dshSetStatusBar(59); } catch (e) {}
  }, { js: APP_JS });
  await p.waitForTimeout(2000);
  // 进会话（闸门 R35b 在会话页跑）
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(async () => {
    const out = { injErr: window.__injErr || null, samples: [] };
    const db = document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    if (!db) { out.noDb = true; return out; }
    // 复刻 R35b 前置：硬写 --dsh-statusbar 75px
    document.documentElement.style.setProperty('--dsh-statusbar', '75px');
    await new Promise(r2 => setTimeout(r2, 200));
    out.sb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-statusbar'));
    // 注入 50px
    db.style.setProperty('transform', 'translateX(50px)', 'important');
    for (let i = 0; i < 10; i++) {
      await new Promise(r2 => setTimeout(r2, 150));
      const rr = db.getBoundingClientRect();
      out.samples.push({
        t: (i + 1) * 150,
        right: Math.round(rr.right),
        tf: db.style.transform || '(none)',
        guardX: db.__dshGuardX === undefined ? null : db.__dshGuardX,
        attr: db.getAttribute('data-dsh-btn-guard')
      });
    }
    out.dbAlive = db === document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
