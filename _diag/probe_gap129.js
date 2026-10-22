/* 复刻闸门时序，观察 优化行 与 模型选择器行 的间距随时间演化（找 9px 跨行压的成因） */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {} }, { js: APP_JS });
  for (const ms of [0, 600, 1200, 2000, 3000, 5000, 8000]) {
    await p.waitForTimeout(ms === 0 ? 0 : ms - (function () { return 0; })());
    const r = await p.evaluate(() => {
      const g = (t) => {
        const el = Array.from(document.querySelectorAll('[class*="composerStack"] button')).find(x => (x.textContent || '').trim().startsWith(t));
        if (!el) return null;
        const q = el.getBoundingClientRect();
        return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) };
      };
      const opt = g('优化');
      const selEl = Array.from(document.querySelectorAll('[class*="composerStack"] button')).find(x => (x.textContent || '').trim().startsWith('选择模型') || (x.textContent || '').trim().startsWith('gemini'));
      const sel = selEl ? (q => ({ x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) }))(selEl.getBoundingClientRect()) : null;
      const sc = document.querySelector('[class*="VERcba_standardControls"]');
      const gap = opt && sel ? (sel.y - (opt.y + opt.h)) : null;
      return { opt, sel, gap, scW: sc ? Math.round(sc.getBoundingClientRect().width) : null,
        scH: sc ? Math.round(sc.getBoundingClientRect().height) : null };
    });
    console.log('t+' + ms + 'ms ' + JSON.stringify(r));
  }
  await b.close();
})();
