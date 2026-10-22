/* 插件页 fab 消失单独复测（跑 3 遍看是不是偶发） */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const MEASURE = () => {
  const ph = document.querySelector('[class*="pageHead"]');
  if (!ph) return { noPage: true };
  const fabs = Array.from(document.querySelectorAll('button')).filter(b => {
    const cs = getComputedStyle(b); const q = b.getBoundingClientRect();
    return cs.position === 'fixed' && cs.display !== 'none' && q.width > 10 && q.x < 100 && q.y < 220;
  });
  if (!fabs.length) {
    // 找找所有 fixed 按钮都在哪
    const allFixed = Array.from(document.querySelectorAll('button')).filter(b => getComputedStyle(b).position === 'fixed').map(b => {
      const q = b.getBoundingClientRect();
      return { txt: (b.textContent || '').trim().slice(0, 10), x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), disp: getComputedStyle(b).display };
    });
    return { noFab: true, allFixed: allFixed.slice(0, 8) };
  }
  const fab = fabs[0], q = fab.getBoundingClientRect();
  const hit = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
  return { ok: true, x: Math.round(q.x), y: Math.round(q.y), clickable: !!(hit && (hit === fab || fab.contains(hit))) };
};

(async () => {
  for (let run = 1; run <= 3; run++) {
    const b = await webkit.launch({ headless: true });
    const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(6500);
    await p.evaluate(({ js, css }) => {
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      try { (0, eval)(js); } catch (e) {}
    }, { js: APP_JS, css: APP_CSS });
    await p.waitForTimeout(1200);
    await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
    await p.waitForTimeout(2500);
    await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
    await p.waitForTimeout(1800);
    await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b2) b2.click(); });
    await p.waitForTimeout(3000);
    await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
    await p.waitForTimeout(2500);
    await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
    await p.waitForTimeout(3600);
    await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
    await p.waitForTimeout(800);
    const m = await p.evaluate(MEASURE);
    console.log('run' + run + ': ' + JSON.stringify(m));
    await b.close();
  }
})();
