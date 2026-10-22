/* composer 模型选择器结构（新 DSH 前端）：SPAN 无类名？父链什么样？ */
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
    const fe = document.createElement('style');
    fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
    document.head.appendChild(fe);
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    try { (0, eval)(js); } catch (e) {}
  }, { js: APP_JS, css: APP_CSS });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(3000);
  // 进会话页（composer 完整形态）
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(1200);

  const out = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const spans = Array.from(document.querySelectorAll('[class*="composerStack"] span, [class*="composer"] span')).filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 30 && (e.textContent || '').trim().length > 3 && r.right > vw + 0.5;
    });
    const info = spans.slice(0, 3).map(e => {
      const chain = [];
      let x = e, i = 0;
      while (x && i++ < 8) {
        const cs = getComputedStyle(x); const r = x.getBoundingClientRect();
        chain.push({ tag: x.tagName, cls: (x.className || '').toString().slice(0, 44), disp: cs.display, of: cs.overflow, ws: cs.whiteSpace, minw: cs.minWidth, maxw: cs.maxWidth, flex: cs.flex, right: Math.round(r.right), w: Math.round(r.width) });
        x = x.parentElement;
      }
      return { txt: (e.textContent || '').trim().slice(0, 30), chain };
    });
    // composer 底排所有按钮几何
    const comp = document.querySelector('[class*="composerStack"]');
    const btns = comp ? Array.from(comp.querySelectorAll('button')).map(b => {
      const r = b.getBoundingClientRect();
      return { txt: (b.textContent || '').trim().slice(0, 14) || (b.getAttribute('aria-label') || ''), x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), cs: getComputedStyle(b).position, cls: (b.className || '').toString().slice(0, 30) };
    }) : [];
    return { vw, n: spans.length, info, btns: btns.slice(0, 10) };
  });
  console.log(JSON.stringify(out, null, 1));
  await p.screenshot({ path: path.join(DIR, 'span129.png'), clip: { x: 0, y: 620, width: 430, height: 312 } });
  await b.close();
})();
