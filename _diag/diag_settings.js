const { webkit } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:430,height:932}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(14000);
  await p.screenshot({ path:'shot_closed.png' });

  // 找所有含「设置」文字 / aria-label 含设置的可见元素
  const info = await p.evaluate(() => {
    const out = [];
    const walk = document.querySelectorAll('*');
    for (const el of walk) {
      const t = (el.textContent || '').trim();
      const aria = el.getAttribute && (el.getAttribute('aria-label') || '');
      const title = el.getAttribute && (el.getAttribute('title') || '');
      if (t === '设置' || aria.includes('设置') || title.includes('设置') || /setting/i.test(aria)) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        out.push({ tag: el.tagName, cls: String(el.className||'').slice(0,50), aria, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position, z: cs.zIndex, disp: cs.display, vis: cs.visibility, op: cs.opacity, txt: t.slice(0,20) });
      }
    }
    return out.slice(0, 20);
  });
  console.log('=== 「设置」元素 ===');
  info.forEach(o => console.log(JSON.stringify(o)));
  console.log('视口:', await p.evaluate(()=>innerWidth+'x'+innerHeight));

  // 找右下角区域的固定定位元素
  const fab = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.x + r.width < innerWidth * 0.55) continue;   // 只看右半屏
      if (r.y + r.height < innerHeight * 0.4) continue;  // 只看下半屏
      out.push({ tag: el.tagName, cls: String(el.className||'').slice(0,40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position, z: cs.zIndex, aria: el.getAttribute('aria-label')||'' });
    }
    return out.slice(0, 15);
  });
  console.log('\n=== 右下角定位元素 ===');
  fab.forEach(o => console.log(JSON.stringify(o)));
  await b.close();
})();
