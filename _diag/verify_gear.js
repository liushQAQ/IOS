const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1' });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0,100)));
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(14000);

  const q = () => p.evaluate(() => {
    const b = document.querySelector('button[aria-label="设置"]');
    if (!b) return { exists:false };
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    const cx = Math.round(r.x + r.width/2), cy = Math.round(r.y + r.height/2);
    const top = document.elementFromPoint(cx, cy);
    return { exists:true, disp:cs.display, x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height),
             onTop: top === b || b.contains(top), topTag: top ? String(top.className||top.tagName).slice(0,30) : null };
  });

  console.log('抽屉关闭时:', JSON.stringify(await q()));
  await p.screenshot({ path:'gear_closed.png' });

  // 打开抽屉
  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="侧边栏"], [aria-label*="侧"]'); if(e) e.click(); });
  await p.waitForTimeout(1500);
  const opened = await q();
  console.log('抽屉打开时:', JSON.stringify(opened));
  await p.screenshot({ path:'gear_drawer.png' });

  // 点击设置按钮
  if (opened.exists && opened.disp !== 'none') {
    await p.mouse.click(opened.x + opened.w/2, opened.y + opened.h/2);
    await p.waitForTimeout(2200);
    const after = await p.evaluate(() => {
      const txt = document.body.innerText.replace(/\s+/g,' ').slice(0, 300);
      return { hasSettingsPanel: /设置|通用|外观|模型|插件/.test(document.body.innerText), snippet: txt.slice(0,120) };
    });
    console.log('点击后:', JSON.stringify(after));
    await p.screenshot({ path:'gear_clicked.png' });
  }
  console.log('页面错误:', errs.length, errs.slice(0,3));
  await b.close();
})();
