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
  await p.waitForTimeout(1000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 20; i++) { await p.waitForTimeout(3000);
    if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry'))) break; }
  const r = await p.evaluate(() => {
    const e = document.querySelector('.cm-stat-entry');
    if (!e) return { none: true };
    const chain = []; let n = e, d = 0;
    while (n && d < 10) {
      const cs = getComputedStyle(n); const q = n.getBoundingClientRect();
      chain.push({ tag: n.tagName, cls: String(n.className || '').slice(0, 36), disp: cs.display, dir: cs.flexDirection, wrap: cs.flexWrap,
        just: cs.justifyContent, y: Math.round(q.y), h: Math.round(q.height), w: Math.round(q.width), x: Math.round(q.x) });
      n = n.parentElement; d++;
    }
    // 这一行里所有顶层 widget（chain[1] 的子元素）
    const row = chain[1] ? null : null;
    return { chain };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
