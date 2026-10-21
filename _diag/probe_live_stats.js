// 快查：当前会话是否有运行中的 Agent / 统计部件文本
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
    window.__regTick = function () { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {} };
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
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(3000);
    if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry, .dcc-root'))) break;
  }
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const body = document.body.innerText || '';
    const hits = {};
    for (const kw of ['深度求索', '正在运行', '轮', 'CPU', '本会话', '网关', 'tok/s', '缓存命中']) {
      const i = body.indexOf(kw);
      hits[kw] = i >= 0 ? body.slice(Math.max(0, i - 20), i + 40).replace(/\n/g, ' | ') : null;
    }
    // 发送按钮当前形态（停止=运行中）
    const stop = document.querySelector('[aria-label*="停止"], [aria-label*="stop"], [class*="primary"] [class*="stop"]');
    const stopVisible = stop ? getComputedStyle(stop).display !== 'none' : false;
    const dock = document.querySelector('[class*="VERcba_dock"], [class*="dock"]');
    const dockCS = dock ? getComputedStyle(dock) : null;
    return { hits, stopVisible, dockCls: dock ? dock.className.toString().slice(0, 50) : null, dockDisp: dockCS ? dockCS.display : null, dockChildren: dock ? dock.children.length : -1 };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
