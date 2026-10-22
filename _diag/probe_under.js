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
    const out = {};
    // 齿轮真实位置（没隐藏时）
    const g = document.querySelector('button[aria-label="设置"]');
    if (g) { const q = g.getBoundingClientRect(); out.gear = { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) }; g.style.display = 'none'; }
    // 隐藏后逐点探测底层
    const pts = [];
    for (const y of [870, 876, 884, 892, 900]) {
      for (const x of [232, 240, 246, 254, 260]) {
        const el = document.elementFromPoint(x, y);
        let path = [];
        let cur = el;
        for (let i = 0; i < 4 && cur; i++) { path.push(cur.tagName + (cur.className && typeof cur.className === 'string' ? '.' + cur.className.split(' ')[0].slice(0, 20) : '')); cur = cur.parentElement; }
        pts.push(x + ',' + y + ' -> ' + path.join(' < '));
      }
    }
    out.pts = pts;
    // 该区域最近的按钮是谁
    const near = [];
    document.querySelectorAll('button,a,[role="button"],[role="menuitem"]').forEach(el => {
      const q = el.getBoundingClientRect();
      if (q.width < 8 || q.height < 8) return;
      const cy = q.y + q.height / 2, cx = q.x + q.width / 2;
      const d = Math.hypot(cx - 246, cy - 884);
      if (d < 120) near.push({ d: Math.round(d), x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
        label: el.getAttribute('aria-label') || '', text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20), cls: String(el.className || '').slice(0, 34) });
    });
    out.near = near.sort((a, b2) => a.d - b2.d);
    return out;
  });

  console.log('[齿轮实际位置] ' + JSON.stringify(r.gear));
  console.log('\n=== 隐藏齿轮后，该区域底层是谁 ===');
  r.pts.forEach(s => console.log('  ' + s));
  console.log('\n=== 落点 120px 内最近的按钮 ===');
  r.near.forEach(o => console.log('  d=' + o.d + ' ' + o.x + ',' + o.y + ' ' + o.w + 'x' + o.h +
    (o.label ? ' [aria:' + o.label + ']' : '') + (o.text ? ' "' + o.text + '"' : '') + ' ' + o.cls));
  await b.close();
})();
