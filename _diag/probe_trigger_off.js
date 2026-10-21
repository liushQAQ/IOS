// 探针：对比 430/393 宽下模型选择器 trigger 的几何与样式，定位 4px 偏移来源
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

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
    const host = document.querySelector('[class*="composerStack"]');
    if (!host) return { found: false };
    const tg = host.querySelector('[class*="ofTiQG_trigger"], [aria-label^="选择模型"]');
    if (!tg) return { found: true, noTrigger: true };
    const chain = [];
    let el = tg;
    for (let i = 0; i < 6 && el && el !== document.body; i++) {
      const q = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      chain.push({
        i, tag: el.tagName, cls: (el.className || '').toString().slice(0, 44),
        y: Math.round(q.y * 10) / 10, h: Math.round(q.height * 10) / 10,
        mt: cs.marginTop, pt: cs.paddingTop, alignSelf: cs.alignSelf, pos: cs.position,
        transform: cs.transform === 'none' ? 'none' : cs.transform.slice(0, 40),
        display: cs.display, flexWrap: cs.flexWrap, alignItems: cs.alignItems,
      });
      el = el.parentElement;
    }
    // 同行参照物
    const peers = [];
    host.querySelectorAll('button, [role="button"]').forEach(b => {
      const q = b.getBoundingClientRect();
      if (q.width < 14 || q.height < 8) return;
      const cy = q.y + q.height / 2;
      if (cy > 735 && cy < 765) peers.push({ label: (b.getAttribute('aria-label') || b.className || '').toString().slice(0, 24), y: Math.round(q.y * 10) / 10, h: Math.round(q.height), cy: Math.round(cy * 10) / 10 });
    });
    return { found: true, chain, peers };
  });
  console.log(`===== ${W}×${H} =====`);
  console.log(JSON.stringify(r, null, 1));
  await c.close();
}

(async () => {
  const b = await webkit.launch({ headless: true });
  await run(b, 393, 852);
  await run(b, 430, 932);
  await b.close();
})();
