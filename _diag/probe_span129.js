/* 找出血 SPAN 与 fab 的真身：新 DSH 前端下它们长什么样 */
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
  await p.waitForTimeout(6500);
  await p.evaluate(({ js, css }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    const fe = document.createElement('style');
    fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
    document.head.appendChild(fe);
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    try { (0, eval)(js); } catch (e) {}
  }, { js: APP_JS, css: APP_CSS });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(800);
  const out = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bads = [];
    const all = document.body.getElementsByTagName('*');
    for (let i = 0; i < all.length && i < 3000; i++) {
      const e = all[i];
      const r = e.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 0.5) {
        const cs = getComputedStyle(e);
        bads.push({
          tag: e.tagName,
          cls: (e.className || '').toString().slice(0, 60),
          txt: (e.textContent || '').trim().slice(0, 24),
          left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
          bleed: Math.round((r.right - vw) * 10) / 10,
          pos: cs.position, tf: cs.transform.slice(0, 40)
        });
      }
    }
    const fab = document.querySelector('[data-mobile-nav="fab"]');
    return { vw, bads: bads.slice(0, 10), fabFound: !!fab, fabCls: fab ? (fab.className || '').toString().slice(0, 40) : null, docSW: document.documentElement.scrollWidth };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
