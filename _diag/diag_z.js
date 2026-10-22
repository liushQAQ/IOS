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
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {} }, { js: APP_JS });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b2) b2.click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(6500);
  const r = await p.evaluate(() => {
    const ph = document.querySelector('[class*="pageHead"]');
    const fabs = Array.from(document.querySelectorAll('button')).filter(b => {
      const cs = getComputedStyle(b); const q = b.getBoundingClientRect();
      return cs.position === 'fixed' && cs.display !== 'none' && q.width > 10 && q.x < 100 && q.y < 220; });
    const fab = fabs[0];
    const o = {};
    if (ph) { const cs = getComputedStyle(ph); o.ph = { z: cs.zIndex, pos: cs.position, pe: cs.pointerEvents, transform: cs.transform.slice(0, 20) };
      // 祖先链 z
      o.phChain = []; let n = ph;
      while (n && n !== document.body && o.phChain.length < 8) {
        const c2 = getComputedStyle(n);
        o.phChain.push({ tag: n.tagName, cls: String(n.className).slice(0, 24), z: c2.zIndex, pos: c2.position, tf: c2.transform !== 'none' });
        n = n.parentElement;
      } }
    if (fab) { const cs = getComputedStyle(fab); o.fab = { z: cs.zIndex, pe: cs.pointerEvents };
      o.fabChain = []; let n = fab;
      while (n && n !== document.body && o.fabChain.length < 8) {
        const c2 = getComputedStyle(n);
        o.fabChain.push({ tag: n.tagName, cls: String(n.className).slice(0, 24), z: c2.zIndex, pos: c2.position, tf: c2.transform !== 'none' });
        n = n.parentElement;
      }
      const q = fab.getBoundingClientRect();
      const stack = document.elementsFromPoint(q.x + q.width / 2, q.y + q.height / 2).slice(0, 6).map(e => String(e.className || e.tagName).slice(0, 26) + (getComputedStyle(e).position === 'fixed' ? '[fixed]' : ''));
      o.stack = stack; }
    return o;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
