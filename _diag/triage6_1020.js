const { webkit } = require('playwright');
const fs = require('fs');
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync('app_inject.js','utf8');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {}
    window.__t = function () { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} }; }, { js: APP_JS });
  await p.waitForTimeout(1000);
  // 打开抽屉 → 插件 → 关抽屉
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b2) b2.click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);
  await p.evaluate(() => window.__t());
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const o = { url: location.pathname.slice(0, 40) };
    const hd = document.querySelector('header');
    o.hasHeader = !!hd;
    if (hd) { const q = hd.getBoundingClientRect(); o.headerTop = Math.round(q.top); o.headerCls = String(hd.className).slice(0, 40); }
    const frame = document.querySelector('[data-mobile-nav="frame"]');
    o.framePadTop = frame ? getComputedStyle(frame).paddingTop : null;
    const col = document.querySelector('[class*="centerCol"]');
    if (col) { const q = col.getBoundingClientRect(); o.colTop = Math.round(q.top); o.colMT = getComputedStyle(col).marginTop; }
    const h1 = document.querySelector('h1');
    if (h1) { const q = h1.getBoundingClientRect(); o.h1 = { text: (h1.textContent || '').slice(0, 10), x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) }; }
    // fixed fab
    const fab = Array.from(document.querySelectorAll('button')).find(b => {
      const cs = getComputedStyle(b); const q = b.getBoundingClientRect();
      return cs.position === 'fixed' && cs.display !== 'none' && q.width > 10 && q.y < 200 && q.x < 100; });
    if (fab) {
      const q = fab.getBoundingClientRect();
      o.fab = { label: fab.getAttribute('aria-label'), x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height), z: getComputedStyle(fab).zIndex,
        parent: String(fab.parentElement.className || fab.parentElement.tagName).slice(0, 36), parentPos: getComputedStyle(fab.parentElement).position };
      const hit = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
      o.fabHit = hit ? { cls: String(hit.className || hit.tagName).slice(0, 36), text: (hit.textContent || '').slice(0, 10), isFab: hit === fab || fab.contains(hit) } : null;
      // fab 与 h1 是否相交
      if (o.h1) { const a = q, b3 = o.h1;
        o.fabH1Overlap = !(a.right < 30 || 30 + 60 < a.x) ? undefined : undefined; }
    }
    return o;
  });
  console.log(JSON.stringify(r, null, 1));
  await p.screenshot({ path: 'plugin_closed_now.png' });
  await b.close();
})();
