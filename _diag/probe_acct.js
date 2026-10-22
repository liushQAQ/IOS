const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(14000);
  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="侧边栏"], [aria-label*="侧"]'); if(e) e.click(); });
  await p.waitForTimeout(1200);
  await p.screenshot({ path:'acct_before.png' });

  const r = await p.evaluate(() => {
    const a = document.querySelector('[aria-label="账号菜单"]');
    if (!a) return null;
    const rr = a.getBoundingClientRect();
    return { x: Math.round(rr.x), y: Math.round(rr.y), w: Math.round(rr.width), h: Math.round(rr.height) };
  });
  console.log('账号行:', JSON.stringify(r));
  if (r) await p.mouse.click(r.x + 40, r.y + r.h/2);
  await p.waitForTimeout(2000);
  await p.screenshot({ path:'acct_menu.png' });

  const menu = await p.evaluate(() => {
    // 菜单通常出现在账号行上方
    const boxes = [];
    for (const el of document.querySelectorAll('[role="menu"],[role="dialog"],div')) {
      const rr = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (rr.width < 120 || rr.height < 60 || rr.height > 400) continue;
      if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
      if (rr.y > 700) continue;
      const t = el.innerText ? el.innerText.replace(/\s+/g,' ').trim() : '';
      if (t) boxes.push({ y: Math.round(rr.y), x: Math.round(rr.x), w: Math.round(rr.width), h: Math.round(rr.height), t: t.slice(0,120) });
    }
    return boxes.slice(0,6);
  });
  console.log('=== 疑似菜单 ===');
  menu.forEach(o => console.log(JSON.stringify(o)));
  await b.close();
})();
