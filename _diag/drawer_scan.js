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

  const info = await p.evaluate(() => {
    const col = document.querySelector('[class*="sidebarCol"]');
    if (!col) return { err: 'no sidebarCol' };
    const cq = col.getBoundingClientRect();
    const out = [];
    col.querySelectorAll('button, [role="button"], a, [data-mobile-nav]').forEach(el => {
      const q = el.getBoundingClientRect();
      if (q.width < 2 || q.height < 2) return;
      out.push({
        tag: el.tagName,
        label: el.getAttribute('aria-label') || '',
        nav: el.getAttribute('data-mobile-nav') || '',
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22),
        x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
        cls: String(el.className || '').slice(0, 40),
        id: el.id || '',
      });
    });
    return {
      col: { x: Math.round(cq.x), y: Math.round(cq.y), w: Math.round(cq.width), h: Math.round(cq.height) },
      count: out.length,
      // 只输出抽屉底部 260px 内的，以及所有带 gear 特征的
      items: out.filter(o => o.y > cq.y + cq.height - 300).sort((a, b) => a.y - b.y),
      all: out.length,
    };
  });
  console.log('[抽屉] ' + JSON.stringify(info.col) + '  按钮共 ' + info.all + ' 个');
  info.items.forEach(o => {
    console.log('  y=' + o.y + ' x=' + o.x + ' ' + o.w + 'x' + o.h + '  ' +
      (o.label ? '[aria:' + o.label + '] ' : '') + (o.nav ? '[nav:' + o.nav + '] ' : '') +
      (o.text ? '"' + o.text + '" ' : '') + (o.id ? '#' + o.id + ' ' : '') + o.cls);
  });

  // 看注入的齿轮在不在
  const gear = await p.evaluate(() => {
    const g = document.querySelector('#__dshGearBtn, [data-dsh-gear]');
    if (!g) return null;
    const q = g.getBoundingClientRect();
    const top = document.elementFromPoint(Math.round(q.x + q.width / 2), Math.round(q.y + q.height / 2));
    return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
             onTop: !!top && (top === g || g.contains(top)),
             topCls: top ? String(top.className || '').slice(0, 40) : null };
  });
  console.log('[齿轮] ' + JSON.stringify(gear));
  await p.screenshot({ path: 'drawer_scan.png' });
  await b.close();
})();
