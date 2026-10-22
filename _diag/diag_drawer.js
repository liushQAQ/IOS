const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  // 用老总手机的真实可视高度（Safari 有地址栏，可视区比屏矮）
  const c = await b.newContext({ viewport:{width:390,height:660}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(14000);

  // 找侧栏开关按钮并点击
  const btns = await p.evaluate(() => [...document.querySelectorAll('button')].map((b,i)=>({ i, cls:String(b.className||'').slice(0,40), aria:b.getAttribute('aria-label')||'', x:Math.round(b.getBoundingClientRect().x), y:Math.round(b.getBoundingClientRect().y), w:Math.round(b.getBoundingClientRect().width), h:Math.round(b.getBoundingClientRect().height) })).filter(o=>o.w>0).slice(0,14));
  console.log('=== 页面上可点按钮 ===');
  btns.forEach(o=>console.log(JSON.stringify(o)));

  // 点击左上角那个（侧栏）
  const topLeft = btns.filter(o=>o.x<80 && o.y<120)[0];
  if (topLeft) { await p.mouse.click(topLeft.x+topLeft.w/2, topLeft.y+topLeft.h/2); }
  else { await p.evaluate(()=>{ const e=document.querySelector('[aria-label*="侧"], [aria-label*="sidebar"]'); if(e) e.click(); }); }
  await p.waitForTimeout(2500);
  await p.screenshot({ path:'shot_drawer.png' });

  const d = await p.evaluate(() => {
    const res = { vh: innerHeight, vw: innerWidth };
    // 抽屉候选：位于左侧、宽度 < 60% 视口、高度接近满屏的容器
    const cands = [];
    for (const el of document.querySelectorAll('div,aside,nav')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.x < 5 && r.width > 200 && r.width < innerWidth*0.9 && r.height > innerHeight*0.6) {
        cands.push({ cls:String(el.className||'').slice(0,45), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height),
          scrollH: el.scrollHeight, clientH: el.clientHeight, ovY: cs.overflowY, pos: cs.position, z: cs.zIndex });
      }
    }
    res.cands = cands.slice(0,10);
    // 抽屉内所有可见文字项的纵向位置
    const items = [];
    for (const el of document.querySelectorAll('button,a,[role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width===0) continue;
      const t = (el.textContent||'').trim().replace(/\s+/g,' ').slice(0,16);
      if (!t) continue;
      items.push({ t, y:Math.round(r.y), h:Math.round(r.height), x:Math.round(r.x), w:Math.round(r.width) });
    }
    res.items = items.filter(o=>o.x<220).sort((a,b)=>a.y-b.y).slice(0,20);
    return res;
  });
  console.log('\n=== 视口 ===', d.vw+'x'+d.vh);
  console.log('=== 抽屉容器 ===');
  d.cands.forEach(o=>console.log(JSON.stringify(o)));
  console.log('=== 抽屉内条目（y 超视口即看不到）===');
  d.items.forEach(o=>console.log((o.y+o.h > d.vh ? '🔴 超出 ' : '   ') + JSON.stringify(o)));
  await b.close();
})();
