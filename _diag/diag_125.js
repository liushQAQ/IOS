const { webkit } = require('playwright');
const fs = require('fs');
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync('app_inject.js','utf8');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 120)));
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) { console.log('INJECT ERR', e.message); }
    window.__t = function () { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} }; }, { js: APP_JS });
  await p.waitForTimeout(1500);
  const st1 = await p.evaluate(() => ({ bleedT: typeof window.__dshBleedT, observerAlive: !!window.__dshBleedT }));
  console.log('主页:', JSON.stringify(st1));
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b2) b2.click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);
  const st2 = await p.evaluate(() => {
    const ph = document.querySelector('[class*="pageHead"]');
    const o = { bleedT: typeof window.__dshBleedT, hasPageHead: !!ph, phCls: ph ? String(ph.className).slice(0, 40) : null };
    if (ph) {
      o.padLeftInline = ph.style.paddingLeft || '(none)';
      // 手工复算 fixPageHeadFab 的判定
      const fabs = Array.from(document.querySelectorAll('button')).filter(b => {
        const cs = getComputedStyle(b); const q = b.getBoundingClientRect();
        return cs.position === 'fixed' && cs.display !== 'none' && q.width > 10 && q.x < 100 && q.y < 220; });
      o.fabCount = fabs.length;
      if (fabs.length) { const q = fabs[0].getBoundingClientRect();
        const pq = ph.getBoundingClientRect();
        o.fabLabel = fabs[0].getAttribute('aria-label');
        o.fq = [Math.round(q.x), Math.round(q.y), Math.round(q.right), Math.round(q.bottom)];
        o.pq = [Math.round(pq.x), Math.round(pq.y), Math.round(pq.right), Math.round(pq.bottom)];
        o.overlap = !(q.right < pq.x + 4 || q.x > pq.right - 4 || q.bottom < pq.y + 4 || q.y > pq.bottom - 4); }
    }
    return o;
  });
  console.log('插件页:', JSON.stringify(st2, null, 1));
  await b.close();
})();
