const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
(async () => {
  for (const S of [{ w: 430, h: 932 }, { w: 375, h: 812 }]) {
    const b = await webkit.launch({ headless: true });
    const c = await b.newContext({ viewport: { width: S.w, height: S.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(9000);
    const t = await p.evaluate(() => {
      const d = document.getElementById('__dshViewDiagBox');
      return d ? { text: d.textContent, rect: (q => ({ x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) }))(d.getBoundingClientRect()) } : null;
    });
    console.log('[' + S.w + 'x' + S.h + '] ' + JSON.stringify(t));
    await b.close();
  }
})();
