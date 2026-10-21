// 探针：393×852 下 dump composerStack 内按钮行分组与中心，定位 4px 离散
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, colorScheme: 'dark' });
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
    try { (0, eval)(js); } catch (e) { console.log('APP_JS err', e.message); }
    window.__regTick = function () {
      try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
      try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {}
    };
    window.__regTick();
  }, { js: APP_JS });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(1000);
  // 进会话页（点侧栏会话行）
  const r = await p.evaluate(() => {
    const host = document.querySelector('[class*="composerStack"]');
    if (!host) return { found: false };
    const boxes = [];
    host.querySelectorAll('button, [role="button"]').forEach(b => {
      const cs = getComputedStyle(b);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const q = b.getBoundingClientRect();
      if (q.width < 14 || q.height < 8) return;
      boxes.push({
        label: (b.getAttribute('aria-label') || (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14)).slice(0, 22),
        cls: (b.className || '').toString().slice(0, 40),
        y: Math.round(q.y * 10) / 10, h: Math.round(q.height * 10) / 10,
        cy: Math.round((q.y + q.height / 2) * 10) / 10,
        x: Math.round(q.x), w: Math.round(q.width),
      });
    });
    boxes.sort((a, z) => a.cy - z.cy);
    const lines = [];
    for (const bx of boxes) {
      let L = lines.find(L => Math.abs(bx.cy - L.cy) <= Math.max(Math.min(bx.h, L.h) / 2, 12));
      if (!L) { L = { cy: bx.cy, h: bx.h, items: [] }; lines.push(L); }
      L.items.push(bx);
      L.cy = L.items.reduce((s, it) => s + it.cy, 0) / L.items.length;
      L.h = Math.max(L.h, bx.h);
    }
    return { found: true, n: boxes.length, lines: lines.map(L => ({ cy: Math.round(L.cy * 10) / 10, spread: Math.round((Math.max(...L.items.map(i => i.cy)) - Math.min(...L.items.map(i => i.cy))) * 10) / 10, items: L.items.map(i => `${i.label}|${i.cls}|y=${i.y} h=${i.h} cy=${i.cy}`) })) };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
