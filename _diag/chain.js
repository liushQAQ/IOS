const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);
  await p.evaluate((css) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    document.querySelectorAll('[class*="sidebarCol"]').forEach(el => {
      el.style.setProperty('width', '252px', 'important');
      el.style.setProperty('min-width', '252px', 'important');
      el.style.setProperty('max-width', '252px', 'important');
    });
  }, CSS);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2200);
  const r = await p.evaluate(() => {
    const row = document.querySelector('[class*="sessionRow"]');
    const chain = [];
    let cur = row;
    while (cur && chain.length < 12) {
      const q = cur.getBoundingClientRect(); const cs = getComputedStyle(cur);
      chain.push({
        tag: cur.tagName, cls: String(cur.className || '').slice(0, 40),
        x: Math.round(q.x), w: Math.round(q.width), right: Math.round(q.right),
        disp: cs.display, flex: cs.flex, w_css: cs.width, maxw: cs.maxWidth, minw: cs.minWidth,
        pad: cs.paddingLeft + '/' + cs.paddingRight, of: cs.overflowX, pos: cs.position,
      });
      if (cur.className && String(cur.className).indexOf('sidebarCol') >= 0) break;
      cur = cur.parentElement;
    }
    return chain;
  });
  r.forEach(o => console.log(o.tag + '.' + o.cls + '  w=' + o.w + ' (' + o.w_css + ') x=' + o.x + ' right=' + o.right + ' disp=' + o.disp + ' flex=' + o.flex + ' maxw=' + o.maxw + ' pad=' + o.pad + ' of=' + o.of));
  await b.close();
})();
