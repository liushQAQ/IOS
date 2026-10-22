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
  await p.waitForTimeout(1200);
  // —— 插件页 ——
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b2) b2.click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);
  await p.evaluate(() => window.__t());
  await p.waitForTimeout(3500);
  await p.evaluate(() => window.__t());
  await p.waitForTimeout(1200);
  const pg = await p.evaluate(() => {
    const o = {};
    const hd = document.querySelector('header');
    if (hd) o.headerTop = Math.round(hd.getBoundingClientRect().top);
    const h1 = document.querySelector('h1');
    if (h1) { const q = h1.getBoundingClientRect(); o.h1 = { x: Math.round(q.x), y: Math.round(q.y) }; }
    const ph = document.querySelector('[class*="pageHead"]');
    if (ph) { o.phPadLeft = getComputedStyle(ph).paddingLeft; const q = ph.getBoundingClientRect(); o.ph = { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width) }; }
    const fabs = Array.from(document.querySelectorAll('button')).filter(b => {
      const cs = getComputedStyle(b); const q = b.getBoundingClientRect();
      return cs.position === 'fixed' && cs.display !== 'none' && q.width > 10 && q.y < 220 && q.x < 100; });
    if (fabs.length) { const q = fabs[0].getBoundingClientRect();
      const hit = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
      o.fab = { label: fabs[0].getAttribute('aria-label'), x: Math.round(q.x), y: Math.round(q.y), z: getComputedStyle(fabs[0]).zIndex,
        clickable: !!(hit && (hit === fabs[0] || fabs[0].contains(hit))),
        hitCls: hit ? String(hit.className || hit.tagName).slice(0, 30) : null };
      if (o.h1) { o.fabH1Overlap = !(q.right < o.h1.x || q.x > o.h1.x + 154 || q.bottom < o.h1.y || q.y > o.h1.y + 28); }
    }
    return o;
  });
  console.log('===== 插件页（修复后） =====');
  console.log(JSON.stringify(pg, null, 1));
  await p.screenshot({ path: 'plugin_fixed_125.png' });
  // —— 会话页 dock ——
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 20; i++) { await p.waitForTimeout(3000);
    if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry'))) break; }
  await p.evaluate(() => window.__t());
  await p.waitForTimeout(1500);
  const dk = await p.evaluate(() => {
    const e = document.querySelector('.cm-stat-entry');
    if (!e) return { none: true };
    let n = e, dockEl = null;
    while (n && n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'flex' && cs.flexDirection === 'row') { dockEl = n; break; }
      n = n.parentElement;
    }
    if (!dockEl) return { noDock: true };
    const cs = getComputedStyle(dockEl);
    const kids = Array.from(dockEl.children).filter(k => getComputedStyle(k).display !== 'none');
    const rects = kids.map(k => { const q = k.getBoundingClientRect(); return { cls: String(k.className || k.tagName).slice(0, 24), x: Math.round(q.x), y: Math.round(q.y), r: Math.round(q.right), b: Math.round(q.bottom) }; });
    let ov = 0;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b2 = rects[j];
      if (Math.min(a.b, b2.b) - Math.max(a.y, b2.y) > 2 && Math.min(a.r, b2.r) - Math.max(a.x, b2.x) > 2) ov++;
    }
    return { dockCls: String(dockEl.className).slice(0, 24), wrap: cs.flexWrap, rows: Math.round(dockEl.getBoundingClientRect().height), kids: rects.length, overlapPairs: ov, rects: rects.slice(0, 12) };
  });
  console.log('===== 会话 dock（修复后） =====');
  console.log(JSON.stringify(dk, null, 1));
  await p.screenshot({ path: 'dock_fixed_125.png' });
  await b.close();
})();
