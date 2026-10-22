const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:1280,height:800} });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(14000);
  await p.screenshot({ path:'shot_wide.png' });
  const r = await p.evaluate(() => {
    const vw = innerWidth, vh = innerHeight, out = [];
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      const rr = el.getBoundingClientRect();
      if (rr.width === 0) continue;
      out.push({ t: (el.textContent||'').trim().replace(/\s+/g,' ').slice(0,12) || el.getAttribute('aria-label') || String(el.className||'').slice(0,28), x:Math.round(rr.x), y:Math.round(rr.y), w:Math.round(rr.width), h:Math.round(rr.height) });
    }
    // 右下象限
    const br = out.filter(o => o.x > vw*0.6 && o.y > vh*0.5);
    return { vw, vh, total: out.length, bottomRight: br, sidebarBottom: out.filter(o=>o.x < vw*0.3 && o.y > vh*0.7) };
  });
  console.log('视口', r.vw+'x'+r.vh, '按钮总数', r.total);
  console.log('=== 右下象限按钮 ===');
  r.bottomRight.forEach(o=>console.log('  '+JSON.stringify(o)));
  console.log('=== 左侧栏底部按钮 ===');
  r.sidebarBottom.forEach(o=>console.log('  '+JSON.stringify(o)));
  await b.close();
})();
