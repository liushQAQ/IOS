const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(14000);
  // 在齿轮周围画标注框
  const ok = await p.evaluate(() => {
    const g = document.querySelector('.dsh-po-btn-gear');
    if (!g) return null;
    const r = g.getBoundingClientRect();
    const mk = document.createElement('div');
    mk.style.cssText = 'position:fixed;left:' + (r.x - 10) + 'px;top:' + (r.y - 10) + 'px;width:' + (r.width + 20) + 'px;height:' + (r.height + 20) + 'px;border:3px solid #ff2d55;border-radius:8px;z-index:2147483600;pointer-events:none;box-shadow:0 0 0 4px rgba(255,45,85,.18)';
    document.body.appendChild(mk);
    const tip = document.createElement('div');
    tip.textContent = '设置在这里 ↑';
    tip.style.cssText = 'position:fixed;left:' + Math.max(4, r.x - 30) + 'px;top:' + (r.y + r.height + 14) + 'px;background:#ff2d55;color:#fff;font:600 13px/1.6 -apple-system,sans-serif;padding:3px 9px;border-radius:6px;z-index:2147483601;pointer-events:none;white-space:nowrap';
    document.body.appendChild(tip);
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  console.log('齿轮位置:', JSON.stringify(ok));
  await p.waitForTimeout(600);
  await p.screenshot({ path:'settings_location.png' });
  await b.close();
})();
