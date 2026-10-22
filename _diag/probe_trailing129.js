/* composer 底排（trailing）全量结构 + 各按钮几何 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.evaluate(({ js, css }) => {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    try { (0, eval)(js); } catch (e) {}
  }, { js: APP_JS, css: APP_CSS });
  await p.waitForTimeout(1000);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(1500);
  const out = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const R = e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) }; };
    const walk = (n, d) => {
      const cs = getComputedStyle(n);
      const o = {
        tag: n.tagName, cls: (n.className || '').toString().slice(0, 42),
        txt: (n.textContent || '').trim().slice(0, 12),
        disp: cs.display, flex: cs.flex, of: cs.overflowX, minw: cs.minWidth, maxw: cs.maxWidth,
        ...R(n)
      };
      if (d > 0) o.kids = Array.from(n.children).map(k => walk(k, d - 1));
      return o;
    };
    const tr = document.querySelector('[class*="VERcba_trailing"]');
    const comp = document.querySelector('[class*="composerStack"]');
    // 全 composer 内按钮列表
    const btns = comp ? Array.from(comp.querySelectorAll('button')).map(b => {
      const r = b.getBoundingClientRect();
      return { txt: (b.textContent || '').trim().slice(0, 8) || (b.getAttribute('aria-label') || '').slice(0, 10), cls: (b.className || '').toString().slice(0, 28), x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), pos: getComputedStyle(b).position };
    }) : [];
    return { vw, trailing: tr ? walk(tr, 3) : null, btns };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
