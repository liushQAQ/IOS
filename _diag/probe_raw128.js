/* v1.0.128 取证：RAW（仅 fakeenv=59，无 App 注入）DOM 全量几何，对比真机截图 */
const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6500);
  await p.evaluate(() => {
    const fe = document.createElement('style');
    fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
    document.head.appendChild(fe);
  });
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => {
    const out = {};
    const f = document.querySelector('[data-mobile-nav="frame"]');
    out.framePT = f ? getComputedStyle(f).paddingTop : null;
    const col = document.querySelector('[class*="centerCol"]');
    out.colTop = col ? Math.round(col.getBoundingClientRect().top) : null;
    const hdr = document.querySelector('header');
    out.hdrTop = hdr ? Math.round(hdr.getBoundingClientRect().top) : null;
    // header 里逐元素
    if (hdr) {
      out.headerKids = Array.from(hdr.querySelectorAll('*')).slice(0, 14).map(e => {
        const q = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        if (q.width < 4 || q.height < 4) return null;
        return { tag: e.tagName, cls: String(e.className || '').slice(0, 26), y: Math.round(q.y), h: Math.round(q.height), pad: cs.paddingTop, txt: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 12) };
      }).filter(Boolean);
      const hcs = getComputedStyle(hdr);
      out.hdrPad = hcs.paddingTop; out.hdrMinH = hcs.minHeight; out.hdrH = Math.round(hdr.getBoundingClientRect().height);
    }
    // tab 下划线
    const tabs = Array.from(document.querySelectorAll('[class*="tab"], [role="tab"], button')).filter(e => /对话|轨迹|系统监控/.test(e.textContent || ''));
    out.tabs = tabs.slice(0, 4).map(e => { const q = e.getBoundingClientRect(); return { t: (e.textContent || '').trim().slice(0, 4), y: Math.round(q.y), bottom: Math.round(q.bottom) }; });
    return out;
  });
  console.log('RAW ' + JSON.stringify(r, null, 1));
  await b.close();
})();
