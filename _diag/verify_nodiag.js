const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  const r = await p.evaluate(() => ({
    diag: !!document.getElementById('__dshViewDiagBox'),
    gear: !!document.querySelector('button[aria-label="设置"]'),
    nodes: document.body.querySelectorAll('*').length,
    doc: document.documentElement.clientWidth + '/' + document.documentElement.scrollWidth,
  }));
  console.log(JSON.stringify(r));
  await b.close();
})();
