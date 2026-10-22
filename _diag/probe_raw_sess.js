/* RAW 会话页全量几何（fakeenv=59，无 App 注入）→ 与真机截图逐元素比对 */
const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.evaluate(() => {
    const fe = document.createElement('style');
    fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
    document.head.appendChild(fe);
  });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 16; i++) { await p.waitForTimeout(2500); if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry'))) break; }
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(3200);
  const r = await p.evaluate(() => {
    const out = {};
    const hdr = document.querySelector('header');
    const q = e => e ? Math.round(e.getBoundingClientRect().top * 10) / 10 : null;
    out.hdrTop = q(hdr);
    out.colTop = q(document.querySelector('[class*="centerCol"]'));
    if (hdr) {
      out.hdrH = Math.round(hdr.getBoundingClientRect().height);
      out.kids = Array.from(hdr.children).map(e => {
        const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        return { cls: String(e.className || '').slice(0, 30), y: Math.round(r.y * 10) / 10, h: Math.round(r.height * 10) / 10, minH: cs.minHeight, h0: cs.height };
      });
      // tab 与下划线
      const tabs = Array.from(hdr.querySelectorAll('*')).filter(e => /对话|轨迹|系统监控/.test(e.textContent || '') && e.children.length === 0);
      out.tabTexts = tabs.slice(0, 4).map(e => { const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim().slice(0, 4), y: Math.round(r.y * 10) / 10, b: Math.round(r.bottom * 10) / 10 }; });
      // 下划线：header 里最矮的可见块
      const bars = Array.from(hdr.querySelectorAll('*')).filter(e => { const r = e.getBoundingClientRect(); return r.height <= 4 && r.height >= 1 && r.width > 20; });
      out.bars = bars.slice(0, 4).map(e => { const r = e.getBoundingClientRect(); return { y: Math.round(r.y * 10) / 10, b: Math.round(r.bottom * 10) / 10, w: Math.round(r.width) }; });
    }
    return out;
  });
  console.log('RAW-SESSION ' + JSON.stringify(r, null, 1));
  await b.close();
})();
