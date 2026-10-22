const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  await p.evaluate(() => { const x = document.querySelector('[aria-label=\"打开侧边栏\"]') || document.querySelector('[aria-label=\"打开左侧侧边栏\"]'); if (x) x.click(); });
  await p.waitForTimeout(2000);
  const dump = await p.evaluate(() => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const s = document.createElement('style'); s.textContent = window.__css || '';
    const rows = [...document.querySelectorAll('[class*="sessionRow"]')].slice(0, 4);
    return rows.map(r => {
      const rq = r.getBoundingClientRect();
      const kids = [...r.children].map(k => {
        const cs = getComputedStyle(k);
        const q = k.getBoundingClientRect();
        return {
          tag: k.tagName, cls: String(k.className || '').slice(0, 40),
          text: (k.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20),
          x: Math.round(q.x), w: Math.round(q.width), right: Math.round(q.right),
          flex: cs.flex, of: cs.overflowX, ws: cs.whiteSpace, disp: cs.display, fs: cs.fontSize,
        };
      });
      const cs = getComputedStyle(r);
      return {
        row: { x: Math.round(rq.x), w: Math.round(rq.width), right: Math.round(rq.right), disp: cs.display, flex: cs.flexDirection },
        kids,
        deep: [...r.querySelectorAll('*')].slice(0, 6).map(e => {
          const q = e.getBoundingClientRect(); const c2 = getComputedStyle(e);
          return { tag: e.tagName, cls: String(e.className || '').slice(0, 34), text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16), x: Math.round(q.x), w: Math.round(q.width), of: c2.overflowX };
        }),
      };
    });
  });
  console.log(JSON.stringify(dump, null, 1));
  await b.close();
})();
