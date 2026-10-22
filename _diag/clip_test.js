const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);

  // 模拟 App：header sticky + z=999
  await p.evaluate(() => {
    const hd = document.querySelector('header');
    if (hd) { hd.style.setProperty('position', 'sticky', 'important'); hd.style.setProperty('top', '0', 'important'); hd.style.setProperty('z-index', '999', 'important'); }
  });

  const before = await p.evaluate(() => ({
    headerTop: Math.round(document.querySelector('header').getBoundingClientRect().top),
    canScrollX: (() => { window.scrollTo(9999, 0); const s = window.scrollX; window.scrollTo(0, 0); return s; })(),
    scrollH: document.documentElement.scrollHeight,
    vh: innerHeight,
    stickySupported: CSS.supports('overflow', 'clip'),
  }));
  console.log('[加 clip 前] ' + JSON.stringify(before));

  // 注入 overflow-x: clip
  await p.addStyleTag({ content: 'html, body { overflow-x: clip !important; }' });
  await p.waitForTimeout(600);

  const after = await p.evaluate(() => {
    const hd = document.querySelector('header');
    // 纵向滚一段，看 header 是否还钉在顶部
    const sc = document.querySelector('[class*="scrollArea"], main, [class*="thread"]');
    window.scrollTo(0, 600);
    const r = {
      docScrollTop: Math.round(window.scrollY),
      headerTopAfterScroll: Math.round(hd.getBoundingClientRect().top),
      canScrollX: (() => { window.scrollTo(9999, window.scrollY); const s = window.scrollX; window.scrollTo(0, window.scrollY); return s; })(),
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
    };
    window.scrollTo(0, 0);
    return r;
  });
  console.log('[加 clip 后] ' + JSON.stringify(after));

  // 检查 headerCorner 是否还在视觉上超界（clip 后应被裁掉，不再产生可滚动宽度）
  const corner = await p.evaluate(() => {
    const el = document.querySelector('[class*="headerCorner"]');
    if (!el) return null;
    const q = el.getBoundingClientRect();
    const iw = innerWidth;
    const cx = Math.min(iw - 3, Math.round(q.x + q.width / 2));
    const hit = document.elementFromPoint(cx, Math.round(q.y + q.height / 2));
    return { x: Math.round(q.x), right: Math.round(q.right), over: Math.round(q.right - iw), hitCls: hit ? String(hit.className || '').slice(0, 30) : null };
  });
  console.log('[headerCorner] ' + JSON.stringify(corner));

  await p.screenshot({ path: 'clip_after.png' });
  await b.close();
})();
