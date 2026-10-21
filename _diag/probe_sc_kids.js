// 细粒度探针：standardControls 子项全 dump + trigger 完整盒模型
const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');

async function run(b, W, H) {
  const c = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    if (!document.getElementById('__reg_fakeenv')) {
      const fe = document.createElement('style');
      fe.id = '__reg_fakeenv';
      fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
      document.head.appendChild(fe);
    }
    try { (0, eval)(js); } catch (e) {}
    window.__regTick = function () {
      try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
      try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {}
    };
    window.__regTick();
  }, { js: APP_JS });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(1000);
  const r = await p.evaluate(() => {
    const sc = document.querySelector('[class*="VERcba_standardControls"], [class*="standardControls"]');
    if (!sc) return { found: false };
    const q = sc.getBoundingClientRect();
    const kids = [];
    const walk = (el, depth) => {
      if (depth > 3) return;
      for (const k of el.children) {
        const cs = getComputedStyle(k);
        if (cs.display === 'contents') { walk(k, depth); continue; }
        const r2 = k.getBoundingClientRect();
        kids.push({
          d: depth, tag: k.tagName, cls: (k.className || '').toString().slice(0, 36),
          y: Math.round(r2.y * 10) / 10, h: Math.round(r2.height * 10) / 10, x: Math.round(r2.x), w: Math.round(r2.width),
          disp: cs.display, mt: cs.margin, top: cs.top, bottom: cs.bottom, pos: cs.position, pt: cs.paddingTop, pb: cs.paddingBottom,
        });
        if (r2.height > 0) walk(k, depth + 1);
      }
    };
    walk(sc, 0);
    return { found: true, scY: Math.round(q.y * 10) / 10, scH: Math.round(q.height * 10) / 10, kids };
  });
  console.log(`===== ${W}×${H} ===== sc.y=${r.scY} sc.h=${r.scH}`);
  for (const k of r.kids) console.log(JSON.stringify(k));
  await c.close();
}

(async () => {
  const b = await webkit.launch({ headless: true });
  await run(b, 393, 852);
  await run(b, 430, 932);
  await b.close();
})();
