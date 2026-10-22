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

  const r = await p.evaluate(() => {
    // 先把我们自己的齿轮藏起来，才能看见底层
    const mine = document.querySelector('button[aria-label="设置"]');
    if (mine) mine.style.display = 'none';
    const vw = innerWidth, vh = innerHeight;
    const list = [];
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
      const q = el.getBoundingClientRect();
      if (q.width < 16 || q.height < 16) return;
      if (q.right < 0 || q.bottom < 0 || q.x > vw || q.y > vh) return;
      const z = parseInt(cs.zIndex, 10);
      list.push({
        tag: el.tagName, cls: String(el.className || '').slice(0, 34),
        label: el.getAttribute('aria-label') || '', nav: el.getAttribute('data-mobile-nav') || '',
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18),
        x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
        z: isFinite(z) ? z : null, pos: cs.position,
      });
    });
    list.sort((a, b2) => (b2.z || 0) - (a.z || 0));
    // 右下角区域：x > vw*0.4 且 y > vh*0.6
    const corner = list.filter(o => o.x > vw * 0.4 && o.y > vh * 0.6);
    return { vw, vh, total: list.length, corner, top: list.slice(0, 12) };
  });

  console.log('[视口] ' + r.vw + 'x' + r.vh + '  fixed/absolute 元素共 ' + r.total);
  console.log('\n=== 右下角区域（x>40% 且 y>60%）===');
  r.corner.forEach(o => console.log('  z=' + o.z + ' ' + o.pos + ' ' + o.x + ',' + o.y + ' ' + o.w + 'x' + o.h +
    (o.label ? ' [aria:' + o.label + ']' : '') + (o.nav ? ' [nav:' + o.nav + ']' : '') +
    (o.text ? ' "' + o.text + '"' : '') + ' ' + o.tag + '.' + o.cls));
  console.log('\n=== z-index 最高的 12 个 ===');
  r.top.forEach(o => console.log('  z=' + o.z + ' ' + o.pos + ' ' + o.x + ',' + o.y + ' ' + o.w + 'x' + o.h +
    (o.label ? ' [aria:' + o.label + ']' : '') + (o.text ? ' "' + o.text + '"' : '') + ' ' + o.tag + '.' + o.cls));
  await p.screenshot({ path: 'fixed_scan_noGear.png' });
  await b.close();
})();
