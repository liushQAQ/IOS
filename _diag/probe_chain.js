const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  // 用很矮的视口模拟「账号行被挤出屏幕」
  const c = await b.newContext({ viewport:{width:390,height:600}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(14000);
  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="侧边栏"], [aria-label*="侧"]'); if(e) e.click(); });
  await p.waitForTimeout(1200);

  const chain = await p.evaluate(() => {
    const a = document.querySelector('[aria-label="账号菜单"]');
    if (!a) return null;
    const out = [];
    let n = a;
    for (let i = 0; i < 8 && n; i++) {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      out.push({
        i, tag: n.tagName, cls: String(n.className||'').slice(0,50),
        x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height),
        pos: cs.position, ovY: cs.overflowY, bottom: cs.bottom, top: cs.top,
        scrollH: n.scrollHeight, clientH: n.clientHeight,
        bg: cs.backgroundColor,
      });
      n = n.parentElement;
    }
    return out;
  });
  console.log('视口 390x600');
  (chain||[]).forEach(o => console.log(JSON.stringify(o)));
  await p.screenshot({ path:'drawer_600.png' });
  await b.close();
})();
