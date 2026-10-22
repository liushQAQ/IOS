const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const FINAL_CSS = fs.readFileSync('composer_v124.css', 'utf8');
(async () => {
  const b = await webkit.launch({ headless: true });
  for (const mode of ['before', 'after']) {
    const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(9000);
    if (mode === 'after') {
      await p.evaluate((css) => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, FINAL_CSS);
      await p.waitForTimeout(700);
    }
    const geo = await p.evaluate(() => {
      const row = document.querySelector('[class*="_row"]');
      const add = document.querySelector('[class*="_add"]');
      const pri = document.querySelector('[class*="_primary"]');
      const r = row.getBoundingClientRect(), a = add.getBoundingClientRect(), q = pri.getBoundingClientRect();
      return {
        rowTop: r.y, rowBottom: r.bottom,
        addCy: a.y + a.height / 2, priCy: q.y + q.height / 2,
        addX: a.x, addR: a.right, priX: q.x, priR: q.right,
      };
    });
    await p.screenshot({ path: 'full_' + mode + '.png' });
    fs.writeFileSync('geo_' + mode + '.json', JSON.stringify(geo));
    console.log(mode, JSON.stringify(geo));
    await c.close();
  }
  await b.close();
})();
