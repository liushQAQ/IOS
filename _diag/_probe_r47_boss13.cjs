/* R47 取证：老总 13:59 真机——「13 个后台任务」长胶囊会话，主会话页抽屉按钮默认出屏
 * 进入该会话，采样按钮几何/守卫内部状态/谁在改写 transform */
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
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  const found = await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"], li, button'));
    const hit = rows.find(e => (e.textContent || '').indexOf('Generate the') >= 0);
    if (hit) { hit.click(); return hit.textContent.slice(0, 40); }
    return 'not-found';
  });
  console.log('[进会话]', found);
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { injErr: window.__injErr || null, samples: [] };
    const db = document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    if (!db) { out.noDb = true; out.headers = document.querySelectorAll('header').length; return out; }
    // 顶栏行内元素宽度审计
    const row = db.closest('header') ? db.closest('header').querySelector('[class*="titleRow"], [class*="headerRow"]') || db.closest('header').firstElementChild : null;
    out.rowInfo = row ? { cls: (row.className || '').slice(0, 40), sw: row.scrollWidth, cw: row.clientWidth, ovf: getComputedStyle(row).overflowX } : null;
    const caps = document.querySelectorAll('header [class*="job"], header [class*="capsule"], header button');
    out.headerBtns = [];
    for (const el of caps) {
      const rr = el.getBoundingClientRect();
      if (rr.width > 0 && rr.top < 140) out.headerBtns.push({ cls: (typeof el.className === 'string' ? el.className.split(' ')[0] : '').slice(0, 24), aria: el.getAttribute('aria-label') || '', text: (el.textContent || '').trim().slice(0, 14), rect: [Math.round(rr.left), Math.round(rr.right)] });
    }
    for (let i = 0; i < 10; i++) {
      await new Promise(r2 => setTimeout(r2, 250));
      const rr = db.getBoundingClientRect();
      out.samples.push({ t: (i + 1) * 250, right: Math.round(rr.right), left: Math.round(rr.left), tf: db.style.transform || '(none)', guard: db.getAttribute('data-dsh-btn-guard'), gx: db.__dshGuardX === undefined ? null : db.__dshGuardX });
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await p.screenshot({ path: path.join(DIR, '_r47_boss13.png'), clip: { x: 0, y: 0, width: 430, height: 130 } });
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
