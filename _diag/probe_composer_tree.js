/* 新前端 composer 底排完整结构：standardControls 里到底塞了什么 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.evaluate(({ js, css }) => {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    try { (0, eval)(js); } catch (e) {}
  }, { js: APP_JS, css: APP_CSS });
  await p.waitForTimeout(1000);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1600);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);
  const out = await p.evaluate(() => {
    const R = e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) }; };
    const dump = (sel, depth) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const walk = (n, d) => {
        const cs = getComputedStyle(n);
        const kids = d < depth ? Array.from(n.children).map(k => walk(k, d + 1)) : undefined;
        return {
          tag: n.tagName, cls: (n.className || '').toString().slice(0, 36),
          disp: cs.display, flex: cs.flex, minw: cs.minWidth, maxw: cs.maxWidth,
          ...R(n), kids
        };
      };
      return walk(e, 0);
    };
    return {
      standardControls: dump('[class*="standardControls"]', 3),
      trailing: dump('[class*="VERcba_trailing"]', 1)
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
