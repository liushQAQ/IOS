// 探针：全 DOM 搜索 dock 统计部件（sm-dock / cm-session-amount / 网关 / CPU 等）
const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.route(/\.(woff2?|ttf|otf)(\?.*)?$/i, r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
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
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(3000);
    await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
    if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry, .dcc-root'))) break;
  }
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const out = [];
    const sels = ['.sm-dock', '[class*="sm-dock"]', '.cm-session-amount', '[class*="cm-session"]', '.cm-bal-amt', '[class*="cm-bal"]', '[class*="dock"]', '[data-composer-stats]', '.cm-stat-dock', '[class*="gateway"]', '[class*="cm-"]'];
    const seen = new Set();
    for (const sel of sels) {
      document.querySelectorAll(sel).forEach(e => {
        if (seen.has(e)) return; seen.add(e);
        const q = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        out.push({
          sel, tag: e.tagName, cls: (e.className || '').toString().slice(0, 44),
          txt: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 46),
          y: Math.round(q.y), x: Math.round(q.x), w: Math.round(q.width), h: Math.round(q.height),
          disp: cs.display, pos: cs.position, ov: cs.overflow, color: cs.color, bg: cs.backgroundColor,
        });
      });
    }
    return out;
  });
  console.log('命中', r.length);
  for (const e of r) console.log(JSON.stringify(e));
  await b.close();
})();
