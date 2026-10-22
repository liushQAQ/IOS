const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  // 打开抽屉，点第一个会话进入会话页
  await p.evaluate(() => { const e = document.querySelector('[aria-label="打开侧边栏"]'); if (e) e.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const rows = [...document.querySelectorAll('[class*="sessionRow"], [class*="sessionTitle"]')];
    for (const r of rows) { if ((r.textContent || '').trim().length > 1) { r.click(); return; } }
  });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const q = el.getBoundingClientRect();
      if (q.width < 8 || q.height < 8 || q.width > 120 || q.height > 120) return;
      if (q.right < vw - 40 || q.right > vw + 120) return;   // 只看贴着右缘 / 微微超出的
      const cs = getComputedStyle(el);
      const rad = parseFloat(cs.borderRadius) || 0;
      const isRound = rad >= Math.min(q.width, q.height) * 0.4;
      out.push({
        tag: el.tagName, cls: String(el.className || '').slice(0, 40),
        label: el.getAttribute('aria-label') || '', text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14),
        x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
        right: Math.round(q.right), over: Math.round(q.right - vw),
        rad: Math.round(rad), round: isRound, pos: cs.position, z: cs.zIndex,
      });
    });
    out.sort((a, b2) => b2.over - a.over);
    return { vw, vh, docSW: document.documentElement.scrollWidth, list: out.slice(0, 18) };
  });
  console.log('[视口] ' + r.vw + 'x' + r.vh + '  docSW=' + r.docSW);
  console.log('=== 贴右缘 / 超出右缘的小元素 ===');
  r.list.forEach(o => console.log('  ' + (o.round ? '●圆形 ' : '       ') + o.x + ',' + o.y + ' ' + o.w + 'x' + o.h +
    ' right=' + o.right + ' over=' + (o.over > 0 ? '+' + o.over : o.over) + ' rad=' + o.rad + ' ' + o.pos + ' z=' + o.z +
    (o.label ? ' [aria:' + o.label + ']' : '') + (o.text ? ' "' + o.text + '"' : '') + ' ' + o.tag + '.' + o.cls));
  await p.screenshot({ path: 'circle_page.png' });
  await b.close();
})();
