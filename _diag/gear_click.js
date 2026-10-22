const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  await p.evaluate(() => { const e = document.querySelector('[aria-label="打开侧边栏"]'); if (e) e.click(); });
  await p.waitForTimeout(1500);

  const g = await p.evaluate(() => {
    const el = document.querySelector('button[aria-label="设置"]');
    if (!el) return null;
    const q = el.getBoundingClientRect();
    return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
  });
  console.log('[齿轮坐标] ' + JSON.stringify(g));

  // 真点击（用坐标 tap，等同真机触摸）
  await p.touchscreen.tap(g.x, g.y).catch(async () => { await p.mouse.click(g.x, g.y); });
  await p.waitForTimeout(3500);

  const st = await p.evaluate(() => {
    const panel = document.querySelector('[class*="tklpSG_panel"]') || document.querySelector('[class*="settings"]');
    const s = document.querySelector('[class*="sidebarCol"]');
    const sr = s ? s.getBoundingClientRect() : null;
    return {
      panelOpen: !!panel,
      panelRect: panel ? (q => ({ x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) }))(panel.getBoundingClientRect()) : null,
      panelTitle: panel ? (panel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) : null,
      drawerX: sr ? Math.round(sr.x) : null,
      drawerCollapsed: sr ? sr.x < -60 : null,
    };
  });
  console.log('[点击后] ' + JSON.stringify(st));
  await p.screenshot({ path: 'gear_click.png' });
  await b.close();
})();
