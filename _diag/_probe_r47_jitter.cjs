/* R47 复现假设：胶囊宽度持续跳变（真机「13 个后台任务」流式刷新态）
 * → 守卫两拍稳定门永不满足 → 按钮滞留出屏。
 * 做法：给 header 里的后台任务胶囊注入 ±6px 宽度抖动，观察抽屉按钮视觉右缘。 */
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
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const hit = rows.find(e => (e.textContent || '').indexOf('Generate the') >= 0) || rows[1] || rows[0];
    if (hit) hit.click();
  });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(async () => {
    const out = { samples: [] };
    const db = document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    if (!db) { out.noDb = true; return out; }
    // 找后台任务胶囊（header 内含「后台任务」文本、非按钮容器）
    let cap = null;
    for (const el of document.querySelectorAll('header *')) {
      const t = (el.textContent || '').trim();
      if (/后台任务/.test(t) && t.length < 20 && el.children.length <= 3) { cap = el; break; }
    }
    out.capFound = !!cap;
    if (cap) cap.style.setProperty('transition', 'none', 'important');
    // 每 120ms 抖动胶囊宽度 ±6px（模拟计数/文案流式刷新），持续 3s
    let n = 0;
    const jit = setInterval(() => {
      if (!cap) return;
      cap.style.setProperty('padding-right', (n % 2 ? 6 : 0) + 'px', 'important');
      n++;
    }, 120);
    for (let i = 0; i < 20; i++) {
      await new Promise(r2 => setTimeout(r2, 150));
      const rr = db.getBoundingClientRect();
      out.samples.push({ t: (i + 1) * 150, right: Math.round(rr.right), tf: db.style.transform || '(none)', gx: db.__dshGuardX === undefined ? null : db.__dshGuardX });
    }
    clearInterval(jit);
    if (cap) { cap.style.removeProperty('padding-right'); }
    await new Promise(r2 => setTimeout(r2, 1200));
    out.final = { right: Math.round(db.getBoundingClientRect().right), tf: db.style.transform || '(none)' };
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
