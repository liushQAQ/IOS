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
    const mine = document.querySelector('button[aria-label="设置"]');
    if (mine) mine.style.display = 'none';
    const col = document.querySelector('[class*="sidebarCol"]');
    const cq = col.getBoundingClientRect();
    const out = [];
    // 更宽的候选：任何可点击类元素
    col.querySelectorAll('button, a, [role="button"], [role="menuitem"], [data-mobile-nav], [class*="trigger"], [class*="btn"], [class*="Button"], [class*="link"], [class*="foot"]').forEach(el => {
      const q = el.getBoundingClientRect();
      if (q.width < 8 || q.height < 8) return;
      out.push({
        y: Math.round(q.y), x: Math.round(q.x), w: Math.round(q.width), h: Math.round(q.height),
        tag: el.tagName, label: el.getAttribute('aria-label') || '', nav: el.getAttribute('data-mobile-nav') || '',
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20),
        cls: String(el.className || '').slice(0, 46),
        z: getComputedStyle(el).zIndex,
      });
    });
    // 去重（同一 y+x 只留一个）
    const seen = new Set(); const uniq = [];
    for (const o of out.sort((a, b2) => a.y - b2.y || a.x - b2.x)) {
      const k = o.y + '|' + o.x + '|' + o.w + 'x' + o.h;
      if (seen.has(k)) continue; seen.add(k); uniq.push(o);
    }
    // 抽屉顶部 200px 内的任何元素（找标题行右侧）
    const topKids = [];
    for (const el of col.querySelectorAll('*')) {
      const q = el.getBoundingClientRect();
      if (q.y > cq.y + 200 || q.width < 20 || q.height < 12) continue;
      topKids.push({ y: Math.round(q.y), x: Math.round(q.x), w: Math.round(q.width), h: Math.round(q.height),
        tag: el.tagName, label: el.getAttribute('aria-label') || '', text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18),
        cls: String(el.className || '').slice(0, 40) });
    }
    return { col: { x: Math.round(cq.x), y: Math.round(cq.y), w: Math.round(cq.width), h: Math.round(cq.height) }, uniq, topKids };
  });

  console.log('[抽屉] ' + JSON.stringify(r.col));
  console.log('\n=== 全量可点击元素（按 y）===');
  r.uniq.forEach(o => console.log('  y=' + o.y + ' x=' + o.x + ' ' + o.w + 'x' + o.h + ' z=' + o.z +
    (o.label ? ' [aria:' + o.label + ']' : '') + (o.nav ? ' [nav:' + o.nav + ']' : '') +
    (o.text ? ' "' + o.text + '"' : '') + ' ' + o.tag + '.' + o.cls));
  console.log('\n=== 抽屉顶部 200px 元素 ===');
  r.topKids.forEach(o => console.log('  y=' + o.y + ' x=' + o.x + ' ' + o.w + 'x' + o.h +
    (o.label ? ' [aria:' + o.label + ']' : '') + (o.text ? ' "' + o.text + '"' : '') + ' ' + o.tag + '.' + o.cls));
  await b.close();
})();
